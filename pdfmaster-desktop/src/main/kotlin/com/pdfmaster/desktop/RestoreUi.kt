package com.pdfmaster.desktop

import android.graphics.Bitmap
import android.content.Context
import androidx.compose.foundation.*
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.drew.imaging.ImageMetadataReader
import com.drew.metadata.exif.ExifIFD0Directory
import com.pdfmaster.app.engine.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import kotlin.math.abs
import kotlin.math.roundToInt

private fun ImageBitmapOf(b: Bitmap): ImageBitmap = b.image.toComposeImageBitmap()

/** A page source: PDF pages or one photo, rendered on demand. */
private class RSource(val file: File, val pdf: PdfSession?) {
    val count get() = pdf?.count ?: 1
    fun render(i: Int, maxSide: Int): Bitmap = pdf?.bitmap(i, maxSide) ?: uprightPhoto(file, maxSide)
}

/** A photo turned upright using its EXIF orientation (cameras store most photos sideways), then limited to [maxSide]. */
fun uprightPhoto(f: File, maxSide: Int): Bitmap {
    var img = javax.imageio.ImageIO.read(f) ?: throw IllegalArgumentException("This picture could not be read")
    val o = runCatching { ImageMetadataReader.readMetadata(f).getFirstDirectoryOfType(ExifIFD0Directory::class.java)?.getInt(ExifIFD0Directory.TAG_ORIENTATION) }.getOrNull() ?: 1
    val deg = when (o) { 6 -> 90; 3 -> 180; 8 -> 270; else -> 0 }
    if (deg != 0) { val r = java.awt.image.BufferedImage(if (deg == 180) img.width else img.height, if (deg == 180) img.height else img.width, java.awt.image.BufferedImage.TYPE_INT_ARGB)
        r.createGraphics().apply { translate(r.width / 2.0, r.height / 2.0); rotate(Math.toRadians(deg.toDouble())); translate(-img.width / 2.0, -img.height / 2.0); drawImage(img, 0, 0, null); dispose() }; img = r }
    var b = Bitmap.wrap(img); val side = maxOf(b.width, b.height)
    if (side > maxSide) b = Bitmap.createScaledBitmap(b, (b.width * maxSide.toFloat() / side).toInt(), (b.height * maxSide.toFloat() / side).toInt(), true)
    return b
}

private class Prev(val key: String, val geometry: ImageBitmap, val enhanced: ImageBitmap, val report: Restore.Report)

@Composable
private fun CompareCanvas(original: ImageBitmap, enhanced: ImageBitmap, view: String, frac: Float, onFrac: (Float) -> Unit, outline: FloatArray?) {
    var zoom by remember(original) { mutableFloatStateOf(1f) }; var pan by remember(original) { mutableStateOf(Offset.Zero) }
    var handle by remember { mutableStateOf(false) }
    val base = if (view == "photo") original else enhanced
    @OptIn(ExperimentalComposeUiApi::class)
    Canvas(Modifier.fillMaxSize().clip(RoundedCornerShape(14.dp)).background(Color(0xFF0A1428))
        .onPointerEvent(PointerEventType.Scroll) { e -> val d = e.changes.first().scrollDelta.y; zoom = (zoom * (if (d < 0) 1.12f else 0.89f)).coerceIn(1f, 8f); if (zoom == 1f) pan = Offset.Zero }
        .pointerInput(base, view) {
            detectDragGestures(onDragStart = { o ->
                val fit = minOf(size.width.toFloat() / base.width, size.height.toFloat() / base.height) * zoom; val w = base.width * fit; val left = (size.width - w) / 2 + pan.x
                handle = view == "compare" && abs(o.x - (left + frac * w)) < 36f }, onDragEnd = { handle = false },
                onDrag = { ch, d -> ch.consume(); val fit = minOf(size.width.toFloat() / base.width, size.height.toFloat() / base.height) * zoom; if (handle) onFrac((frac + d.x / (base.width * fit)).coerceIn(0.02f, 0.98f)) else if (zoom > 1f) pan += d })
        }) {
        val fit = minOf(size.width / base.width, size.height / base.height) * zoom
        val w = base.width * fit; val h = base.height * fit; val left = (size.width - w) / 2 + pan.x; val top = (size.height - h) / 2 + pan.y
        val dst = IntSize(w.roundToInt(), h.roundToInt()); val off = IntOffset(left.roundToInt(), top.roundToInt())
        drawRect(Color.White, Offset(left, top), androidx.compose.ui.geometry.Size(w, h))
        drawImage(if (view == "photo") original else enhanced, dstOffset = off, dstSize = dst, filterQuality = FilterQuality.High)
        if (view == "compare") {
            clipRect(left, top, left + frac * w, top + h) { drawImage(original, dstOffset = off, dstSize = dst, filterQuality = FilterQuality.High) }
            val x = left + frac * w; drawLine(Color.White, Offset(x, top), Offset(x, top + h), 3f); drawCircle(Brand.Royal, 20f, Offset(x, top + h / 2)); drawCircle(Color.White, 20f, Offset(x, top + h / 2), style = Stroke(3f))
            drawLine(Color.White, Offset(x - 8, top + h / 2), Offset(x - 2, top + h / 2), 3f); drawLine(Color.White, Offset(x + 2, top + h / 2), Offset(x + 8, top + h / 2), 3f)
        }
        if (view == "photo" && outline != null) { val p = Path(); for (i in 0..3) { val x = left + outline[2 * i] * w; val y = top + outline[2 * i + 1] * h; if (i == 0) p.moveTo(x, y) else p.lineTo(x, y) }; p.close(); drawPath(p, Brand.Cyan, style = Stroke(4f)); for (i in 0..3) drawCircle(Brand.Cyan, 9f, Offset(left + outline[2 * i] * w, top + outline[2 * i + 1] * h)) }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RestoreScreen(model: AppModel, file: File) {
    var session by remember(file) { mutableStateOf<PdfSession?>(null) }
    var password by remember(file) { mutableStateOf<String?>(null) }
    var askPw by remember(file) { mutableStateOf(false) }
    var loadError by remember(file) { mutableStateOf<String?>(null) }
    val isPdf = file.extension.equals("pdf", true)
    LaunchedEffect(file, password) { if (isPdf) try { session = withContext(Dispatchers.IO) { PdfSession(file, password) }; askPw = false } catch (e: PasswordRequiredException) { askPw = true } catch (e: Throwable) { loadError = e.message } }
    DisposableEffect(session) { val s = session; onDispose { s?.close() } }
    val source = remember(session, file) { if (isPdf) session?.let { RSource(file, it) } else RSource(file, null) }

    var page by remember { mutableIntStateOf(0) }
    var mode by remember { mutableStateOf(Restore.Mode.AUTO) }
    var strength by remember { mutableFloatStateOf(0.6f) }
    var autoCrop by remember { mutableStateOf(true) }
    var hiRes by remember { mutableStateOf(true) }
    var view by remember { mutableStateOf("compare") }
    var frac by remember { mutableFloatStateOf(0.5f) }
    val keep = remember { mutableStateListOf<Int>() }
    val rot = remember { mutableStateMapOf<Int, Int>() }
    val originals = remember(source) { mutableStateMapOf<Int, ImageBitmap>() }
    val origBmp = remember(source) { HashMap<Int, Bitmap>() }
    val dets = remember(source) { HashMap<Int, Restore.Detection>() }
    var prev by remember { mutableStateOf<Prev?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf<String?>(null) }
    var savedProgress by remember { mutableFloatStateOf(0f) }
    var done by remember { mutableStateOf<Pair<File, List<String>>?>(null) }
    val scope = rememberCoroutineScope()
    val count = source?.count ?: 0

    LaunchedEffect(page, source) { val src = source ?: return@LaunchedEffect; if (origBmp[page] != null) return@LaunchedEffect
        try { val b = withContext(Dispatchers.Default) { src.render(page, 1500) }; origBmp[page] = b; originals[page] = ImageBitmapOf(b) } catch (e: Throwable) { error = e.message ?: "This page could not be read" } }
    val key = "$page|${mode.name}|${(strength * 100).roundToInt()}|$autoCrop|${rot[page] ?: 0}"
    LaunchedEffect(key, originals[page]) {
        val o = origBmp[page] ?: return@LaunchedEffect; if (page in keep) return@LaunchedEffect
        busy = true; delay(250)
        try { val r = withContext(Dispatchers.Default) { val det = dets.getOrPut(page) { Restore.detect(o) }; Restore.process(o, det, Restore.Params(mode, strength, autoCrop, rot[page] ?: 0), 1400) }
            prev = Prev(key, ImageBitmapOf(r.geometry!!), ImageBitmapOf(r.enhanced), r.report); error = null
        } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Throwable) { error = "The page could not be processed: ${e.message ?: e.javaClass.simpleName}" }
        busy = false
    }
    val cur = prev?.takeIf { it.key == key }
    val showOriginal = page in keep

    fun save() {
        val src = source ?: return
        val target = Files.save("Save restored PDF", "${file.nameWithoutExtension} (restored).pdf") ?: return
        val keepSet = keep.toSet(); val rots = rot.toMap(); val params = Restore.Params(mode, strength, autoCrop); val maxSide = if (hiRes) 3300 else 2300
        saving = "Restoring page 1"; savedProgress = 0f
        scope.launch {
            try {
                val notes = withContext(Dispatchers.IO) {
                    val n = ArrayList<String>(); val tmp = File.createTempFile("restored", ".pdf")
                    ScanPdfWriter(Context(), ScanClean.Mode.COLOUR, typed = false, a4 = true).use { w ->
                        for (i in 0 until src.count) {
                            saving = "Restoring page ${i + 1} of ${src.count}"; savedProgress = i.toFloat() / src.count
                            val orig = src.render(i, maxSide); var out = orig; var m = ScanClean.Mode.COLOUR
                            if (i in keepSet) n.add("Page ${i + 1}: kept exactly as the original, as you asked.")
                            else { val r = Restore.process(orig, Restore.detect(orig), params.copy(rotate = rots[i] ?: 0), maxSide, withGeometry = false); out = r.enhanced; if (r.report.chosen == Restore.Mode.BW) m = ScanClean.Mode.BW
                                r.report.warnings.forEach { n.add("Page ${i + 1}: $it") }; if (params.mode == Restore.Mode.AUTO) r.report.notes.firstOrNull { it.startsWith("Auto:") }?.let { n.add("Page ${i + 1}: $it") } }
                            w.add(ScanPage(out, emptyList()), m)
                        }
                        w.save(tmp, file.nameWithoutExtension)
                    }
                    tmp.copyTo(target, overwrite = true); tmp.delete()
                    n.add(0, "Your original is unchanged. Only light, colour and the page outline were adjusted: no text, number, signature or stamp was retyped, drawn or replaced.")
                    n.add("Searchable text (OCR) is not available in the Windows version yet, so this PDF has the page pictures only."); n
                }
                done = target to notes
            } catch (e: Throwable) { model.toast = "Saving failed: ${e.message}. Your original is unchanged." }
            saving = null
        }
    }

    Row(Modifier.fillMaxSize().padding(16.dp), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Column(Modifier.weight(1f).fillMaxHeight()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton({ model.screen = if (isPdf) Screen.Viewer(file) else Screen.Home }) { Icon(Icons.Outlined.ArrowBack, "Back") }
                Column(Modifier.weight(1f)) { Text("Professional Document Restoration", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold); Text(file.name, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                listOf("compare" to "Compare", "enhanced" to "Enhanced", "photo" to "Original photo").forEach { (k, l) -> FilterChip(view == k, { view = k }, label = { Text(l) }, modifier = Modifier.padding(horizontal = 3.dp)) }
            }
            Box(Modifier.weight(1f).fillMaxWidth().padding(top = 8.dp), contentAlignment = Alignment.Center) {
                val o = originals[page]
                when {
                    loadError != null -> Text(loadError!!, color = MaterialTheme.colorScheme.error)
                    error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                    o == null -> CircularProgressIndicator()
                    showOriginal -> Box { CompareCanvas(o, o, "enhanced", 0.5f, {}, null); Text("This page will be saved exactly as the original", Modifier.align(Alignment.BottomCenter).padding(10.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.65f)).padding(horizontal = 10.dp, vertical = 4.dp), color = Color.White) }
                    cur == null && view != "photo" -> CircularProgressIndicator()
                    else -> Box { CompareCanvas(if (view == "photo") o else cur!!.geometry, cur?.enhanced ?: o, view, frac, { frac = it }, dets[page]?.takeIf { it.found }?.quad)
                        if (view == "compare") { Text("ORIGINAL", Modifier.align(Alignment.TopStart).padding(10.dp).clip(RoundedCornerShape(6.dp)).background(Color.Black.copy(alpha = 0.6f)).padding(horizontal = 8.dp, vertical = 3.dp), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            Text("ENHANCED", Modifier.align(Alignment.TopEnd).padding(10.dp).clip(RoundedCornerShape(6.dp)).background(Brand.Royal.copy(alpha = 0.9f)).padding(horizontal = 8.dp, vertical = 3.dp), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold) }
                        if (view == "photo") Text(if (dets[page]?.found == true) "Detected page outline" else "No page outline found: the whole picture is used", Modifier.align(Alignment.BottomCenter).padding(10.dp).clip(RoundedCornerShape(8.dp)).background(Color.Black.copy(alpha = 0.65f)).padding(horizontal = 10.dp, vertical = 4.dp), color = Color.White) }
                }
                if (busy && cur != null) LinearProgressIndicator(Modifier.align(Alignment.TopCenter).fillMaxWidth())
            }
            Text("Scroll to zoom, drag to move, drag the handle to compare.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
        }
        Column(Modifier.width(350.dp).fillMaxHeight().verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (count > 1) { Text("Pages", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { itemsIndexed((0 until count).toList()) { _, i ->
                    Box(Modifier.size(54.dp, 70.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).border(if (i == page) 2.dp else 1.dp, if (i == page) Brand.Royal else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)).clickable { page = i; prev = null }, contentAlignment = Alignment.BottomCenter) {
                        originals[i]?.let { Image(it, null, Modifier.fillMaxSize(), contentScale = androidx.compose.ui.layout.ContentScale.Crop, alignment = Alignment.TopCenter) }
                        Text("${i + 1}${if (i in keep) " ↩" else ""}", Modifier.fillMaxWidth().background(Color.Black.copy(alpha = 0.6f)), color = Color.White, fontSize = 11.sp, textAlign = androidx.compose.ui.text.style.TextAlign.Center) } } } }
            Text("Mode", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Restore.Mode.entries.forEach { m -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { mode = m }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                RadioButton(mode == m, { mode = m }); Column { Text(m.label, fontWeight = FontWeight.SemiBold); if (mode == m) Text(m.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } } }
            Row(verticalAlignment = Alignment.CenterVertically) { Text("Strength", Modifier.width(72.dp), style = MaterialTheme.typography.labelLarge); Slider(strength, { strength = it }, Modifier.weight(1f)); Text("${(strength * 100).roundToInt()}%", Modifier.width(44.dp)) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(autoCrop, { autoCrop = !autoCrop }, label = { Text("Find page edges") })
                AssistChip({ rot[page] = ((rot[page] ?: 0) + 90) % 360; prev = null }, { Text("Rotate") }, leadingIcon = { Icon(Icons.Outlined.RotateRight, null, Modifier.size(18.dp)) })
                FilterChip(page in keep, { if (page in keep) keep.remove(page) else keep.add(page) }, label = { Text("Restore original") }, leadingIcon = { Icon(Icons.Outlined.Undo, null, Modifier.size(18.dp)) })
                FilterChip(hiRes, { hiRes = !hiRes }, label = { Text(if (hiRes) "High resolution" else "Standard resolution") })
            }
            cur?.report?.takeIf { !showOriginal }?.let { rep -> Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surface).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)).padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                rep.warnings.forEach { Row { Icon(Icons.Outlined.WarningAmber, null, tint = Color(0xFFF59E0B), modifier = Modifier.size(18.dp)); Text("  $it", style = MaterialTheme.typography.bodySmall) } }
                rep.notes.forEach { Row { Icon(Icons.Outlined.Info, null, tint = Brand.Cyan, modifier = Modifier.size(18.dp)); Text("  $it", style = MaterialTheme.typography.bodySmall) } }
                Text("Only light, colour and the page outline are changed. Nothing is retyped, drawn in or replaced: signatures, stamps, seals and logos stay as photographed. Your original is never overwritten.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
            Button({ save() }, Modifier.fillMaxWidth().height(50.dp), enabled = count > 0 && saving == null && (cur != null || showOriginal)) { Icon(Icons.Outlined.Save, null); Text("  Save enhanced PDF") }
            Text("Searchable text (OCR) is not in the Windows version yet.${if (count > 1) " Mode, strength and options apply to all $count pages; Restore original is per page." else ""}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    saving?.let { AlertDialog({}, title = { Text("Restoring at full quality") }, text = { Column { Text(it); Spacer(Modifier.height(10.dp)); LinearProgressIndicator(progress = { savedProgress }, Modifier.fillMaxWidth()) } }, confirmButton = {}) }
    done?.let { (f, n) -> AlertDialog({ done = null }, icon = { Icon(Icons.Outlined.CheckCircle, null, tint = Color(0xFF22C55E)) }, title = { Text("Restored PDF saved") }, text = { Column(Modifier.heightIn(max = 340.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(f.name, fontWeight = FontWeight.SemiBold); n.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) } } },
        confirmButton = { TextButton({ done = null; model.open(f) }) { Text("Open") } }, dismissButton = { Row { TextButton({ Files.showInFolder(f) }) { Text("Show in folder") }; TextButton({ done = null }) { Text("Close") } } }) }
    if (askPw) { var pw by remember { mutableStateOf("") }
        AlertDialog({ model.screen = Screen.Home }, title = { Text("Password needed") }, text = { OutlinedTextField(pw, { pw = it }, singleLine = true, label = { Text("Password") }, visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()) },
            confirmButton = { TextButton({ password = pw }, enabled = pw.isNotEmpty()) { Text("Open") } }, dismissButton = { TextButton({ model.screen = Screen.Home }) { Text("Cancel") } }) }
}
