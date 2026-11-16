package com.pdfmaster.desktop

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.toComposeImageBitmap
import androidx.compose.ui.input.pointer.PointerEventType
import androidx.compose.ui.input.pointer.isCtrlPressed
import androidx.compose.ui.input.pointer.onPointerEvent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.pdfmaster.app.engine.PasswordRequiredException
import com.pdfmaster.app.engine.PdfOps
import com.pdfmaster.app.engine.openPdf
import com.pdfmaster.app.engine.viewSize
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.rendering.PDFRenderer
import java.io.File

/** An open PDF for display: page sizes, a renderer, and a small cache so scrolling stays smooth. */
class PdfSession(val file: File, password: String?) : AutoCloseable {
    val doc: PDDocument = openPdf(file, password)
    private val renderer = PDFRenderer(doc)
    val count = doc.numberOfPages
    val sizes: List<Pair<Float, Float>> = (0 until count).map { viewSize(doc.getPage(it)) }
    private val lock = Any()
    private val cache = object : LinkedHashMap<String, ImageBitmap>(32, 0.75f, true) { override fun removeEldestEntry(e: MutableMap.MutableEntry<String, ImageBitmap>) = size > 20 }
    fun page(i: Int, scale: Float): ImageBitmap { val key = "$i:${(scale * 100).toInt()}"
        synchronized(cache) { cache[key] }?.let { return it }
        val img = synchronized(lock) { renderer.renderImage(i, scale) }.toComposeImageBitmap(); synchronized(cache) { cache[key] = img }; return img }
    /** A page as a picture for the restoration engine, longest side about [maxSide] pixels. */
    fun bitmap(i: Int, maxSide: Int): android.graphics.Bitmap { val (w, h) = sizes[i]; return android.graphics.Bitmap.wrap(synchronized(lock) { renderer.renderImage(i, maxSide / maxOf(w, h)) }) }
    override fun close() { doc.close() }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun ViewerScreen(model: AppModel, file: File) {
    var password by remember(file) { mutableStateOf<String?>(null) }
    var askPw by remember(file) { mutableStateOf(false) }
    var wrong by remember { mutableStateOf(false) }
    var error by remember(file) { mutableStateOf<String?>(null) }
    var session by remember(file) { mutableStateOf<PdfSession?>(null) }
    var zoom by remember { mutableFloatStateOf(1f) }
    var query by remember { mutableStateOf("") }
    var hits by remember { mutableStateOf<List<Pair<Int, AnnotatedString>>?>(null) }
    var texts by remember(file) { mutableStateOf<List<String>?>(null) }
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    LaunchedEffect(file, password) {
        try { session = withContext(Dispatchers.IO) { PdfSession(file, password) }; askPw = false }
        catch (e: PasswordRequiredException) { wrong = password != null; askPw = true } catch (e: Throwable) { error = "This PDF could not be opened. It may be damaged: try Tools, Repair PDF. (${e.message})" }
    }
    DisposableEffect(session) { val s = session; onDispose { s?.close() } }
    fun search() { val s = session ?: return; if (query.isBlank()) return
        scope.launch { val t = texts ?: withContext(Dispatchers.IO) { PdfOps.pageTexts(file, password) }.also { texts = it }
            val needle = query.trim(); hits = withContext(Dispatchers.Default) { t.flatMapIndexed { p, txt -> val flat = txt.replace(Regex("\\s+"), " ")
                Regex(Regex.escape(needle), RegexOption.IGNORE_CASE).findAll(flat).take(15).map { m -> val a = maxOf(0, m.range.first - 40); val b = minOf(flat.length, m.range.last + 60)
                    p to buildAnnotatedString { append(flat.substring(a, m.range.first)); withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = Brand.Cyan)) { append(m.value) }; append(flat.substring(m.range.last + 1, b)) } }.toList() } } } }

    Column(Modifier.fillMaxSize()) {
        Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 2.dp) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton({ model.screen = Screen.Home }) { Icon(Icons.Outlined.ArrowBack, "Back") }
                Column(Modifier.weight(1f)) { Text(file.name, fontWeight = FontWeight.SemiBold, maxLines = 1); Text(session?.let { "Page ${list.firstVisibleItemIndex + 1} of ${it.count}" } ?: "", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                OutlinedTextField(query, { query = it }, Modifier.width(240.dp).height(52.dp), singleLine = true, placeholder = { Text("Search in document") }, trailingIcon = { IconButton({ search() }) { Icon(Icons.Outlined.Search, "Search") } })
                IconButton({ zoom = (zoom - 0.15f).coerceAtLeast(0.4f) }) { Icon(Icons.Outlined.ZoomOut, "Zoom out") }
                Text("${(zoom * 100).toInt()}%", Modifier.width(64.dp), maxLines = 1)
                IconButton({ zoom = (zoom + 0.15f).coerceAtMost(4f) }) { Icon(Icons.Outlined.ZoomIn, "Zoom in") }
                TextButton({ model.screen = Screen.Restore(file) }) { Icon(Icons.Outlined.PhotoFilter, null); Text("  Restore") }
                TextButton({ model.screen = Screen.Tool("compress", listOf(file)) }) { Text("Compress") }
                TextButton({ model.screen = Screen.Tool("to_docx", listOf(file)) }) { Text("To Word") }
            }
        }
        Row(Modifier.weight(1f).fillMaxWidth()) {
            Box(Modifier.weight(1f).fillMaxHeight().background(MaterialTheme.colorScheme.surfaceVariant).onPointerEvent(PointerEventType.Scroll) { e -> if (e.keyboardModifiers.isCtrlPressed) { val d = e.changes.first().scrollDelta.y; zoom = (zoom * (if (d < 0) 1.1f else 0.9f)).coerceIn(0.4f, 4f); e.changes.forEach { it.consume() } } }, contentAlignment = Alignment.TopCenter) {
                val s = session
                when {
                    error != null -> Text(error!!, Modifier.padding(30.dp), color = MaterialTheme.colorScheme.error)
                    s == null -> CircularProgressIndicator(Modifier.padding(60.dp))
                    else -> BoxWithConstraints(Modifier.fillMaxSize()) {
                        val density = LocalDensity.current.density
                        val pageW = s.sizes.maxOf { it.first } * 1.333f * zoom
                        val contentW = maxOf(maxWidth.value, pageW + 40f).dp
                        Box(Modifier.fillMaxSize().horizontalScroll(rememberScrollState())) {
                            LazyColumn(Modifier.width(contentW).fillMaxHeight(), state = list, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = PaddingValues(vertical = 16.dp)) {
                                items(s.count) { i ->
                                    val (w, h) = s.sizes[i]
                                    val scale = (1.333f * zoom * density).coerceIn(0.5f, 6f)
                                    val img by produceState<ImageBitmap?>(null, s, i, scale) { value = withContext(Dispatchers.IO) { runCatching { s.page(i, scale) }.getOrNull() } }
                                    Box(Modifier.size((w * 1.333f * zoom).dp, (h * 1.333f * zoom).dp).background(Color.White)) { img?.let { Image(it, "Page ${i + 1}", Modifier.fillMaxSize()) } }
                                }
                            }
                        }
                    }
                }
            }
            hits?.let { h -> Surface(Modifier.width(320.dp).fillMaxHeight(), color = MaterialTheme.colorScheme.surface) {
                Column { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Text(if (h.isEmpty()) "Not found (a scanned PDF has no text to search)" else "${h.size} result${if (h.size == 1) "" else "s"}", Modifier.weight(1f), fontWeight = FontWeight.SemiBold); IconButton({ hits = null }) { Icon(Icons.Outlined.Close, "Close") } }
                    LazyColumn { items(h) { (p, t) -> Column(Modifier.fillMaxWidth().clickable { scope.launch { list.animateScrollToItem(p) } }.padding(12.dp)) { Text("Page ${p + 1}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary); Text(t, style = MaterialTheme.typography.bodySmall) } } } } } }
        }
    }
    if (askPw) { var pw by remember { mutableStateOf("") }
        AlertDialog({ model.screen = Screen.Home }, icon = { Icon(Icons.Outlined.Lock, null) }, title = { Text("Password needed") }, text = { Column { Text(if (wrong) "That password did not open ${file.name}. Try again." else "${file.name} is protected. Type its password."); Spacer(Modifier.height(10.dp))
            OutlinedTextField(pw, { pw = it }, singleLine = true, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), isError = wrong) } },
            confirmButton = { TextButton({ password = pw }, enabled = pw.isNotEmpty()) { Text("Open") } }, dismissButton = { TextButton({ model.screen = Screen.Home }) { Text("Cancel") } }) }
}
