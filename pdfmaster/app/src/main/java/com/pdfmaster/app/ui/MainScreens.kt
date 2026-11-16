package com.pdfmaster.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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

private val TOOL_TINTS = mapOf(Groups.EDIT to Brand.Indigo, Groups.ORGANISE to Brand.Royal, Groups.FROM to Color(0xFF0E8FA3), Groups.TO to Color(0xFFEA580C), Groups.SECURE to Color(0xFFDC2626), Groups.SCAN to Brand.Violet)
fun tint(spec: ToolSpec): Color = TOOL_TINTS[spec.group] ?: Brand.Indigo

@Composable
fun HomeScreen(vm: AppViewModel, nav: Nav, seeAll: (String) -> Unit, toTools: () -> Unit) {
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
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(bottomStart = 28.dp, bottomEnd = 28.dp)).background(Brand.Hero).statusBarsPadding().padding(20.dp)) {
                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)).background(Color.White), contentAlignment = Alignment.Center) {
                            Text("M", color = Brand.Indigo, fontWeight = FontWeight.Black, fontSize = 22.sp)
                        }
                        Spacer(Modifier.width(10.dp))
                        Text("PDFMASTER", color = Color.White, fontWeight = FontWeight.Black, fontSize = 20.sp, letterSpacing = 1.5.sp)
                    }
                    Spacer(Modifier.height(18.dp))
                    Text(if (settings.userName.isBlank()) "Welcome" else "Welcome, ${settings.userName}", color = Color.White, style = MaterialTheme.typography.headlineMedium)
                    Text("Edit, convert, sign and organise your documents", color = Color.White.copy(alpha = 0.82f), style = MaterialTheme.typography.bodyMedium)
                    Spacer(Modifier.height(16.dp))
                    TextField(query, { query = it }, placeholder = { Text("Search documents") }, leadingIcon = { Icon(Icons.Outlined.Search, null) }, singleLine = true,
                        trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Outlined.Close, "Clear") } },
                        shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth(),
                        colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent,
                            focusedContainerColor = MaterialTheme.colorScheme.surface, unfocusedContainerColor = MaterialTheme.colorScheme.surface))
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(Modifier.weight(1f).clip(RoundedCornerShape(18.dp)).background(Color.White).clickable { picker.launch(IMPORT_TYPES) }.heightIn(min = 52.dp).padding(horizontal = 16.dp),
                            verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                            Icon(Icons.Outlined.FileOpen, null, tint = Brand.Indigo); Spacer(Modifier.width(8.dp))
                            Text("Import PDF", color = Brand.Indigo, style = MaterialTheme.typography.titleSmall)
                        }
                        Row(Modifier.clip(RoundedCornerShape(18.dp)).background(Color.White.copy(alpha = 0.18f)).clickable { nav.tool("scan") }.heightIn(min = 52.dp).padding(horizontal = 18.dp),
                            verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.DocumentScanner, null, tint = Color.White); Spacer(Modifier.width(8.dp)); Text("Scan", color = Color.White, style = MaterialTheme.typography.titleSmall)
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
            SectionTitle("Quick actions", action = "All tools", onAction = toTools)
            Column(Modifier.padding(horizontal = 12.dp)) {
                QUICK.chunked(5).forEach { row ->
                    Row(Modifier.fillMaxWidth()) {
                        row.forEach { (id, label) ->
                            val spec = tool(id)
                            Column(Modifier.weight(1f).clip(RoundedCornerShape(16.dp)).clickable { nav.tool(id) }.padding(vertical = 10.dp, horizontal = 2.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                                IconBadge(spec.icon, tint(spec), 50.dp)
                                Spacer(Modifier.height(6.dp))
                                Text(label, style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center, maxLines = 2, lineHeight = 13.sp)
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
            item { SectionTitle("Recent documents", action = "See all") { seeAll("all") } }
            items(recent, key = { "r" + it.id }) { d -> DocRow(d, { openDoc(d) }, Modifier.padding(horizontal = 8.dp)) { IconButton(onClick = { actions = d }) { Icon(Icons.Outlined.MoreVert, "More") } } }
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
                SectionTitle("Storage")
                SoftCard(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clickable { nav.go("settings/storage") }) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(Icons.Outlined.Storage, Brand.Royal)
                        Column(Modifier.padding(start = 14.dp).weight(1f)) {
                            Text("${s.files} file${if (s.files == 1) "" else "s"} using ${human(s.libraryBytes)}", style = MaterialTheme.typography.titleSmall)
                            Text("${human(s.freeBytes)} free on this phone  ·  ${human(s.tempBytes)} temporary", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
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

