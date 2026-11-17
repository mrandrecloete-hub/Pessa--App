package com.pdfmaster.app.ui

import android.graphics.Bitmap
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.data.JobState
import com.pdfmaster.app.engine.Restore
import com.pdfmaster.app.tools.ImagePageSource
import com.pdfmaster.app.tools.PageSource
import com.pdfmaster.app.tools.RestoreJob
import com.pdfmaster.app.tools.RestoreOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

private class Preview(val key: String, val geometry: Bitmap, val enhanced: Bitmap, val report: Restore.Report)

/** Before and after: drag the handle, pinch to zoom. Both pictures have the same page outline, so they line up exactly. */
@Composable
private fun Compare(original: Bitmap, enhanced: Bitmap, frac: Float, onFrac: (Float) -> Unit, labels: Boolean = true) {
    val ar = enhanced.width.toFloat() / enhanced.height
    var w by remember { mutableIntStateOf(1) }
    Zoomable(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant)) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Box(Modifier.aspectRatio(ar).onSizeChanged { w = it.width.coerceAtLeast(1) }.background(Color.White)) {
                Image(enhanced.asImageBitmap(), "Enhanced page", Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
                Image(original.asImageBitmap(), "Original page", Modifier.fillMaxSize().drawWithContent { clipRect(right = size.width * frac) { this@drawWithContent.drawContent() } }, contentScale = ContentScale.FillBounds)
                Box(Modifier.fillMaxHeight().width(40.dp).offset { IntOffset((frac * w - 20.dp.toPx()).roundToInt(), 0) }
                    .pointerInput(w) { detectHorizontalDragGestures { change, dx -> change.consume(); onFrac((frac + dx / w).coerceIn(0.02f, 0.98f)) } }, contentAlignment = Alignment.Center) {
                    Box(Modifier.fillMaxHeight().width(2.dp).background(Color.White))
                    Box(Modifier.size(34.dp).clip(CircleShape).background(Brand.Royal).border(2.dp, Color.White, CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.UnfoldMore, "Drag to compare", tint = Color.White, modifier = Modifier.size(20.dp).then(Modifier)) }
                }
                if (labels) {
                    Text("ORIGINAL", Modifier.align(Alignment.TopStart).padding(6.dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 6.dp, vertical = 2.dp), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    Text("ENHANCED", Modifier.align(Alignment.TopEnd).padding(6.dp).clip(RoundedCornerShape(6.dp)).background(Brand.Royal.copy(alpha = 0.9f)).padding(horizontal = 6.dp, vertical = 2.dp), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RestoreScreen(vm: AppViewModel, nav: Nav, id: String) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val doc = remember(docs.isNotEmpty()) { docs.firstOrNull { it.id == id } }
    val (pdf, password) = rememberPdfSession(vm, doc?.takeIf { it.isPdf }) { nav.back() }
    val image = remember(doc?.id) { doc?.takeIf { !it.isPdf }?.let { ImagePageSource(vm.library.file(it)) } }
    val count = if (doc?.isPdf == true) pdf?.pageCount ?: 0 else if (image != null) 1 else 0
    val context = LocalContext.current
    val jobs by vm.jobs.jobs.collectAsStateWithLifecycle()

    var page by remember { mutableIntStateOf(0) }
    var mode by remember { mutableStateOf(Restore.Mode.AUTO) }
    var strength by remember { mutableFloatStateOf(0.6f) }
    var autoCrop by remember { mutableStateOf(true) }
    var ocr by remember(settings.ocrAfterScan) { mutableStateOf(settings.ocrAfterScan) }
    var hiRes by remember { mutableStateOf(true) }
    var view by remember { mutableStateOf("compare") }         // compare, enhanced, photo
    var frac by remember { mutableFloatStateOf(0.5f) }
    val keep = remember { mutableStateListOf<Int>() }
    val rot = remember { mutableStateMapOf<Int, Int>() }
    val originals = remember { mutableStateMapOf<Int, Bitmap>() }
    val dets = remember { HashMap<Int, Restore.Detection>() }
    var preview by remember { mutableStateOf<Preview?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var saveJob by remember { mutableStateOf<Long?>(null) }
    var finished by remember { mutableStateOf<RunResult?>(null) }
    var leave by remember { mutableStateOf(false) }
    val changed = keep.isNotEmpty() || mode != Restore.Mode.AUTO || strength != 0.6f || rot.isNotEmpty()
    BackHandler(saveJob == null && changed) { leave = true }

    fun source(): PageSource? = if (doc?.isPdf == true) pdf?.let { s -> object : PageSource { override val count = s.pageCount; override fun render(index: Int, maxSide: Int) = s.raster.render(index, maxSide); override fun close() {} } } else image

    // Original page at preview size.
    LaunchedEffect(page, count) {
        if (count == 0 || originals[page] != null) return@LaunchedEffect
        val src = source() ?: return@LaunchedEffect
        try { originals[page] = withContext(Dispatchers.Default) { src.render(page, 1500) } } catch (e: Exception) { error = e.message ?: "This page could not be read" }
    }
    // Restored preview: recalculated shortly after any setting changes, on a background thread.
    val key = "$page|${mode.name}|${(strength * 100).roundToInt()}|$autoCrop|${rot[page] ?: 0}"
    LaunchedEffect(key, originals[page]) {
        val o = originals[page] ?: return@LaunchedEffect
        if (page in keep) return@LaunchedEffect
        busy = true; delay(250)
        try {
            val r = withContext(Dispatchers.Default) {
                val det = dets.getOrPut(page) { Restore.detect(o) }
                Restore.process(o, det, Restore.Params(mode, strength, autoCrop, rot[page] ?: 0), 1400)
            }
            preview = Preview(key, r.geometry!!, r.enhanced, r.report); error = null
        } catch (e: kotlinx.coroutines.CancellationException) { throw e
        } catch (e: Throwable) { error = "The page could not be processed: ${e.message ?: e.javaClass.simpleName}" }
        busy = false
    }

    // Saving
    val job = jobs.firstOrNull { it.id == saveJob }
    LaunchedEffect(job?.state) {
        when (job?.state) {
            JobState.DONE -> { finished = job.result as? RunResult; vm.jobs.dismiss(job.id); saveJob = null; finished?.docs?.firstOrNull()?.let { vm.record("restore", "Professional Document Restoration", it) } }
            JobState.FAILED -> { vm.say(job.error ?: "Saving failed. Your original is unchanged."); vm.jobs.dismiss(job.id); saveJob = null }
            JobState.CANCELLED -> { vm.jobs.dismiss(job.id); saveJob = null }
            else -> {}
        }
    }
    fun save() {
        val d = doc ?: return; val src = source() ?: return
        val opts = RestoreOptions(Restore.Params(mode, strength, autoCrop), keep.toSet(), rot.toMap(), ocr, if (hiRes) 3300 else 2300)
        saveJob = vm.jobs.start("Professional restoration") { ctx -> RestoreJob.run(ctx, context, vm.library, d, src, opts) }
    }

    val cur = preview?.takeIf { it.key == key }
    val showOriginal = page in keep
    Scaffold(topBar = { BackBar("Document Restoration", { if (changed) leave = true else nav.back() }, subtitle = doc?.name) {
        TextButton(onClick = { save() }, enabled = count > 0 && saveJob == null && (cur != null || showOriginal)) { Text("Save") }
    } }, containerColor = MaterialTheme.colorScheme.background) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            // ---- preview area ----
            Box(Modifier.weight(1f).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                val o = originals[page]
                when {
                    error != null -> Text(error!!, Modifier.padding(20.dp), color = MaterialTheme.colorScheme.error)
                    o == null -> CircularProgressIndicator()
                    view == "photo" -> Box(Modifier.fillMaxSize()) {
                        Zoomable(Modifier.fillMaxSize()) {
                            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Box(Modifier.aspectRatio(o.width.toFloat() / o.height)) {
                                    Image(o.asImageBitmap(), "Original photo", Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds)
                                    val d = dets[page]
                                    if (d != null && d.found) Canvas(Modifier.fillMaxSize()) {
                                        val p = Path(); for (i in 0..3) { val x = d.quad[2 * i] * size.width; val y = d.quad[2 * i + 1] * size.height; if (i == 0) p.moveTo(x, y) else p.lineTo(x, y) }; p.close()
                                        drawPath(p, Brand.Cyan, style = Stroke(3.dp.toPx()))
                                        for (i in 0..3) drawCircle(Brand.Cyan, 7.dp.toPx(), Offset(d.quad[2 * i] * size.width, d.quad[2 * i + 1] * size.height))
                                    }
                                }
                            }
                        }
                        Text(if (dets[page]?.found == true) "Detected page outline" else "No page outline found: the whole picture is used", Modifier.align(Alignment.BottomCenter).padding(8.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.65f)).padding(horizontal = 10.dp, vertical = 4.dp), color = Color.White, fontSize = 12.sp)
                    }
                    showOriginal -> { Zoomable(Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Image(o.asImageBitmap(), "Original page", Modifier.aspectRatio(o.width.toFloat() / o.height), contentScale = ContentScale.FillBounds) } }
                        Text("This page will be saved exactly as the original", Modifier.align(Alignment.BottomCenter).padding(8.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.65f)).padding(horizontal = 10.dp, vertical = 4.dp), color = Color.White, fontSize = 12.sp) }
                    cur == null -> CircularProgressIndicator()
                    view == "enhanced" -> Zoomable(Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Image(cur.enhanced.asImageBitmap(), "Enhanced page", Modifier.aspectRatio(cur.enhanced.width.toFloat() / cur.enhanced.height).background(Color.White), contentScale = ContentScale.FillBounds) } }
                    else -> Compare(cur.geometry, cur.enhanced, frac, { frac = it })
                }
                if (busy && cur != null) LinearProgressIndicator(Modifier.align(Alignment.TopCenter).fillMaxWidth())
            }
            // ---- controls ----
            Column(Modifier.heightIn(max = 330.dp).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp, vertical = 8.dp)) {
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("compare" to "Compare", "enhanced" to "Enhanced", "photo" to "Original photo").forEach { (k, l) -> FilterChip(view == k, { view = k }, label = { Text(l) }) }
                }
                if (count > 1) LazyRow(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    itemsIndexed((0 until count).toList()) { _, i ->
                        Box(Modifier.size(width = 46.dp, height = 60.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).border(if (i == page) 2.dp else 1.dp, if (i == page) Brand.Royal else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)).clickable { page = i; preview = null },
                            contentAlignment = Alignment.Center) {
                            originals[i]?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alignment = Alignment.TopCenter) }
                            Text("${i + 1}", Modifier.align(Alignment.BottomCenter).background(Color.Black.copy(alpha = 0.6f)).fillMaxWidth(), color = Color.White, fontSize = 11.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                            if (i in keep) Icon(Icons.Outlined.Undo, "Original", tint = Color.White, modifier = Modifier.align(Alignment.TopEnd).padding(2.dp).size(14.dp).background(Brand.Royal, CircleShape))
                        }
                    }
                }
                Text("Mode", Modifier.padding(top = 10.dp), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Restore.Mode.entries.forEach { m -> FilterChip(mode == m, { mode = m }, label = { Text(m.label) }) }
                }
                Text(mode.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text("Strength", style = MaterialTheme.typography.labelLarge, modifier = Modifier.width(72.dp)); Slider(strength, { strength = it }, Modifier.weight(1f)); Text("${(strength * 100).roundToInt()}%", Modifier.width(44.dp), style = MaterialTheme.typography.labelLarge)
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(autoCrop, { autoCrop = !autoCrop }, label = { Text("Find page edges") }, leadingIcon = { Icon(Icons.Outlined.Crop, null, Modifier.size(18.dp)) })
                    AssistChip({ rot[page] = ((rot[page] ?: 0) + 90) % 360; preview = null }, { Text("Rotate") }, leadingIcon = { Icon(Icons.Outlined.RotateRight, null, Modifier.size(18.dp)) })
                    FilterChip(page in keep, { if (page in keep) keep.remove(page) else keep.add(page) }, label = { Text("Restore original") }, leadingIcon = { Icon(Icons.Outlined.Undo, null, Modifier.size(18.dp)) })
                    FilterChip(ocr, { ocr = !ocr }, label = { Text("Searchable text (OCR)") }, leadingIcon = { Icon(Icons.Outlined.ManageSearch, null, Modifier.size(18.dp)) })
                    FilterChip(hiRes, { hiRes = !hiRes }, label = { Text(if (hiRes) "High resolution" else "Standard resolution") })
                }
                // ---- what the app found, said plainly ----
                val rep = cur?.report
                if (rep != null && !showOriginal) {
                    Column(Modifier.padding(top = 8.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)).padding(12.dp)) {
                        rep.warnings.forEach { Row(Modifier.padding(bottom = 4.dp)) { Icon(Icons.Outlined.WarningAmber, null, tint = Color(0xFFF59E0B), modifier = Modifier.size(18.dp)); Text("  $it", style = MaterialTheme.typography.bodySmall) } }
                        rep.notes.forEach { Row(Modifier.padding(bottom = 4.dp)) { Icon(Icons.Outlined.Info, null, tint = Brand.Cyan, modifier = Modifier.size(18.dp)); Text("  $it", style = MaterialTheme.typography.bodySmall) } }
                        Text("Only light, colour and the page outline are changed. Nothing is retyped, drawn in or replaced: signatures, stamps, seals and logos stay as photographed. Your original is never overwritten.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                GradientButton("Save enhanced PDF", Icons.Outlined.Save, { save() }, Modifier.fillMaxWidth().padding(top = 10.dp), enabled = count > 0 && saveJob == null && (cur != null || showOriginal))
                if (count > 1) Text("Mode, strength and options apply to all $count pages. Restore original is chosen page by page.", Modifier.padding(top = 4.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
    if (leave) ConfirmDialog("Leave without saving?", "Your restoration settings will be lost. The original document is unchanged.", "Leave", { leave = false }, { leave = false; nav.back() }, danger = true)
    if (saveJob != null && job != null) AlertDialog({}, title = { Text("Restoring at full quality") }, text = { Column {
        Text(if (job.total > 0) "Page ${job.done + 1} of ${job.total}" else job.step.ifEmpty { "Working" }); Spacer(Modifier.height(12.dp))
        if (job.total > 0) LinearProgressIndicator(progress = { job.done.toFloat() / job.total }, Modifier.fillMaxWidth()) else LinearProgressIndicator(Modifier.fillMaxWidth()) } },
        confirmButton = { TextButton({ saveJob?.let { vm.jobs.cancel(it) } }) { Text("Stop") } })
    finished?.let { r -> val out = r.docs.firstOrNull()
        AlertDialog({ finished = null }, icon = { Icon(Icons.Outlined.CheckCircle, null, tint = Color(0xFF16A34A)) }, title = { Text("Restored PDF saved") }, text = {
            Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (out != null) Text(out.name, fontWeight = FontWeight.SemiBold); r.notes.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) } } },
            confirmButton = { TextButton({ finished = null; if (out != null) { nav.c.popBackStack(); vm.opened(out); nav.open(out) } }) { Text("Open") } },
            dismissButton = { Row { if (out != null) TextButton({ vm.share(listOf(out)) }) { Text("Share") }; TextButton({ finished = null }) { Text("Close") } } }) }
}
