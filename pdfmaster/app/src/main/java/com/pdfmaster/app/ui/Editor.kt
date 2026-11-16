package com.pdfmaster.app.ui

import android.graphics.Paint
import android.graphics.Typeface
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.data.Category
import com.pdfmaster.app.data.JobState
import com.pdfmaster.app.engine.*
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** One thing placed on a page in the editor. Coordinates are page points from the top left. */
data class EdItem(
    val id: Int, val page: Int, val kind: String,
    val x1: Float, val y1: Float, val x2: Float = x1, val y2: Float = y1,
    val text: String = "", val color: Int = 0x111111, val size: Float = 14f, val bold: Boolean = false,
    val strokes: List<List<Offset>> = emptyList(), val bytes: ByteArray? = null, val image: ImageBitmap? = null, val signature: Boolean = false
) {
    private fun paint() = Paint().apply { textSize = size; typeface = if (bold || kind == "stamp") Typeface.DEFAULT_BOLD else Typeface.DEFAULT }
    /** The rectangle the item covers, used for selecting and moving. */
    fun bounds(): Rect = when (kind) {
        "text" -> { val lines = textBoxLines(text); val p = paint(); Rect(x1, y1, x1 + max(12f, lines.maxOf { p.measureText(it) }), y1 + lines.size * size * 1.25f) }
        "stamp" -> { val w = paint().measureText(text.uppercase()); val pad = size * 0.35f; Rect(x1, y1, x1 + w + 2 * pad, y1 + size + 2 * pad) }
        "note" -> Rect(x1, y1, x1 + 16f, y1 + 16f)
        "ink" -> strokes.flatten().let { p -> if (p.isEmpty()) Rect(x1, y1, x1, y1) else Rect(p.minOf { it.x }, p.minOf { it.y }, p.maxOf { it.x }, p.maxOf { it.y }) }
        else -> Rect(min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2))
    }
    fun moved(dx: Float, dy: Float) = copy(x1 = x1 + dx, y1 = y1 + dy, x2 = x2 + dx, y2 = y2 + dy, strokes = strokes.map { s -> s.map { Offset(it.x + dx, it.y + dy) } })
    val resizable get() = kind in setOf("image", "rect", "ellipse", "whiteout", "redact", "highlight", "field", "check")
    val hasText get() = kind in setOf("text", "note", "stamp")
}

private class ToolDef(val id: String, val label: String, val icon: ImageVector, val drag: Boolean)
private val ED_TOOLS = listOf(
    ToolDef("select", "Select", Icons.Outlined.NearMe, false), ToolDef("pan", "Move view", Icons.Outlined.PanTool, false),
    ToolDef("text", "Text", Icons.Outlined.TextFields, false), ToolDef("sign", "Signature", Icons.Outlined.Draw, false), ToolDef("image", "Picture", Icons.Outlined.Image, false),
    ToolDef("ink", "Draw", Icons.Outlined.Gesture, true), ToolDef("highlight", "Highlight", Icons.Outlined.BorderColor, true), ToolDef("underline", "Underline", Icons.Outlined.FormatUnderlined, true),
    ToolDef("strike", "Strike out", Icons.Outlined.FormatStrikethrough, true), ToolDef("whiteout", "Cover", Icons.Outlined.Rectangle, true),
    ToolDef("rect", "Box", Icons.Outlined.CropSquare, true), ToolDef("ellipse", "Circle", Icons.Outlined.Circle, true), ToolDef("line", "Line", Icons.Outlined.HorizontalRule, true),
    ToolDef("arrow", "Arrow", Icons.Outlined.ArrowOutward, true), ToolDef("note", "Comment", Icons.Outlined.Comment, false), ToolDef("stamp", "Stamp", Icons.Outlined.Approval, false),
    ToolDef("date", "Date", Icons.Outlined.CalendarToday, false), ToolDef("tick", "Tick", Icons.Outlined.Check, false), ToolDef("cross", "Cross", Icons.Outlined.Close, false),
    ToolDef("field", "Text field", Icons.Outlined.Input, true), ToolDef("check", "Check box", Icons.Outlined.CheckBox, false), ToolDef("redact", "Redact", Icons.Outlined.HideSource, true)
)
private val COLORS = listOf(0x111111, 0xDC2626, 0x2563EB, 0x16A34A, 0xF59E0B, 0x8B5CF6, 0xFFE600, 0xFFFFFF)
private val STAMPS = listOf("Approved", "Paid", "Draft", "Confidential", "Received", "Rejected", "Copy", "Final")
private fun c(rgb: Int, alpha: Float = 1f) = Color(rgb or (0xFF shl 24)).copy(alpha = alpha)

private fun DrawScope.drawItem(it: EdItem, s: Float, selected: Boolean) {
    val b = it.bounds()
    fun o(x: Float, y: Float) = Offset(x * s, y * s)
    when (it.kind) {
        "text", "stamp" -> drawIntoCanvas { cv ->
            val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = it.size * s; color = it.color or (0xFF shl 24); typeface = if (it.bold || it.kind == "stamp") Typeface.DEFAULT_BOLD else Typeface.DEFAULT }
            if (it.kind == "stamp") {
                val pad = it.size * 0.35f
                drawRect(c(it.color), o(b.left, b.top), Size(b.width * s, b.height * s), style = Stroke(max(1.5f, it.size / 9f) * s))
                cv.nativeCanvas.drawText(it.text.uppercase(), (it.x1 + pad) * s, (it.y1 + pad + it.size * 0.86f) * s, p)
            } else textBoxLines(it.text).forEachIndexed { i, line -> cv.nativeCanvas.drawText(line, it.x1 * s, (it.y1 + it.size * 0.95f + i * it.size * 1.25f) * s, p) }
        }
        "note" -> { drawRect(Color(0xFFFACC15), o(b.left, b.top), Size(16f * s, 16f * s)); drawRect(Color(0xFF92400E), o(b.left, b.top), Size(16f * s, 16f * s), style = Stroke(1f * s))
            for (i in 1..3) drawLine(Color(0xFF92400E), o(b.left + 3, b.top + i * 4f), o(b.left + 13, b.top + i * 4f), 1f * s) }
        "image" -> it.image?.let { img -> drawImage(img, dstOffset = IntOffset((b.left * s).toInt(), (b.top * s).toInt()), dstSize = IntSize((b.width * s).toInt().coerceAtLeast(1), (b.height * s).toInt().coerceAtLeast(1))) }
        "ink" -> for (st in it.strokes) { if (st.isEmpty()) continue; val p = Path().apply { moveTo(st[0].x * s, st[0].y * s); st.drop(1).forEach { q -> lineTo(q.x * s, q.y * s) } }
            drawPath(p, c(it.color), style = Stroke(it.size * s, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
        "highlight" -> drawRect(c(it.color, 0.4f), o(b.left, b.top), Size(b.width * s, b.height * s))
        "underline" -> drawLine(c(it.color), o(b.left, b.bottom), o(b.right, b.bottom), 1.5f * s)
        "strike" -> drawLine(c(it.color), o(b.left, (b.top + b.bottom) / 2), o(b.right, (b.top + b.bottom) / 2), 1.5f * s)
        "whiteout" -> drawRect(c(it.color), o(b.left, b.top), Size(b.width * s, b.height * s))
        "redact" -> { drawRect(Color.Black.copy(alpha = 0.85f), o(b.left, b.top), Size(b.width * s, b.height * s)); drawRect(Color(0xFFDC2626), o(b.left, b.top), Size(b.width * s, b.height * s), style = Stroke(1.5f * s)) }
        "rect" -> drawRect(c(it.color), o(b.left, b.top), Size(b.width * s, b.height * s), style = Stroke(it.size * s))
        "ellipse" -> drawOval(c(it.color), o(b.left, b.top), Size(b.width * s, b.height * s), style = Stroke(it.size * s))
        "line", "arrow" -> { drawLine(c(it.color), o(it.x1, it.y1), o(it.x2, it.y2), it.size * s, cap = StrokeCap.Round)
            if (it.kind == "arrow") { val a = atan2(it.y2 - it.y1, it.x2 - it.x1); val len = max(8f, it.size * 4.5f)
                val p = Path().apply { moveTo(it.x2 * s, it.y2 * s); lineTo((it.x2 - len * cos(a - 0.45f)) * s, (it.y2 - len * sin(a - 0.45f)) * s); lineTo((it.x2 - len * cos(a + 0.45f)) * s, (it.y2 - len * sin(a + 0.45f)) * s); close() }
                drawPath(p, c(it.color)) } }
        "field", "check" -> { drawRect(Brand.Indigo.copy(alpha = 0.12f), o(b.left, b.top), Size(b.width * s, b.height * s)); drawRect(Brand.Indigo, o(b.left, b.top), Size(b.width * s, b.height * s), style = Stroke(1f * s)) }
    }
    if (selected) {
        drawRect(Brand.Royal, o(b.left - 3, b.top - 3), Size((b.width + 6) * s, (b.height + 6) * s), style = Stroke(1.5f * density, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 8f))))
        if (it.resizable) drawCircle(Brand.Royal, 7f * density, o(b.right + 3, b.bottom + 3))
    }
}

private fun toOverlay(it: EdItem): Overlay? = when (it.kind) {
    "text" -> TextOverlay(it.page, it.x1, it.y1, it.text, it.size, it.color, it.bold)
    "stamp" -> StampOverlay(it.page, it.x1, it.y1, it.text, it.color, it.size)
    "note" -> NoteOverlay(it.page, it.x1, it.y1, it.text)
    "image" -> it.bounds().let { b -> ImageOverlay(it.page, b.left, b.top, b.width, b.height, it.bytes!!) }
    "ink" -> InkOverlay(it.page, it.strokes.map { s -> s.map { p -> p.x to p.y } }, it.color, it.size)
    "highlight" -> MarkupOverlay(it.page, MarkupKind.HIGHLIGHT, it.x1, it.y1, it.x2, it.y2, it.color)
    "underline" -> MarkupOverlay(it.page, MarkupKind.UNDERLINE, it.x1, it.y1, it.x2, it.y2, it.color)
    "strike" -> MarkupOverlay(it.page, MarkupKind.STRIKE, it.x1, it.y1, it.x2, it.y2, it.color)
    "whiteout" -> ShapeOverlay(it.page, ShapeKind.RECT, it.x1, it.y1, it.x2, it.y2, it.color, 0f, it.color)
    "rect" -> ShapeOverlay(it.page, ShapeKind.RECT, it.x1, it.y1, it.x2, it.y2, it.color, it.size)
    "ellipse" -> ShapeOverlay(it.page, ShapeKind.ELLIPSE, it.x1, it.y1, it.x2, it.y2, it.color, it.size)
    "line" -> ShapeOverlay(it.page, ShapeKind.LINE, it.x1, it.y1, it.x2, it.y2, it.color, it.size)
    "arrow" -> ShapeOverlay(it.page, ShapeKind.ARROW, it.x1, it.y1, it.x2, it.y2, it.color, it.size)
    else -> null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditorScreen(vm: AppViewModel, nav: Nav, id: String, start: String) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val doc = remember(docs.isNotEmpty()) { docs.firstOrNull { it.id == id } }
    val (session, password) = rememberPdfSession(vm, doc) { nav.back() }
    val jobs by vm.jobs.jobs.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope(); val context = LocalContext.current
    val density = LocalDensity.current
    val screenW = with(density) { LocalConfiguration.current.screenWidthDp.dp.toPx() }

    var items by remember { mutableStateOf(listOf<EdItem>()) }
    val undo = remember { mutableStateListOf<List<EdItem>>() }; val redo = remember { mutableStateListOf<List<EdItem>>() }
    var nextId by remember { mutableIntStateOf(1) }
    fun change(new: List<EdItem>) { undo.add(items); if (undo.size > 60) undo.removeAt(0); redo.clear(); items = new }
    var page by remember { mutableIntStateOf(0) }
    var tool by remember { mutableStateOf(if (start == "redact") "redact" else if (start == "sign") "sign" else "select") }
    var color by remember { mutableIntStateOf(0x111111) }
    var stroke by remember { mutableFloatStateOf(2f) }
    var fontSize by remember { mutableFloatStateOf(14f) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var selected by remember { mutableStateOf<Int?>(null) }
    var live by remember { mutableStateOf<EdItem?>(null) }
    var textAt by remember { mutableStateOf<Pair<Offset, EdItem?>?>(null) }      // position and the item being edited, if any
    var textKind by remember { mutableStateOf("text") }
    var pending by remember { mutableStateOf<EdItem?>(null) }                    // picture or signature waiting to be placed with a tap
    var sheet by remember { mutableStateOf(if (start == "sign") "sign" else "") }
    var stampText by remember { mutableStateOf("Approved") }
    var saveJob by remember { mutableStateOf<Long?>(null) }
    var leave by remember { mutableStateOf(false) }
    var info by remember { mutableStateOf(start != "sign") }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch {
            val b = readPicture(context, uri); val bmp = b?.let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }
            if (b == null || bmp == null) vm.say("That picture could not be read") else { pending = EdItem(0, 0, "image", 0f, 0f, bmp.width.toFloat(), bmp.height.toFloat(), bytes = b, image = bmp.asImageBitmap()); vm.say("Tap the page where the picture should go") }
        }
    }
    val dirty = items.isNotEmpty()
    BackHandler(dirty && saveJob == null) { leave = true }

    // ---- saving ----
    val job = jobs.firstOrNull { it.id == saveJob }
    LaunchedEffect(job?.state) {
        when (job?.state) {
            JobState.DONE -> { vm.jobs.dismiss(job.id); val out = job.result as? com.pdfmaster.app.data.Doc; saveJob = null
                if (out != null) { vm.say("Saved as ${out.name}"); nav.c.popBackStack(); vm.opened(out); nav.open(out) } }
            JobState.FAILED -> { vm.say(job.error ?: "Saving failed. Your original is unchanged."); vm.jobs.dismiss(job.id); saveJob = null }
            JobState.CANCELLED -> { vm.jobs.dismiss(job.id); saveJob = null }
            else -> {}
        }
    }
    fun save() {
        val d = doc ?: return; val snapshot = items
        saveJob = vm.jobs.start("Save edited PDF") { ctx ->
            val work = vm.library.workDir()
            try {
                var src = vm.library.file(d); var pw = password
                val redactions = snapshot.filter { it.kind == "redact" }
                if (redactions.isNotEmpty()) {
                    ctx.step("Removing redacted content")
                    val t = File(work, "r.pdf")
                    com.pdfmaster.app.data.AndroidRasterizer(vm.library.renderable(d, pw)).use { r ->
                        PdfOps.redact(src, redactions.groupBy({ it.page }, { it.bounds().let { b -> floatArrayOf(b.left, b.top, b.right, b.bottom) } }), r, t, pw, progress = ctx.progress) }
                    src = t; pw = null
                }
                val overlays = snapshot.mapNotNull { toOverlay(it) }
                if (overlays.isNotEmpty()) { ctx.step("Writing your changes"); val t = File(work, "o.pdf"); OverlayWriter.apply(context, src, overlays, t, pw, ctx.progress); src = t; pw = null }
                val fields = snapshot.filter { it.kind == "field" || it.kind == "check" }
                if (fields.isNotEmpty()) { val t = File(work, "f.pdf")
                    PdfForms.addFields(src, fields.map { it.bounds().let { b -> NewField(it.page, if (it.kind == "check") FieldKind.CHECKBOX else FieldKind.TEXT, it.text, b.left, b.top, b.width, b.height) } }, t, pw); src = t }
                val signed = snapshot.any { it.signature }
                val label = if (redactions.isNotEmpty()) "redacted" else if (signed) "signed" else "edited"
                val out = vm.library.adopt(src, "${d.name.substringBeforeLast('.')} ($label).pdf", if (signed) Category.SIGNED else Category.EDITED)
                vm.record(if (signed) "sign" else if (redactions.isNotEmpty()) "redact" else "edit", if (signed) "Sign PDF" else if (redactions.isNotEmpty()) "Redact" else "Edit PDF", out)
                out
            } finally { work.deleteRecursively() }
        }
    }

    Scaffold(topBar = { BackBar(doc?.name ?: "Edit", { if (dirty) leave = true else nav.back() }, subtitle = "Changes are saved as a new copy") {
        IconButton(onClick = { redo.add(items); items = undo.removeAt(undo.size - 1); selected = null }, enabled = undo.isNotEmpty()) { Icon(Icons.AutoMirrored.Outlined.Undo, "Undo") }
        IconButton(onClick = { undo.add(items); items = redo.removeAt(redo.size - 1); selected = null }, enabled = redo.isNotEmpty()) { Icon(Icons.AutoMirrored.Outlined.Redo, "Redo") }
        TextButton(onClick = { save() }, enabled = dirty && saveJob == null) { Text("Save") }
    } }, containerColor = MaterialTheme.colorScheme.surfaceVariant) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            if (session == null) { Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Column }
            val (pw, ph) = session.sizes[page]
            val scale = screenW * zoom / pw            // pixels per page point
            val canScroll = tool == "pan"
            Box(Modifier.weight(1f).fillMaxWidth().verticalScroll(rememberScrollState(), enabled = canScroll).horizontalScroll(rememberScrollState(), enabled = canScroll)) {
                Box(Modifier.size(with(density) { (pw * scale).toDp() }, with(density) { (ph * scale).toDp() })) {
                    PageImage(session, page, (screenW * zoom).toInt(), Modifier.fillMaxSize(), hi = zoom > 1.2f)
                    Canvas(Modifier.fillMaxSize().pointerInput(tool, page, scale, pending, color, stroke, fontSize, stampText) {
                        if (tool == "pan") return@pointerInput
                        awaitEachGesture {
                            val down = awaitFirstDown(); val p0 = down.position / scale
                            val def = ED_TOOLS.first { it.id == tool }
                            var moved = false; var last = p0
                            var grab: EdItem? = null; var resize = false; var before: List<EdItem>? = null
                            if (tool == "select") {
                                val sel = items.firstOrNull { it.id == selected }
                                if (sel != null && sel.resizable && (sel.bounds().bottomRight - p0).getDistance() < 22f / zoom.coerceAtLeast(0.5f)) { grab = sel; resize = true }
                                else grab = items.lastOrNull { it.page == page && it.bounds().inflate(8f).contains(p0) }
                                selected = grab?.id; before = items
                            }
                            val pts = ArrayList<Offset>().apply { add(p0) }
                            while (true) {
                                val e = awaitPointerEvent(); val ch = e.changes.firstOrNull { it.id == down.id } ?: break
                                if (!ch.pressed) break
                                val p = ch.position / scale
                                if (!moved && (p - p0).getDistance() * scale > viewConfiguration.touchSlop) moved = true
                                if (moved) {
                                    ch.consume()
                                    if (tool == "select" && grab != null) {
                                        val g = items.firstOrNull { it.id == grab!!.id } ?: break
                                        items = items.map { if (it.id != g.id) it else if (resize) { val b = g.bounds(); if (g.kind == "image") { val w = max(12f, p.x - b.left); g.copy(x1 = b.left, y1 = b.top, x2 = b.left + w, y2 = b.top + w * b.height / b.width) } else g.copy(x1 = b.left, y1 = b.top, x2 = max(b.left + 6f, p.x), y2 = max(b.top + 6f, p.y)) } else g.moved(p.x - last.x, p.y - last.y) }
                                    } else if (def.drag) {
                                        pts.add(p)
                                        live = if (tool == "ink") EdItem(-1, page, "ink", p0.x, p0.y, strokes = listOf(pts.toList()), color = color, size = stroke)
                                        else EdItem(-1, page, tool, p0.x, p0.y, p.x, p.y, color = when (tool) { "highlight" -> if (color == 0x111111) 0xFFE600 else color; "whiteout" -> 0xFFFFFF; else -> color }, size = stroke)
                                    }
                                    last = p
                                }
                            }
                            val lv = live; live = null
                            when {
                                tool == "select" -> if (moved && grab != null && before != null && before != items) { undo.add(before); redo.clear() }
                                def.drag && lv != null && (lv.kind == "ink" || lv.kind in setOf("line", "arrow", "underline", "strike") && hypot(lv.x2 - lv.x1, lv.y2 - lv.y1) > 6f || abs(lv.x2 - lv.x1) > 5f && abs(lv.y2 - lv.y1) > 5f) ->
                                    change(items + lv.copy(id = nextId++))
                                def.drag && tool == "ink" && !moved -> change(items + EdItem(nextId++, page, "ink", p0.x, p0.y, strokes = listOf(listOf(p0)), color = color, size = stroke))
                                moved -> {}
                                pending != null -> { val pd = pending!!; val w = if (pd.signature) 150f else min(220f, pw * 0.45f); val h = w * pd.y2 / pd.x2
                                    val it = pd.copy(id = nextId++, page = page, x1 = p0.x - w / 2, y1 = p0.y - h / 2, x2 = p0.x + w / 2, y2 = p0.y + h / 2); change(items + it); pending = null; selected = it.id; tool = "select" }
                                tool == "text" || tool == "note" -> { textKind = tool; textAt = p0 to null }
                                tool == "stamp" -> change(items + EdItem(nextId++, page, "stamp", p0.x, p0.y, text = stampText, color = if (color == 0x111111) 0xDC2626 else color, size = 20f))
                                tool == "date" -> change(items + EdItem(nextId++, page, "text", p0.x, p0.y - fontSize / 2, text = SimpleDateFormat("d MMMM yyyy", Locale.getDefault()).format(Date()), color = color, size = fontSize))
                                tool == "tick" || tool == "cross" -> change(items + EdItem(nextId++, page, "text", p0.x - 7f, p0.y - 9f, text = if (tool == "tick") "✓" else "✗", color = color, size = 18f, bold = true))
                                tool == "check" -> change(items + EdItem(nextId++, page, "check", p0.x - 8f, p0.y - 8f, p0.x + 8f, p0.y + 8f, text = "Check box"))
                                tool == "sign" -> sheet = "sign"
                                tool == "image" -> pickImage.launch("image/*")
                            }
                            if (tool == "field" && lv != null) { /* named below */ }
                        }
                    }) {
                        items.filter { it.page == page }.forEach { drawItem(it, scale, it.id == selected) }
                        live?.let { drawItem(it, scale, false) }
                    }
                }
            }
            // ---- selected item actions ----
            val sel = items.firstOrNull { it.id == selected }
            if (sel != null) Surface(tonalElevation = 3.dp) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(ED_TOOLS.firstOrNull { it.id == sel.kind }?.label ?: if (sel.signature) "Signature" else "Item", Modifier.padding(horizontal = 8.dp), style = MaterialTheme.typography.labelLarge)
                    if (sel.hasText || sel.kind == "field" || sel.kind == "check") TextButton(onClick = { textKind = sel.kind; textAt = Offset(sel.x1, sel.y1) to sel }) { Text(if (sel.kind == "field" || sel.kind == "check") "Name" else "Change text") }
                    if (sel.kind in setOf("text", "stamp", "ink", "rect", "ellipse", "line", "arrow")) {
                        IconButton(onClick = { change(items.map { if (it.id == sel.id) it.copy(size = (it.size * 0.87f).coerceAtLeast(if (sel.hasText) 6f else 0.5f)) else it }) }) { Icon(Icons.Outlined.Remove, "Smaller") }
                        IconButton(onClick = { change(items.map { if (it.id == sel.id) it.copy(size = (it.size * 1.15f).coerceAtMost(if (sel.hasText) 96f else 24f)) else it }) }) { Icon(Icons.Outlined.Add, "Bigger") }
                    }
                    if (sel.kind == "text") IconButton(onClick = { change(items.map { if (it.id == sel.id) it.copy(bold = !it.bold) else it }) }) { Icon(Icons.Outlined.FormatBold, "Bold") }
                    if (sel.kind !in setOf("image", "redact", "note", "field", "check")) COLORS.forEach { col ->
                        Box(Modifier.padding(3.dp).size(24.dp).clip(CircleShape).background(c(col)).border(1.dp, MaterialTheme.colorScheme.outline, CircleShape).clickable { change(items.map { if (it.id == sel.id) it.copy(color = col) else it }) })
                    }
                    IconButton(onClick = { change(items + sel.moved(12f, 12f).copy(id = nextId++)) }) { Icon(Icons.Outlined.ContentCopy, "Duplicate") }
                    IconButton(onClick = { change(items.filter { it.id != sel.id }); selected = null }) { Icon(Icons.Outlined.Delete, "Delete", tint = MaterialTheme.colorScheme.error) }
                }
            } else if (tool !in setOf("select", "pan", "redact", "image", "sign", "field", "check", "note")) Surface(tonalElevation = 3.dp) {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 10.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    COLORS.forEach { col -> Box(Modifier.padding(3.dp).size(26.dp).clip(CircleShape).background(c(col)).border(if (color == col) 3.dp else 1.dp, if (color == col) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, CircleShape).clickable { color = col }) }
                    Spacer(Modifier.width(10.dp))
                    if (tool in setOf("text", "date")) { Text("Size ${fontSize.toInt()}", style = MaterialTheme.typography.labelMedium); Slider(fontSize, { fontSize = it }, valueRange = 8f..48f, modifier = Modifier.width(150.dp)) }
                    else if (tool == "stamp") STAMPS.forEach { s -> FilterChip(stampText == s, { stampText = s }, label = { Text(s) }, modifier = Modifier.padding(horizontal = 3.dp)) }
                    else if (tool in setOf("ink", "rect", "ellipse", "line", "arrow")) { Text("Width ${"%.1f".format(stroke)}", style = MaterialTheme.typography.labelMedium); Slider(stroke, { stroke = it }, valueRange = 0.5f..12f, modifier = Modifier.width(150.dp)) }
                }
            }
            if (tool == "redact") Text("Drag over what must be removed. When you save, each marked page becomes a picture and the covered text and pictures are deleted from the file for good.",
                Modifier.fillMaxWidth().background(Color(0xFFFEE2E2)).padding(10.dp), style = MaterialTheme.typography.bodySmall, color = Color(0xFF7F1D1D))
            // ---- page and zoom bar ----
            Surface(tonalElevation = 1.dp) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { page--; selected = null }, enabled = page > 0) { Icon(Icons.Outlined.ChevronLeft, "Previous page") }
                    Text("Page ${page + 1} of ${session.pageCount}", style = MaterialTheme.typography.labelLarge)
                    IconButton(onClick = { page++; selected = null }, enabled = page < session.pageCount - 1) { Icon(Icons.Outlined.ChevronRight, "Next page") }
                    Spacer(Modifier.weight(1f))
                    IconButton(onClick = { zoom = (zoom - 0.5f).coerceAtLeast(1f) }, enabled = zoom > 1f) { Icon(Icons.Outlined.ZoomOut, "Zoom out") }
                    Text("${(zoom * 100).toInt()}%", style = MaterialTheme.typography.labelMedium)
                    IconButton(onClick = { zoom = (zoom + 0.5f).coerceAtMost(4f); if (tool != "pan") vm.say("Use Move view to scroll around the page") }, enabled = zoom < 4f) { Icon(Icons.Outlined.ZoomIn, "Zoom in") }
                }
            }
            // ---- tools ----
            Surface(tonalElevation = 4.dp) {
                Row(Modifier.fillMaxWidth().navigationBarsPadding().horizontalScroll(rememberScrollState()).padding(horizontal = 6.dp, vertical = 6.dp)) {
                    ED_TOOLS.forEach { t ->
                        val on = tool == t.id
                        Column(Modifier.clip(RoundedCornerShape(14.dp)).background(if (on) MaterialTheme.colorScheme.primaryContainer else Color.Transparent)
                            .clickable { tool = t.id; selected = null; pending = if (t.id == "sign" || t.id == "image") pending else null
                                when (t.id) { "sign" -> sheet = "sign"; "image" -> pickImage.launch("image/*") } }
                            .padding(horizontal = 12.dp, vertical = 7.dp).widthIn(min = 50.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(t.icon, null, tint = if (on) MaterialTheme.colorScheme.primary else if (t.id == "redact") MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                            Text(t.label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                        }
                    }
                }
            }
        }
    }

    // A newly drawn text field asks for its name.
    LaunchedEffect(items.size) { items.lastOrNull()?.let { if (it.kind == "field" && it.text.isEmpty()) { textKind = "field"; textAt = Offset(it.x1, it.y1) to it } } }

    textAt?.let { (pos, editing) ->
        val naming = textKind == "field" || textKind == "check"
        TextDialog(when { naming -> "Field name"; textKind == "note" -> "Comment"; editing != null -> "Change text"; else -> "Add text" }, if (naming) "Name shown to the person filling it in" else "Text",
            editing?.text ?: "", if (editing != null) "Save" else "Add", { textAt = null; if (naming && editing != null && editing.text.isEmpty()) items = items.map { if (it.id == editing.id) it.copy(text = "Field") else it } }, multiline = !naming) { t ->
            if (editing != null) change(items.map { if (it.id == editing.id) it.copy(text = t.trim()) else it })
            else { val it = EdItem(nextId++, page, textKind, pos.x, pos.y - (if (textKind == "text") fontSize / 2 else 8f), text = t.trim(), color = color, size = fontSize); change(items + it); selected = it.id; tool = "select" }
            textAt = null
        }
    }
    if (sheet == "sign") ModalBottomSheet({ sheet = "" }, sheetState = rememberModalBottomSheetState(true)) {
        Column(Modifier.padding(bottom = 16.dp)) {
            Text("Choose a signature", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
            SignatureList(vm) { s ->
                val b = runCatching { File(s.path).readBytes() }.getOrNull(); val bmp = b?.let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }
                if (b != null && bmp != null) { pending = EdItem(0, 0, "image", 0f, 0f, bmp.width.toFloat(), bmp.height.toFloat(), bytes = b, image = bmp.asImageBitmap(), signature = true); sheet = ""; tool = "sign"; vm.say("Tap the page where you want to sign") }
            }
        }
    }
    if (info) AlertDialog({ info = false }, icon = { Icon(Icons.Outlined.Info, null) }, title = { Text(if (start == "redact") "How redaction works" else "How editing works") },
        text = { Text(if (start == "redact") "Mark the areas to remove. On saving, every marked page is turned into a picture with black boxes burned in, so the text and pictures underneath no longer exist in the new file. Text on those pages can then no longer be selected or searched. Your original stays unchanged."
            else "You add things on top of the page: text, pictures, drawings, highlights, comments, stamps and signatures. The words already printed in the PDF cannot be retyped in place. To replace some, use Cover to hide them and Text to type over them. Note that Cover only hides: use Redact to truly remove content. Saving always makes a new copy.") },
        confirmButton = { TextButton(onClick = { info = false }) { Text("Got it") } })
    if (leave) ConfirmDialog("Leave without saving?", "Your changes on this document will be lost.", "Leave", { leave = false }, { leave = false; nav.back() }, danger = true)
    if (saveJob != null && job != null) AlertDialog({}, title = { Text("Saving") }, text = { Column { Text(job.step.ifEmpty { "Writing the new PDF" }); Spacer(Modifier.height(12.dp)); LinearProgressIndicator(Modifier.fillMaxWidth()) } }, confirmButton = {})
}
