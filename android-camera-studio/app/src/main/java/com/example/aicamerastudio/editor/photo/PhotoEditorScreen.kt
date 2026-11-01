package com.example.aicamerastudio.editor.photo

import android.graphics.Bitmap
import android.graphics.Matrix
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import kotlinx.coroutines.flow.first
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.AppException
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.database.EditSession
import com.example.aicamerastudio.data.database.MediaAsset
import com.example.aicamerastudio.core.common.JobState
import com.example.aicamerastudio.photo.enhancement.BitmapPixels
import com.example.aicamerastudio.photo.enhancement.ExifCopy
import com.example.aicamerastudio.photo.enhancement.ImageLoader
import com.example.aicamerastudio.photo.pipeline.Enhancer
import com.example.aicamerastudio.photo.pipeline.EnhancementCancelled
import kotlinx.coroutines.*
import java.security.MessageDigest
import java.util.UUID

/** Applies flip, rotation and crop. Always returns a new bitmap or the input when nothing changes. */
fun applyGeometry(src: Bitmap, p: EditParams): Bitmap {
    var cur = src
    if (p.quarterTurns % 4 != 0 || p.flipHorizontal) {
        val m = Matrix()
        if (p.flipHorizontal) m.postScale(-1f, 1f, src.width / 2f, src.height / 2f)
        m.postRotate(90f * (p.quarterTurns % 4))
        cur = Bitmap.createBitmap(src, 0, 0, src.width, src.height, m, true)
    }
    val box = CropGeometry.centerCrop(cur.width, cur.height, p.crop.ratio)
    if (box.width != cur.width || box.height != cur.height) {
        val c = Bitmap.createBitmap(cur, box.left, box.top, box.width, box.height)
        if (cur !== src) cur.recycle()
        cur = c
    }
    return cur
}

private class Adjustment(val label: String, val range: ClosedFloatingPointRange<Float>, val get: (EditParams) -> Float,
                         val set: (EditParams, Float) -> EditParams, val fmt: (Float) -> String = { "%+.2f".format(it) })

private val ADJUSTMENTS = listOf(
    Adjustment("Exposure", -2f..2f, { it.exposureEv }, { p, v -> p.copy(exposureEv = v) }, { "%+.1f EV".format(it) }),
    Adjustment("Contrast", -0.8f..0.8f, { it.contrast }, { p, v -> p.copy(contrast = v) }),
    Adjustment("Highlights", -1f..1f, { it.highlights }, { p, v -> p.copy(highlights = v) }),
    Adjustment("Shadows", -1f..1f, { it.shadows }, { p, v -> p.copy(shadows = v) }),
    Adjustment("Black point", 0f..0.3f, { it.blackPoint }, { p, v -> p.copy(blackPoint = v) }, { "%.2f".format(it) }),
    Adjustment("White point", 0.7f..1f, { it.whitePoint }, { p, v -> p.copy(whitePoint = v) }, { "%.2f".format(it) }),
    Adjustment("Saturation", 0f..2f, { it.saturation }, { p, v -> p.copy(saturation = v) }, { "%.2f".format(it) }),
    Adjustment("Vibrance", -1f..1f, { it.vibrance }, { p, v -> p.copy(vibrance = v) }),
    Adjustment("Temperature", -1f..1f, { it.temperature }, { p, v -> p.copy(temperature = v) }),
    Adjustment("Tint", -1f..1f, { it.tint }, { p, v -> p.copy(tint = v) }),
    Adjustment("Sharpen", 0f..1f, { it.sharpen }, { p, v -> p.copy(sharpen = v) }, { "%.2f".format(it) }),
    Adjustment("Denoise", 0f..1f, { it.denoise }, { p, v -> p.copy(denoise = v) }, { "%.2f".format(it) }),
)

private fun sessionId(uri: Uri): String =
    MessageDigest.getInstance("SHA-256").digest(uri.toString().toByteArray()).joinToString("") { "%02x".format(it) }.take(32)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhotoEditorScreen(uri: Uri, onBack: () -> Unit, onSaved: (Uri) -> Unit) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val scope = rememberCoroutineScope()
    val history = remember { EditHistory(EditParams()) }
    var params by remember { mutableStateOf(EditParams()) }
    var committed by remember { mutableStateOf(EditParams()) }
    var preview by remember { mutableStateOf<Bitmap?>(null) }
    var rendered by remember { mutableStateOf<Bitmap?>(null) }
    var showOriginal by remember { mutableStateOf(false) }
    var selected by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<AppError?>(null) }
    var saving by remember { mutableStateOf(false) }
    var progress by remember { mutableFloatStateOf(0f) }
    var saveJob by remember { mutableStateOf<Job?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val id = remember(uri) { sessionId(uri) }

    LaunchedEffect(uri) {
        try {
            preview = withContext(Dispatchers.IO) { ImageLoader.decode(context.contentResolver, uri, maxEdge = 1280) }
            graph.database.sessions().get(id)?.let { s ->
                EditParamsCodec.decode(s.params)?.let { history.reset(it); params = it; committed = it; message = "Restored your previous edits" }
            }
        } catch (t: Throwable) { if (t is kotlinx.coroutines.CancellationException) throw t; error = ErrorMapper.map(t) }
    }
    LaunchedEffect(committed) { // persist the edit session whenever a change is committed
        if (preview != null) graph.database.sessions().upsert(EditSession(id, uri.toString(), EditParamsCodec.encode(committed), System.currentTimeMillis()))
    }
    LaunchedEffect(params, preview) {
        val src = preview ?: return@LaunchedEffect
        delay(25)
        val p = params
        val out = withContext(Dispatchers.Default) {
            val job = coroutineContext.job
            val geom = applyGeometry(src, p)
            if (p.validated().let { it.toEnhancement(1).isIdentity() }) return@withContext geom
            val dst = Bitmap.createBitmap(geom.width, geom.height, Bitmap.Config.ARGB_8888)
            try {
                Enhancer(400_000).enhance(BitmapPixels(geom), BitmapPixels(dst), p.toEnhancement(1), isCancelled = { !job.isActive })
            } catch (e: EnhancementCancelled) { return@withContext null }
            if (geom !== src) geom.recycle()
            dst
        }
        if (out != null) rendered = out
    }

    fun commit() { history.push(params); committed = params }

    fun save() {
        saveJob = scope.launch {
            saving = true; progress = 0f; error = null
            try {
                val result = withContext(Dispatchers.Default) {
                    val job = coroutineContext.job
                    graph.media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE)
                    var note: String? = null
                    val src = try { ImageLoader.decode(context.contentResolver, uri) }
                    catch (oom: OutOfMemoryError) {
                        note = "Saved at half size because the device ran out of memory."
                        try { ImageLoader.decode(context.contentResolver, uri, sampleSize = 2) } catch (e: OutOfMemoryError) { throw AppException(Errors.lowMemory(), e) }
                    }
                    val started = System.nanoTime()
                    val p = params.validated()
                    val geom = applyGeometry(src, p)
                    if (geom !== src) src.recycle()
                    val dst = Bitmap.createBitmap(geom.width, geom.height, Bitmap.Config.ARGB_8888)
                    try {
                        Enhancer().enhance(BitmapPixels(geom), BitmapPixels(dst), p.toEnhancement(2), { progress = it * 0.9f }, { !job.isActive })
                        val out = graph.media.saveJpeg(MediaStoreRepository.timestampName("AICS_", "_edit"), dst, graph.preferences.flow.first().jpegQuality) {
                            ExifCopy.copy(context, uri, it, "AI Camera Studio (edit)")
                        }
                        graph.database.assets().upsert(MediaAsset(UUID.randomUUID().toString(), "edited", uri.toString(), out.toString(),
                            System.currentTimeMillis(), dst.width, dst.height, 0, JobState.SUCCEEDED.name, null, note, (System.nanoTime() - started) / 1_000_000, id))
                        out to note
                    } finally { geom.recycle(); dst.recycle() }
                }
                message = "Saved as a new photo. The original was not changed." + (result.second?.let { " $it" } ?: "")
                onSaved(result.first)
            } catch (t: Throwable) {
                error = if (t is EnhancementCancelled || t is CancellationException) Errors.interrupted() else ErrorMapper.map(t)
            } finally { saving = false }
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Edit photo") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }, actions = {
            IconButton({ params = history.undo(); committed = params }, enabled = history.canUndo && !saving) { Icon(Icons.AutoMirrored.Filled.Undo, "Undo") }
            IconButton({ params = history.redo(); committed = params }, enabled = history.canRedo && !saving) { Icon(Icons.AutoMirrored.Filled.Redo, "Redo") }
            IconButton({ params = EditParams(); commit() }, enabled = !params.isDefault && !saving) { Icon(Icons.Default.RestartAlt, "Reset all edits") }
            IconButton({ save() }, enabled = !saving && preview != null && !params.isDefault) { Icon(Icons.Default.Save, "Save as new photo") }
        })
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val shown = if (showOriginal) preview else rendered ?: preview
            if (shown != null) Image(shown.asImageBitmap(), "Photo preview", Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            else if (error == null) LoadingIndicator("Opening photo", modifier = Modifier.align(Alignment.Center))
            if (preview != null) Text(if (showOriginal) "Original" else "Hold to see the original",
                Modifier.align(Alignment.BottomCenter).padding(8.dp).pointerInput(Unit) {
                    detectTapGestures(onPress = { showOriginal = true; tryAwaitRelease(); showOriginal = false })
                }.heightIn(min = Tokens.minTouch).padding(12.dp), color = MaterialTheme.colorScheme.onSurface)
        }
        error?.let { ErrorCard(it, Modifier.padding(Tokens.spaceSm), onRetry = { save() }, onDismiss = { error = null }) }
        if (saving) Column(Modifier.padding(Tokens.spaceMd)) {
            LoadingIndicator("Saving full resolution ${(progress * 100).toInt()}%", progress = progress)
            TextButton({ saveJob?.cancel() }) { Text("Cancel") }
        }
        message?.let { Text(it, Modifier.padding(horizontal = Tokens.spaceMd), style = MaterialTheme.typography.bodySmall) }
        Column(Modifier.padding(horizontal = Tokens.spaceMd)) {
            val adj = ADJUSTMENTS[selected]
            LabeledSlider(adj.label, adj.get(params), adj.range, adj.fmt(adj.get(params)), { params = adj.set(params, it) }, { commit() })
            LazyRow(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                items(ADJUSTMENTS.size) { i -> FilterChip(selected == i, { selected = i }, { Text(ADJUSTMENTS[i].label) }) }
            }
            Row(Modifier.fillMaxWidth().horizontalScrollRow(), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm), verticalAlignment = Alignment.CenterVertically) {
                IconButton({ params = params.copy(quarterTurns = params.quarterTurns + 1).validated(); commit() }) { Icon(Icons.Default.RotateRight, "Rotate 90 degrees") }
                IconButton({ params = params.copy(flipHorizontal = !params.flipHorizontal); commit() }) { Icon(Icons.Default.Flip, "Flip horizontally") }
                CropAspect.values().forEach { c -> FilterChip(params.crop == c, { params = params.copy(crop = c); commit() }, { Text(c.label) }) }
            }
            Text("Edits are saved as a new photo. The original is never changed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = Tokens.spaceXs))
        }
    }
}

@Composable
private fun Modifier.horizontalScrollRow(): Modifier = this.then(Modifier.horizontalScroll(rememberScrollState()))
