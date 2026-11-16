package com.pdfmaster.app.ui

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.pdfmaster.app.data.Category
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.JobState
import com.pdfmaster.app.engine.*
import com.pdfmaster.app.tools.CloudAi
import com.pdfmaster.app.tools.tool
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/** Camera scanning with Google's document scanner, then a clean up so the page looks like a freshly made document. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ScanScreen(vm: AppViewModel, nav: Nav) {
    val context = LocalContext.current
    val settings by vm.settings.collectAsStateWithLifecycle()
    val jobs by vm.jobs.jobs.collectAsStateWithLifecycle()
    var original by remember { mutableStateOf<Doc?>(null) }
    var polishJob by rememberSaveable { mutableStateOf<Long?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var started by rememberSaveable { mutableStateOf(false) }
    var style by remember { mutableStateOf<String?>(null) }
    var colour by remember { mutableStateOf<String?>(null) }
    val curStyle = style ?: settings.scanStyle; val curColour = colour ?: settings.scanColour
    fun polish(d: Doc) { polishJob = vm.runTool(tool("polish"), listOf(d), mapOf("style" to curStyle, "colour" to curColour, "a4" to "true"), emptyMap()) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { res ->
        val pdf = if (res.resultCode == Activity.RESULT_OK) GmsDocumentScanningResult.fromActivityResultIntent(res.data)?.pdf else null
        if (pdf == null) { if (original == null) nav.back() }
        else vm.import(listOf(pdf.uri), Category.SCANNED) { docs ->
            val d = docs.firstOrNull()
            if (d == null) error = "The scan could not be saved." else { original = d; vm.record("scan", "Scan document", d, detail = "${pdf.pageCount} page(s)"); polish(d) }
        }
    }
    fun scan() {
        val opts = GmsDocumentScannerOptions.Builder().setGalleryImportAllowed(true).setPageLimit(60)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF).setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL).build()
        val act = context as? Activity ?: return
        GmsDocumentScanning.getClient(opts).getStartScanIntent(act)
            .addOnSuccessListener { launcher.launch(IntentSenderRequest.Builder(it).build()) }
            .addOnFailureListener { error = "The document scanner could not start on this phone. It needs Google Play services and, the first time, an internet connection to download the scanner. (${it.message ?: "no details"})" }
    }
    LaunchedEffect(Unit) { if (!started) { started = true; scan() } }
    val job = jobs.firstOrNull { it.id == polishJob }
    val result = job?.result as? RunResult
    val clean = result?.docs?.firstOrNull { it.isPdf }
    Scaffold(topBar = { BackBar("Scan document", { nav.back() }) }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            val d = original
            when {
                error != null -> { EmptyState(Icons.Outlined.ErrorOutline, "Scanner not available", error!!) { Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Button(onClick = { error = null; scan() }) { Text("Try again") }
                    TextButton(onClick = { nav.c.popBackStack(); nav.tool("img_pdf") }) { Text("Use photos from the gallery instead") } } } }
                d == null -> { CircularProgressIndicator(Modifier.padding(top = 80.dp)); Text("Opening the scanner", Modifier.padding(top = 16.dp)) }
                else -> {
                    if (job?.state == JobState.RUNNING || job == null) {
                        Text("Making your pages look like new", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 24.dp))
                        Text("Evening out the paper, removing shadows, sharpening the text and fitting the page", Modifier.padding(top = 6.dp, bottom = 16.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
                        if (job != null && job.total > 0) { LinearProgressIndicator(progress = { job.done.toFloat() / job.total }, modifier = Modifier.fillMaxWidth()); Text("Page ${job.done + 1} of ${job.total}", Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall) } else LinearProgressIndicator(Modifier.fillMaxWidth())
                    } else if (job.state == JobState.DONE && clean != null) {
                        Icon(Icons.Outlined.CheckCircle, null, tint = androidx.compose.ui.graphics.Color(0xFF16A34A), modifier = Modifier.size(56.dp))
                        Text("Your document is ready", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 8.dp))
                        SoftCard(Modifier.fillMaxWidth().padding(top = 14.dp)) { DocRow(clean, { vm.opened(clean); nav.c.popBackStack(); nav.open(clean) }, Modifier.padding(4.dp)) }
                        Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            Button(onClick = { vm.opened(clean); nav.c.popBackStack(); nav.open(clean) }, modifier = Modifier.weight(1f).height(48.dp)) { Text("Open") }
                            OutlinedButton(onClick = { vm.share(listOf(clean)) }, modifier = Modifier.weight(1f).height(48.dp)) { Text("Share") }
                        }
                        result?.notes?.forEach { Text(it, Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    } else if (job.state == JobState.FAILED) {
                        Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(48.dp))
                        Text("The clean up did not work: ${job.error}. Your original scan is saved.", Modifier.padding(top = 10.dp), color = MaterialTheme.colorScheme.error)
                    }
                    if (job?.state != JobState.RUNNING && job != null) {
                        Text("Try another look", Modifier.padding(top = 22.dp).fillMaxWidth(), style = MaterialTheme.typography.titleSmall)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { scanStyles.forEach { (k, l) -> FilterChip(curStyle == k, { style = k }, label = { Text(l.substringBefore(":")) }) } }
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { scanColours.forEach { (k, l) -> FilterChip(curColour == k, { colour = k }, label = { Text(l) }) } }
                        if (curStyle == "typed") Text("Rebuilt retypes the recognised text so it is perfectly sharp. Check names and numbers afterwards, and note that handwriting stays as a picture.", Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        OutlinedButton(onClick = { polish(d) }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) { Text("Apply this look") }
                        Text("Original scan", Modifier.padding(top = 20.dp).fillMaxWidth(), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        DocRow(d, { vm.opened(d); nav.c.popBackStack(); nav.open(d) })
                        OutlinedButton(onClick = { original = null; polishJob = null; scan() }, modifier = Modifier.fillMaxWidth().padding(top = 12.dp)) { Text("Scan another document") }
                    }
                }
            }
        }
    }
}

private class Msg(val title: String, val text: String, val pages: List<Int> = emptyList(), val cloud: Boolean = false, val question: Boolean = false)

/** Document assistant. Works on the phone by default; a cloud model is used only when the user has set one up and agrees. */
@Composable
fun AiScreen(vm: AppViewModel, nav: Nav) {
    val docs by vm.docs.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope(); val clip = LocalClipboardManager.current
    var docId by rememberSaveable { mutableStateOf<String?>(null) }
    val doc = docs.firstOrNull { it.id == docId }
    var picking by remember { mutableStateOf(false) }
    var texts by remember(docId) { mutableStateOf<List<String>?>(null) }
    var password by remember(docId) { mutableStateOf<String?>(null) }
    var askPw by remember(docId) { mutableStateOf(false) }; var wrongPw by remember { mutableStateOf(false) }
    val msgs = remember(docId) { mutableStateListOf<Msg>() }
    var q by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val agreed = remember { mutableStateListOf<String>() }          // documents the user agreed to send, this session only
    var consentFor by remember { mutableStateOf<Pair<String, String>?>(null) }
    var translate by remember { mutableStateOf(false) }
    val list = rememberLazyListState()
    val cloud = CloudAi.ready(settings)

    LaunchedEffect(docId, password) {
        val d = doc ?: return@LaunchedEffect
        try { texts = withContext(Dispatchers.IO) { PdfOps.pageTexts(vm.library.file(d), password) }; askPw = false
            if (texts!!.all { it.isBlank() }) msgs.add(Msg("No text in this document", "It looks like a scan or pictures only. Use Tools, Make searchable (OCR) first, then choose the searchable copy here."))
        } catch (e: PasswordRequiredException) { wrongPw = password != null; askPw = true } catch (e: Exception) { msgs.add(Msg("Could not read this document", e.message ?: "It may be damaged.")) }
    }
    LaunchedEffect(msgs.size) { if (msgs.isNotEmpty()) list.animateScrollToItem(msgs.size - 1) }

    fun local(kind: String, question: String = "") {
        val t = texts ?: return
        scope.launch { busy = true
            val m = withContext(Dispatchers.Default) { when (kind) {
                "summary" -> LocalAi.summarise(t, 6).let { s -> if (s.isEmpty()) Msg("Key sentences", "There is not enough running text to pick key sentences from.") else Msg("Key sentences (picked on this phone)", s.joinToString("\n\n") { "• ${it.text}  (p. ${it.page})" }, s.map { it.page }.distinct()) }
                "facts" -> LocalAi.extract(t).let { f -> if (f.isEmpty()) Msg("Details found", "No dates, amounts, email addresses, phone numbers or names were recognised.") else Msg("Details found (on this phone)",
                    f.groupBy { it.kind }.entries.joinToString("\n\n") { (k, v) -> "$k${if (v.size > 1) "s" else ""}\n" + v.groupBy { it.value }.entries.take(40).joinToString("\n") { (value, hits) -> "• $value  (p. ${hits.map { it.page }.distinct().joinToString(", ")})" } }, f.map { it.page }.distinct()) }
                else -> LocalAi.answer(t, question).let { a -> if (a.isEmpty()) Msg("No matching passage", "None of the important words in your question appear in the document. Try the words the document itself would use.") else Msg("Closest passages (found on this phone)",
                    a.joinToString("\n\n") { "p. ${it.page}:  ${it.text}" }, a.map { it.page }.distinct()) }
            } }
            msgs.add(m); busy = false }
    }
    fun cloudAsk(title: String, request: String) {
        val t = texts ?: return; val d = doc ?: return
        if (d.id !in agreed) { consentFor = title to request; return }
        scope.launch { busy = true
            try {
                val (text, cut) = LocalAi.promptText(t, 1_200_000)
                val a = CloudAi.ask(settings, text, request)
                msgs.add(Msg("$title (${a.model})", a.text + listOfNotNull(a.note, "Only the first part of this very long document was sent.".takeIf { cut }).joinToString("") { "\n\nNote: $it" }, cloud = true))
            } catch (e: Exception) { msgs.add(Msg("The cloud assistant could not answer", e.message ?: "Check your internet connection and the settings in Profile.")) }
            busy = false }
    }
    fun ask() { val text = q.trim(); if (text.isEmpty() || texts == null) return; msgs.add(Msg("You", text, question = true)); q = ""
        if (cloud) cloudAsk("Answer", text) else local("ask", text) }
    fun saveDocx() {
        val d = doc ?: return; val answers = msgs.filter { !it.question }
        scope.launch { try {
            val out = withContext(Dispatchers.IO) { val work = vm.library.workDir(); val f = File(work, "notes.docx")
                val items = ArrayList<DocxItem>(); items.add(DocxPara(listOf(Run("Notes on ${d.name}", bold = true, size = 18f))))
                for (m in msgs) { items.add(DocxPara(listOf(Run(m.title, bold = true, size = 12f)))); m.text.split("\n").filter { it.isNotBlank() }.forEach { items.add(DocxPara(listOf(Run(it, size = 11f)))) } }
                Ooxml.writeDocx(items, f); vm.library.adopt(f, "Notes on ${d.name.substringBeforeLast('.')}.docx", Category.CONVERTED).also { work.deleteRecursively() } }
            vm.record("ai", "AI notes to Word", out); vm.say("Saved as ${out.name} in Documents")
        } catch (e: Exception) { vm.say(e.message ?: "Could not save") } }
        if (answers.isEmpty()) vm.say("Nothing to save yet")
    }

    Column(Modifier.fillMaxSize().statusBarsPadding()) {
        Row(Modifier.padding(start = 20.dp, end = 8.dp, top = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("AI Assistant", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            if (msgs.any { !it.question }) IconButton(onClick = { saveDocx() }) { Icon(Icons.Outlined.Description, "Save as Word document") }
            IconButton(onClick = { nav.go("settings/ai") }) { Icon(Icons.Outlined.Settings, "AI settings") }
        }
        SoftCard(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clickable { picking = true }) {
            if (doc != null) DocRow(doc, { picking = true }, Modifier.padding(4.dp)) { Text("Change", Modifier.padding(end = 12.dp), color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.labelLarge) }
            else Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { IconBadge(Icons.Outlined.AutoAwesome, Brand.Violet)
                Column(Modifier.padding(start = 14.dp)) { Text("Choose a PDF to work with", style = MaterialTheme.typography.titleSmall)
                    Text(if (cloud) "Cloud AI is on. You are asked before any document is sent." else "Works on this phone. Nothing is sent anywhere.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) } }
        }
        if (doc != null && texts != null) Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (cloud) {
                AssistChip({ cloudAsk("Summary", "Summarise this document clearly. Start with a two sentence overview, then the main points.") }, { Text("Summarise") }, enabled = !busy)
                AssistChip({ cloudAsk("Structured notes", "Write structured notes of this document: headings with short points under each, including key dates, names and amounts with page references.") }, { Text("Notes") }, enabled = !busy)
                AssistChip({ cloudAsk("Tables", "Extract every table in this document as plain text rows with columns separated by ' | ', each with its page number.") }, { Text("Tables") }, enabled = !busy)
                AssistChip({ cloudAsk("Missing information", "List information that appears to be missing, blank, inconsistent or unsigned in this document, with page references.") }, { Text("What is missing") }, enabled = !busy)
                AssistChip({ translate = true }, { Text("Translate") }, enabled = !busy)
            }
            AssistChip({ local("summary") }, { Text(if (cloud) "Key sentences (offline)" else "Key sentences") }, enabled = !busy)
            AssistChip({ local("facts") }, { Text("Dates, amounts, names") }, enabled = !busy)
        }
        LazyColumn(Modifier.weight(1f), state = list, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (doc == null || msgs.isEmpty() && texts != null) item {
                Text(if (doc == null) "The assistant reads the real text of your document. On this phone it can pick out key sentences, dates, amounts, names and contact details, and find the passages that match a question, always with page numbers.\n\n" +
                    "For true summaries, explanations, translation and notes, you can connect your own cloud AI key in settings. That is optional and off by default."
                    else if (cloud) "Ask a question about this document or use a shortcut above." else "Ask a question to find the matching passages, or use a shortcut above. This offline mode finds and ranks text; it does not write new explanations.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
            }
            items(msgs) { m ->
                Surface(color = if (m.question) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface, shape = MaterialTheme.shapes.medium, shadowElevation = if (m.question) 0.dp else 1.dp,
                    modifier = Modifier.fillMaxWidth().padding(start = if (m.question) 48.dp else 0.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        if (!m.question) Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(if (m.cloud) Icons.Outlined.Cloud else Icons.Outlined.PhoneAndroid, null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                            Text("  " + m.title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
                            IconButton(onClick = { clip.setText(AnnotatedString(m.text)); vm.say("Copied") }, modifier = Modifier.size(28.dp)) { Icon(Icons.Outlined.ContentCopy, "Copy", modifier = Modifier.size(16.dp)) }
                        }
                        SelectionContainer { Text(m.text, style = MaterialTheme.typography.bodyMedium) }
                        if (m.cloud) Text("Written by a cloud AI model. Check important facts against the document.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                    }
                }
            }
            if (busy) item { Row(verticalAlignment = Alignment.CenterVertically) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp); Text("  Working", color = MaterialTheme.colorScheme.onSurfaceVariant) } }
        }
        if (doc != null) Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(q, { q = it }, placeholder = { Text(if (cloud) "Ask about this document" else "Find in this document by question") }, modifier = Modifier.weight(1f), maxLines = 3, shape = MaterialTheme.shapes.large,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send), keyboardActions = KeyboardActions(onSend = { ask() }), enabled = texts != null && !busy)
            IconButton(onClick = { ask() }, enabled = q.isNotBlank() && texts != null && !busy) { Icon(Icons.Outlined.Send, "Ask", tint = MaterialTheme.colorScheme.primary) }
        }
    }
    if (picking) DocPickerSheet(vm, "Choose a document", { it.isPdf }, false, { picking = false }) { picked -> picking = false; docId = picked.firstOrNull()?.id }
    if (askPw && doc != null) PasswordDialog(doc.name, wrongPw, { askPw = false; docId = null }) { password = it }
    consentFor?.let { (title, request) -> AlertDialog({ consentFor = null }, icon = { Icon(Icons.Outlined.Cloud, null) }, title = { Text("Send this document's text?") },
        text = { Text("The text of ${doc?.name} will be sent over the internet to ${if (settings.aiProvider == "anthropic") "Anthropic (Claude)" else "your OpenAI compatible service"}${settings.aiBaseUrl.takeIf { it.isNotBlank() }?.let { " at $it" } ?: ""} using your key. Usage may be charged to your account there.") },
        confirmButton = { TextButton(onClick = { doc?.let { agreed.add(it.id) }; consentFor = null; cloudAsk(title, request) }) { Text("Send") } }, dismissButton = { TextButton(onClick = { consentFor = null }) { Text("Do not send") } }) }
    if (translate) TextDialog("Translate into", "Language, for example Afrikaans", "", "Translate", { translate = false }) { lang -> translate = false
        cloudAsk("Translation into ${lang.trim()}", "Translate the content of this document into ${lang.trim()}. Keep the page markers so the pages can be matched.") }
}
