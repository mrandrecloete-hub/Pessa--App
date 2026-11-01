package com.example.aicamerastudio.editor.composite

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.common.JobState
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.database.CompositeProject
import com.example.aicamerastudio.data.database.MediaAsset
import com.example.aicamerastudio.editor.masks.AlphaMask
import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.ModelUnavailable
import com.example.aicamerastudio.photo.enhancement.ExifCopy
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.inpainting.InpaintPipeline
import com.example.aicamerastudio.photo.pipeline.EnhancementCancelled
import com.example.aicamerastudio.photo.segmentation.DetectedPerson
import com.example.aicamerastudio.photo.segmentation.PeopleFinder
import com.example.aicamerastudio.photo.segmentation.PersonSegmenter
import com.example.aicamerastudio.photo.segmentation.TapSegmenter
import kotlinx.coroutines.*
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RemovePersonScreen(projectId: String?, onBack: () -> Unit, onOpenResult: (Uri) -> Unit) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val scope = rememberCoroutineScope()
    val id = remember { projectId ?: UUID.randomUUID().toString() }
    var img by remember { mutableStateOf<WorkImage?>(null) }
    var mask by remember { mutableStateOf<AlphaMask?>(null) }
    var maskVersion by remember { mutableIntStateOf(0) }
    val history = remember { MaskHistory() }
    var people by remember { mutableStateOf<List<DetectedPerson>>(emptyList()) }
    var mode by remember { mutableStateOf(CanvasMode.TAP) }
    var brush by remember { mutableFloatStateOf(30f) }
    var expand by remember { mutableFloatStateOf(0.01f) }
    var result by remember { mutableStateOf<IntArray?>(null) }
    var notes by remember { mutableStateOf<List<String>>(emptyList()) }
    var showOriginal by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var job by remember { mutableStateOf<Job?>(null) }
    var error by remember { mutableStateOf<AppError?>(null) }
    val t = remember { CanvasTransform() }
    var strokeOpen by remember { mutableStateOf(false) }

    fun commitMask(m: AlphaMask) {
        mask = m; maskVersion++; result = null
        scope.launch(Dispatchers.IO) {
            val f = graph.projectFiles.saveMask(id, "selection", m)
            val now = System.currentTimeMillis()
            val old = graph.database.projects().get(id)
            graph.database.projects().upsert(CompositeProject(id, "remove", img!!.uri.toString(), null, null, null, f, null, null,
                old?.createdAt ?: now, now, old?.lastExportUri))
        }
    }

    suspend fun open(uri: Uri, saved: AlphaMask?) {
        busy = "Opening photo"; error = null
        try {
            val w = withContext(Dispatchers.IO) { WorkImage.load(context, uri, 1600) }
            img = w
            busy = "Finding people"
            val found = withContext(Dispatchers.Default) {
                try { PeopleFinder.find(PersonSegmenter(graph.models.get(ModelNames.PERSON_SEG)).segment(w.px, w.w, w.h)) }
                catch (e: ModelUnavailable) { error = e.toAppError(); emptyList() }
            }
            people = found
            val m = saved?.takeIf { it.width == w.w && it.height == w.h } ?: AlphaMask(w.w, w.h)
            mask = m; maskVersion++
            if (found.isEmpty() && saved == null) error = AppError(com.example.aicamerastudio.core.errors.ErrorCode.INFERENCE_FAILED,
                "No person was found automatically.", "Tap the person, or paint over them with Brush add.", true, false)
        } catch (t2: Throwable) { if (t2 is CancellationException) throw t2; error = ErrorMapper.map(t2) }
        finally { busy = null }
    }

    LaunchedEffect(projectId) {
        if (projectId != null) {
            val p = graph.database.projects().get(projectId)
            if (p != null) open(Uri.parse(p.sourceUri), graph.projectFiles.loadMask(projectId, p.maskFile))
        }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) scope.launch { open(u, null) } }

    fun tapSelect(x: Float, y: Float) {
        val w = img ?: return; val cur = mask ?: return
        job = scope.launch {
            busy = "Selecting"
            try {
                val sel = withContext(Dispatchers.Default) {
                    // Prefer a detected person under the finger; otherwise ask the tap model.
                    people.firstOrNull { p -> p.mask[y.toInt().coerceIn(0, w.h - 1) * w.w + x.toInt().coerceIn(0, w.w - 1)] > 0.5f }?.mask
                        ?: TapSegmenter(graph.models.get(ModelNames.TAP_SELECT)).select(w.px, w.w, w.h, x, y)
                }
                history.record(cur)
                val n = cur.copy(); n.union(AlphaMask(w.w, w.h, sel)); commitMask(n)
            } catch (e: ModelUnavailable) { error = e.toAppError() } finally { busy = null }
        }
    }

    fun previewRemoval() {
        val w = img ?: return; val m = mask ?: return
        job = scope.launch {
            busy = "Rebuilding the background"; progress = 0f
            try {
                val r = withContext(Dispatchers.Default) {
                    val active = coroutineContext.job
                    InpaintPipeline.remove(w.px, w.w, w.h, m.data, (expand * minOf(w.w, w.h)).toInt(), progress = { progress = it }, isCancelled = { !active.isActive })
                }
                result = r.pixels; notes = r.notes
            } catch (e: EnhancementCancelled) { } catch (e: CancellationException) { } finally { busy = null; progress = null }
        }
    }

    fun saveFull() {
        val w = img ?: return; val m = mask ?: return
        job = scope.launch {
            busy = "Saving at full resolution"; progress = 0f; error = null
            try {
                val out = withContext(Dispatchers.Default) {
                    val active = coroutineContext.job
                    graph.media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE)
                    // Always start again from the untouched original file.
                    val (fpx, fw, fh) = WorkImage.full(context, w.uri)
                    val fullMask = Resample.bilinear(m.data, w.w, w.h, fw, fh)
                    val expandPx = (expand * minOf(fw, fh)).toInt()
                    val r = InpaintPipeline.remove(fpx, fw, fh, fullMask, expandPx, maxWorkPixels = 700_000, progress = { progress = it * 0.95f }, isCancelled = { !active.isActive })
                    val bmp = bitmapOf(r.pixels, fw, fh)
                    val uri = graph.media.saveJpeg(MediaStoreRepository.timestampName("AICS_", "_removed"), bmp, 95) { u -> ExifCopy.copy(context, w.uri, u, "AI Camera Studio (person removed, area reconstructed)") }
                    bmp.recycle()
                    graph.database.assets().upsert(MediaAsset(UUID.randomUUID().toString(), "removed", w.uri.toString(), uri.toString(), System.currentTimeMillis(),
                        fw, fh, 0, JobState.SUCCEEDED.name, null, r.notes.joinToString(" "), 0, id))
                    val p = graph.database.projects().get(id)
                    if (p != null) graph.database.projects().upsert(p.copy(updatedAt = System.currentTimeMillis(), lastExportUri = uri.toString()))
                    uri to r.notes
                }
                notes = out.second
                onOpenResult(out.first)
            } catch (e: OutOfMemoryError) { error = Errors.lowMemory() }
            catch (e: EnhancementCancelled) { error = Errors.interrupted() } catch (e: CancellationException) { error = Errors.interrupted() }
            catch (t2: Throwable) { error = ErrorMapper.map(t2) }
            finally { busy = null; progress = null }
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Remove a person") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }, actions = {
            IconButton({ mask?.let { c -> history.undo(c)?.let { commitMask(it) } } }, enabled = history.canUndo && busy == null) { Icon(Icons.AutoMirrored.Filled.Undo, "Undo selection change") }
            IconButton({ mask?.let { c -> history.redo(c)?.let { commitMask(it) } } }, enabled = history.canRedo && busy == null) { Icon(Icons.AutoMirrored.Filled.Redo, "Redo selection change") }
        })
        val w = img; val m = mask
        if (w == null || m == null) {
            if (busy != null) LoadingIndicator(busy, modifier = Modifier.fillMaxWidth().padding(Tokens.spaceLg))
            else EmptyState("Choose a photo", "Pick the photo you want to remove a person from. The original is never changed.",
                action = { AppButton("Choose photo", { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) })
            error?.let { ErrorCard(it, Modifier.padding(Tokens.spaceMd), onDismiss = { error = null }) }
            return@Column
        }
        val base = remember(w, result, showOriginal) { pixelsToImage(if (result != null && !showOriginal) result!! else w.px, w.w, w.h) }
        val overlay = remember(maskVersion, result) { if (result == null) maskOverlay(m) else null }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            ImageCanvas(base, overlay, if (result != null) CanvasMode.VIEW else mode, t, Modifier.fillMaxSize(), brushRadiusScreen = brush,
                description = if (result != null) "Result of removal" else "Photo with selection shown in red",
                onTap = { x, y -> if (mode == CanvasMode.TAP && result == null) tapSelect(x, y) },
                onStroke = { x0, y0, x1, y1, r ->
                    if (!strokeOpen) { history.record(m); strokeOpen = true }
                    m.stroke(x0, y0, x1, y1, r, mode == CanvasMode.BRUSH_ADD); maskVersion++
                },
                onStrokeEnd = { strokeOpen = false; commitMask(m) })
        }
        Column(Modifier.heightIn(max = 340.dp).verticalScroll(rememberScrollState()).padding(Tokens.spaceSm), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            error?.let { ErrorCard(it, onDismiss = { error = null }) }
            if (busy != null) { LoadingIndicator(busy, progress = progress); TextButton({ job?.cancel() }) { Text("Cancel") } }
            if (result == null) {
                if (people.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    Text("People found:", style = MaterialTheme.typography.labelLarge)
                    people.forEach { p -> AssistChip({ history.record(m); val n = m.copy(); n.union(AlphaMask(w.w, w.h, p.mask)); commitMask(n) }, { Text("Person ${p.index}") }) }
                    AssistChip({ history.record(m); commitMask(AlphaMask(w.w, w.h)) }, { Text("Clear") })
                }
                SelectionTools(mode, { mode = it }, brush, { brush = it }) {
                    AssistChip({
                        history.record(m)
                        scope.launch { busy = "Refining edges"; val r = withContext(Dispatchers.Default) { MaskOps.refine(m.data, Resample.luma(w.px), w.w, w.h) }; commitMask(AlphaMask(w.w, w.h, r)); busy = null }
                    }, { Text("Refine edges") })
                }
                LabeledSlider("Expand selection (covers edges and shadows)", expand * 100, 0f..5f, "%.1f%%".format(expand * 100), { expand = it / 100f })
                AppButton("Preview removal", { previewRemoval() }, Modifier.fillMaxWidth(), enabled = busy == null && m.coverage() > 0f)
            } else {
                Text("Hold the button below to see the original.", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    OutlinedButton({}, Modifier.pointerInput(Unit) { detectTapGestures(onPress = { showOriginal = true; tryAwaitRelease(); showOriginal = false }) }) { Text("Hold: original") }
                    OutlinedButton({ result = null }) { Text("Refine selection") }
                    Button({ saveFull() }, enabled = busy == null) { Text("Save new photo") }
                }
                notes.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Text("The original photo is never changed. Each attempt starts again from the original.", style = MaterialTheme.typography.bodySmall)
        }
    }
}
