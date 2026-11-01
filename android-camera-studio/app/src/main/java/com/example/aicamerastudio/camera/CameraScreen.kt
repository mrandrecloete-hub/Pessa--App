package com.example.aicamerastudio.camera

import android.net.Uri
import androidx.camera.core.ImageCapture
import androidx.camera.video.Quality
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.graphics.graphicsLayer
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.camera.engine.*
import com.example.aicamerastudio.core.design.ErrorCard
import com.example.aicamerastudio.core.design.Tokens
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.preferences.UserPreferences
import com.example.aicamerastudio.photo.enhancement.EnhanceWorker
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.abs

private val FLASH_MODES = listOf(ImageCapture.FLASH_MODE_OFF, ImageCapture.FLASH_MODE_AUTO, ImageCapture.FLASH_MODE_ON)
private fun flashLabel(m: Int) = when (m) { ImageCapture.FLASH_MODE_AUTO -> "Flash auto"; ImageCapture.FLASH_MODE_ON -> "Flash on"; else -> "Flash off" }
private fun qualityLabel(q: Quality) = when (q) { Quality.UHD -> "4K"; Quality.FHD -> "1080p"; Quality.HD -> "720p"; Quality.SD -> "480p"; else -> "Auto" }

@Composable
fun CameraScreen(audioGranted: Boolean, bottomInset: androidx.compose.ui.unit.Dp, prefs: UserPreferences) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val owner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val engine = remember { CameraEngine(context, graph.media) }
    val previewView = remember { PreviewView(context).apply { implementationMode = PreviewView.ImplementationMode.COMPATIBLE } }

    var front by rememberSaveable { mutableStateOf(false) }
    var mode by rememberSaveable { mutableStateOf(CaptureMode.PHOTO) }
    var aspect by rememberSaveable { mutableStateOf(AspectChoice.R4_3) }
    var flash by rememberSaveable { mutableIntStateOf(ImageCapture.FLASH_MODE_OFF) }
    var torch by remember { mutableStateOf(false) }
    var timer by rememberSaveable { mutableIntStateOf(0) }
    var quality by remember { mutableStateOf<Quality?>(null) }
    var fps by remember { mutableStateOf<Int?>(null) }
    var stabilise by rememberSaveable { mutableStateOf(false) }
    var showEv by remember { mutableStateOf(false) }
    var evIndex by remember { mutableIntStateOf(0) }

    var support by remember { mutableStateOf<CameraSupport?>(null) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var error by remember { mutableStateOf<AppError?>(null) }
    var countdown by remember { mutableIntStateOf(0) }
    var focusPoint by remember { mutableStateOf<Offset?>(null) }
    var busy by remember { mutableStateOf(false) }
    var lastSaved by remember { mutableStateOf<Uri?>(null) }
    var recording by remember { mutableStateOf(false) }
    var recSeconds by remember { mutableLongStateOf(0L) }
    var recBytes by remember { mutableLongStateOf(0L) }
    var notice by remember { mutableStateOf<String?>(null) }

    // ---- ultra zoom state ----
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
    var zoomJob by remember { mutableStateOf<String?>(null) }
    var framesTaken by remember { mutableIntStateOf(-1) }
    val planner = remember(catalog, mainRange, separateMax.toMap()) {
        com.example.aicamerastudio.camera.zoom.ZoomPlanner(catalog?.others.orEmpty(), catalog?.main, mainRange.first, mainRange.second, separateMax.toMap())
    }
    val plan = planner.plan(zoomTarget)
    val steadiness = com.example.aicamerastudio.camera.stabilisation.rememberSteadiness(plan.requested, mode == CaptureMode.ZOOM)
    val steadyNow by rememberUpdatedState(steadiness)

    LaunchedEffect(front, mode, aspect, quality, fps, stabilise, zoomBindId) {
        try {
            val s = engine.bind(owner, previewView, BindConfig(front, zoomBindId.takeIf { mode == CaptureMode.ZOOM }, mode, aspect, quality, fps, stabilise, flash)) { zoom = it }
            support = s
            evIndex = 0
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
        onDispose { owner.lifecycle.removeObserver(obs); engine.unbind() }
    }
    LaunchedEffect(focusPoint) { if (focusPoint != null && !afLocked) { delay(1200); focusPoint = null } }

    // Zoom routing: adjust the bound camera at once; switch to another lens only after the user pauses.
    LaunchedEffect(zoomTarget, planner, mode, support) {
        if (mode != CaptureMode.ZOOM || support == null) return@LaunchedEffect
        val r = planner.route(zoomTarget)
        if (r.bindCameraId == zoomBindId) engine.setZoomRatio(r.cameraRatio)
        else { delay(350); zoomBindId = r.bindCameraId }
    }
    val zoomRoute = planner.route(zoomTarget)
    val previewScale = if (mode == CaptureMode.ZOOM && zoomRoute.bindCameraId == zoomBindId) zoomRoute.extendedCrop else 1f

    val zoomWork by (zoomJob?.let { WorkManager.getInstance(context).getWorkInfosForUniqueWorkFlow(it) } ?: kotlinx.coroutines.flow.flowOf(emptyList()))
        .collectAsState(initial = emptyList())
    val zoomStatus = zoomWork.firstOrNull()?.let { w ->
        when (w.state) {
            WorkInfo.State.RUNNING -> "Processing ultra zoom ${(w.progress.getFloat(com.example.aicamerastudio.camera.zoom.UltraZoomWorker.K_PROGRESS, 0f) * 100).toInt()}%"
            WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> "Ultra zoom queued"
            WorkInfo.State.SUCCEEDED -> "Ultra zoom photo saved with its original. " + w.outputData.getString(com.example.aicamerastudio.camera.zoom.UltraZoomWorker.K_NOTES).orEmpty()
            WorkInfo.State.FAILED -> w.outputData.getString(com.example.aicamerastudio.camera.zoom.UltraZoomWorker.K_ERROR) ?: "Ultra zoom processing failed."
            WorkInfo.State.CANCELLED -> "Ultra zoom processing cancelled."
        }
    }

    // Show real progress of the background enhancement of the last photo.
    val work = lastSaved?.let { WorkManager.getInstance(context).getWorkInfosForUniqueWorkFlow(EnhanceWorker.uniqueName(it)) }
    val workInfo by (work ?: kotlinx.coroutines.flow.flowOf(emptyList())).collectAsState(initial = emptyList())
    val enhanceStatus = workInfo.firstOrNull()?.let { w ->
        when (w.state) {
            WorkInfo.State.RUNNING -> "Enhancing ${(w.progress.getFloat(EnhanceWorker.K_PROGRESS, 0f) * 100).toInt()}%"
            WorkInfo.State.ENQUEUED, WorkInfo.State.BLOCKED -> "Enhancement queued"
            WorkInfo.State.SUCCEEDED -> "Enhanced copy saved. Original kept." .let { base ->
                val n = w.outputData.getString(EnhanceWorker.K_NOTES).orEmpty()
                if (n.isBlank()) base else "$base $n"
            }
            WorkInfo.State.FAILED -> w.outputData.getString(EnhanceWorker.K_ERROR) ?: "Enhancement failed. Your original is safe."
            WorkInfo.State.CANCELLED -> "Enhancement cancelled. Your original is safe."
        }
    }

    fun capture() {
        if (busy) return
        scope.launch {
            if (timer > 0) {
                for (s in timer downTo 1) { countdown = s; delay(1000) }
                countdown = 0
            }
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            busy = true
            engine.takePhoto(MediaStoreRepository.timestampName("AICS_"), onSaved = { uri ->
                busy = false; lastSaved = uri; notice = "Photo saved"
                if (prefs.autoEnhance) EnhanceWorker.enqueue(context, uri, prefs)
            }, onError = { busy = false; error = ErrorMapper.map(it).takeIf { e -> e.code != com.example.aicamerastudio.core.errors.ErrorCode.UNKNOWN } ?: Errors.captureFailed() })
        }
    }

    fun captureZoom() {
        if (busy) return
        scope.launch {
            if (timer > 0) { for (t in timer downTo 1) { countdown = t; delay(1000) }; countdown = 0 }
            // At long zoom, wait up to 2 seconds for the phone to be steady (if a gyroscope exists).
            if (plan.requested >= 5f && steadyNow != null) {
                val until = System.currentTimeMillis() + 2000
                while (steadyNow != com.example.aicamerastudio.camera.stabilisation.Steadiness.STEADY && System.currentTimeMillis() < until) delay(40)
            }
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            busy = true; framesTaken = 0
            val name = "zoom_${System.currentTimeMillis()}"
            val dir = java.io.File(context.cacheDir, "zoom/$name")
            val route = planner.route(zoomTarget)
            val crop = if (route.bindCameraId == zoomBindId) route.extendedCrop else 1f
            val label = plan.label
            engine.captureFrames(zoomFrames, dir, onProgress = { framesTaken = it }, onDone = { files, rot ->
                busy = false; framesTaken = -1
                com.example.aicamerastudio.camera.zoom.UltraZoomWorker.enqueue(context, name, dir, files.size, crop, rot, zoomAi, prefs.strength, label)
                zoomJob = name
            }, onError = { busy = false; framesTaken = -1; dir.deleteRecursively(); error = ErrorMapper.map(it) })
        }
    }

    fun toggleRecording() {
        if (recording) { engine.stopRecording(); return }
        try {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            recSeconds = 0; recBytes = 0
            engine.startRecording(MediaStoreRepository.timestampName("AICS_"), audioGranted) { e ->
                when (e) {
                    is VideoRecordEvent.Start -> recording = true
                    is VideoRecordEvent.Status -> {
                        recSeconds = e.recordingStats.recordedDurationNanos / 1_000_000_000
                        recBytes = e.recordingStats.numBytesRecorded
                    }
                    is VideoRecordEvent.Finalize -> {
                        recording = false
                        if (e.hasError() && e.error != VideoRecordEvent.Finalize.ERROR_NONE) {
                            // Some errors still leave a usable file (e.g. duration/size limit); only report real failures.
                            error = when (e.error) {
                                VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE -> Errors.lowStorage()
                                VideoRecordEvent.Finalize.ERROR_NO_VALID_DATA ->
                                    Errors.captureFailed().copy(what = "The recording was too short to save.", whatToDo = "Record for at least a second.")
                                else -> Errors.exportFailed().copy(what = "The video could not be finished.")
                            }
                        } else notice = "Video saved"
                    }
                    else -> {}
                }
            }
        } catch (t: Throwable) { error = ErrorMapper.map(t) }
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize()
            .graphicsLayer(scaleX = previewScale, scaleY = previewScale)
            .pointerInput(support, mode, afLocked) {
                detectTapGestures(onTap = { o ->
                    focusPoint = o
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
        if (previewScale > 1.01f) Text("Preview enlarged ${"%.1f".format(previewScale)}×. Final detail comes from processing after capture.",
            Modifier.align(Alignment.Center).padding(top = 120.dp).clip(RoundedCornerShape(12.dp)).background(Tokens.glass).padding(8.dp),
            color = Color.White, style = MaterialTheme.typography.labelSmall)

        if (prefs.grid) Canvas(Modifier.fillMaxSize()) {
            val c = Color.White.copy(alpha = 0.35f)
            for (i in 1..2) {
                drawLine(c, Offset(size.width * i / 3, 0f), Offset(size.width * i / 3, size.height), 1.5f)
                drawLine(c, Offset(0f, size.height * i / 3), Offset(size.width, size.height * i / 3), 1.5f)
            }
        }
        focusPoint?.let { p ->
            Canvas(Modifier.fillMaxSize()) { drawCircle(Tokens.accent, 36.dp.toPx(), p, style = androidx.compose.ui.graphics.drawscope.Stroke(3.dp.toPx())) }
        }
        if (countdown > 0) Text("$countdown", Modifier.align(Alignment.Center), color = Color.White, style = MaterialTheme.typography.displayLarge)

        // Top controls
        Column(Modifier.align(Alignment.TopCenter).windowInsetsPadding(WindowInsets.statusBars).padding(Tokens.spaceSm)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                val s = support
                if (s?.hasFlash == true) {
                    if (mode != CaptureMode.VIDEO) GlassButton(Icons.Default.FlashOn, flashLabel(flash), flash != ImageCapture.FLASH_MODE_OFF) {
                        flash = FLASH_MODES[(FLASH_MODES.indexOf(flash) + 1) % FLASH_MODES.size]; engine.setFlashMode(flash)
                    } else GlassButton(Icons.Default.FlashlightOn, if (torch) "Torch on" else "Torch off", torch) { torch = !torch; engine.setTorch(torch) }
                }
                if (mode != CaptureMode.VIDEO) {
                    GlassButton(Icons.Default.Timer, if (timer == 0) "Timer off" else "Timer ${timer} seconds", timer != 0, label = if (timer == 0) null else "${timer}s") {
                        timer = when (timer) { 0 -> 3; 3 -> 10; else -> 0 }
                    }
                    GlassButton(Icons.Default.AspectRatio, "Aspect ratio ${aspect.label}", false, label = aspect.label) {
                        aspect = if (aspect == AspectChoice.R4_3) AspectChoice.R16_9 else AspectChoice.R4_3
                    }
                }
                if (support?.evSupported == true) GlassButton(Icons.Default.WbSunny, "Exposure compensation", showEv) { showEv = !showEv }
            }
            if (showEv && support?.evSupported == true) {
                val s = support!!
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Tokens.glass).padding(horizontal = Tokens.spaceMd), verticalAlignment = Alignment.CenterVertically) {
                    Text("%+.1f EV".format(evIndex * s.evStep), color = Color.White, style = MaterialTheme.typography.labelLarge)
                    Slider(evIndex.toFloat(), { evIndex = it.toInt(); engine.setExposureIndex(evIndex) },
                        valueRange = s.evMin.toFloat()..s.evMax.toFloat(), steps = (s.evMax - s.evMin - 1).coerceAtLeast(0),
                        modifier = Modifier.weight(1f).padding(start = Tokens.spaceSm).semantics { contentDescription = "Exposure compensation" })
                }
            }
            if (mode == CaptureMode.VIDEO && !recording) support?.let { s ->
                Row(Modifier.fillMaxWidth().padding(top = Tokens.spaceXs), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm, Alignment.CenterHorizontally)) {
                    s.videoQualities.forEach { q -> Chip(qualityLabel(q), (quality ?: s.videoQualities.firstOrNull()) == q) { quality = q } }
                    s.fpsOptions.forEach { f -> Chip("$f fps", fps == f) { fps = if (fps == f) null else f } }
                    if (s.stabilisationSupported) Chip("Stabilise", stabilise) { stabilise = !stabilise }
                }
                if (fps != null) Text("Frame rate is requested; the device may choose the nearest it supports.", color = Color.White.copy(0.8f), style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = Tokens.spaceXs))
                if (!audioGranted) Text("Microphone is off: videos will have no sound.", color = Tokens.warning, style = MaterialTheme.typography.labelSmall)
            }
        }

        // Bottom controls
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(bottom = bottomInset + Tokens.spaceSm),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm),
        ) {
            error?.let { ErrorCard(it, Modifier.padding(horizontal = Tokens.spaceMd), onRetry = { error = null; front = front }, onDismiss = { error = null }) }
            if (framesTaken >= 0) Text("Capturing frame ${framesTaken + 1} of $zoomFrames. Hold still.", color = Color.White,
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Tokens.glassStrong).padding(horizontal = 12.dp, vertical = 6.dp))
            (zoomStatus.takeIf { mode == CaptureMode.ZOOM } ?: enhanceStatus ?: notice)?.let { Text(it, color = Color.White, modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Tokens.glassStrong).padding(horizontal = 12.dp, vertical = 6.dp), style = MaterialTheme.typography.labelMedium) }
            if (recording) {
                val bps = if (recSeconds >= 3) recBytes / recSeconds else 0L
                val left = if (bps > 0) (graph.media.freeBytes() / bps / 60) else null
                Text("● %02d:%02d  %.1f MB".format(recSeconds / 60, recSeconds % 60, recBytes / 1_048_576f) + (left?.let { "  ~$it min of space left" } ?: ""),
                    color = Color.White, modifier = Modifier.clip(RoundedCornerShape(16.dp)).background(Tokens.danger.copy(alpha = 0.85f)).padding(horizontal = 12.dp, vertical = 6.dp))
            }
            if (mode == CaptureMode.ZOOM && support != null) com.example.aicamerastudio.camera.zoom.ZoomPanel(
                plan, planner, steadiness, { zoomTarget = it.coerceIn(planner.minZoom, planner.maxZoom) },
                zoomFrames, { zoomFrames = it }, zoomAi, { zoomAi = it },
                aeLocked, { aeLocked = it; engine.setExposureLock(it) },
                afLocked, { on -> afLocked = on; if (on) engine.lockFocusAt(previewView, previewView.width / 2f, previewView.height / 2f) else engine.unlockFocus() },
                catalog?.manualFocus == true && zoomBindId == null, catalog?.minFocusDiopters ?: 0f, manualFocus, { manualFocus = it; engine.setManualFocus(it) },
            )
            support?.takeIf { mode != CaptureMode.ZOOM && it.maxZoom > it.minZoom + 0.01f }?.let { s ->
                val stops = buildList {
                    if (s.minZoom < 0.95f) add(s.minZoom)
                    add(1f)
                    listOf(2f, 3f, 5f, 10f).filter { it <= s.maxZoom + 0.01f }.forEach { add(it) }
                }
                Row(Modifier.clip(RoundedCornerShape(24.dp)).background(Tokens.glass).padding(4.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    stops.forEach { z ->
                        val sel = abs(zoom - z) < 0.1f
                        Text(if (z < 1f) "%.1f×".format(z) else "${z.toInt()}×", color = if (sel) Color.Black else Color.White,
                            fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                            modifier = Modifier.heightIn(min = 40.dp).widthIn(min = 40.dp).clip(CircleShape).background(if (sel) Color.White else Color.Transparent)
                                .clickable { zoom = z; engine.setZoomRatio(z) }.padding(horizontal = 10.dp, vertical = 9.dp)
                                .semantics { contentDescription = "Zoom ${z}x" })
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceLg), verticalAlignment = Alignment.CenterVertically) {
                if (!recording) CaptureMode.values().forEach { m ->
                    val sel = mode == m
                    Text(m.name, color = Color.White, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.heightIn(min = 40.dp).clickable { mode = m; torch = false }.padding(8.dp)
                            .then(if (sel) Modifier.border(1.dp, Color.White, RoundedCornerShape(16.dp)).padding(horizontal = 8.dp) else Modifier)
                            .semantics { contentDescription = "${m.name.lowercase()} mode" + if (sel) ", selected" else "" })
                }
            }
            Row(Modifier.fillMaxWidth().padding(horizontal = Tokens.spaceLg), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.size(Tokens.minTouch))
                val shutterDesc = when { mode == CaptureMode.PHOTO -> "Take photo"; mode == CaptureMode.ZOOM -> "Take ultra zoom photo"; recording -> "Stop recording"; else -> "Start recording" }
                Box(
                    Modifier.size(Tokens.shutterSize).clip(CircleShape).border(4.dp, Color.White, CircleShape).padding(7.dp).clip(CircleShape)
                        .background(if (mode == CaptureMode.VIDEO) Tokens.danger else Color.White)
                        .clickable(enabled = !busy && support != null) { when (mode) { CaptureMode.PHOTO -> capture(); CaptureMode.ZOOM -> captureZoom(); CaptureMode.VIDEO -> toggleRecording() } }
                        .semantics { contentDescription = shutterDesc },
                )
                IconButton(onClick = { front = !front }, enabled = !recording && mode != CaptureMode.ZOOM && (support?.let { it.hasFront && it.hasBack } ?: false),
                    modifier = Modifier.size(Tokens.minTouch).clip(CircleShape).background(Tokens.glass)) {
                    Icon(Icons.Default.FlipCameraAndroid, "Switch camera", tint = Color.White)
                }
            }
        }
    }
}

@Composable
private fun GlassButton(icon: androidx.compose.ui.graphics.vector.ImageVector, desc: String, active: Boolean, label: String? = null, onClick: () -> Unit) {
    Row(
        Modifier.heightIn(min = Tokens.minTouch).clip(RoundedCornerShape(24.dp)).background(if (active) Tokens.accent.copy(alpha = 0.85f) else Tokens.glass)
            .clickable(onClick = onClick).padding(horizontal = 12.dp).semantics { contentDescription = desc },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(icon, null, tint = if (active) Color.Black else Color.White)
        if (label != null) Text(label, color = if (active) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge)
    }
}

@Composable
private fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    Text(text, color = if (selected) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(18.dp)).background(if (selected) Color.White else Tokens.glass)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 8.dp)
            .semantics { contentDescription = text + if (selected) ", selected" else "" })
}
