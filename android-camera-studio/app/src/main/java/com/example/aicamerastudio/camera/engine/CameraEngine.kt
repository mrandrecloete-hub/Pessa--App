package com.example.aicamerastudio.camera.engine

import android.annotation.SuppressLint
import android.content.Context
import android.net.Uri
import android.provider.MediaStore
import android.util.Range
import androidx.camera.core.*
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
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
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

enum class CaptureMode { PHOTO, ZOOM, VIDEO }

enum class AspectChoice(val label: String, val cameraxRatio: Int) {
    R4_3("4:3", AspectRatio.RATIO_4_3), R16_9("16:9", AspectRatio.RATIO_16_9)
}

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
    /** Camera2 id of the bound camera, and of the default back camera, plus all back ids CameraX can bind. */
    val boundCameraId: String?,
    val defaultBackId: String?,
    val bindableBackIds: Set<String>,
)

class CameraEngine(private val context: Context, private val media: MediaStoreRepository) {
    private val executor: Executor = ContextCompat.getMainExecutor(context)
    private var provider: ProcessCameraProvider? = null
    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var recording: Recording? = null
    private var zoomLive: androidx.lifecycle.LiveData<ZoomState>? = null
    private var zoomObserver: Observer<ZoomState>? = null

    val isRecording: Boolean get() = recording != null

    private suspend fun <T> ListenableFuture<T>.await(): T = suspendCancellableCoroutine { cont ->
        addListener({
            try { cont.resume(get()) } catch (t: Throwable) { cont.resumeWithException(t.cause ?: t) }
        }, executor)
        cont.invokeOnCancellation { cancel(false) }
    }

    @androidx.annotation.OptIn(androidx.camera.core.ExperimentalCameraInfo::class)
    /** Binds preview plus one capture use case for the mode. Returns the real capabilities of that camera. */
    suspend fun bind(owner: LifecycleOwner, view: PreviewView, cfg: BindConfig, onZoom: (Float) -> Unit): CameraSupport {
        val p = provider ?: ProcessCameraProvider.getInstance(context).await().also { provider = it }
        val hasBack = p.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)
        val hasFront = p.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)
        val backInfos = p.availableCameraInfos.filter { it.lensFacing == CameraSelector.LENS_FACING_BACK }
        val bindable = backInfos.mapNotNull { idOf(it) }.toSet()
        val defaultBack = if (hasBack) runCatching { idOf(p.getCameraInfo(CameraSelector.DEFAULT_BACK_CAMERA)) }.getOrNull() else null
        val selector = when {
            cfg.mode == CaptureMode.ZOOM && cfg.cameraId != null && cfg.cameraId in bindable ->
                CameraSelector.Builder().addCameraFilter { infos -> infos.filter { idOf(it) == cfg.cameraId } }.build()
            cfg.frontCamera && hasFront && cfg.mode != CaptureMode.ZOOM -> CameraSelector.DEFAULT_FRONT_CAMERA
            hasBack -> CameraSelector.DEFAULT_BACK_CAMERA
            hasFront -> CameraSelector.DEFAULT_FRONT_CAMERA
            else -> throw AppException(Errors.cameraUnavailable())
        }
        stopRecording()
        unobserveZoom()
        p.unbindAll()
        aeLock = false; manualFocusDiopters = null

        val info = p.getCameraInfo(selector)
        val caps = Recorder.getVideoCapabilities(info)
        val qualities = caps.getSupportedQualities(androidx.camera.core.DynamicRange.SDR)
        val fpsRanges = info.supportedFrameRateRanges
        val fpsOptions = listOf(24, 30, 60).filter { f -> fpsRanges.any { it.contains(f) } }
        val stabSupported = caps.isStabilizationSupported

        val resolution = ResolutionSelector.Builder()
            .setAspectRatioStrategy(
                AspectRatioStrategy(cfg.aspect.cameraxRatio, AspectRatioStrategy.FALLBACK_RULE_AUTO),
            ).build()
        val preview = Preview.Builder().setResolutionSelector(resolution).build()
            .also { it.surfaceProvider = view.surfaceProvider }

        val useCase: UseCase = when (cfg.mode) {
            CaptureMode.PHOTO, CaptureMode.ZOOM -> ImageCapture.Builder()
                .setResolutionSelector(resolution)
                .setCaptureMode(ImageCapture.CAPTURE_MODE_MAXIMIZE_QUALITY)
                .setFlashMode(cfg.flashMode)
                .build().also { imageCapture = it; videoCapture = null }
            CaptureMode.VIDEO -> {
                val q = cfg.videoQuality?.takeIf { it in qualities } ?: qualities.firstOrNull() ?: Quality.HIGHEST
                val recorder = Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(q, FallbackStrategy.lowerQualityOrHigherThan(q)))
                    .build()
                val b = VideoCapture.Builder(recorder)
                if (cfg.fps != null && cfg.fps in fpsOptions) b.setTargetFrameRate(Range(cfg.fps, cfg.fps))
                if (cfg.stabilise && stabSupported) b.setVideoStabilizationEnabled(true)
                b.build().also { videoCapture = it; imageCapture = null }
            }
        }
        camera = try {
            p.bindToLifecycle(owner, selector, preview, useCase)
        } catch (e: IllegalArgumentException) {
            throw AppException(Errors.cameraUnavailable(), e)
        }
        val cam = camera!!
        val live = cam.cameraInfo.zoomState
        val obs = Observer<ZoomState> { onZoom(it.zoomRatio) }
        live.observe(owner, obs)
        zoomLive = live; zoomObserver = obs
        val zs = live.value
        val ev = cam.cameraInfo.exposureState
        return CameraSupport(
            hasFlash = cam.cameraInfo.hasFlashUnit(),
            minZoom = zs?.minZoomRatio ?: 1f, maxZoom = zs?.maxZoomRatio ?: 1f,
            evSupported = ev.isExposureCompensationSupported,
            evMin = ev.exposureCompensationRange.lower, evMax = ev.exposureCompensationRange.upper,
            evStep = ev.exposureCompensationStep.toFloat(),
            videoQualities = qualities, fpsOptions = fpsOptions, stabilisationSupported = stabSupported,
            hasFront = hasFront, hasBack = hasBack,
            boundCameraId = idOf(cam.cameraInfo), defaultBackId = defaultBack, bindableBackIds = bindable,
        )
    }

    @androidx.annotation.OptIn(androidx.camera.camera2.interop.ExperimentalCamera2Interop::class)
    private fun idOf(info: CameraInfo): String? = runCatching { androidx.camera.camera2.interop.Camera2CameraInfo.from(info).cameraId }.getOrNull()

    // ---- focus and exposure controls -------------------------------------------------------------

    private var aeLock = false
    private var manualFocusDiopters: Float? = null

    @androidx.annotation.OptIn(androidx.camera.camera2.interop.ExperimentalCamera2Interop::class)
    private fun applyRequestOptions() {
        val c = camera ?: return
        val b = androidx.camera.camera2.interop.CaptureRequestOptions.Builder()
            .setCaptureRequestOption(android.hardware.camera2.CaptureRequest.CONTROL_AE_LOCK, aeLock)
        manualFocusDiopters?.let { d ->
            b.setCaptureRequestOption(android.hardware.camera2.CaptureRequest.CONTROL_AF_MODE, android.hardware.camera2.CameraMetadata.CONTROL_AF_MODE_OFF)
            b.setCaptureRequestOption(android.hardware.camera2.CaptureRequest.LENS_FOCUS_DISTANCE, d)
        }
        androidx.camera.camera2.interop.Camera2CameraControl.from(c.cameraControl).setCaptureRequestOptions(b.build())
    }

    /** Locks or unlocks auto exposure (the camera keeps the current exposure). */
    fun setExposureLock(locked: Boolean) { aeLock = locked; applyRequestOptions() }

    /** Manual focus distance in diopters (0 = infinity), or null for autofocus. Only on cameras that support it. */
    fun setManualFocus(diopters: Float?) { manualFocusDiopters = diopters; applyRequestOptions() }

    /** Focuses on a point and keeps that focus until [unlockFocus]. */
    fun lockFocusAt(view: PreviewView, x: Float, y: Float) {
        val c = camera ?: return
        c.cameraControl.startFocusAndMetering(
            FocusMeteringAction.Builder(view.meteringPointFactory.createPoint(x, y), FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
                .disableAutoCancel().build(),
        )
    }

    fun unlockFocus() { camera?.cameraControl?.cancelFocusAndMetering() }

    /**
     * Captures [count] full resolution JPEG frames back to back into [dir] (as files, so memory stays low).
     * Calls [onDone] with the files and the rotation needed to make them upright.
     */
    fun captureFrames(count: Int, dir: java.io.File, onProgress: (Int) -> Unit, onDone: (List<java.io.File>, Int) -> Unit, onError: (Throwable) -> Unit) {
        val ic = imageCapture ?: return onError(AppException(Errors.cameraUnavailable()))
        try { media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE * 2) } catch (t: Throwable) { return onError(t) }
        dir.mkdirs()
        val files = ArrayList<java.io.File>()
        var rotation = 0
        fun next(i: Int) {
            if (i == count) { onDone(files, rotation); return }
            ic.takePicture(executor, object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    try {
                        rotation = image.imageInfo.rotationDegrees
                        val buf = image.planes[0].buffer
                        val bytes = ByteArray(buf.remaining()); buf.get(bytes)
                        val f = java.io.File(dir, "frame_$i.jpg"); f.writeBytes(bytes); files += f
                    } catch (t: Throwable) { image.close(); return onError(t) }
                    image.close()
                    onProgress(i + 1)
                    next(i + 1)
                }
                override fun onError(exception: ImageCaptureException) = onError(AppException(Errors.captureFailed(), exception))
            })
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
            FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
                .setAutoCancelDuration(4, java.util.concurrent.TimeUnit.SECONDS).build(),
        )
    }

    fun takePhoto(displayName: String, onSaved: (Uri) -> Unit, onError: (Throwable) -> Unit) {
        val ic = imageCapture ?: return onError(AppException(Errors.cameraUnavailable()))
        try { media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE) } catch (t: Throwable) { return onError(t) }
        val opts = ImageCapture.OutputFileOptions.Builder(
            context.contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, media.photoValues(displayName),
        ).build()
        ic.takePicture(opts, executor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(result: ImageCapture.OutputFileResults) {
                val uri = result.savedUri
                if (uri != null) onSaved(uri) else onError(AppException(Errors.mediaProvider()))
            }
            override fun onError(exception: ImageCaptureException) = onError(AppException(Errors.captureFailed(), exception))
        })
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

    fun stopRecording() { recording?.stop() }
}
