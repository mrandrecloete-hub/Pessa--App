package com.pdfmaster.app.ui

import android.graphics.Bitmap
import android.util.LruCache
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChanged
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.data.AndroidRasterizer
import com.pdfmaster.app.data.Bookmark
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.engine.PasswordRequiredException
import com.pdfmaster.app.engine.PdfOps
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Holds an open PDF for display: page sizes, a renderer and a bitmap cache limited by memory.
 * Pages that scroll away are dropped from the cache, so long documents do not exhaust memory.
 */
class PdfSession(val raster: AndroidRasterizer, val sizes: List<Pair<Int, Int>>) {
    private val cache = object : LruCache<String, Bitmap>((Runtime.getRuntime().maxMemory() / 6).toInt().coerceIn(24 shl 20, 160 shl 20)) {
        override fun sizeOf(key: String, value: Bitmap) = value.byteCount
    }
    val pageCount get() = sizes.size
    fun cached(index: Int, side: Int): Bitmap? = cache.get("$index:$side")
    suspend fun page(index: Int, side: Int): Bitmap? = withContext(Dispatchers.IO) {
        cache.get("$index:$side") ?: try { raster.render(index, side).also { cache.put("$index:$side", it) } } catch (e: Throwable) { null }
    }
    fun close() { cache.evictAll(); raster.close() }
}

/** Opens a document for viewing, asking for the password when it is protected. Returns null while loading. */
@Composable
fun rememberPdfSession(vm: AppViewModel, doc: Doc?, onCancel: () -> Unit): Pair<PdfSession?, String?> {
    var session by remember(doc?.id, doc?.size) { mutableStateOf<PdfSession?>(null) }
    var password by remember(doc?.id) { mutableStateOf<String?>(null) }
    var ask by remember(doc?.id) { mutableStateOf(false) }
    var wrong by remember { mutableStateOf(false) }
    var error by remember(doc?.id) { mutableStateOf<String?>(null) }
    LaunchedEffect(doc?.id, doc?.size, password) {
        if (doc == null) return@LaunchedEffect
        try {
            session = withContext(Dispatchers.IO) {
                val f = vm.library.renderable(doc, password)
                val r = AndroidRasterizer(f)
                PdfSession(r, (0 until r.pageCount).map { r.size(it) })
            }
            ask = false
        } catch (e: PasswordRequiredException) { wrong = password != null; ask = true
        } catch (e: IllegalStateException) { if (password != null) { wrong = true; ask = true } else error = e.message
        } catch (e: Exception) { error = "This PDF could not be opened. It may be damaged: try Tools, Repair PDF." }
    }
    DisposableEffect(session) { val s = session; onDispose { s?.close() } }
    if (ask && doc != null) PasswordDialog(doc.name, wrong, onCancel) { password = it }
    error?.let { AlertDialog(onDismissRequest = onCancel, title = { Text("Cannot open") }, text = { Text(it) }, confirmButton = { TextButton(onClick = onCancel) { Text("Close") } }) }
    return session to password
}

private val NIGHT = ColorFilter.colorMatrix(ColorMatrix(floatArrayOf(-1f, 0f, 0f, 0f, 255f, 0f, -1f, 0f, 0f, 255f, 0f, 0f, -1f, 0f, 255f, 0f, 0f, 0f, 1f, 0f)))

@Composable
fun PageImage(session: PdfSession, index: Int, widthPx: Int, modifier: Modifier = Modifier, night: Boolean = false, hi: Boolean = false) {
    val (pw, ph) = session.sizes[index]
    // Render at the size shown; when zoomed in, a sharper copy is made.
    val side = ((widthPx * (if (hi) 2 else 1)).toFloat() * maxOf(pw, ph) / pw).toInt().coerceIn(200, 3600)
    var bmp by remember(session, index) { mutableStateOf(session.cached(index, side)) }
    LaunchedEffect(session, index, side) { session.page(index, side)?.let { bmp = it } }
    Box(modifier.aspectRatio(pw.toFloat() / ph).background(if (night) Color.Black else Color.White)) {
        bmp?.let { Image(it.asImageBitmap(), "Page ${index + 1}", Modifier.fillMaxSize(), contentScale = ContentScale.FillBounds, colorFilter = if (night) NIGHT else null) }
    }
}

/** Pinch to zoom and drag for its content. A double tap switches between fitting the width and 2.5 times. */
@Composable
fun Zoomable(modifier: Modifier = Modifier, onTap: () -> Unit = {}, onScale: (Float) -> Unit = {}, content: @Composable () -> Unit) {
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    var size by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    fun clamp() {
        val mx = size.width * (scale - 1) / 2; val my = size.height * (scale - 1) / 2
        offset = Offset(offset.x.coerceIn(-mx, mx), offset.y.coerceIn(-my, my))
    }
    Box(modifier.clipToBounds().onSizeChanged { size = it }
        .pointerInput(Unit) { detectTapGestures(onTap = { onTap() }, onDoubleTap = { scale = if (scale > 1.05f) 1f else 2.5f; if (scale == 1f) offset = Offset.Zero; onScale(scale) }) }
        .pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown(requireUnconsumed = false)
                do {
                    val e = awaitPointerEvent()
                    val zoom = e.calculateZoom(); val pan = e.calculatePan()
                    if (e.changes.size > 1 || scale > 1.02f) {
                        // Two fingers always zoom; one finger pans only when zoomed in, so normal scrolling still works at 1x.
                        val ns = (scale * zoom).coerceIn(1f, 6f)
                        if (ns != scale) { scale = ns; onScale(ns) }
                        offset += pan; clamp()
                        if (e.changes.size > 1 || scale > 1.02f) e.changes.forEach { if (it.positionChanged()) it.consume() }
                    }
                } while (e.changes.any { it.pressed })
            }
        }) {
        Box(Modifier.graphicsLayer(scaleX = scale, scaleY = scale, translationX = offset.x, translationY = offset.y)) { content() }
    }
}

class Hit(val page: Int, val snippet: AnnotatedString)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ViewerScreen(vm: AppViewModel, nav: Nav, id: String) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val doc = docs.firstOrNull { it.id == id }
    val (session, password) = rememberPdfSession(vm, doc) { nav.back() }
    val bookmarks by remember(id) { vm.dao.bookmarks(id) }.collectAsStateWithLifecycle(emptyList())
    val scope = rememberCoroutineScope()
    val clip = LocalClipboardManager.current
    val widthPx = with(LocalDensity.current) { LocalConfiguration.current.screenWidthDp.dp.roundToPx() }
    val listState = rememberLazyListState()
    var single by rememberSaveable { mutableStateOf(false) }
    var night by rememberSaveable { mutableStateOf(false) }
    var full by rememberSaveable { mutableStateOf(false) }
    var rotation by rememberSaveable { mutableIntStateOf(0) }
    var zoomed by remember { mutableStateOf(false) }
    var sheet by remember { mutableStateOf("") }   // pages, search, text, bookmarks, goto, more
    var menu by remember { mutableStateOf(false) }
    var texts by remember(id) { mutableStateOf<List<String>?>(null) }
    val count = session?.pageCount ?: 0
    val pager = rememberPagerState { count }
    val current = if (single) pager.currentPage else listState.firstVisibleItemIndex
    suspend fun loadTexts(): List<String> = texts ?: withContext(Dispatchers.IO) { runCatching { PdfOps.pageTexts(vm.library.file(doc!!), password) }.getOrDefault(emptyList()) }.also { texts = it }
    fun goTo(p: Int) { scope.launch { val t = p.coerceIn(0, maxOf(0, count - 1)); if (single) pager.scrollToPage(t) else listState.scrollToItem(t) } }
    BackHandler(full) { full = false }

    Scaffold(containerColor = if (night) Color.Black else MaterialTheme.colorScheme.surfaceVariant,
        topBar = { if (!full && doc != null) BackBar(doc.name, { nav.back() }, subtitle = if (count > 0) "Page ${current + 1} of $count" else null) {
            IconButton(onClick = { sheet = "search" }) { Icon(Icons.Outlined.Search, "Search in document") }
            IconButton(onClick = { val b = bookmarks.any { it.page == current }; scope.launch { if (b) vm.dao.deleteBookmark(id, current) else vm.dao.putBookmark(Bookmark(id, current, "Page ${current + 1}")) }; vm.say(if (b) "Bookmark removed" else "Page ${current + 1} bookmarked") }) {
                Icon(if (bookmarks.any { it.page == current }) Icons.Outlined.Bookmark else Icons.Outlined.BookmarkBorder, "Bookmark this page")
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Outlined.MoreVert, "More") }
                DropdownMenu(menu, { menu = false }) {
                    @Composable fun mi(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, on: () -> Unit) = DropdownMenuItem(text = { Text(label) }, leadingIcon = { Icon(icon, null) }, onClick = { menu = false; on() })
                    mi(Icons.Outlined.GridView, "Page thumbnails") { sheet = "pages" }
                    mi(Icons.Outlined.Bookmarks, "Bookmarks") { sheet = "bookmarks" }
                    mi(Icons.Outlined.Numbers, "Go to page") { sheet = "goto" }
                    mi(Icons.Outlined.TextFields, "Select and copy text") { sheet = "text" }
                    mi(if (single) Icons.Outlined.ViewDay else Icons.Outlined.ViewCarousel, if (single) "Continuous scrolling" else "One page at a time") { val p = current; single = !single; goTo(p) }
                    mi(Icons.Outlined.RotateRight, "Rotate view") { rotation = (rotation + 90) % 360 }
                    mi(if (night) Icons.Outlined.LightMode else Icons.Outlined.DarkMode, if (night) "Normal colours" else "Dark reading mode") { night = !night }
                    mi(Icons.Outlined.Fullscreen, "Full screen") { full = true; vm.say("Tap the page to show the controls again") }
                    mi(Icons.Outlined.Share, "Share") { vm.share(listOf(doc)) }
                }
            }
        } },
        bottomBar = { if (!full && doc != null && session != null) Surface(tonalElevation = 2.dp) {
            Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 6.dp, vertical = 4.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                @Composable fun act(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, on: () -> Unit) =
                    Column(Modifier.clip(RoundedCornerShape(12.dp)).clickable(onClick = on).padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary); Text(label, style = MaterialTheme.typography.labelSmall) }
                act(Icons.Outlined.Edit, "Edit") { nav.tool("edit", doc) }
                act(Icons.Outlined.Draw, "Sign") { nav.tool("sign", doc) }
                act(Icons.Outlined.Assignment, "Fill") { nav.tool("form", doc) }
                act(Icons.Outlined.GridView, "Pages") { nav.tool("organise", doc) }
                act(Icons.Outlined.SwapHoriz, "Convert") { sheet = "convert" }
            }
        } }) { pad ->
        Box(Modifier.fillMaxSize().padding(if (full) PaddingValues(0.dp) else pad)) {
            if (session == null) CircularProgressIndicator(Modifier.align(Alignment.Center))
            else Zoomable(Modifier.fillMaxSize(), onTap = { if (full) full = false }, onScale = { zoomed = it > 1.3f }) {
                if (single) HorizontalPager(pager, Modifier.fillMaxSize(), userScrollEnabled = !zoomed) { i ->
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { PageImage(session, i, widthPx, Modifier.fillMaxWidth().rotate(rotation.toFloat()), night, zoomed) }
                } else LazyColumn(Modifier.fillMaxSize(), state = listState, userScrollEnabled = !zoomed, verticalArrangement = Arrangement.spacedBy(8.dp), contentPadding = PaddingValues(vertical = 8.dp)) {
                    items(count, key = { it }) { i -> PageImage(session, i, widthPx, Modifier.fillMaxWidth().rotate(rotation.toFloat()), night, zoomed) }
                }
            }
            if (count > 0 && !full) Text("${current + 1} / $count", Modifier.align(Alignment.BottomEnd).padding(12.dp).clip(RoundedCornerShape(50)).background(Color.Black.copy(alpha = 0.6f)).clickable { sheet = "goto" }.padding(horizontal = 12.dp, vertical = 5.dp),
                color = Color.White, style = MaterialTheme.typography.labelMedium)
        }
    }

    if (doc == null || session == null) return
    when (sheet) {
        "pages" -> ModalBottomSheet({ sheet = "" }, sheetState = rememberModalBottomSheetState(true)) {
            LazyVerticalGrid(GridCells.Adaptive(96.dp), contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items((0 until count).toList()) { i ->
                    Column(Modifier.clickable { goTo(i); sheet = "" }, horizontalAlignment = Alignment.CenterHorizontally) {
                        PageImage(session, i, 220, Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).border(if (i == current) 2.dp else 1.dp, if (i == current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp)))
                        Text("${i + 1}", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 2.dp))
                    }
                }
            }
        }
        "bookmarks" -> ModalBottomSheet({ sheet = "" }) {
            Column(Modifier.padding(bottom = 24.dp)) {
                Text("Bookmarks", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
                if (bookmarks.isEmpty()) Text("No bookmarks yet. Use the bookmark button at the top to mark a page.", Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                bookmarks.forEach { b ->
                    Row(Modifier.fillMaxWidth().clickable { goTo(b.page); sheet = "" }.padding(horizontal = 24.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Bookmark, null, tint = MaterialTheme.colorScheme.primary); Text(b.label, Modifier.weight(1f).padding(start = 14.dp))
                        IconButton(onClick = { scope.launch { vm.dao.deleteBookmark(id, b.page) } }) { Icon(Icons.Outlined.Close, "Remove") }
                    }
                }
            }
        }
        "goto" -> { var v by remember { mutableStateOf("") }
            AlertDialog({ sheet = "" }, title = { Text("Go to page") }, text = { OutlinedTextField(v, { v = it.filter(Char::isDigit).take(6) }, label = { Text("1 to $count") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)) },
                confirmButton = { TextButton(onClick = { v.toIntOrNull()?.let { goTo(it - 1) }; sheet = "" }, enabled = v.toIntOrNull() in 1..count) { Text("Go") } }, dismissButton = { TextButton(onClick = { sheet = "" }) { Text("Cancel") } }) }
        "search" -> ModalBottomSheet({ sheet = "" }, sheetState = rememberModalBottomSheetState(true)) {
            var q by rememberSaveable { mutableStateOf("") }
            var hits by remember { mutableStateOf<List<Hit>?>(null) }
            var busy by remember { mutableStateOf(false) }
            val hl = MaterialTheme.colorScheme.primary
            fun run() { if (q.isBlank()) return; busy = true; scope.launch {
                val t = loadTexts(); val needle = q.trim()
                hits = withContext(Dispatchers.Default) { t.flatMapIndexed { p, s ->
                    val flat = s.replace(Regex("\\s+"), " ")
                    Regex(Regex.escape(needle), RegexOption.IGNORE_CASE).findAll(flat).take(20).map { m ->
                        val a = maxOf(0, m.range.first - 40); val b = minOf(flat.length, m.range.last + 60)
                        Hit(p, buildAnnotatedString { append(if (a > 0) "…" else ""); append(flat.substring(a, m.range.first)); withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = hl)) { append(m.value) }; append(flat.substring(m.range.last + 1, b)); if (b < flat.length) append("…") })
                    }.toList()
                } }
                busy = false
            } }
            Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp)) {
                OutlinedTextField(q, { q = it }, label = { Text("Search in this document") }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { run() }), trailingIcon = { IconButton(onClick = { run() }) { Icon(Icons.Outlined.Search, "Search") } })
                if (busy) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top = 8.dp))
                hits?.let { h ->
                    Text(when { h.isEmpty() && texts?.all { it.isBlank() } == true -> "This PDF has no text layer. It is probably a scan: use Tools, Make searchable (OCR)."; h.isEmpty() -> "Not found"; else -> "${h.size} result${if (h.size == 1) "" else "s"}" },
                        Modifier.padding(vertical = 8.dp), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    LazyColumn(Modifier.heightIn(max = 420.dp)) {
                        items(h) { hit -> Column(Modifier.fillMaxWidth().clickable { goTo(hit.page); sheet = "" }.padding(vertical = 8.dp)) {
                            Text("Page ${hit.page + 1}", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary); Text(hit.snippet, style = MaterialTheme.typography.bodySmall) } }
                    }
                }
            }
        }
        "text" -> ModalBottomSheet({ sheet = "" }, sheetState = rememberModalBottomSheetState(true)) {
            var t by remember { mutableStateOf<String?>(null) }
            LaunchedEffect(current) { t = loadTexts().getOrNull(current)?.trim().orEmpty() }
            Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 20.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Text of page ${current + 1}", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    TextButton(onClick = { clip.setText(AnnotatedString(t.orEmpty())); vm.say("Page text copied") }, enabled = !t.isNullOrEmpty()) { Text("Copy all") }
                }
                Text("Press and hold on the words to select part of the text.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                when { t == null -> LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 16.dp))
                    t!!.isEmpty() -> Text("This page has no text layer. If it is a scan, use Tools, Make searchable (OCR).", Modifier.padding(vertical = 16.dp))
                    else -> SelectionContainer { Text(t!!, Modifier.padding(top = 10.dp).heightIn(max = 460.dp).verticalScroll(rememberScrollState()), style = MaterialTheme.typography.bodyMedium) } }
            }
        }
        "convert" -> ModalBottomSheet({ sheet = "" }) {
            Column(Modifier.padding(bottom = 24.dp)) {
                Text("Convert this PDF", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
                listOf("to_docx", "to_xlsx", "to_pptx", "to_img", "to_txt", "compress", "protect", "ocr").forEach { tid ->
                    val spec = com.pdfmaster.app.tools.tool(tid)
                    Row(Modifier.fillMaxWidth().clickable { sheet = ""; nav.tool(tid, doc) }.padding(horizontal = 24.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(spec.icon, tint(spec), 36.dp); Text(spec.title, Modifier.padding(start = 14.dp))
                    }
                }
            }
        }
    }
}

