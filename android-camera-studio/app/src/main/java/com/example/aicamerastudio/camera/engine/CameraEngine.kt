package com.example.aicamerastudio.camera.engine

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.net.Uri
import android.provider.MediaStore
import android.util.Range
import android.util.Size
import androidx.camera.camera2.interop.Camera2CameraControl
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.Camera2Interop
import androidx.camera.camera2.interop.CaptureRequestOptions
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.*
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.extensions.ExtensionMode
import androidx.camera.extensions.ExtensionsManager
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.Observer
import com.example.aicamerastudio.core.errors.AppException
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlin.math.abs

enum class CaptureMode(val label: String) { NIGHT("Night"), PORTRAIT("Portrait"), PHOTO("Photo"), VIDEO("Video"), PRO("Pro"), ZOOM("Zoom") }

enum class AspectChoice(val label: String, val cameraxRatio: Int, val ratio: Float) {
    R4_3("4:3", AspectRatio.RATIO_4_3, 4f / 3f), R16_9("16:9", AspectRatio.RATIO_16_9, 16f / 9f)
}

enum class AnalysisKind { NONE, FRAMES }

data class BindConfig(
    val frontCamera: Boolean,
    /** In zoom mode, a specific back camera id to bind (a separate telephoto or ultra wide). Null = default. */
    val cameraId: String? = null,
    val mode: CaptureMode,
    val aspect: AspectChoice,
    val videoQuality: Quality?,
    val fps: Int?,
    val stabilise: Boolean,
    val flashMode: Int,
    /** A phone maker extension to use (ExtensionMode.HDR / NIGHT / BOKEH) when available, else NONE. */
    val extension: Int = ExtensionMode.NONE,
    /** Requested photo size in megapixels, 0 = largest. */
    val photoMegapixels: Int = 0,
    val raw: Boolean = false,
    /** Deliver small preview frames to [CameraEngine.analyzer] (face finding, histogram). */
    val analysis: AnalysisKind = AnalysisKind.NONE,
    /** Read live ISO and shutter speed from the camera (Pro mode). */
    val liveExposure: Boolean = false,
    /** A GPU effect applied to the preview and video recording (the beauty camera). */
    val effect: CameraEffect? = null,
)

/** What the bound camera really supports. The UI only offers what is listed here. */
data class CameraSupport(
    val hasFlash: Boolean,
    val minZoom: Float,
    val maxZoom: Float,
    val evSupported: Boolean,
    val evMin: Int,
    val evMax: Int,
    val evStep: Float,
    val videoQualities: List<Quality>,
    val fpsOptions: List<Int>,
    val stabilisationSupported: Boolean,
    val hasFront: Boolean,
    val hasBack: Boolean,
    val boundCameraId: String?,
    val defaultBackId: String?,
    val bindableBackIds: Set<String>,
    /** Phone maker extensions available for this camera direction, and the one actually in use. */
    val extensions: Set<Int> = emptySet(),
    val extensionActive: Int = ExtensionMode.NONE,
    val rawSupported: Boolean = false,
    val rawActive: Boolean = false,
    val manualSensor: Boolean = false,
    val isoRange: IntRange? = null,
    val exposureRangeNs: LongRange? = null,
    val awbModes: List<Int> = emptyList(),
    val minFocusDiopters: Float = 0f,
    /** Photo sizes for the chosen aspect ratio, largest first, and the size actually used. */
    val photoSizes: List<Size> = emptyList(),
    val photoSize: Size? = null,
    val analysisActive: Boolean = false,
    /** True when [BindConfig.effect] is really applied. False if this camera refused it (then the plain camera runs). */
    val effectActive: Boolean = false,
)

data class LiveExposure(val iso: Int?, val exposureNs: Long?, val focusDiopters: Float?)

/** Manual Pro settings. Null means automatic. */
data class ManualSettings(val iso: Int? = null, val exposureNs: Long? = null, val awbMode: Int? = null, val focusDiopters: Float? = null, val aeLock: Boolean = false)

@androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
class CameraEngine(private val context: Context, private val media: MediaStoreRepository) {
    private val executor: Executor = ContextCompat.getMainExecutor(context)
    private val analysisExecutor = Executors.newSingleThreadExecutor()
    private var provider: ProcessCameraProvider? = null
    private var extensions: ExtensionsManager? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var rawActive = false
    private var zoomLive: androidx.lifecycle.LiveData<ZoomState>? = null
    private var zoomObserver: Observer<ZoomState>? = null
    private var manual = ManualSettings()
    private var lastLive = LiveExposure(null, null, null)
    private val _live = MutableStateFlow(lastLive)
    val liveExposure: StateFlow<LiveExposure> = _live

    /** Receives preview frames (RGBA, about 640x480) when analysis is on. Must close the image. */
    @Volatile var analyzer: ((ImageProxy) -> Unit)? = null

    val isRecording: Boolean get() = recording != null

    private suspend fun <T> ListenableFuture<T>.await(): T = suspendCancellableCoroutine { cont ->
        addListener({
            try { cont.resume(get()) } catch (t: Throwable) { cont.resumeWithException(t.cause ?: t) }
        }, executor)
        cont.invokeOnCancellation { cancel(false) }
    }

    private fun characteristics(id: String?) = id?.let { runCatching { (context.getSystemService(Context.CAMERA_SERVICE) as CameraManager).getCameraCharacteristics(it) }.getOrNull() }

    /** Binds preview plus the use cases the mode needs. Returns the real capabilities of that camera. */
    suspend fun bind(owner: LifecycleOwner, view: PreviewView, cfg: BindConfig, onZoom: (Float) -> Unit): CameraSupport {
        val p = provider ?: ProcessCameraProvider.getInstance(context).await().also { provider = it }
        val ext = extensions ?: runCatching { ExtensionsManager.getInstanceAsync(context, p).await() }.getOrNull().also { extensions = it }
        val hasBack = p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)
        val hasFront = p.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)
        val backInfos = p.availableCameraInfos.filter { it.lensFacing == CameraSelector.LENS_FACING_BACK }
        val bindable = backInfos.mapNotNull { idOf(it) }.toSet()
        val defaultBack = if (hasBack) runCatching { idOf(p.getCameraInfo(CameraSelector.DEFAULT_BACK_CAMERA)) }.getOrNull() else null
        val front = cfg.frontCamera && hasFront && cfg.mode != CaptureMode.ZOOM
        val base = when {
            cfg.mode == CaptureMode.ZOOM && cfg.cameraId != null && cfg.cameraId in bindable ->
                CameraSelector.Builder().addCameraFilter { infos -> infos.filter { idOf(it) == cfg.cameraId } }.build()
            front -> CameraSelector.DEFAULT_FRONT_CAMERA
            hasBack -> CameraSelector.DEFAULT_BACK_CAMERA
            hasFront -> CameraSelector.DEFAULT_FRONT_CAMERA
            else -> throw AppException(Errors.cameraUnavailable())
        }
        stopRecording()
        unobserveZoom()
        p.unbindAll()
        manual = ManualSettings()

        val available = if (ext == null) emptySet() else listOf(ExtensionMode.HDR, ExtensionMode.NIGHT, ExtensionMode.BOKEH)
            .filter { runCatching { ext.isExtensionAvailable(base, it) }.getOrDefault(false) }.toSet()
        val useExt = cfg.extension.takeIf { it != ExtensionMode.NONE && it in available && cfg.mode != CaptureMode.VIDEO } ?: ExtensionMode.NONE
        val selector = if (useExt != ExtensionMode.NONE) ext!!.getExtensionEnabledCameraSelector(base, useExt) else base

        val info = p.getCameraInfo(base)
        val chars = characteristics(idOf(info))
        val caps = Recorder.getVideoCapabilities(info)
        val qualities = caps.getSupportedQualities(DynamicRange.SDR)
        val fpsRanges = info.supportedFrameRateRanges
        val fpsOptions = listOf(24, 25, 30, 50, 60).filter { f -> fpsRanges.any { it.contains(f) } }
        val stabSupported = caps.isStabilizationSupported
        val capList = chars?.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.toList().orEmpty()
        val manualSensor = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR in capList
        val rawSupported = useExt == ExtensionMode.NONE &&
            ImageCapture.OUTPUT_FORMAT_RAW_JPEG in runCatching { ImageCapture.getImageCaptureCapabilities(info).supportedOutputFormats }.getOrDefault(emptySet())

        // Photo sizes offered for this aspect ratio (largest first, one per megapixel class).
        val sizes = chars?.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)?.getOutputSizes(ImageFormat.JPEG).orEmpty()
            .filter { abs(it.width.toFloat() / it.height - cfg.aspect.ratio) < 0.03f || abs(it.height.toFloat() / it.width - cfg.aspect.ratio) < 0.03f }
            .sortedByDescending { it.width.toLong() * it.height }
            .distinctBy { Math.round(it.width.toLong() * it.height / 1_000_000.0) }
        val wanted = if (cfg.photoMegapixels > 0) sizes.firstOrNull { it.width.toLong() * it.height <= cfg.photoMegapixels * 1_050_000L } else null

        val aspectStrategy = AspectRatioStrategy(cfg.aspect.cameraxRatio, AspectRatioStrategy.FALLBACK_RULE_AUTO)
        val previewSel = ResolutionSelector.Builder().setAspectRatioStrategy(aspectStrategy).build()
        val photoSel = ResolutionSelector.Builder().setAspectRatioStrategy(aspectStrategy)
            .setResolutionStrategy(if (wanted != null) ResolutionStrategy(wanted, ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER) else ResolutionStrategy.HIGHEST_AVAILABLE_STRATEGY)
            .build()

        val previewBuilder = Preview.Builder().setResolutionSelector(previewSel)
        if (cfg.liveExposure && useExt == ExtensionMode.NONE) {
            Camera2Interop.Extender(previewBuilder).setSessionCaptureCallback(object : CameraCaptureSession.CaptureCallback() {
                private var lastT = 0L
                override fun onCaptureCompleted(s: CameraCaptureSession, r: CaptureRequest, result: TotalCaptureResult) {
                    val now = System.currentTimeMillis(); if (now - lastT < 200) return; lastT = now
                    lastLive = LiveExposure(result.get(CaptureResult.SENSOR_SENSITIVITY), result.get(CaptureResult.SENSOR_EXPOSURE_TIME), result.get(CaptureResult.LENS_FOCUS_DISTANCE))
                    _live.value = lastLive
                }
            })
        }
        val preview = previewBuilder.build().also { it.surfaceProvider = view.surfaceProvider }

        val useCases = ArrayList<UseCase>()
        useCases += preview
        rawActive = false
        when (cfg.mode) {
            CaptureMode.VIDEO -> {
                var q = cfg.videoQuality?.takeIf { it in qualities } ?: qualities.firstOrNull() ?: Quality.HIGHEST
                // Live beauty processes every frame on the GPU. When the user has not chosen a quality, start at 1080p
                // (4K is still available by choosing it: it needs a fast phone).
                if (cfg.effect != null && cfg.videoQuality == null && (q == Quality.UHD || q == Quality.HIGHEST) && Quality.FHD in qualities) q = Quality.FHD
                val height = when (q) { Quality.UHD -> 2160; Quality.FHD -> 1080; Quality.HD -> 720; Quality.SD -> 480; else -> 2160 }
                val recorder = Recorder.Builder().setQualitySelector(QualitySelector.from(q, FallbackStrategy.lowerQualityOrHigherThan(q)))
                    .setTargetVideoEncodingBitRate(VideoBitrates.target(height, cfg.fps)).build()
                val b = VideoCapture.Builder(recorder)
                if (cfg.fps != null && cfg.fps in fpsOptions) b.setTargetFrameRate(Range(cfg.fps, cfg.fps))
                if (cfg.stabilise && stabSupported) b.setVideoStabilizationEnabled(true)
                useCases += b.build().also { videoCapture = it; imageCapture = null }
            }
            else -> {
                val b = ImageCapture.Builder().setResolutionSelector(photoSel).setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY).setFlashMode(cfg.flashMode)
                if (cfg.raw && rawSupported) { b.setOutputFormat(ImageCapture.OUTPUT_FORMAT_RAW_JPEG); rawActive = true }
                useCases += b.build().also { imageCapture = it; videoCapture = null }
            }
        }
        var analysisOn = false
        if (cfg.analysis == AnalysisKind.FRAMES && useExt == ExtensionMode.NONE && cfg.mode != CaptureMode.VIDEO) {
            val a = ImageAnalysis.Builder()
                .setResolutionSelector(ResolutionSelector.Builder().setAspectRatioStrategy(aspectStrategy)
                    .setResolutionStrategy(ResolutionStrategy(Size(640, 480), ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER)).build())
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888).build()
            a.setAnalyzer(analysisExecutor) { img -> val f = analyzer; if (f != null) f(img) else img.close() }
            useCases += a; analysisOn = true
        }
        var effectOn = false
        if (cfg.effect != null && useExt == ExtensionMode.NONE) {
            camera = try {
                val group = UseCaseGroup.Builder().apply { useCases.forEach { addUseCase(it) }; addEffect(cfg.effect) }.build()
                p.bindToLifecycle(owner, selector, group).also { effectOn = true }
            } catch (e: IllegalArgumentException) {
                // This camera cannot run the effect next to these use cases: fall back to the plain camera.
                p.unbindAll(); null
            }
        }
        if (!effectOn) camera = try {
            p.bindToLifecycle(owner, selector, *useCases.toTypedArray())
        } catch (e: IllegalArgumentException) {
            // Some cameras cannot run frame analysis next to capture: retry without it rather than fail.
            if (analysisOn) {
                useCases.removeAt(useCases.lastIndex); analysisOn = false
                try { p.bindToLifecycle(owner, selector, *useCases.toTypedArray()) } catch (e2: IllegalArgumentException) { throw AppException(Errors.cameraUnavailable(), e2) }
            } else throw AppException(Errors.cameraUnavailable(), e)
        }
        val cam = camera!!
        val live = cam.cameraInfo.zoomState
        val obs = Observer<ZoomState> { onZoom(it.zoomRatio) }
        live.observe(owner, obs)
        zoomLive = live; zoomObserver = obs
        val zs = live.value
        val ev = cam.cameraInfo.exposureState
        val iso = chars?.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)
        val exp = chars?.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)
        return CameraSupport(
            hasFlash = cam.cameraInfo.hasFlashUnit(),
            minZoom = zs?.minZoomRatio ?: 1f, maxZoom = zs?.maxZoomRatio ?: 1f,
            evSupported = ev.isExposureCompensationSupported,
            evMin = ev.exposureCompensationRange.lower, evMax = ev.exposureCompensationRange.upper,
            evStep = ev.exposureCompensationStep.toFloat(),
            videoQualities = qualities, fpsOptions = fpsOptions, stabilisationSupported = stabSupported,
            hasFront = hasFront, hasBack = hasBack,
            boundCameraId = idOf(cam.cameraInfo), defaultBackId = defaultBack, bindableBackIds = bindable,
            extensions = available, extensionActive = useExt,
            rawSupported = rawSupported, rawActive = rawActive,
            manualSensor = manualSensor && useExt == ExtensionMode.NONE,
            isoRange = iso?.let { it.lower..it.upper }, exposureRangeNs = exp?.let { it.lower..it.upper },
            awbModes = chars?.get(CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES)?.toList().orEmpty(),
            minFocusDiopters = chars?.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f,
            photoSizes = sizes, photoSize = imageCapture?.resolutionInfo?.resolution,
            analysisActive = analysisOn,
            effectActive = effectOn,
        )
    }

    private fun idOf(info: CameraInfo): String? = runCatching { Camera2CameraInfo.from(info).cameraId }.getOrNull()

    // ---- focus, exposure and Pro controls --------------------------------------------------------

    private fun applyRequestOptions() {
        val c = camera ?: return
        val m = manual
        val b = CaptureRequestOptions.Builder().setCaptureRequestOption(CaptureRequest.CONTROL_AE_LOCK, m.aeLock)
        if (m.iso != null || m.exposureNs != null) {
            // Manual exposure needs both values; the missing one comes from what auto exposure was using.
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AE_MODE, CameraMetadata.CONTROL_AE_MODE_OFF)
            b.setCaptureRequestOption(CaptureRequest.SENSOR_SENSITIVITY, m.iso ?: lastLive.iso ?: 100)
            b.setCaptureRequestOption(CaptureRequest.SENSOR_EXPOSURE_TIME, m.exposureNs ?: lastLive.exposureNs ?: 10_000_000L)
        }
        m.awbMode?.let { b.setCaptureRequestOption(CaptureRequest.CONTROL_AWB_MODE, it) }
        m.focusDiopters?.let { d ->
            b.setCaptureRequestOption(CaptureRequest.CONTROL_AF_MODE, CameraMetadata.CONTROL_AF_MODE_OFF)
            b.setCaptureRequestOption(CaptureRequest.LENS_FOCUS_DISTANCE, d)
        }
        Camera2CameraControl.from(c.cameraControl).setCaptureRequestOptions(b.build())
    }

    fun setManual(m: ManualSettings) { manual = m; applyRequestOptions() }
    fun setExposureLock(locked: Boolean) = setManual(manual.copy(aeLock = locked))
    fun setManualFocus(diopters: Float?) = setManual(manual.copy(focusDiopters = diopters))

    fun lockFocusAt(view: PreviewView, x: Float, y: Float) {
        val c = camera ?: return
        c.cameraControl.startFocusAndMetering(
            FocusMeteringAction.Builder(view.meteringPointFactory.createPoint(x, y), FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE).disableAutoCancel().build(),
        )
    }

    fun unlockFocus() { camera?.cameraControl?.cancelFocusAndMetering() }

    /** Focus and meter on a point given in normalised analysis-frame coordinates (used for faces). */
    fun focusOnNormalised(view: PreviewView, nx: Float, ny: Float) {
        val c = camera ?: return
        val f = view.meteringPointFactory
        c.cameraControl.startFocusAndMetering(FocusMeteringAction.Builder(f.createPoint(nx * view.width, ny * view.height)).setAutoCancelDuration(3, java.util.concurrent.TimeUnit.SECONDS).build())
    }

    // ---- capture --------------------------------------------------------------------------------

    /**
     * Captures [count] full resolution JPEG frames back to back into [dir]. With [evSteps] (one per frame,
     * in exposure compensation steps) it captures an exposure bracket and restores the previous setting.
     */
    fun captureFrames(count: Int, dir: java.io.File, onProgress: (Int) -> Unit, onDone: (List<java.io.File>, Int) -> Unit, onError: (Throwable) -> Unit,
                      evSteps: List<Int>? = null) {
        val ic = imageCapture ?: return onError(AppException(Errors.cameraUnavailable()))
        val cam = camera ?: return onError(AppException(Errors.cameraUnavailable()))
        try { media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE * 2) } catch (t: Throwable) { return onError(t) }
        dir.mkdirs()
        val files = ArrayList<java.io.File>()
        var rotation = 0
        val previousEv = cam.cameraInfo.exposureState.exposureCompensationIndex
        fun finish(t: Throwable?) {
            if (evSteps != null) cam.cameraControl.setExposureCompensationIndex(previousEv)
            if (t != null) onError(t) else onDone(files, rotation)
        }
        lateinit var next: (Int) -> Unit
        fun shoot(i: Int) {
            ic.takePicture(executor, object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    try {
                        rotation = image.imageInfo.rotationDegrees
                        val buf = image.planes[0].buffer
                        val bytes = ByteArray(buf.remaining()); buf.get(bytes)
                        val f = java.io.File(dir, "frame_$i.jpg"); f.writeBytes(bytes); files += f
                    } catch (t: Throwable) { image.close(); return finish(t) }
                    image.close()
                    onProgress(i + 1)
                    next(i + 1)
                }
                override fun onError(exception: ImageCaptureException) = finish(AppException(Errors.captureFailed(), exception))
            })
        }
        next = { i ->
            if (i == count) finish(null) else {
            val ev = evSteps?.getOrNull(i)
            if (ev == null) shoot(i)
            else {
                // The future completes when the camera has applied the new exposure.
                val fut = cam.cameraControl.setExposureCompensationIndex(ev)
                fut.addListener({ shoot(i) }, executor)
            }
            }
        }
        next(0)
    }

    private fun unobserveZoom() {
        val l = zoomLive; val o = zoomObserver
        if (l != null && o != null) l.removeObserver(o)
        zoomLive = null; zoomObserver = null
    }

    fun unbind() {
        stopRecording()
        unobserveZoom()
        provider?.unbindAll()
        camera = null; imageCapture = null; videoCapture = null
    }

    fun setZoomRatio(r: Float) { camera?.cameraControl?.setZoomRatio(r) }
    fun setExposureIndex(i: Int) { camera?.cameraControl?.setExposureCompensationIndex(i) }
    fun setFlashMode(mode: Int) { imageCapture?.flashMode = mode }
    fun setTorch(on: Boolean) { camera?.cameraControl?.enableTorch(on) }

    fun focusAt(view: PreviewView, x: Float, y: Float) {
        val c = camera ?: return
        val point = view.meteringPointFactory.createPoint(x, y)
        c.cameraControl.startFocusAndMetering(
            FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE).setAutoCancelDuration(4, java.util.concurrent.TimeUnit.SECONDS).build(),
        )
    }

    /**
     * Takes a photo into MediaStore. When RAW is active the camera also writes a DNG file; [onSaved] is called
     * with the JPEG and [onRawSaved] with the DNG.
     */
    fun takePhoto(displayName: String, onSaved: (Uri) -> Unit, onError: (Throwable) -> Unit, onRawSaved: (Uri) -> Unit = {}) {
        val ic = imageCapture ?: return onError(AppException(Errors.cameraUnavailable()))
        try { media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE) } catch (t: Throwable) { return onError(t) }
        val jpeg = ImageCapture.OutputFileOptions.Builder(context.contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, media.photoValues(displayName)).build()
        val cb = object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(result: ImageCapture.OutputFileResults) {
                val uri = result.savedUri ?: return onError(AppException(Errors.mediaProvider()))
                if (result.imageFormat == ImageFormat.RAW_SENSOR) onRawSaved(uri) else onSaved(uri)
            }
            override fun onError(exception: ImageCaptureException) = onError(AppException(Errors.captureFailed(), exception))
        }
        if (rawActive) {
            val raw = ImageCapture.OutputFileOptions.Builder(context.contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                media.photoValues(displayName, "image/x-adobe-dng", "dng")).build()
            ic.takePicture(raw, jpeg, executor, cb)
        } else ic.takePicture(jpeg, executor, cb)
    }

    @SuppressLint("MissingPermission")
    fun startRecording(displayName: String, withAudio: Boolean, onEvent: (VideoRecordEvent) -> Unit) {
        val vc = videoCapture ?: throw AppException(Errors.cameraUnavailable())
        media.requireFree(MediaStoreRepository.MIN_VIDEO_FREE)
        val out = MediaStoreOutputOptions.Builder(context.contentResolver, MediaStore.Video.Media.EXTERNAL_CONTENT_URI)
            .setContentValues(media.videoValues(displayName)).build()
        var pending = vc.output.prepareRecording(context, out)
        if (withAudio) pending = pending.withAudioEnabled()
        recording = pending.start(executor) { e ->
            if (e is VideoRecordEvent.Finalize) recording = null
            onEvent(e)
        }
    }

    fun pauseRecording() { recording?.pause() }
    fun resumeRecording() { recording?.resume() }
    fun stopRecording() { recording?.stop() }
}
