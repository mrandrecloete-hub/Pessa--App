package com.example.aicamerastudio.camera

import android.graphics.Bitmap
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.RenderEffect
import android.net.Uri
import android.os.Build
import androidx.camera.core.ImageCapture
import androidx.camera.extensions.ExtensionMode
import androidx.camera.video.Quality
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateFloat
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.camera.engine.*
import com.example.aicamerastudio.camera.ui.*
import com.example.aicamerastudio.camera.zoom.UltraZoomWorker
import com.example.aicamerastudio.core.design.ErrorCard
import com.example.aicamerastudio.core.design.Tokens
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorCode
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.preferences.UserPreferences
import com.example.aicamerastudio.photo.enhancement.EnhanceWorker
import com.example.aicamerastudio.photo.enhancement.FinishPhotoWorker
import com.example.aicamerastudio.photo.filters.FilterMath
import com.example.aicamerastudio.photo.filters.Filters
import com.example.aicamerastudio.photo.portrait.PortraitLight
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.abs
import kotlin.math.roundToInt

private val FLASH_MODES = listOf(ImageCapture.FLASH_MODE_OFF, ImageCapture.FLASH_MODE_AUTO, ImageCapture.FLASH_MODE_ON)
private fun flashLabel(m: Int) = when (m) { ImageCapture.FLASH_MODE_AUTO -> "Flash auto"; ImageCapture.FLASH_MODE_ON -> "Flash on"; else -> "Flash off" }
private fun qualityLabel(q: Quality) = when (q) { Quality.UHD -> "4K"; Quality.FHD -> "1080p"; Quality.HD -> "720p"; Quality.SD -> "480p"; else -> "Auto" }
private fun qualityOf(name: String) = when (name) { "UHD" -> Quality.UHD; "FHD" -> Quality.FHD; "HD" -> Quality.HD; "SD" -> Quality.SD; else -> null }

private enum class Sheet { NONE, FILTERS, RESOLUTION, BEAUTY }

@Composable
fun CameraScreen(audioGranted: Boolean, bottomInset: Dp, prefs: UserPreferences, onOpenMedia: (Uri, Boolean) -> Unit = { _, _ -> }) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val owner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val engine = remember { CameraEngine(context, graph.media) }
    val previewView = remember { PreviewView(context).apply { implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }
    val sound = remember { ShutterSound(context) }
    DisposableEffect(Unit) { onDispose { sound.release() } }

    var front by rememberSaveable { mutableStateOf(false) }
    var mode by rememberSaveable { mutableStateOf(CaptureMode.PHOTO) }
    var aspect by rememberSaveable { mutableStateOf(AspectChoice.R4_3) }
    var flash by rememberSaveable { mutableIntStateOf(ImageCapture.FLASH_MODE_OFF) }
    var torch by remember { mutableStateOf(false) }
    var timer by rememberSaveable { mutableIntStateOf(prefs.defaultTimer) }
    var quality by remember { mutableStateOf(qualityOf(prefs.videoQuality)) }
    var fps by remember { mutableStateOf<Int?>(null) }
    var stabilise by rememberSaveable { mutableStateOf(false) }
    var showEv by remember { mutableStateOf(false) }
    var evIndex by remember { mutableIntStateOf(0) }
    var hdr by rememberSaveable { mutableStateOf(false) }
    var raw by rememberSaveable { mutableStateOf(false) }
    var megapixels by rememberSaveable { mutableIntStateOf(prefs.photoMegapixels) }
    var filterId by rememberSaveable { mutableStateOf(Filters.NATURAL.id) }
    var filterK by rememberSaveable { mutableFloatStateOf(1f) }
    var light by rememberSaveable { mutableStateOf(PortraitLight.NATURAL) }
    var blur by rememberSaveable { mutableFloatStateOf(0.6f) }
    var lightK by rememberSaveable { mutableFloatStateOf(0.6f) }
    var phoneBokeh by rememberSaveable { mutableStateOf(true) }
    var sheet by remember { mutableStateOf(Sheet.NONE) }
    var sample by remember { mutableStateOf<Bitmap?>(null) }
    var manual by remember { mutableStateOf(ManualSettings()) }
    var face by remember { mutableStateOf<FaceBox?>(null) }
    var hist by remember { mutableStateOf<IntArray?>(null) }
    var flashTrigger by remember { mutableIntStateOf(0) }
    var lastMedia by remember { mutableStateOf<Pair<Uri, Boolean>?>(null) }
    val live by engine.liveExposure.collectAsState()

    // ---- beauty camera ----
    val beautyStore = remember { com.example.aicamerastudio.camera.beauty.BeautyStore(context) }
    var beauty by remember { mutableStateOf(beautyStore.load()) }
    val beautyProc = remember { lazy { com.example.aicamerastudio.camera.beauty.BeautyProcessor(context.applicationContext) } }
    DisposableEffect(Unit) { onDispose { if (beautyProc.isInitialized()) beautyProc.value.release() } }
    val beautyMode = mode == CaptureMode.PHOTO || mode == CaptureMode.VIDEO
    val beautyActive = beauty.enabled && beautyMode
    LaunchedEffect(beauty) { beautyStore.save(beauty); if (beautyProc.isInitialized()) beautyProc.value.state = beauty }
    // Crash guard: remember that the live effect is starting; clear it once frames are really being processed.
    LaunchedEffect(beautyActive) { if (beautyActive) beautyStore.markStarting() else beautyStore.markHealthy() }
    val beautyStatus by (if (beautyActive) beautyProc.value.status else kotlinx.coroutines.flow.flowOf(com.example.aicamerastudio.camera.beauty.BeautyStatus()))
        .collectAsState(com.example.aicamerastudio.camera.beauty.BeautyStatus())
    LaunchedEffect(beautyStatus.fps) { if (beautyActive && beautyStatus.fps > 0f) beautyStore.markHealthy() }

    var support by remember { mutableStateOf<CameraSupport?>(null) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var error by remember { mutableStateOf<AppError?>(null) }
    var countdown by remember { mutableIntStateOf(0) }
    var focusPoint by remember { mutableStateOf<Offset?>(null) }
    var busy by remember { mutableStateOf(false) }
    var lastSaved by remember { mutableStateOf<Uri?>(null) }
    var recording by remember { mutableStateOf(false) }
    var paused by remember { mutableStateOf(false) }
    var recSeconds by remember { mutableLongStateOf(0L) }
    var recBytes by remember { mutableLongStateOf(0L) }
    var notice by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        if (beautyStore.lastRunFailed) notice = "Beauty was turned off because the camera closed the last time it ran. You can turn it on again from the Beauty button."
    }

    // ---- ultra zoom state (unchanged behaviour) ----
    var zoomBindId by remember { mutableStateOf<String?>(null) }
    var zoomTarget by rememberSaveable { mutableFloatStateOf(1f) }
    var catalog by remember { mutableStateOf<com.example.aicamerastudio.camera.capabilities.LensCatalog.Catalog?>(null) }
    var mainRange by remember { mutableStateOf(1f to 1f) }
    val separateMax = remember { mutableStateMapOf<String, Float>() }
    var zoomFrames by rememberSaveable { mutableIntStateOf(3) }
    var zoomAi by rememberSaveable { mutableStateOf(true) }
    var aeLocked by remember { mutableStateOf(false) }
    var afLocked by remember { mutableStateOf(false) }
    var manualFocus by remember { mutableStateOf<Float?>(null) }
    var burstJob by remember { mutableStateOf<String?>(null) }
    var framesTaken by remember { mutableIntStateOf(-1) }
    var framesWanted by remember { mutableIntStateOf(0) }
    val planner = remember(catalog, mainRange, separateMax.toMap()) {
        com.example.aicamerastudio.camera.zoom.ZoomPlanner(catalog?.others.orEmpty(), catalog?.main, mainRange.first, mainRange.second, separateMax.toMap())
    }
    val plan = planner.plan(zoomTarget)
    val steadiness = com.example.aicamerastudio.camera.stabilisation.rememberSteadiness(plan.requested, mode == CaptureMode.ZOOM || mode == CaptureMode.NIGHT)
    val steadyNow by rememberUpdatedState(steadiness)

    val filter = Filters.byId(filterId)
    // While Beauty is on in Photo mode, its presets replace the older colour filters (they would apply twice).
    val filterModes = (mode == CaptureMode.PHOTO && !beautyActive) || mode == CaptureMode.PORTRAIT || mode == CaptureMode.PRO
    val wantExtension = when {
        mode == CaptureMode.PHOTO && hdr && !beautyActive -> ExtensionMode.HDR
        mode == CaptureMode.NIGHT -> ExtensionMode.NIGHT
        mode == CaptureMode.PORTRAIT && phoneBokeh -> ExtensionMode.BOKEH
        else -> ExtensionMode.NONE
    }
    val analysisWanted = mode == CaptureMode.PORTRAIT || mode == CaptureMode.PRO

    // Live frame analysis (faces for Portrait, histogram for Pro).
    val analysis = remember { FrameAnalysis(graph.models) { r -> ContextCompat.getMainExecutor(context).execute(r) } }
    LaunchedEffect(mode) {
        analysis.wantFaces = mode == CaptureMode.PORTRAIT; analysis.wantHistogram = mode == CaptureMode.PRO
        analysis.onFace = { face = it }; analysis.onHistogram = { hist = it }
        engine.analyzer = { analysis.analyze(it) }
        face = null; hist = null
    }

    LaunchedEffect(front, mode, aspect, quality, fps, stabilise, zoomBindId, wantExtension, megapixels, raw, beautyActive) {
        try {
            val effect = if (beautyActive) beautyProc.value.let { proc ->
                proc.state = beauty
                com.example.aicamerastudio.camera.beauty.BeautyEffect(proc,
                    if (mode == CaptureMode.VIDEO) androidx.camera.core.CameraEffect.PREVIEW or androidx.camera.core.CameraEffect.VIDEO_CAPTURE else androidx.camera.core.CameraEffect.PREVIEW)
            } else null
            val s = engine.bind(owner, previewView, BindConfig(front, zoomBindId.takeIf { mode == CaptureMode.ZOOM }, mode, aspect, quality, fps, stabilise, flash,
                extension = wantExtension, photoMegapixels = megapixels, raw = raw && mode == CaptureMode.PRO,
                analysis = if (analysisWanted) AnalysisKind.FRAMES else AnalysisKind.NONE, liveExposure = mode == CaptureMode.PRO, effect = effect)) { zoom = it }
            support = s
            evIndex = 0; manual = ManualSettings()
            error = null
            if (!s.hasFront && front) front = false
            aeLocked = false; afLocked = false; manualFocus = null
            if (mode == CaptureMode.ZOOM) {
                if (s.boundCameraId == s.defaultBackId) mainRange = s.minZoom to s.maxZoom
                else s.boundCameraId?.let { separateMax[it] = s.maxZoom }
                if (catalog == null && s.defaultBackId != null) catalog = withContext(Dispatchers.IO) {
                    runCatching { com.example.aicamerastudio.camera.capabilities.LensCatalog.read(context, s.defaultBackId, s.bindableBackIds) }.getOrNull()
                }
            }
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            error = ErrorMapper.map(t)
        }
    }
    DisposableEffect(owner) {
        val obs = LifecycleEventObserver { _, e -> if (e == Lifecycle.Event.ON_STOP) { engine.stopRecording(); torch = false } }
        owner.lifecycle.addObserver(obs)
        onDispose { owner.lifecycle.removeObserver(obs); engine.analyzer = null; engine.unbind() }
    }
    LaunchedEffect(focusPoint) { if (focusPoint != null && !afLocked) { delay(1200); focusPoint = null } }
    // Last saved photo or video, for the thumbnail next to the shutter.
    LaunchedEffect(lastSaved, burstJob) { lastMedia = withContext(Dispatchers.IO) { graph.media.page(0, 1).firstOrNull()?.let { it.uri to it.isVideo } } }
    // Portrait subject focus: keep focus and metering on the detected face.
    LaunchedEffect(face) {
        val f = face ?: return@LaunchedEffect
        if (mode == CaptureMode.PORTRAIT) { delay(150); engine.focusOnNormalised(previewView, f.x + f.w / 2, f.y + f.h / 2) }
    }

    LaunchedEffect(zoomTarget, planner, mode, support) {
        if (mode != CaptureMode.ZOOM || support == null) return@LaunchedEffect
        val r = planner.route(zoomTarget)
        if (r.bindCameraId == zoomBindId) engine.setZoomRatio(r.cameraRatio)
        else { delay(350); zoomBindId = r.bindCameraId }
    }
    val zoomRoute = planner.route(zoomTarget)
    val previewScale = if (mode == CaptureMode.ZOOM && zoomRoute.bindCameraId == zoomBindId) zoomRoute.extendedCrop else 1f

    // Progress of background work for the last capture (enhance, finish, or burst modes).
    val wm = WorkManager.getInstance(context)
    val burstWork by (burstJob?.let { wm.getWorkInfosForUniqueWorkFlow(it) } ?: kotlinx.coroutines.flow.flowOf(emptyList())).collectAsState(initial = emptyList())
    val enhWork by (lastSaved?.let { wm.getWorkInfosForUniqueWorkFlow(EnhanceWorker.uniqueName(it)) } ?: kotlinx.coroutines.flow.flowOf(emptyList())).collectAsState(initial = emptyList())
    val finWork by (lastSaved?.let { wm.getWorkInfosForUniqueWorkFlow(FinishPhotoWorker.uniqueName(it)) } ?: kotlinx.coroutines.flow.flowOf(emptyList())).collectAsState(initial = emptyList())
    val status = burstWork.firstOrNull()?.let { w ->
        when (w.state) {
            WorkInfo.State.RUNNING -> "Processing ${(w.progress.getFloat(UltraZoomWorker.K_PROGRESS, 0f) * 100).toInt()}%"
            WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> "Processing queued"
            WorkInfo.State.SUCCEEDED -> "Saved with its original. " + w.outputData.getString(UltraZoomWorker.K_NOTES).orEmpty()
            WorkInfo.State.FAILED -> w.outputData.getString(UltraZoomWorker.K_ERROR) ?: "Processing failed. The original frame was kept."
            WorkInfo.State.CANCELLED -> "Processing cancelled."
        }
    }.takeIf { burstJob != null } ?: finWork.firstOrNull()?.let { w ->
        when (w.state) {
            WorkInfo.State.RUNNING -> "Applying your look ${(w.progress.getFloat(FinishPhotoWorker.K_PROGRESS, 0f) * 100).toInt()}%"
            WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> "Applying your look"
            WorkInfo.State.SUCCEEDED -> "Photo saved. " + w.outputData.getString(FinishPhotoWorker.K_NOTES).orEmpty()
            WorkInfo.State.FAILED -> w.outputData.getString(FinishPhotoWorker.K_ERROR) ?: "Could not apply the look. Your original is safe."
            WorkInfo.State.CANCELLED -> "Cancelled. Your original is safe."
        }
    } ?: enhWork.firstOrNull()?.let { w ->
        when (w.state) {
            WorkInfo.State.RUNNING -> "Enhancing ${(w.progress.getFloat(EnhanceWorker.K_PROGRESS, 0f) * 100).toInt()}%"
            WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> "Enhancement queued"
            WorkInfo.State.SUCCEEDED -> "Enhanced copy saved. Original kept. " + w.outputData.getString(EnhanceWorker.K_NOTES).orEmpty()
            WorkInfo.State.FAILED -> w.outputData.getString(EnhanceWorker.K_ERROR) ?: "Enhancement failed. Your original is safe."
            WorkInfo.State.CANCELLED -> "Enhancement cancelled. Your original is safe."
        }
    }

    fun shutterFeedback() {
        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        sound.play(prefs.shutterSound)
        flashTrigger++
    }

    suspend fun countdownIfNeeded() { if (timer > 0) { for (t in timer downTo 1) { countdown = t; delay(1000) }; countdown = 0 } }

    fun afterPhoto(uri: Uri) {
        lastSaved = uri
        // Beauty: the photo just saved is the untouched original; an enhanced copy is made with the same GPU renderer as the preview.
        if (beautyActive && support?.effectActive == true && !beauty.isNeutral) {
            val look = beauty
            notice = "Applying beauty to a copy..."
            scope.launch {
                notice = try {
                    val copy = withContext(Dispatchers.Default) {
                        val photo = com.example.aicamerastudio.photo.enhancement.ImageLoader.decode(context.contentResolver, uri)
                        val r = com.example.aicamerastudio.camera.beauty.BeautyStill.process(context, photo, look)
                        photo.recycle()
                        graph.media.saveJpeg(MediaStoreRepository.timestampName("BC_", "_beauty"), r.bitmap, prefs.jpegQuality).also { r.bitmap.recycle() }
                    }
                    lastSaved = copy
                    "Beauty copy saved. Original kept."
                } catch (t: Throwable) {
                    if (t is kotlinx.coroutines.CancellationException) throw t
                    "Could not make the beauty copy. Your original photo is saved."
                }
            }
            return
        }
        val look = FinishPhotoWorker.Look(
            enhance = prefs.autoEnhance && mode != CaptureMode.PRO, profile = prefs.profile, strength = prefs.strength,
            light = if (mode == CaptureMode.PORTRAIT && support?.extensionActive != ExtensionMode.BOKEH) light else if (mode == CaptureMode.PORTRAIT && light != PortraitLight.NATURAL) light else null,
            blur = if (mode == CaptureMode.PORTRAIT && support?.extensionActive == ExtensionMode.BOKEH) 0f else blur, lightIntensity = lightK,
            filterId = if (filterModes) filterId else Filters.NATURAL.id, filterIntensity = filterK,
            watermark = if (prefs.watermark) prefs.watermarkText else null, quality = prefs.jpegQuality, keep = prefs.keepUntouched)
        when {
            look.needsFinishing -> FinishPhotoWorker.enqueue(context, uri, look)
            prefs.autoEnhance && mode != CaptureMode.PRO -> EnhanceWorker.enqueue(context, uri, prefs)
            else -> notice = "Photo saved"
        }
    }

    fun burst(kind: String, count: Int, evSteps: List<Int>? = null, crop: Float = 1f, ai: Boolean = false, label: String) {
        busy = true; framesTaken = 0; framesWanted = count
        val name = "${kind}_${System.currentTimeMillis()}"
        val dir = java.io.File(context.cacheDir, "zoom/$name")
        engine.captureFrames(count, dir, onProgress = { framesTaken = it }, onDone = { files, rot ->
            busy = false; framesTaken = -1
            UltraZoomWorker.enqueue(context, name, dir, files.size, crop, rot, ai, prefs.strength, label, kind, if (prefs.watermark) prefs.watermarkText else null)
            burstJob = name
        }, onError = { busy = false; framesTaken = -1; dir.deleteRecursively(); error = ErrorMapper.map(it) }, evSteps = evSteps)
    }

    fun capture() {
        if (busy) return
        val s = support ?: return
        scope.launch {
            countdownIfNeeded()
            when {
                mode == CaptureMode.ZOOM -> {
                    if (plan.requested >= 5f && steadyNow != null) {
                        val until = System.currentTimeMillis() + 2000
                        while (steadyNow != com.example.aicamerastudio.camera.stabilisation.Steadiness.STEADY && System.currentTimeMillis() < until) delay(40)
                    }
                    shutterFeedback()
                    val route = planner.route(zoomTarget)
                    burst(UltraZoomWorker.KIND_ZOOM, zoomFrames, crop = if (route.bindCameraId == zoomBindId) route.extendedCrop else 1f, ai = zoomAi, label = plan.label)
                }
                mode == CaptureMode.NIGHT && s.extensionActive != ExtensionMode.NIGHT -> { shutterFeedback(); burst(UltraZoomWorker.KIND_NIGHT, 5, label = "Night, 5 frames merged by BlazeCam") }
                mode == CaptureMode.PHOTO && hdr && !beautyActive && s.extensionActive != ExtensionMode.HDR -> {
                    val k = (2f / s.evStep).roundToInt().coerceIn(1, minOf(-s.evMin, s.evMax))
                    shutterFeedback(); burst(UltraZoomWorker.KIND_HDR, 3, evSteps = listOf(-k, 0, k), label = "HDR, 3 exposures fused by BlazeCam")
                }
                else -> {
                    shutterFeedback(); busy = true
                    engine.takePhoto(MediaStoreRepository.timestampName("BC_"), onSaved = { uri -> busy = false; afterPhoto(uri) },
                        onError = { busy = false; error = ErrorMapper.map(it).takeIf { e -> e.code != ErrorCode.UNKNOWN } ?: Errors.captureFailed() },
                        onRawSaved = { notice = "RAW (DNG) saved next to the photo" })
                }
            }
        }
    }

    fun toggleRecording() {
        if (recording) { engine.stopRecording(); return }
        try {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            recSeconds = 0; recBytes = 0; paused = false
            engine.startRecording(MediaStoreRepository.timestampName("BC_"), audioGranted) { e ->
                when (e) {
                    is VideoRecordEvent.Start -> recording = true
                    is VideoRecordEvent.Pause -> paused = true
                    is VideoRecordEvent.Resume -> paused = false
                    is VideoRecordEvent.Status -> { recSeconds = e.recordingStats.recordedDurationNanos / 1_000_000_000; recBytes = e.recordingStats.numBytesRecorded }
                    is VideoRecordEvent.Finalize -> {
                        recording = false; paused = false
                        if (e.hasError() && e.error != VideoRecordEvent.Finalize.ERROR_NONE) {
                            error = when (e.error) {
                                VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE -> Errors.lowStorage()
                                VideoRecordEvent.Finalize.ERROR_NO_VALID_DATA -> Errors.captureFailed().copy(what = "The recording was too short to save.", whatToDo = "Record for at least a second.")
                                else -> Errors.exportFailed().copy(what = "The video could not be finished.")
                            }
                        } else { notice = "Video saved"; lastSaved = e.outputResults.outputUri }
                    }
                    else -> {}
                }
            }
        } catch (t: Throwable) { error = ErrorMapper.map(t) }
    }

    // Live filter preview: the same colour matrix the photo will get, applied by the GPU (Android 12+).
    val liveFilter = Build.VERSION.SDK_INT >= 31 && filterModes && filter != Filters.NATURAL
    val previewEffect = if (liveFilter) RenderEffect.createColorFilterEffect(ColorMatrixColorFilter(ColorMatrix(FilterMath.mix(filter.matrix, filterK)))).asComposeRenderEffect() else null

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize()
            .graphicsLayer(scaleX = previewScale, scaleY = previewScale, renderEffect = previewEffect)
            .pointerInput(support, mode, afLocked) {
                detectTapGestures(onTap = { o ->
                    focusPoint = o; sheet = Sheet.NONE
                    if (mode == CaptureMode.ZOOM && afLocked) engine.lockFocusAt(previewView, o.x, o.y) else engine.focusAt(previewView, o.x, o.y)
                })
            }.pointerInput(support, mode) {
                detectTransformGestures { _, _, z, _ ->
                    val s = support ?: return@detectTransformGestures
                    if (z == 1f) return@detectTransformGestures
                    if (mode == CaptureMode.ZOOM) zoomTarget = (zoomTarget * z).coerceIn(planner.minZoom, planner.maxZoom)
                    else { val n = (zoom * z).coerceIn(s.minZoom, s.maxZoom); zoom = n; engine.setZoomRatio(n) }
                }
            })
        if (prefs.grid) Canvas(Modifier.fillMaxSize()) {
            val c = Color.White.copy(alpha = 0.35f)
            for (i in 1..2) {
                drawLine(c, Offset(size.width * i / 3, 0f), Offset(size.width * i / 3, size.height), 1.5f)
                drawLine(c, Offset(0f, size.height * i / 3), Offset(size.width, size.height * i / 3), 1.5f)
            }
        }
        face?.let { if (mode == CaptureMode.PORTRAIT) FaceBrackets(it, front) }
        focusPoint?.let { FocusRing(it) }
        CaptureFlash(flashTrigger)
        if (countdown > 0) Text("$countdown", Modifier.align(Alignment.Center), color = Tokens.goldLight, style = MaterialTheme.typography.displayLarge)
        if (previewScale > 1.01f) Text("Preview enlarged ${"%.1f".format(previewScale)}×. Final detail comes from processing after capture.",
            Modifier.align(Alignment.TopCenter).windowInsetsPadding(WindowInsets.statusBars).padding(top = 72.dp, start = 16.dp, end = 16.dp).clip(RoundedCornerShape(12.dp)).background(Tokens.glass).padding(8.dp),
            color = Color.White, style = MaterialTheme.typography.labelSmall)

        // ---------- top controls ----------
        Column(Modifier.align(Alignment.TopCenter).fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).padding(Tokens.spaceSm), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            val s = support
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                if (s?.hasFlash == true) {
                    if (mode != CaptureMode.VIDEO) GlassButton(Icons.Default.FlashOn, flashLabel(flash), flash != ImageCapture.FLASH_MODE_OFF) {
                        flash = FLASH_MODES[(FLASH_MODES.indexOf(flash) + 1) % FLASH_MODES.size]; engine.setFlashMode(flash)
                    } else GlassButton(Icons.Default.FlashlightOn, if (torch) "Torch on" else "Torch off", torch) { torch = !torch; engine.setTorch(torch) }
                }
                if (beautyMode) GlassButton(Icons.Default.Face, if (beauty.enabled) "Beauty on. Open beauty settings" else "Beauty off. Turn on", beauty.enabled, label = "Beauty") {
                    if (!beauty.enabled) { beauty = beauty.copy(enabled = true); sheet = Sheet.BEAUTY }
                    else sheet = if (sheet == Sheet.BEAUTY) Sheet.NONE else Sheet.BEAUTY
                    if (sheet == Sheet.BEAUTY) sample = previewView.bitmap?.let { b -> Bitmap.createScaledBitmap(b, 72, (72f * b.height / b.width).toInt().coerceAtLeast(1), true) }
                }
                if (mode == CaptureMode.PHOTO && !beautyActive && s != null && (ExtensionMode.HDR in s.extensions || s.evSupported))
                    GlassButton(null, if (hdr) "HDR on" else "HDR off", hdr, label = "HDR") { hdr = !hdr }
                if (mode != CaptureMode.VIDEO && mode != CaptureMode.PRO && !beautyActive) GlassButton(Icons.Default.AutoAwesome, if (prefs.autoEnhance) "AI enhancement on" else "AI enhancement off", prefs.autoEnhance, label = "AI") {
                    scope.launch { graph.preferences.update { it.copy(autoEnhance = !it.autoEnhance) } }
                }
                if (mode != CaptureMode.VIDEO && s != null && s.photoSizes.isNotEmpty()) {
                    val mp = (s.photoSize ?: s.photoSizes.first()).let { (it.width.toLong() * it.height / 1_000_000.0).roundToInt() }
                    GlassButton(null, "Photo resolution $mp megapixels", sheet == Sheet.RESOLUTION, label = "${mp}M") { sheet = if (sheet == Sheet.RESOLUTION) Sheet.NONE else Sheet.RESOLUTION }
                }
                if (mode != CaptureMode.VIDEO) GlassButton(Icons.Default.Timer, if (timer == 0) "Timer off" else "Timer $timer seconds", timer != 0, label = if (timer == 0) null else "${timer}s") {
                    timer = when (timer) { 0 -> 3; 3 -> 10; else -> 0 }
                }
                if (mode != CaptureMode.VIDEO) GlassButton(Icons.Default.AspectRatio, "Aspect ratio ${aspect.label}", false, label = aspect.label) {
                    aspect = if (aspect == AspectChoice.R4_3) AspectChoice.R16_9 else AspectChoice.R4_3
                }
                GlassButton(Icons.Default.GridOn, if (prefs.grid) "Grid on" else "Grid off", prefs.grid) { scope.launch { graph.preferences.update { it.copy(grid = !it.grid) } } }
                if (filterModes) GlassButton(Icons.Default.Palette, "Filters, ${filter.label}", sheet == Sheet.FILTERS || filter != Filters.NATURAL) {
                    sheet = if (sheet == Sheet.FILTERS) Sheet.NONE else Sheet.FILTERS
                    if (sheet == Sheet.FILTERS) sample = previewView.bitmap?.let { b -> Bitmap.createScaledBitmap(b, 120, (120f * b.height / b.width).toInt().coerceAtLeast(1), true) }
                }
                if (s?.evSupported == true && mode != CaptureMode.PRO && mode != CaptureMode.ZOOM) GlassButton(Icons.Default.WbSunny, "Exposure compensation", showEv) { showEv = !showEv }
            }
            if (showEv && s?.evSupported == true && mode != CaptureMode.PRO) {
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Tokens.glass).padding(horizontal = Tokens.spaceMd), verticalAlignment = Alignment.CenterVertically) {
                    Text("%+.1f EV".format(evIndex * s.evStep), color = Tokens.goldLight, style = MaterialTheme.typography.labelLarge)
                    Slider(evIndex.toFloat(), { evIndex = it.toInt(); engine.setExposureIndex(evIndex) }, valueRange = s.evMin.toFloat()..s.evMax.toFloat(),
                        steps = (s.evMax - s.evMin - 1).coerceAtLeast(0), modifier = Modifier.weight(1f).padding(start = Tokens.spaceSm).semantics { contentDescription = "Exposure compensation" })
                }
            }
            if (beautyActive && sheet != Sheet.BEAUTY && !recording) Row(Modifier.align(Alignment.CenterHorizontally).clip(RoundedCornerShape(16.dp))
                .background(com.example.aicamerastudio.camera.ui.BeautyColors.panel).clickable { beauty = beauty.copy(enabled = false) }
                .semantics { contentDescription = "Beauty ${beauty.preset.label} is on. Tap to turn every beauty effect off" }
                .padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text("Beauty: ${beauty.preset.label}", color = com.example.aicamerastudio.camera.ui.BeautyColors.silver, style = MaterialTheme.typography.labelMedium)
                Icon(Icons.Default.Close, null, tint = com.example.aicamerastudio.camera.ui.BeautyColors.silver, modifier = Modifier.padding(start = 6.dp).size(16.dp))
            }
            if (sheet == Sheet.RESOLUTION && s != null) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Chip("Max", megapixels == 0) { megapixels = 0; scope.launch { graph.preferences.update { it.copy(photoMegapixels = 0) } } }
                s.photoSizes.take(6).forEach { sz ->
                    val mp = (sz.width.toLong() * sz.height / 1_000_000.0).roundToInt().coerceAtLeast(1)
                    Chip("$mp MP (${sz.width}×${sz.height})", megapixels == mp) { megapixels = mp; scope.launch { graph.preferences.update { it.copy(photoMegapixels = mp) } } }
                }
            }
            if (mode == CaptureMode.VIDEO && !recording) s?.let { sup ->
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm, Alignment.CenterHorizontally)) {
                    val shown = sup.videoQualities.filter { !(beautyActive && it == Quality.UHD) }
                    shown.forEach { q -> Chip(qualityLabel(q), (quality?.takeIf { it in shown } ?: shown.firstOrNull()) == q) { quality = q } }
                    sup.fpsOptions.forEach { f -> Chip("$f fps", fps == f) { fps = if (fps == f) null else f } }
                    if (sup.stabilisationSupported) Chip("Stabilise", stabilise) { stabilise = !stabilise }
                }
                if (fps != null) Text("Frame rate is requested; the device may choose the nearest it supports.", color = Color.White.copy(0.8f), style = MaterialTheme.typography.labelSmall)
                if (!audioGranted) Text("Microphone is off: videos will have no sound.", color = Tokens.warning, style = MaterialTheme.typography.labelSmall)
            }
            if (recording) Row(Modifier.align(Alignment.CenterHorizontally).clip(RoundedCornerShape(16.dp)).background(Tokens.glassStrong).padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                val blink by androidx.compose.animation.core.rememberInfiniteTransition(label = "rec").animateFloat(1f, 0.2f,
                    androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(600), androidx.compose.animation.core.RepeatMode.Reverse), label = "b")
                Box(Modifier.size(10.dp).clip(CircleShape).background(Tokens.danger.copy(alpha = if (paused) 1f else blink)))
                val bps = if (recSeconds >= 3) recBytes / recSeconds else 0L
                val left = if (bps > 0) graph.media.freeBytes() / bps / 60 else null
                Text("  %02d:%02d:%02d%s  %.1f MB".format(recSeconds / 3600, (recSeconds / 60) % 60, recSeconds % 60, if (paused) " paused" else "", recBytes / 1_048_576f) +
                    (left?.let { "  ~$it min left" } ?: ""), color = Color.White, style = MaterialTheme.typography.labelLarge)
            }
        }

        // ---------- bottom controls ----------
        Column(Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(bottom = bottomInset + Tokens.spaceSm),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            error?.let { ErrorCard(it, Modifier.padding(horizontal = Tokens.spaceMd), onRetry = { error = null; front = front }, onDismiss = { error = null }) }
            if (framesTaken >= 0) Text("Capturing frame ${minOf(framesTaken + 1, framesWanted)} of $framesWanted. Hold still.", color = Color.White,
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Tokens.glassStrong).padding(horizontal = 12.dp, vertical = 6.dp))
            (status ?: notice)?.let { Text(it, color = Color.White, maxLines = 3, modifier = Modifier.padding(horizontal = Tokens.spaceMd).clip(RoundedCornerShape(16.dp)).background(Tokens.glassStrong).padding(horizontal = 12.dp, vertical = 6.dp), style = MaterialTheme.typography.labelMedium) }

            AnimatedContent(Triple(mode, sheet, support != null), transitionSpec = { fadeIn() togetherWith fadeOut() }, label = "panel",
                modifier = Modifier.padding(horizontal = Tokens.spaceSm)) { (m, sh, _) ->
                val s = support
                when {
                    sh == Sheet.BEAUTY && beautyMode -> com.example.aicamerastudio.camera.ui.BeautyPanel(beauty, { beauty = it }, beautyStatus, support?.effectActive == true || !beautyActive,
                        m == CaptureMode.VIDEO, sample, { held -> if (beautyProc.isInitialized()) beautyProc.value.compare = held })
                    sh == Sheet.FILTERS && filterModes -> FilterPanel(sample, filter, { filterId = it.id }, filterK, { filterK = it }, Build.VERSION.SDK_INT >= 31)
                    m == CaptureMode.ZOOM && s != null -> com.example.aicamerastudio.camera.zoom.ZoomPanel(
                        plan, planner, steadiness, { zoomTarget = it.coerceIn(planner.minZoom, planner.maxZoom) },
                        zoomFrames, { zoomFrames = it }, zoomAi, { zoomAi = it },
                        aeLocked, { aeLocked = it; engine.setExposureLock(it) },
                        afLocked, { on -> afLocked = on; if (on) engine.lockFocusAt(previewView, previewView.width / 2f, previewView.height / 2f) else engine.unlockFocus() },
                        catalog?.manualFocus == true && zoomBindId == null, catalog?.minFocusDiopters ?: 0f, manualFocus, { manualFocus = it; engine.setManualFocus(it) })
                    m == CaptureMode.PRO && s != null -> ProPanel(s, manual, live, evIndex, raw, hist, { manual = it; engine.setManual(it) }, { evIndex = it; engine.setExposureIndex(it) }, { raw = it })
                    m == CaptureMode.PORTRAIT -> PortraitPanel(light, { light = it }, blur, { blur = it }, lightK, { lightK = it },
                        if (s != null && ExtensionMode.BOKEH in s.extensions) phoneBokeh else null, { phoneBokeh = it },
                        if (s?.analysisActive == true) face != null else null)
                    m == CaptureMode.NIGHT -> Text(if (s?.extensionActive == ExtensionMode.NIGHT) "Night: your phone's night mode. Hold still." else "Night: 5 frames are merged by BlazeCam to reduce noise. Hold still." +
                        (steadiness?.let { if (it == com.example.aicamerastudio.camera.stabilisation.Steadiness.STEADY) " Steady." else " Hold steadier." } ?: ""),
                        color = Color.White, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(Tokens.glassStrong).padding(10.dp))
                    m == CaptureMode.PHOTO && hdr -> Text(if (s?.extensionActive == ExtensionMode.HDR) "HDR by your phone." else "HDR: 3 exposures are fused by BlazeCam. Hold still.",
                        color = Color.White, style = MaterialTheme.typography.labelMedium, modifier = Modifier.clip(RoundedCornerShape(14.dp)).background(Tokens.glassStrong).padding(10.dp))
                    else -> Spacer(Modifier.height(0.dp))
                }
            }

            // Zoom stops for the normal modes: 0.5x, 1x, 2x, 5x where the camera reaches them (not labelled optical).
            support?.takeIf { mode != CaptureMode.ZOOM && it.maxZoom > it.minZoom + 0.01f }?.let { s ->
                val stops = buildList { if (s.minZoom < 0.95f) add(maxOf(0.5f, s.minZoom)); add(1f); listOf(2f, 5f).filter { it <= s.maxZoom + 0.01f }.forEach { add(it) } }
                Row(Modifier.clip(RoundedCornerShape(24.dp)).background(Tokens.glass).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    stops.forEach { z ->
                        val sel = abs(zoom - z) < 0.1f
                        val size by androidx.compose.animation.core.animateDpAsState(if (sel) 46.dp else 40.dp, label = "z")
                        Box(Modifier.size(size).clip(CircleShape).background(if (sel) Tokens.gold else Color.Transparent).clickable { zoom = z; engine.setZoomRatio(z) }
                            .semantics { contentDescription = "Zoom ${z}x" }, contentAlignment = Alignment.Center) {
                            Text(if (z < 1f) "%.1f×".format(z) else "${z.toInt()}×", color = if (sel) Color.Black else Color.White, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal, style = MaterialTheme.typography.labelLarge)
                        }
                    }
                }
            }
            if (!recording) ModeCarousel(CaptureMode.values().toList(), mode, !busy) { m -> mode = m; torch = false; sheet = Sheet.NONE }
            Row(Modifier.fillMaxWidth().padding(horizontal = Tokens.spaceLg), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                if (recording) IconButton({ if (paused) engine.resumeRecording() else engine.pauseRecording() }, Modifier.size(56.dp).clip(CircleShape).background(Tokens.glass)) {
                    Icon(if (paused) Icons.Default.PlayArrow else Icons.Default.Pause, if (paused) "Resume recording" else "Pause recording", tint = Color.White)
                } else GalleryThumb(lastMedia?.first, 56.dp) { lastMedia?.let { onOpenMedia(it.first, it.second) } }
                val desc = when { mode == CaptureMode.VIDEO && recording -> "Stop recording"; mode == CaptureMode.VIDEO -> "Start recording"; else -> "Take ${mode.label.lowercase()} photo" }
                ShutterButton(mode == CaptureMode.VIDEO, recording, !busy && support != null, desc) { if (mode == CaptureMode.VIDEO) toggleRecording() else capture() }
                IconButton({ front = !front }, enabled = !recording && mode != CaptureMode.ZOOM && (support?.let { it.hasFront && it.hasBack } ?: false),
                    modifier = Modifier.size(56.dp).clip(CircleShape).background(Tokens.glass)) { Icon(Icons.Default.FlipCameraAndroid, "Switch camera", tint = Color.White) }
            }
        }
    }
}
