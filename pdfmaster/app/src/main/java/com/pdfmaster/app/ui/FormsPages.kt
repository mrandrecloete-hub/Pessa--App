package com.pdfmaster.app.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.data.Category
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.FormTemplate
import com.pdfmaster.app.engine.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Fills the interactive fields of a PDF form: text, check boxes, choices and option buttons. */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun FormScreen(vm: AppViewModel, nav: Nav, id: String) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val doc = remember(docs.isNotEmpty()) { docs.firstOrNull { it.id == id } }
    val templates by vm.templates.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf<String?>(null) }
    var askPw by remember { mutableStateOf(false) }; var wrongPw by remember { mutableStateOf(false) }
    var fields by remember { mutableStateOf<List<FormField>?>(null) }
    val values = remember { mutableStateMapOf<String, String>() }
    var flatten by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var missing by remember { mutableStateOf<List<FormField>>(emptyList()) }
    var dialog by remember { mutableStateOf("") }
    var changed by remember { mutableStateOf(false) }
    var leave by remember { mutableStateOf(false) }
    BackHandler(changed && !busy) { leave = true }

    LaunchedEffect(doc?.id, password) {
        if (doc == null) return@LaunchedEffect
        try {
            val f = withContext(Dispatchers.IO) { PdfForms.read(vm.library.file(doc), password) }
            fields = f; values.clear(); f.forEach { values[it.name] = it.value }; askPw = false
        } catch (e: PasswordRequiredException) { wrongPw = password != null; askPw = true
        } catch (e: Exception) { vm.say("The form could not be read: ${e.message ?: "unknown problem"}"); fields = emptyList() }
    }
    fun save(reset: Boolean = false) {
        val d = doc ?: return; val list = fields ?: return
        if (!reset) { val m = PdfForms.missingRequired(list, values); if (m.isNotEmpty()) { missing = m; return } }
        busy = true
        scope.launch {
            try {
                val (out, problems) = withContext(Dispatchers.IO) {
                    val work = vm.library.workDir(); val f = File(work, "form.pdf")
                    try {
                        val p = if (reset) { PdfForms.reset(vm.library.file(d), f, password); emptyList() }
                        else PdfForms.fill(vm.library.file(d), list.filter { !it.readOnly }.associate { it.name to (values[it.name] ?: "") }, f, flatten, password)
                        // Verify by reading the saved file back.
                        if (!reset && !flatten) { val back = PdfForms.read(f).associate { it.name to it.value }
                            val lost = list.filter { !it.readOnly && it.kind != FieldKind.SIGNATURE && it.kind != FieldKind.OTHER && (values[it.name] ?: "") != (back[it.name] ?: "") && it.name !in p.map { s -> s.substringBefore(':') } }
                            check(lost.isEmpty()) { "These answers could not be stored: ${lost.joinToString { it.label }}" } }
                        vm.library.adopt(f, "${d.name.substringBeforeLast('.')} (${if (reset) "blank" else if (flatten) "filled, final" else "filled"}).pdf", Category.EDITED) to p
                    } finally { work.deleteRecursively() }
                }
                vm.record("form", "Fill form", out)
                vm.say(if (problems.isEmpty()) "Saved as ${out.name}" else "Saved, but ${problems.size} field(s) had problems: ${problems.first()}")
                changed = false; nav.c.popBackStack(); vm.opened(out); nav.open(out)
            } catch (e: Exception) { vm.say(e.message ?: "The form could not be saved. Your original is unchanged.") } finally { busy = false }
        }
    }

    Scaffold(topBar = { BackBar("Fill form", { if (changed) leave = true else nav.back() }, subtitle = doc?.name) {
        if (!fields.isNullOrEmpty()) { IconButton(onClick = { dialog = "templates" }) { Icon(Icons.Outlined.Bookmarks, "Saved answers") }
            IconButton(onClick = { dialog = "reset" }) { Icon(Icons.Outlined.RestartAlt, "Clear all answers") } }
    } }, bottomBar = { if (!fields.isNullOrEmpty()) Surface(tonalElevation = 3.dp) {
        Column(Modifier.navigationBarsPadding().padding(horizontal = 16.dp, vertical = 8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text("Make final (flatten)", style = MaterialTheme.typography.titleSmall)
                Text("Answers become part of the page and cannot be changed later", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Switch(flatten, { flatten = it }) }
            GradientButton(if (busy) "Saving" else "Save filled form", Icons.Outlined.Save, { save() }, Modifier.fillMaxWidth().padding(top = 6.dp), enabled = !busy)
        }
    } }) { pad ->
        val list = fields
        when {
            list == null -> Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            list.isEmpty() -> EmptyState(Icons.Outlined.Assignment, "No fillable fields in this PDF", "This is a plain (static) document. You can type on top of it with the editor, placing text, ticks, dates and your signature anywhere. You can also add real form fields to it.", Modifier.padding(pad)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    GradientButton("Type on the page", Icons.Outlined.Edit, { doc?.let { nav.c.popBackStack(); nav.tool("edit", it) } })
                    Text("In the editor, the Text field and Check box tools add real fields.", Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            else -> LazyColumn(Modifier.padding(pad), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text("${list.size} field${if (list.size == 1) "" else "s"}. Fields marked * must be filled.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                items(list, key = { it.name }) { f ->
                    val label = f.label + (if (f.required) " *" else "") + (f.page?.let { "  (page ${it + 1})" } ?: "")
                    val v = values[f.name].orEmpty()
                    val set = { nv: String -> values[f.name] = nv; changed = true; missing = missing.filter { it.name != f.name } }
                    val bad = missing.any { it.name == f.name }
                    when (f.kind) {
                        FieldKind.TEXT, FieldKind.MULTILINE -> {
                            val low = f.label.lowercase()
                            val type = when { "mail" in low -> KeyboardType.Email; "phone" in low || "tel" in low || "cell" in low -> KeyboardType.Phone; "amount" in low || "number" in low || "qty" in low -> KeyboardType.Number; else -> KeyboardType.Text }
                            OutlinedTextField(v, { nv -> set(if (f.maxLength != null) nv.take(f.maxLength) else nv) }, label = { Text(label) }, enabled = !f.readOnly, isError = bad, singleLine = f.kind == FieldKind.TEXT, minLines = if (f.kind == FieldKind.MULTILINE) 3 else 1,
                                keyboardOptions = KeyboardOptions(keyboardType = type, imeAction = if (f.kind == FieldKind.TEXT) ImeAction.Next else ImeAction.Default, capitalization = if (type == KeyboardType.Text) KeyboardCapitalization.Sentences else KeyboardCapitalization.None),
                                trailingIcon = if ("date" in low) ({ IconButton(onClick = { set(SimpleDateFormat("d MMMM yyyy", Locale.getDefault()).format(Date())) }) { Icon(Icons.Outlined.CalendarToday, "Today") } }) else null,
                                supportingText = if (f.maxLength != null) ({ Text("${v.length} / ${f.maxLength}") }) else null, modifier = Modifier.fillMaxWidth())
                        }
                        FieldKind.CHECKBOX -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(enabled = !f.readOnly) { set(if (v == "true") "false" else "true") }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                            Checkbox(v == "true", { set(it.toString()) }, enabled = !f.readOnly); Text(label, color = if (bad) MaterialTheme.colorScheme.error else Color.Unspecified) }
                        FieldKind.RADIO, FieldKind.CHOICE -> Column {
                            Text(label, style = MaterialTheme.typography.labelLarge, color = if (bad) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { f.options.forEach { o -> FilterChip(v == o, { set(if (v == o && f.kind == FieldKind.RADIO) "" else o) }, label = { Text(o) }, enabled = !f.readOnly) } }
                        }
                        FieldKind.SIGNATURE -> Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Draw, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("$label: a signature box. Save the form, then use Sign to place your signature on it.", Modifier.padding(start = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        FieldKind.OTHER -> Text("$label: this kind of field cannot be filled here.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                item { Spacer(Modifier.height(8.dp)) }
            }
        }
    }
    if (missing.isNotEmpty()) AlertDialog({ missing = emptyList() }, title = { Text("Some required fields are empty") }, text = { Text(missing.joinToString("\n") { "• ${it.label}" }) }, confirmButton = { TextButton(onClick = { missing = emptyList() }) { Text("Fill them in") } })
    if (askPw && doc != null) PasswordDialog(doc.name, wrongPw, { nav.back() }) { password = it }
    if (leave) ConfirmDialog("Leave without saving?", "Your answers will be lost.", "Leave", { leave = false }, { leave = false; nav.back() }, danger = true)
    when (dialog) {
        "reset" -> ConfirmDialog("Clear all answers?", "Every field on this screen is emptied. Nothing is saved until you press Save.", "Clear", { dialog = "" }, { fields?.forEach { if (!it.readOnly) values[it.name] = if (it.kind == FieldKind.CHECKBOX) "false" else "" }; changed = true; dialog = "" })
        "templates" -> AlertDialog({ dialog = "" }, title = { Text("Saved answers") }, confirmButton = { TextButton(onClick = { dialog = "name" }) { Text("Save current answers") } }, dismissButton = { TextButton(onClick = { dialog = "" }) { Text("Close") } }, text = {
            Column { Text("Reuse answers such as your name and address on other forms. Fields are matched by name.", style = MaterialTheme.typography.bodySmall)
                if (templates.isEmpty()) Text("Nothing saved yet.", Modifier.padding(top = 12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                templates.forEach { t: FormTemplate -> Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { val o = JSONObject(t.values); var n = 0; val byLabel = fields.orEmpty().associateBy { it.label.lowercase() }
                        o.keys().forEach { k -> val f = fields.orEmpty().firstOrNull { it.name == k } ?: byLabel[k.substringAfterLast('.').lowercase()]; if (f != null && !f.readOnly) { values[f.name] = o.getString(k); n++ } }
                        changed = n > 0; dialog = ""; vm.say(if (n == 0) "No field of this form matches those answers" else "$n field(s) filled") }, modifier = Modifier.weight(1f)) { Text(t.name) }
                    IconButton(onClick = { scope.launch { vm.dao.deleteTemplate(t.id) } }) { Icon(Icons.Outlined.Delete, "Delete") } } } }
        })
        "name" -> TextDialog("Save answers as", "Name, for example My details", "", "Save", { dialog = "" }) { n ->
            val o = JSONObject(); values.forEach { (k, v) -> if (v.isNotBlank() && v != "false") o.put(k, v) }
            scope.launch { vm.dao.addTemplate(FormTemplate(name = n.trim(), values = o.toString())) }; dialog = ""; vm.say("Answers saved on this phone") }
    }
}

private data class PageRef(val key: Int, val src: Int, val rot: Int = 0)

/** Visual page organiser: drag to reorder, rotate, duplicate and delete pages, then save a new PDF. */
@Composable
fun PagesScreen(vm: AppViewModel, nav: Nav, id: String) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val doc = remember(docs.isNotEmpty()) { docs.firstOrNull { it.id == id } }
    val (session, password) = rememberPdfSession(vm, doc) { nav.back() }
    val scope = rememberCoroutineScope()
    val pages = remember { mutableStateListOf<PageRef>() }
    var nextKey by remember { mutableIntStateOf(0) }
    val selected = remember { mutableStateListOf<Int>() }
    var changed by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var leave by remember { mutableStateOf(false) }
    var dragKey by remember { mutableStateOf<Int?>(null) }
    val grid = rememberLazyGridState()
    LaunchedEffect(session) { if (session != null && pages.isEmpty()) { repeat(session.pageCount) { pages.add(PageRef(it, it)) }; nextKey = session.pageCount } }
    BackHandler(changed && !busy) { leave = true }
    fun sel() = pages.filter { it.key in selected }
    fun save() {
        val d = doc ?: return; busy = true; val order = pages.toList()
        scope.launch {
            try {
                val out = withContext(Dispatchers.IO) {
                    val work = vm.library.workDir()
                    try {
                        var f = File(work, "p0.pdf"); PdfOps.reorder(vm.library.file(d), order.map { it.src }, f, password)
                        for (deg in listOf(90, 180, 270)) { val idx = order.indices.filter { order[it].rot == deg }.toSet(); if (idx.isNotEmpty()) { val n = File(work, "p$deg.pdf"); PdfOps.rotate(f, deg, idx, n); f = n } }
                        check(pageCount(f) == order.size) { "The new file does not have the expected number of pages" }
                        vm.library.adopt(f, "${d.name.substringBeforeLast('.')} (organised).pdf", Category.EDITED)
                    } finally { work.deleteRecursively() }
                }
                vm.record("organise", "Organise pages", out); vm.say("Saved as ${out.name}")
                changed = false; nav.c.popBackStack(); vm.opened(out); nav.open(out)
            } catch (e: Exception) { vm.say(e.message ?: "Could not save. Your original is unchanged.") } finally { busy = false }
        }
    }
    Scaffold(topBar = { BackBar("Organise pages", { if (changed) leave = true else nav.back() }, subtitle = if (selected.isEmpty()) "Hold and drag to reorder. Tap to select." else "${selected.size} selected") {
        TextButton(onClick = { save() }, enabled = changed && !busy && pages.isNotEmpty()) { Text(if (busy) "Saving" else "Save") }
    } }, bottomBar = { Surface(tonalElevation = 3.dp) {
        Row(Modifier.fillMaxWidth().navigationBarsPadding().horizontalScroll(rememberScrollState()).padding(6.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            @Composable fun act(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, enabled: Boolean = selected.isNotEmpty(), danger: Boolean = false, on: () -> Unit) =
                Column(Modifier.clip(RoundedCornerShape(12.dp)).clickable(enabled = enabled, onClick = on).padding(horizontal = 12.dp, vertical = 6.dp).graphicsLayer(alpha = if (enabled) 1f else 0.38f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(icon, null, tint = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary); Text(label, style = MaterialTheme.typography.labelSmall) }
            act(Icons.Outlined.RotateLeft, "Left") { for (i in pages.indices) if (pages[i].key in selected) pages[i] = pages[i].copy(rot = (pages[i].rot + 270) % 360); changed = true }
            act(Icons.Outlined.RotateRight, "Right") { for (i in pages.indices) if (pages[i].key in selected) pages[i] = pages[i].copy(rot = (pages[i].rot + 90) % 360); changed = true }
            act(Icons.Outlined.ArrowBack, "Earlier") { for (i in 1 until pages.size) if (pages[i].key in selected && pages[i - 1].key !in selected) { val t = pages[i]; pages[i] = pages[i - 1]; pages[i - 1] = t }; changed = true }
            act(Icons.Outlined.ArrowForward, "Later") { for (i in pages.size - 2 downTo 0) if (pages[i].key in selected && pages[i + 1].key !in selected) { val t = pages[i]; pages[i] = pages[i + 1]; pages[i + 1] = t }; changed = true }
            act(Icons.Outlined.ContentCopy, "Duplicate") { for (p in sel()) pages.add(pages.indexOf(p) + 1, p.copy(key = nextKey++)); changed = true }
            act(Icons.Outlined.Delete, "Delete", danger = true) { if (selected.size >= pages.size) vm.say("A PDF must keep at least one page") else { pages.removeAll { it.key in selected }; selected.clear(); changed = true } }
            act(Icons.Outlined.SelectAll, if (selected.size == pages.size) "None" else "All", enabled = pages.isNotEmpty()) { if (selected.size == pages.size) selected.clear() else { selected.clear(); selected.addAll(pages.map { it.key }) } }
        }
    } }) { pad ->
        if (session == null) { Box(Modifier.fillMaxSize().padding(pad), contentAlignment = Alignment.Center) { CircularProgressIndicator() }; return@Scaffold }
        LazyVerticalGrid(GridCells.Adaptive(104.dp), state = grid, contentPadding = PaddingValues(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.padding(pad).fillMaxSize().pointerInput(Unit) {
                detectDragGesturesAfterLongPress(
                    onDragStart = { o -> dragKey = grid.layoutInfo.visibleItemsInfo.firstOrNull { o.x.toInt() in it.offset.x..(it.offset.x + it.size.width) && o.y.toInt() in it.offset.y..(it.offset.y + it.size.height) }?.key as? Int },
                    onDrag = { ch, _ -> ch.consume(); val k = dragKey
                        if (k != null) { val o = ch.position
                            val over = grid.layoutInfo.visibleItemsInfo.firstOrNull { o.x.toInt() in it.offset.x..(it.offset.x + it.size.width) && o.y.toInt() in it.offset.y..(it.offset.y + it.size.height) }
                            val from = pages.indexOfFirst { it.key == k }; val to = over?.index ?: -1
                            if (from >= 0 && to >= 0 && to != from && to < pages.size) { pages.add(to, pages.removeAt(from)); changed = true } } },
                    onDragEnd = { dragKey = null }, onDragCancel = { dragKey = null })
            }) {
            itemsIndexed(pages, key = { _, p -> p.key }) { i, p ->
                val on = p.key in selected; val dragging = dragKey == p.key
                Column(Modifier.zIndex(if (dragging) 1f else 0f).graphicsLayer(scaleX = if (dragging) 1.08f else 1f, scaleY = if (dragging) 1.08f else 1f, alpha = if (dragging) 0.85f else 1f)
                    .clip(RoundedCornerShape(10.dp)).background(if (on) MaterialTheme.colorScheme.primaryContainer else Color.Transparent).clickable { if (on) selected.remove(p.key) else selected.add(p.key) }.padding(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.fillMaxWidth().aspectRatio(0.72f), contentAlignment = Alignment.Center) {
                        PageImage(session, p.src, 260, Modifier.fillMaxSize(if (p.rot % 180 == 0) 1f else 0.72f).rotate(p.rot.toFloat()).border(if (on) 2.dp else 1.dp, if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant))
                        if (on) Box(Modifier.align(Alignment.TopEnd).padding(4.dp).size(22.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Check, null, tint = Color.White, modifier = Modifier.size(15.dp)) }
                    }
                    Text("${i + 1}" + if (p.src != i) "  (was ${p.src + 1})" else "", style = MaterialTheme.typography.labelSmall, modifier = Modifier.padding(top = 3.dp))
                }
            }
        }
    }
    if (leave) ConfirmDialog("Leave without saving?", "The new page order will be lost.", "Leave", { leave = false }, { leave = false; nav.back() }, danger = true)
}
