package com.pdfmaster.app.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.JobState
import com.pdfmaster.app.tools.*

/** Bottom sheet for choosing documents from the library, or importing new ones from the phone. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DocPickerSheet(vm: AppViewModel, title: String, accept: (Doc) -> Boolean, multi: Boolean, onDismiss: () -> Unit,
                   mimeTypes: Array<String> = arrayOf("application/pdf"), onPicked: (List<Doc>) -> Unit) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val chosen = remember { mutableStateListOf<String>() }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (uris.isNotEmpty()) vm.import(if (multi) uris else uris.take(1)) { added ->
            val ok = added.filter(accept)
            if (ok.size < added.size) vm.say("Some files are not the right type for this tool")
            if (!multi) { if (ok.isNotEmpty()) onPicked(ok) } else ok.forEach { if (it.id !in chosen) chosen.add(it.id) }
        }
    }
    val list = docs.filter(accept)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().padding(bottom = 12.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(horizontal = 24.dp))
            Text(if (multi) "Tap files in the order you want them" else "Choose a file", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 24.dp, vertical = 2.dp))
            GradientButton("Import from this phone", Icons.Outlined.FileOpen, { picker.launch(mimeTypes) }, Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp))
            if (list.isEmpty()) Text("No suitable files in your library yet.", Modifier.padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            LazyColumn(Modifier.weight(1f, fill = false).heightIn(max = 420.dp), contentPadding = PaddingValues(horizontal = 8.dp)) {
                items(list, key = { it.id }) { d ->
                    val n = chosen.indexOf(d.id)
                    DocRow(d, { if (!multi) onPicked(listOf(d)) else if (n >= 0) chosen.remove(d.id) else chosen.add(d.id) }) {
                        if (multi) Box(Modifier.padding(end = 8.dp).size(26.dp).clip(CircleShape).background(if (n >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                            if (n >= 0) Text("${n + 1}", color = MaterialTheme.colorScheme.onPrimary, style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            }
            if (multi) Button(onClick = { onPicked(chosen.mapNotNull { id -> docs.firstOrNull { it.id == id } }) }, enabled = chosen.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp).height(50.dp)) { Text(if (chosen.isEmpty()) "Choose files" else "Use ${chosen.size} file${if (chosen.size == 1) "" else "s"}") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun OptionFields(opts: List<Opt>, values: MutableMap<String, String>) {
    for (o in opts) {
        when (o) {
            is ChoiceOpt -> Column(Modifier.padding(vertical = 6.dp)) {
                Text(o.label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    o.choices.forEach { (k, l) -> FilterChip(values[o.key] == k, { values[o.key] = k }, label = { Text(l) }) }
                }
            }
            is TextOpt -> if (o.showIf == null || values[o.showIf.first] == o.showIf.second)
                OutlinedTextField(values[o.key].orEmpty(), { values[o.key] = it }, label = { Text(o.label) }, placeholder = if (o.hint.isNotEmpty()) ({ Text(o.hint) }) else null, singleLine = true,
                    visualTransformation = if (o.password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
                    keyboardOptions = KeyboardOptions(keyboardType = if (o.password) KeyboardType.Password else if (o.number) KeyboardType.Number else KeyboardType.Text),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp))
            is ToggleOpt -> Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { values[o.key] = (values[o.key] != "true").toString() }.padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(o.label, Modifier.weight(1f)); Switch(values[o.key] == "true", { values[o.key] = it.toString() })
            }
        }
    }
}

/** The standard flow for a tool: choose files, set options, run with progress, then open, share or save the results. */
@Composable
fun ToolRunScreen(vm: AppViewModel, nav: Nav, toolId: String, docId: String) {
    val spec = remember(toolId) { tool(toolId) }
    val docs by vm.docs.collectAsStateWithLifecycle()
    val jobs by vm.jobs.jobs.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val inputIds = rememberSaveable(saver = androidx.compose.runtime.saveable.listSaver<androidx.compose.runtime.snapshots.SnapshotStateList<String>, String>({ it.toList() }, { it.toMutableStateList() })) {
        mutableStateListOf<String>().apply { if (docId.isNotEmpty()) add(docId) }
    }
    val inputs = inputIds.mapNotNull { id -> docs.firstOrNull { it.id == id } }
    val values = remember { mutableStateMapOf<String, String>() }
    LaunchedEffect(spec, settings.compress, settings.imageDpi) {
        spec.opts.forEach { o -> if (o.key !in values) values[o.key] = when (o) { is ChoiceOpt -> o.default; is TextOpt -> o.default; is ToggleOpt -> o.default.toString() } }
        // Defaults from Settings.
        if (toolId == "compress" && values["level"] == "BALANCED") values["level"] = settings.compress
        if (spec.opts.any { it.key == "dpi" }) values["dpi"] = listOf(96, 150, 220, 300).minByOrNull { kotlin.math.abs(it - settings.imageDpi) }.toString()
    }
    val passwords = remember { mutableStateMapOf<String, String>() }
    var jobId by rememberSaveable { mutableStateOf<Long?>(null) }
    var picking by remember { mutableStateOf(false) }
    val job = jobs.firstOrNull { it.id == jobId }
    val result = job?.result as? RunResult
    val multi = spec.batch || spec.input == InputKind.MANY_PDF || spec.input == InputKind.TWO_PDF || spec.input == InputKind.IMAGES
    val need = when (spec.input) { InputKind.MANY_PDF, InputKind.TWO_PDF -> 2; else -> 1 }
    val ready = inputs.size >= need && (spec.input != InputKind.TWO_PDF || inputs.size == 2)
    val start = { jobId = vm.runTool(spec, inputs, values.toMap(), passwords.toMap()) }

    Scaffold(topBar = { BackBar(spec.title, { nav.back() }) }, containerColor = MaterialTheme.colorScheme.background) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp)) {
            when {
                job == null || job.state == JobState.CANCELLED || result?.needPassword != null -> {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconBadge(spec.icon, tint(spec)); Text(spec.blurb, Modifier.padding(start = 14.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Spacer(Modifier.height(14.dp))
                    SoftCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(vertical = 8.dp)) {
                            Text(when (spec.input) { InputKind.TWO_PDF -> "Two PDFs to compare"; InputKind.MANY_PDF -> "PDFs to join, in order"; InputKind.IMAGES -> "Pictures, in page order"
                                InputKind.OFFICE -> if (multi) "Files to convert" else "File"; else -> if (spec.batch) "Files (choose several to do them all at once)" else "File" },
                                style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                            inputs.forEachIndexed { i, d ->
                                DocRow(d, {}, Modifier.padding(horizontal = 4.dp)) {
                                    if (spec.input == InputKind.MANY_PDF || spec.input == InputKind.IMAGES) {
                                        IconButton(onClick = { if (i > 0) { inputIds.removeAt(i); inputIds.add(i - 1, d.id) } }, enabled = i > 0) { Icon(Icons.Outlined.ArrowUpward, "Move up") }
                                        IconButton(onClick = { if (i < inputIds.size - 1) { inputIds.removeAt(i); inputIds.add(i + 1, d.id) } }, enabled = i < inputIds.size - 1) { Icon(Icons.Outlined.ArrowDownward, "Move down") }
                                    }
                                    IconButton(onClick = { inputIds.remove(d.id) }) { Icon(Icons.Outlined.Close, "Remove") }
                                }
                            }
                            if (inputs.isEmpty() || multi && !(spec.input == InputKind.TWO_PDF && inputs.size >= 2))
                                TextButton(onClick = { picking = true }, modifier = Modifier.padding(horizontal = 8.dp)) { Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(6.dp)); Text(if (inputs.isEmpty()) "Choose file" else "Add another") }
                        }
                    }
                    if (spec.opts.isNotEmpty()) {
                        Spacer(Modifier.height(12.dp))
                        SoftCard(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) { OptionFields(spec.opts, values) } }
                    }
                    Spacer(Modifier.height(18.dp))
                    GradientButton(if (job?.state == JobState.CANCELLED) "Start again" else "Start", Icons.Outlined.PlayArrow, start, Modifier.fillMaxWidth(), enabled = ready)
                    if (!ready && inputs.isNotEmpty() && need == 2) Text("Choose ${if (spec.input == InputKind.TWO_PDF) "exactly" else "at least"} two files.", Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                    if (job?.state == JobState.CANCELLED) Text("Stopped. Nothing was saved.", Modifier.padding(top = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                job.state == JobState.RUNNING -> Column(Modifier.fillMaxWidth().padding(top = 60.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    IconBadge(spec.icon, tint(spec), 72.dp)
                    Spacer(Modifier.height(20.dp))
                    Text("Working on it", style = MaterialTheme.typography.titleLarge)
                    Text(job.step.ifEmpty { inputs.firstOrNull()?.name.orEmpty() }, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 20.dp))
                    if (job.total > 0) { LinearProgressIndicator(progress = { job.done.toFloat() / job.total }, modifier = Modifier.fillMaxWidth(0.8f)); Text("${job.done} of ${job.total}", Modifier.padding(top = 8.dp), style = MaterialTheme.typography.bodySmall) }
                    else LinearProgressIndicator(Modifier.fillMaxWidth(0.8f))
                    Spacer(Modifier.height(24.dp))
                    OutlinedButton(onClick = { vm.jobs.cancel(job.id) }) { Text("Stop") }
                    Text("You can leave this screen. The work continues and the result appears in Documents.", Modifier.padding(24.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                }
                job.state == JobState.FAILED -> Column(Modifier.fillMaxWidth().padding(top = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(56.dp))
                    Text("This did not work", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp))
                    Text(job.error ?: "Something went wrong", Modifier.padding(16.dp), textAlign = androidx.compose.ui.text.style.TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text("No file was saved and your original is unchanged.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        OutlinedButton(onClick = { vm.jobs.dismiss(job.id); jobId = null }) { Text("Change settings") }
                        Button(onClick = { vm.jobs.dismiss(job.id); start() }) { Text("Try again") }
                    }
                }
                result != null -> ResultView(vm, nav, spec, result) { vm.jobs.dismiss(job.id); jobId = null }
            }
        }
    }
    if (picking) DocPickerSheet(vm, spec.title, { spec.accepts(it) }, multi, { picking = false },
        mimeTypes = when (spec.input) { InputKind.IMAGES -> arrayOf("image/*"); InputKind.OFFICE -> IMPORT_TYPES.filter { it != "application/pdf" && it != "image/*" }.toTypedArray(); else -> arrayOf("application/pdf") }) { picked ->
        picking = false
        picked.forEach { if (it.id !in inputIds && !(spec.input == InputKind.TWO_PDF && inputIds.size >= 2)) inputIds.add(it.id) }
        if (!multi && picked.isNotEmpty()) { inputIds.clear(); inputIds.add(picked[0].id) }
    }
    result?.needPassword?.let { d ->
        PasswordDialog(d.name, result.wrongPassword, onCancel = { vm.jobs.dismiss(job!!.id); jobId = null }) { pw -> passwords[d.id] = pw; vm.jobs.dismiss(job!!.id); start() }
    }
}

@Composable
private fun ResultView(vm: AppViewModel, nav: Nav, spec: ToolSpec, r: RunResult, again: () -> Unit) {
    val clip = LocalClipboardManager.current
    var actions by remember { mutableStateOf<Doc?>(null) }
    val allFailed = r.failures.isNotEmpty() && r.docs.isEmpty() && r.report == null
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(12.dp))
        Icon(if (allFailed) Icons.Outlined.ErrorOutline else Icons.Outlined.CheckCircle, null, tint = if (allFailed) MaterialTheme.colorScheme.error else Color(0xFF16A34A), modifier = Modifier.size(56.dp))
        Text(if (allFailed) "Nothing could be done" else if (r.failures.isNotEmpty()) "Done, with problems" else "Done", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
        if (r.docs.isNotEmpty()) Text(if (r.docs.size == 1) "Saved in Documents" else "${r.docs.size} files saved in Documents", color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (r.failures.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        Surface(color = MaterialTheme.colorScheme.errorContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) { Text("Could not be processed", fontWeight = FontWeight.SemiBold); r.failures.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) } }
        }
    }
    if (r.docs.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        SoftCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(vertical = 6.dp)) {
                r.docs.take(40).forEach { d ->
                    DocRow(d, { if (d.isPdf) { vm.opened(d); nav.open(d) } else actions = d }, Modifier.padding(horizontal = 4.dp)) { IconButton(onClick = { actions = d }) { Icon(Icons.Outlined.MoreVert, "More") } }
                }
                if (r.docs.size > 40) Text("and ${r.docs.size - 40} more in Documents", Modifier.padding(16.dp), style = MaterialTheme.typography.bodySmall)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = { vm.share(r.docs) }, modifier = Modifier.weight(1f).height(48.dp)) { Icon(Icons.Outlined.Share, null); Spacer(Modifier.width(8.dp)); Text(if (r.docs.size == 1) "Share" else "Share all") }
            if (r.docs.size == 1 && r.docs[0].isPdf) OutlinedButton(onClick = { vm.opened(r.docs[0]); nav.open(r.docs[0]) }, modifier = Modifier.weight(1f).height(48.dp)) { Text("Open") }
            else if (r.docs.size == 1) OutlinedButton(onClick = { if (!vm.library.openExternally(r.docs[0])) vm.say("No app on this phone can open ${r.docs[0].ext.uppercase()} files") }, modifier = Modifier.weight(1f).height(48.dp)) { Text("Open in app") }
        }
    }
    if (r.notes.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.Info, null, modifier = Modifier.size(18.dp)); Text("  Good to know", fontWeight = FontWeight.SemiBold) }
                r.notes.forEach { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(top = 6.dp)) }
            }
        }
    }
    if (r.report != null) {
        Spacer(Modifier.height(12.dp))
        SoftCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Details", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    TextButton(onClick = { clip.setText(AnnotatedString(r.report)); vm.say("Copied") }) { Icon(Icons.Outlined.ContentCopy, null, modifier = Modifier.size(18.dp)); Text("  Copy") }
                }
                SelectionContainer { Text(if (r.report.length > 12000) r.report.take(12000) + "\n\n(The rest is included when you copy.)" else r.report, style = MaterialTheme.typography.bodySmall) }
            }
        }
    }
    Spacer(Modifier.height(16.dp))
    OutlinedButton(onClick = again, modifier = Modifier.fillMaxWidth()) { Text("Use ${spec.title} again") }
    Spacer(Modifier.height(24.dp))
    actions?.let { d -> DocActionsSheet(vm, nav, d) { actions = null } }
}

@Composable
fun HistoryScreen(vm: AppViewModel, nav: Nav) {
    val history by vm.history.collectAsStateWithLifecycle()
    val docs by vm.docs.collectAsStateWithLifecycle()
    var confirm by remember { mutableStateOf(false) }
    Scaffold(topBar = { BackBar("History", { nav.back() }) { if (history.isNotEmpty()) TextButton(onClick = { confirm = true }) { Text("Clear") } } }) { pad ->
        if (history.isEmpty()) EmptyState(Icons.Outlined.History, "No activity yet", "Conversions and other work you do are listed here.", Modifier.padding(pad))
        else LazyColumn(Modifier.padding(pad)) {
            items(history, key = { it.id }) { h ->
                val outs = h.outputIds.split(',').mapNotNull { id -> docs.firstOrNull { it.id == id } }
                val ins = h.inputIds.split(',').mapNotNull { id -> docs.firstOrNull { it.id == id } }
                Column(Modifier.clickable(enabled = outs.isNotEmpty()) { outs.first().let { d -> if (d.isPdf) { vm.opened(d); nav.open(d) } else vm.library.openExternally(d) } }) {
                    HistoryRow(h)
                    // A failed job can be started again with the same files.
                    if (!h.ok && ins.isNotEmpty() && TOOLS.any { it.id == h.tool && it.screen == null }) TextButton(onClick = { nav.tool(h.tool, ins.first()) }, modifier = Modifier.padding(start = 44.dp)) { Text("Try again") }
                }
            }
        }
    }
    if (confirm) ConfirmDialog("Clear history?", "The list is cleared. Your documents are not deleted.", "Clear", { confirm = false }, { vm.clearHistory(); confirm = false })
}
