package com.pdfmaster.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.border
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import com.pdfmaster.app.R
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.data.Category
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.JobState
import com.pdfmaster.app.data.StorageInfo
import com.pdfmaster.app.tools.*

val IMPORT_TYPES = arrayOf("application/pdf", "image/*", "text/*", "application/rtf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation")

private val QUICK = listOf("edit" to "Edit PDF", "to_docx" to "PDF to Word", "to_xlsx" to "PDF to Excel", "to_pptx" to "PDF to PowerPoint", "merge" to "Merge PDF",
    "split" to "Split PDF", "compress" to "Compress PDF", "form" to "Fill PDF", "sign" to "Sign PDF", "scan" to "Scan document")

private val QUICK_TINT = mapOf("edit" to Color(0xFF3B82F6), "to_docx" to Color(0xFF2563EB), "to_xlsx" to Color(0xFF16A34A), "to_pptx" to Color(0xFFEA580C), "merge" to Color(0xFF8B5CF6),
    "split" to Color(0xFFA855F7), "compress" to Color(0xFF14B8A6), "form" to Color(0xFF22D3EE), "sign" to Color(0xFFEC4899), "scan" to Color(0xFF38BDF8))
private fun Color.lighten() = Color(red + (1 - red) * 0.35f, green + (1 - green) * 0.35f, blue + (1 - blue) * 0.35f)

private val TOOL_TINTS = mapOf(Groups.EDIT to Brand.Indigo, Groups.ORGANISE to Brand.Royal, Groups.FROM to Color(0xFF0E8FA3), Groups.TO to Color(0xFFEA580C), Groups.SECURE to Color(0xFFDC2626), Groups.SCAN to Brand.Violet)
fun tint(spec: ToolSpec): Color = TOOL_TINTS[spec.group] ?: Brand.Indigo

@Composable
fun HomeScreen(vm: AppViewModel, nav: Nav, seeAll: (String) -> Unit, toTools: () -> Unit, toProfile: () -> Unit = {}) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val jobs by vm.jobs.jobs.collectAsStateWithLifecycle()
    val history by vm.history.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var actions by remember { mutableStateOf<Doc?>(null) }
    var storage by remember { mutableStateOf<StorageInfo?>(null) }
    LaunchedEffect(docs.size) { storage = vm.library.storage() }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) vm.import(uris) { d -> if (d.size == 1 && d[0].isPdf) { vm.opened(d[0]); nav.open(d[0]) } }
    }
    val openDoc: (Doc) -> Unit = { d -> if (d.isPdf) { vm.opened(d); nav.open(d) } else if (!vm.library.openExternally(d)) vm.say("No app on this phone can open ${d.ext.uppercase()} files") }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Column(Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(Color(0xFF0E2A66), MaterialTheme.colorScheme.background))).statusBarsPadding().padding(horizontal = 16.dp, vertical = 14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource(R.drawable.logo_mark), null, Modifier.size(64.dp).clip(RoundedCornerShape(18.dp)))
                    Column(Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(buildAnnotatedString { withStyle(SpanStyle(color = Color.White)) { append("PDF") }; withStyle(SpanStyle(color = Brand.Cyan)) { append("MASTER") } }, fontSize = 30.sp, fontWeight = FontWeight.Black, letterSpacing = (-0.5).sp, maxLines = 1)
                        Text("Every Document. Every Format. One Intelligent Workspace.", color = Color.White.copy(alpha = 0.75f), fontSize = 12.sp, lineHeight = 15.sp)
                    }
                    Box(Modifier.size(44.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.12f)).clickable(onClick = toProfile), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Person, "Profile", tint = Color.White) }
                }
                Spacer(Modifier.height(16.dp))
                Row(Modifier.fillMaxWidth().height(52.dp).clip(RoundedCornerShape(16.dp)).background(Color.White.copy(alpha = 0.08f)).border(1.dp, Color.White.copy(alpha = 0.16f), RoundedCornerShape(16.dp)).padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.Search, null, tint = Color.White.copy(alpha = 0.75f))
                    BasicTextField(query, { query = it }, singleLine = true, textStyle = androidx.compose.ui.text.TextStyle(color = Color.White, fontSize = 16.sp), cursorBrush = SolidColor(Brand.Cyan), modifier = Modifier.weight(1f).padding(horizontal = 10.dp),
                        decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (query.isEmpty()) Text("Search documents...", color = Color.White.copy(alpha = 0.55f), fontSize = 16.sp); inner() } })
                    if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Outlined.Close, "Clear", tint = Color.White) }
                    else IconButton(onClick = { nav.tool("scan") }) { Icon(Icons.Outlined.DocumentScanner, "Scan a document", tint = Color.White) }
                }
                Spacer(Modifier.height(16.dp))
                // Import card: dashed border, tap to choose files.
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Color(0xFF123A8C).copy(alpha = 0.45f)).drawBehind {
                    drawRoundRect(Brand.Royal, style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f))), cornerRadius = androidx.compose.ui.geometry.CornerRadius(22.dp.toPx()))
                }.clickable { picker.launch(IMPORT_TYPES) }.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(84.dp).clip(RoundedCornerShape(22.dp)).background(Color.White.copy(alpha = 0.1f)), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.CloudUpload, null, tint = Brand.Cyan, modifier = Modifier.size(48.dp))
                    }
                    Column(Modifier.padding(start = 16.dp).weight(1f)) {
                        Text(buildAnnotatedString { withStyle(SpanStyle(color = Color.White)) { append("Import Your ") }; withStyle(SpanStyle(color = Brand.Cyan)) { append("PDF") } }, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        Text("Tap to browse your phone. Word, Excel, PowerPoint and pictures too.", color = Color.White.copy(alpha = 0.75f), fontSize = 13.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 2.dp, bottom = 10.dp))
                        Row(Modifier.clip(RoundedCornerShape(50)).background(Brush.horizontalGradient(listOf(Brand.Royal, Color(0xFF3B82F6)))).padding(horizontal = 18.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.FolderOpen, null, tint = Color.White, modifier = Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text("Import PDF", color = Color.White, fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
        if (query.isNotBlank()) {
            val hits = docs.filter { it.name.contains(query.trim(), ignoreCase = true) }
            item { SectionTitle(if (hits.isEmpty()) "No document is called \"${query.trim()}\"" else "${hits.size} found") }
            items(hits, key = { "s" + it.id }) { d -> DocRow(d, { openDoc(d) }, Modifier.padding(horizontal = 8.dp)) { IconButton(onClick = { actions = d }) { Icon(Icons.Outlined.MoreVert, "More") } } }
            return@LazyColumn
        }
        val running = jobs.filter { it.state == JobState.RUNNING }
        if (running.isNotEmpty()) {
            item { SectionTitle("Working now") }
            items(running, key = { "j" + it.id }) { j ->
                SoftCard(Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth()) {
                    Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(j.title, style = MaterialTheme.typography.titleSmall)
                            if (j.step.isNotEmpty()) Text(j.step, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Spacer(Modifier.height(8.dp))
                            if (j.total > 0) LinearProgressIndicator(progress = { j.done.toFloat() / j.total }, modifier = Modifier.fillMaxWidth()) else LinearProgressIndicator(Modifier.fillMaxWidth())
                        }
                        TextButton(onClick = { vm.jobs.cancel(j.id) }) { Text("Stop") }
                    }
                }
            }
        }
        item {
            SectionTitle("Quick Actions", action = "See All  \u2192", onAction = toTools)
            Column(Modifier.padding(horizontal = 12.dp)) {
                QUICK.chunked(5).forEach { row ->
                    Row(Modifier.fillMaxWidth()) {
                        row.forEach { (id, label) ->
                            val spec = tool(id); val col = QUICK_TINT[id] ?: tint(spec)
                            Column(Modifier.weight(1f).padding(3.dp).clip(RoundedCornerShape(16.dp)).background(Brush.verticalGradient(listOf(col.copy(alpha = 0.30f), col.copy(alpha = 0.10f)))).border(1.dp, col.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
                                .clickable { nav.tool(id) }.padding(vertical = 10.dp, horizontal = 2.dp).heightIn(min = 82.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Icon(spec.icon, null, tint = col.lighten(), modifier = Modifier.size(28.dp))
                                Spacer(Modifier.height(6.dp))
                                Text(label.replace("PDF to ", "PDF to\n").replace(" PDF", "\nPDF").replace(" document", "\nDocument"), fontSize = 11.sp, textAlign = TextAlign.Center, maxLines = 2, lineHeight = 13.sp, fontWeight = FontWeight.Medium)
                            }
                        }
                    }
                }
            }
        }
        if (docs.isEmpty()) {
            item {
                EmptyState(Icons.Outlined.Description, "No documents yet", "Import a PDF, a Word, Excel or PowerPoint file, or scan a paper document to begin. Your files stay on this phone.") {
                    GradientButton("Import a file", Icons.Outlined.FileOpen, { picker.launch(IMPORT_TYPES) })
                }
            }
        } else {
            val recent = docs.sortedByDescending { maxOf(it.openedAt, it.addedAt) }.take(6)
            item { SectionTitle("Recent Documents", action = "See All  \u2192") { seeAll("all") } }
            items(recent, key = { "r" + it.id }) { d -> DocRow(d, { openDoc(d) }, Modifier.padding(horizontal = 16.dp, vertical = 3.dp).background(MaterialTheme.colorScheme.surfaceContainer, RoundedCornerShape(16.dp)).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))) { IconButton(onClick = { actions = d }) { Icon(Icons.Outlined.MoreVert, "More") } } }
            val favs = docs.filter { it.favourite }
            if (favs.isNotEmpty()) {
                item { SectionTitle("Favourites", action = "See all") { seeAll("fav") } }
                item { LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(favs.take(12), key = { "f" + it.id }) { d ->
                        Column(Modifier.width(96.dp).clip(RoundedCornerShape(14.dp)).clickable { openDoc(d) }.padding(4.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            DocThumb(d, width = 84.dp, height = 110.dp); Spacer(Modifier.height(6.dp))
                            Text(d.name, style = MaterialTheme.typography.labelSmall, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                        }
                    }
                } }
            }
            val conv = docs.filter { it.category == Category.CONVERTED }.take(4)
            if (conv.isNotEmpty()) {
                item { SectionTitle("Recently converted", action = "See all") { seeAll(Category.CONVERTED) } }
                items(conv, key = { "c" + it.id }) { d -> DocRow(d, { openDoc(d) }, Modifier.padding(horizontal = 8.dp)) { IconButton(onClick = { actions = d }) { Icon(Icons.Outlined.MoreVert, "More") } } }
            }
        }
        if (history.isNotEmpty()) {
            item { SectionTitle("Activity", action = "History") { nav.go("history") } }
            items(history.take(3), key = { "h" + it.id }) { h -> HistoryRow(h) }
        }
        storage?.let { s ->
            item {
                val used = if (s.totalBytes > 0) ((s.totalBytes - s.freeBytes).toFloat() / s.totalBytes).coerceIn(0f, 1f) else 0f
                Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainer).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(20.dp))
                    .clickable { nav.go("settings/storage") }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(64.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(progress = { used }, modifier = Modifier.fillMaxSize(), strokeWidth = 6.dp, color = Brand.Cyan, trackColor = MaterialTheme.colorScheme.outlineVariant)
                        Text("${(used * 100).toInt()}%", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                    Column(Modifier.padding(start = 16.dp).weight(1f)) {
                        Text("Storage Usage", style = MaterialTheme.typography.titleSmall)
                        Text("${human(s.totalBytes - s.freeBytes)} / ${human(s.totalBytes)} on this phone", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("PDFMASTER: ${s.files} file${if (s.files == 1) "" else "s"}, ${human(s.libraryBytes)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Row(Modifier.clip(RoundedCornerShape(50)).border(1.dp, Brand.Royal, RoundedCornerShape(50)).padding(horizontal = 14.dp, vertical = 9.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Outlined.Settings, null, tint = Color.White, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Manage", fontWeight = FontWeight.SemiBold)
                    }
                }
            }
        }
    }
    actions?.let { d -> DocActionsSheet(vm, nav, d) { actions = null } }
}

@Composable
fun HistoryRow(h: com.pdfmaster.app.data.History) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(if (h.ok) Icons.Outlined.CheckCircle else Icons.Outlined.ErrorOutline, null, tint = if (h.ok) Color(0xFF16A34A) else MaterialTheme.colorScheme.error, modifier = Modifier.size(22.dp))
        Column(Modifier.padding(start = 12.dp).weight(1f)) {
            Text(h.title, style = MaterialTheme.typography.titleSmall)
            Text(h.detail, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Text(whenText(h.at), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
fun ToolsScreen(nav: Nav) {
    var query by rememberSaveable { mutableStateOf("") }
    val groups = listOf(Groups.EDIT, Groups.ORGANISE, Groups.FROM, Groups.TO, Groups.SECURE, Groups.SCAN)
    LazyColumn(Modifier.fillMaxSize().statusBarsPadding(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Text("Tools", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(start = 20.dp, top = 16.dp, end = 20.dp))
            OutlinedTextField(query, { query = it }, placeholder = { Text("Find a tool") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true,
                shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp))
        }
        for (g in groups) {
            val list = TOOLS.filter { it.group == g && (query.isBlank() || it.title.contains(query.trim(), true) || it.blurb.contains(query.trim(), true)) }
            if (list.isEmpty()) continue
            item(key = g) { SectionTitle(g) }
            items(list.chunked(2), key = { it[0].id }) { row ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(0.dp)) {
                    row.forEach { spec ->
                        SoftCard(Modifier.weight(1f).padding(4.dp).clip(MaterialTheme.shapes.medium).clickable { nav.tool(spec.id) }) {
                            Column(Modifier.padding(14.dp).heightIn(min = 104.dp)) {
                                IconBadge(spec.icon, tint(spec), 40.dp)
                                Spacer(Modifier.height(10.dp))
                                Text(spec.title, style = MaterialTheme.typography.titleSmall)
                                Text(spec.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis, lineHeight = 15.sp)
                            }
                        }
                    }
                    if (row.size == 1) Spacer(Modifier.weight(1f).padding(4.dp))
                }
            }
        }
    }
}

private val FILTERS = listOf("all" to "All", "recent" to "Recent", "fav" to "Favourites", "downloads" to "Imported", Category.SCANNED to "Scanned",
    Category.CONVERTED to "Converted", Category.SIGNED to "Signed", Category.EDITED to "Edited", "shared" to "Shared")

@Composable
fun DocumentsScreen(vm: AppViewModel, nav: Nav, filter: String, setFilter: (String) -> Unit) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    var query by rememberSaveable { mutableStateOf("") }
    var sort by rememberSaveable { mutableStateOf("date") }
    var sortMenu by remember { mutableStateOf(false) }
    var actions by remember { mutableStateOf<Doc?>(null) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { if (it.isNotEmpty()) vm.import(it) }
    val shown = remember(docs, filter, query, sort) {
        docs.filter { d ->
            when (filter) { "all" -> true; "recent" -> d.openedAt > 0; "fav" -> d.favourite; "downloads" -> d.category == Category.IMPORTED; "shared" -> d.sharedAt > 0; else -> d.category == filter }
        }.filter { query.isBlank() || it.name.contains(query.trim(), true) }.let { l ->
            when (sort) { "name" -> l.sortedBy { it.name.lowercase() }; "size" -> l.sortedByDescending { it.size }; "type" -> l.sortedWith(compareBy({ it.ext }, { it.name.lowercase() }))
                else -> if (filter == "recent") l.sortedByDescending { it.openedAt } else l.sortedByDescending { it.addedAt } }
        }
    }
    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.padding(start = 20.dp, end = 8.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("Documents", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            Box {
                IconButton(onClick = { sortMenu = true }) { Icon(Icons.Outlined.Sort, "Sort") }
                DropdownMenu(sortMenu, { sortMenu = false }) {
                    listOf("date" to "Newest first", "name" to "Name", "size" to "Largest first", "type" to "File type").forEach { (k, l) ->
                        DropdownMenuItem(text = { Text(l) }, onClick = { sort = k; sortMenu = false }, leadingIcon = { if (sort == k) Icon(Icons.Outlined.Check, null) })
                    }
                }
            }
            IconButton(onClick = { picker.launch(IMPORT_TYPES) }) { Icon(Icons.Outlined.Add, "Import") }
        }
        OutlinedTextField(query, { query = it }, placeholder = { Text("Search by file name") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true,
            shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp))
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FILTERS.forEach { (k, l) -> FilterChip(filter == k, { setFilter(k) }, label = { Text(l) }) }
        }
        if (shown.isEmpty()) EmptyState(Icons.Outlined.FolderOpen, if (docs.isEmpty()) "Your library is empty" else "Nothing here",
            if (docs.isEmpty()) "Files you import, scan, convert or sign are kept here, on this phone only." else "No document matches this filter or search.") {
            if (docs.isEmpty()) GradientButton("Import a file", Icons.Outlined.FileOpen, { picker.launch(IMPORT_TYPES) })
        }
        else LazyColumn(contentPadding = PaddingValues(vertical = 8.dp, horizontal = 8.dp)) {
            items(shown, key = { it.id }) { d ->
                DocRow(d, { if (d.isPdf) { vm.opened(d); nav.open(d) } else actions = d }) { IconButton(onClick = { actions = d }) { Icon(Icons.Outlined.MoreVert, "More") } }
            }
        }
    }
    actions?.let { d -> DocActionsSheet(vm, nav, d) { actions = null } }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocActionsSheet(vm: AppViewModel, nav: Nav, doc: Doc, onDismiss: () -> Unit) {
    var rename by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val saver = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument(vm.library.mime(doc.ext))) { uri -> if (uri != null) vm.exportTo(doc, uri); onDismiss() }
    @Composable fun item(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, danger: Boolean = false, onClick: () -> Unit) {
        Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 24.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
            Text(label, Modifier.padding(start = 18.dp), color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
        }
    }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 16.dp)) {
            DocRow(doc, {}, Modifier.padding(horizontal = 12.dp))
            HorizontalDivider(Modifier.padding(vertical = 6.dp))
            if (doc.isPdf) {
                item(Icons.Outlined.Visibility, "Open") { onDismiss(); vm.opened(doc); nav.open(doc) }
                item(Icons.Outlined.Edit, "Edit") { onDismiss(); nav.tool("edit", doc) }
                item(Icons.Outlined.Draw, "Sign") { onDismiss(); nav.tool("sign", doc) }
                item(Icons.Outlined.GridView, "Organise pages") { onDismiss(); nav.tool("organise", doc) }
                item(Icons.Outlined.SwapHoriz, "Convert to Word") { onDismiss(); nav.tool("to_docx", doc) }
                item(Icons.Outlined.Compress, "Compress") { onDismiss(); nav.tool("compress", doc) }
            } else {
                item(Icons.Outlined.OpenInNew, "Open in another app") { onDismiss(); if (!vm.library.openExternally(doc)) vm.say("No app on this phone can open ${doc.ext.uppercase()} files") }
                if (doc.ext in OFFICE_EXTS) item(Icons.Outlined.PictureAsPdf, "Convert to PDF") { onDismiss(); nav.tool("office_pdf", doc) }
                if (doc.ext in IMAGE_EXTS) item(Icons.Outlined.PictureAsPdf, "Make a PDF from this picture") { onDismiss(); nav.tool("img_pdf", doc) }
            }
            item(Icons.Outlined.Share, "Share") { onDismiss(); vm.share(listOf(doc)) }
            item(Icons.Outlined.SaveAlt, "Save to device") { saver.launch(doc.name) }
            item(if (doc.favourite) Icons.Outlined.StarBorder else Icons.Outlined.Star, if (doc.favourite) "Remove from favourites" else "Add to favourites") { vm.favourite(doc); onDismiss() }
            item(Icons.Outlined.DriveFileRenameOutline, "Rename") { rename = true }
            item(Icons.Outlined.ContentCopy, "Make a copy") { vm.duplicate(doc); onDismiss() }
            item(Icons.Outlined.Delete, "Delete", danger = true) { confirmDelete = true }
        }
    }
    if (rename) TextDialog("Rename", "File name", doc.name.substringBeforeLast('.'), "Rename", { rename = false }) { vm.rename(doc, it); rename = false; onDismiss() }
    if (confirmDelete) ConfirmDialog("Delete this file?", "${doc.name} will be removed from PDFMASTER. Files you saved to your device or shared are not affected. This cannot be undone.", "Delete",
        { confirmDelete = false }, { vm.delete(doc); confirmDelete = false; onDismiss() }, danger = true)
}

