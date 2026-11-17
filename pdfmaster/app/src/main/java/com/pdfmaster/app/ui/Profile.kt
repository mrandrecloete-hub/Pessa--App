package com.pdfmaster.app.ui

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.BuildConfig
import com.pdfmaster.app.data.Secrets
import com.pdfmaster.app.data.StorageInfo
import com.pdfmaster.app.tools.CloudAi
import com.pdfmaster.app.tools.human
import kotlinx.coroutines.launch

@Composable
private fun Row2(icon: ImageVector, title: String, value: String? = null, onClick: (() -> Unit)? = null, trailing: @Composable (() -> Unit)? = null) {
    Row(Modifier.fillMaxWidth().then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f).padding(start = 16.dp)) {
            Text(title)
            if (value != null) Text(value, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (trailing != null) trailing() else if (onClick != null) Icon(Icons.Outlined.ChevronRight, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Group(title: String, content: @Composable ColumnScope.() -> Unit) {
    Text(title, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(start = 28.dp, top = 20.dp, bottom = 6.dp))
    SoftCard(Modifier.padding(horizontal = 16.dp).fillMaxWidth()) { Column(Modifier.padding(vertical = 4.dp), content = content) }
}

@Composable
private fun ChoiceDialog(title: String, options: List<Pair<String, String>>, current: String, onDismiss: () -> Unit, onPick: (String) -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text(title) }, confirmButton = { TextButton(onClick = onDismiss) { Text("Close") } }, text = {
        Column { options.forEach { (k, l) -> Row(Modifier.fillMaxWidth().clickable { onPick(k) }.padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) { RadioButton(current == k, { onPick(k) }); Text(l) } } }
    })
}

val scanStyles = listOf("clean" to "Clean: sharp page picture", "typed" to "Rebuilt: text retyped from the scan")
val scanColours = listOf("colour" to "Colour", "grey" to "Greyscale", "bw" to "Black and white")

@Composable
fun ProfileScreen(vm: AppViewModel, nav: Nav) {
    val s by vm.settings.collectAsStateWithLifecycle()
    val docs by vm.docs.collectAsStateWithLifecycle()
    var dialog by remember { mutableStateOf("") }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    val scope = rememberCoroutineScope()
    val notifPerm = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> vm.save(s.copy(notifyDone = ok)); if (!ok) vm.say("Notifications stay off. You can allow them in Android settings.") }
    val themes = listOf("system" to "Same as the phone", "light" to "Light", "dark" to "Dark")
    val formats = listOf("docx" to "Word (DOCX)", "xlsx" to "Excel (XLSX)", "pptx" to "PowerPoint (PPTX)", "txt" to "Text (TXT)", "img" to "Pictures (JPG)")
    val levels = listOf("LOW" to "Low (best quality)", "BALANCED" to "Balanced", "HIGH" to "High (smallest file)")
    val dpis = listOf("96" to "Screen (96 dpi)", "150" to "Good (150 dpi)", "220" to "High (220 dpi)", "300" to "Print (300 dpi)")
    Column(Modifier.fillMaxSize().statusBarsPadding().verticalScroll(rememberScrollState()).padding(bottom = 28.dp)) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(64.dp).clip(CircleShape).background(Brand.Accent), contentAlignment = Alignment.Center) {
                Text(s.userName.trim().take(1).uppercase().ifEmpty { "P" }, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            }
            Column(Modifier.padding(start = 16.dp).weight(1f)) {
                Text(s.userName.ifBlank { "Your profile" }, style = MaterialTheme.typography.headlineSmall)
                Text("${docs.size} document${if (docs.size == 1) "" else "s"} on this phone. No account needed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(onClick = { dialog = "name" }) { Icon(Icons.Outlined.Edit, "Change name") }
        }
        Group("Appearance") {
            Row2(Icons.Outlined.Palette, "Theme", themes.first { it.first == s.theme }.second, { dialog = "theme" })
            Row2(Icons.Outlined.Language, "Language", "English (more languages are planned)")
        }
        Group("Documents") {
            Row2(Icons.Outlined.SwapHoriz, "Default export format", formats.firstOrNull { it.first == s.exportFormat }?.second, { dialog = "format" })
            Row2(Icons.Outlined.FolderOpen, "Save location", "Inside PDFMASTER. Use Save to device or Share to put a file anywhere else.")
            Row2(Icons.Outlined.Compress, "Compression", levels.first { it.first == s.compress }.second, { dialog = "compress" })
            Row2(Icons.Outlined.Image, "Picture quality when converting", "${s.imageDpi} dpi", { dialog = "dpi" })
            Row2(Icons.Outlined.AutoFixHigh, "Scan look", "${scanStyles.first { it.first == s.scanStyle }.second}, ${scanColours.first { it.first == s.scanColour }.second}", { dialog = "scan" })
            Row2(Icons.Outlined.ManageSearch, "Recognise text after scanning (OCR)", "Makes scans searchable") { Switch(s.ocrAfterScan, { vm.save(s.copy(ocrAfterScan = it)) }) }
            Row2(Icons.Outlined.Draw, "Signatures", "Draw, import and manage", { nav.go("signatures") })
        }
        Group("AI and privacy") {
            Row2(Icons.Outlined.AutoAwesome, "AI assistant settings", if (s.aiCloud) "Cloud AI is on" else "On device only (nothing is sent anywhere)", { nav.go("settings/ai") })
            Row2(Icons.Outlined.Storage, "Storage", "Space used, temporary files", { nav.go("settings/storage") })
            Row2(Icons.Outlined.Notifications, "Tell me when long work finishes", "Only when the app is in the background") {
                Switch(s.notifyDone, { on -> if (on && Build.VERSION.SDK_INT >= 33) notifPerm.launch(Manifest.permission.POST_NOTIFICATIONS) else vm.save(s.copy(notifyDone = on)) })
            }
            Row2(Icons.Outlined.History, "History", "Conversions and other work", { nav.go("history") })
        }
        Group("Updates") {
            val updater = remember { com.pdfmaster.app.update.Updater.get(ctx) }
            val us by updater.state.collectAsStateWithLifecycle()
            var auto by remember { mutableStateOf(updater.autoCheck) }
            Row2(Icons.Outlined.SystemUpdate, "Update automatically", "Checks the public GitHub releases of PDFMASTER. Only signed updates install.") { Switch(auto, { auto = it; updater.autoCheck = it }) }
            Row2(Icons.Outlined.Refresh, "Check for updates now", when (val u = us) { com.pdfmaster.app.update.UpdateState.Checking -> "Checking..."; com.pdfmaster.app.update.UpdateState.UpToDate -> "PDFMASTER is up to date"
                is com.pdfmaster.app.update.UpdateState.Failed -> u.message; is com.pdfmaster.app.update.UpdateState.Available -> "Version ${u.release.version} is available"; else -> "Installed version ${BuildConfig.VERSION_NAME}" }, { scope.launch { updater.check() } })
        }
        Group("About") {
            Row2(Icons.Outlined.Info, "About PDFMASTER", "Version ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})", { nav.go("settings/about") })
            Row2(Icons.Outlined.PrivacyTip, "Privacy policy", onClick = { nav.go("settings/privacy") })
            Row2(Icons.Outlined.Gavel, "Terms of service", onClick = { nav.go("settings/terms") })
        }
    }
    when (dialog) {
        "name" -> TextDialog("Your name", "Name", s.userName, "Save", { dialog = "" }) { vm.save(s.copy(userName = it.trim().take(40))); dialog = "" }
        "theme" -> ChoiceDialog("Theme", themes, s.theme, { dialog = "" }) { vm.save(s.copy(theme = it)); dialog = "" }
        "format" -> ChoiceDialog("Default export format", formats, s.exportFormat, { dialog = "" }) { vm.save(s.copy(exportFormat = it)); dialog = "" }
        "compress" -> ChoiceDialog("Compression", levels, s.compress, { dialog = "" }) { vm.save(s.copy(compress = it)); dialog = "" }
        "scan" -> AlertDialog({ dialog = "" }, title = { Text("Scan look") }, confirmButton = { TextButton(onClick = { dialog = "" }) { Text("Done") } }, text = {
            Column { Text("Applied automatically to every new scan.", style = MaterialTheme.typography.bodySmall)
                Text("Look", Modifier.padding(top = 10.dp), style = MaterialTheme.typography.labelLarge)
                scanStyles.forEach { (k, l) -> Row(Modifier.fillMaxWidth().clickable { vm.save(s.copy(scanStyle = k)) }, verticalAlignment = Alignment.CenterVertically) { RadioButton(s.scanStyle == k, { vm.save(s.copy(scanStyle = k)) }); Text(l, style = MaterialTheme.typography.bodyMedium) } }
                Text("Colour", Modifier.padding(top = 10.dp), style = MaterialTheme.typography.labelLarge)
                scanColours.forEach { (k, l) -> Row(Modifier.fillMaxWidth().clickable { vm.save(s.copy(scanColour = k)) }, verticalAlignment = Alignment.CenterVertically) { RadioButton(s.scanColour == k, { vm.save(s.copy(scanColour = k)) }); Text(l) } } }
        })
        "dpi" -> ChoiceDialog("Picture quality", dpis, s.imageDpi.toString(), { dialog = "" }) { vm.save(s.copy(imageDpi = it.toInt())); dialog = "" }
    }
}

@Composable
fun SettingsPage(vm: AppViewModel, nav: Nav, page: String) {
    val title = when (page) { "ai" -> "AI assistant settings"; "storage" -> "Storage"; "about" -> "About PDFMASTER"; "privacy" -> "Privacy policy"; else -> "Terms of service" }
    Scaffold(topBar = { BackBar(title, { nav.back() }) }) { pad ->
        Column(Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp)) {
            when (page) { "ai" -> AiSettings(vm); "storage" -> StorageSettings(vm); "about" -> Prose(ABOUT); "privacy" -> Prose(PRIVACY); else -> Prose(TERMS) }
        }
    }
}

@Composable
private fun Prose(text: String) {
    text.trim().split("\n\n").forEach { p ->
        if (p.startsWith("# ")) Text(p.drop(2), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 14.dp, bottom = 4.dp))
        else Text(p, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(bottom = 8.dp))
    }
}

@Composable
private fun AiSettings(vm: AppViewModel) {
    val s by vm.settings.collectAsStateWithLifecycle()
    var consent by remember { mutableStateOf(false) }
    var key by remember { mutableStateOf("") }
    var base by remember(s.aiBaseUrl) { mutableStateOf(s.aiBaseUrl) }
    var model by remember(s.aiModel) { mutableStateOf(s.aiModel) }
    Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium) {
        Text("The assistant always works on this phone without internet: it finds dates, amounts, names, the most important sentences and passages that match your question. " +
            "It can also use a cloud AI service for real summaries, explanations and translation. That is off unless you switch it on here.", Modifier.padding(14.dp), style = MaterialTheme.typography.bodySmall)
    }
    Spacer(Modifier.height(12.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text("Use cloud AI", style = MaterialTheme.typography.titleSmall); Text("Sends document text to the service you choose", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Switch(s.aiCloud, { on -> if (on) consent = true else vm.save(s.copy(aiCloud = false)) })
    }
    if (s.aiCloud) {
        Spacer(Modifier.height(8.dp))
        Text("Service", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(s.aiProvider == "anthropic", { vm.save(s.copy(aiProvider = "anthropic")) }, label = { Text("Claude (Anthropic)") })
            FilterChip(s.aiProvider == "openai", { vm.save(s.copy(aiProvider = "openai")) }, label = { Text("OpenAI compatible") })
        }
        OutlinedTextField(key, { key = it }, label = { Text(if (s.aiKeyEnc.isEmpty()) "Your API key" else "API key is saved. Type a new one to replace it") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        OutlinedTextField(model, { model = it }, label = { Text("Model") }, placeholder = { Text(if (s.aiProvider == "anthropic") CloudAi.DEFAULT_CLAUDE_MODEL else "Model name from your service") }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        OutlinedTextField(base, { base = it }, label = { Text("Service address (leave empty for the standard one)") }, placeholder = { Text(if (s.aiProvider == "anthropic") "https://api.anthropic.com" else "https://api.openai.com/v1") },
            singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth().padding(top = 8.dp))
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Button(onClick = {
                if (base.isNotBlank() && !base.trim().startsWith("https://")) { vm.say("The address must start with https://"); return@Button }
                vm.save(s.copy(aiKeyEnc = if (key.isNotEmpty()) Secrets.encrypt(key.trim()) else s.aiKeyEnc, aiModel = model.trim(), aiBaseUrl = base.trim())); key = ""; vm.say("Saved")
            }) { Text("Save") }
            if (s.aiKeyEnc.isNotEmpty()) OutlinedButton(onClick = { vm.save(s.copy(aiKeyEnc = "")); vm.say("Key removed from this phone") }) { Text("Remove key") }
        }
        Text("Your key is encrypted with the Android Keystore and stays on this phone. PDFMASTER has no key of its own and no server: requests go straight from your phone to the service, and that service's own terms, prices and privacy rules apply. " +
            "The cloud connection has not yet been tested against a live account in this version, so please report any problem.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 12.dp))
    }
    if (consent) AlertDialog(onDismissRequest = { consent = false }, icon = { Icon(Icons.Outlined.PrivacyTip, null) }, title = { Text("Send document text to a cloud service?") },
        text = { Text("When you ask the cloud assistant something, the text of the document you chose is sent over the internet to the AI service you set up, using your own key. " +
            "Do not use it for documents you are not allowed to share. You will be asked again for each document, and you can switch this off at any time.") },
        confirmButton = { TextButton(onClick = { vm.save(s.copy(aiCloud = true)); consent = false }) { Text("I agree") } }, dismissButton = { TextButton(onClick = { consent = false }) { Text("Keep it off") } })
}

@Composable
private fun StorageSettings(vm: AppViewModel) {
    var info by remember { mutableStateOf<StorageInfo?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(Unit) { info = vm.library.storage() }
    val i = info
    if (i == null) { CircularProgressIndicator(); return }
    listOf("Documents in your library" to "${i.files} files, ${human(i.libraryBytes)}", "Temporary working files" to human(i.tempBytes), "Free space on this phone" to human(i.freeBytes)).forEach { (a, b) ->
        Row(Modifier.fillMaxWidth().padding(vertical = 10.dp)) { Text(a, Modifier.weight(1f)); Text(b, fontWeight = FontWeight.SemiBold) }
        HorizontalDivider()
    }
    Spacer(Modifier.height(16.dp))
    Button(onClick = { scope.launch { val freed = vm.library.clearTemp(); info = vm.library.storage(); vm.say("Freed ${human(freed)}") } }) { Text("Clear temporary files") }
    Text("Temporary files are working copies made while converting, and unlocked copies of password protected PDFs made for viewing. They are stored privately, never in your library, and are also removed automatically every day. " +
        "Do not clear them while a conversion is running.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
}

private val ABOUT = """
PDFMASTER is a PDF editor, converter and document manager for Android. Version ${BuildConfig.VERSION_NAME}.

# How it works

Everything is processed on your phone. There is no account and no PDFMASTER server. Files you import are copied into the app's private library, so tools always write a new file and never change your original.

# What to expect from conversions

PDF is a page drawing format, not a text document, so converting it to Word or Excel means rebuilding the text, headings and tables from positions on the page. Results are editable and usually good for ordinary documents, but complex layouts can differ from the original. Each result screen tells you what was kept and what was not.

# Open source parts

PDF reading and writing: PdfBox Android (Apache License 2.0). Text recognition and document scanning: Google ML Kit. Fonts in created PDFs: DejaVu (free licence, Bitstream Vera derivative). User interface: Jetpack Compose and Material 3 (Apache License 2.0).
"""

private val PRIVACY = """
# Summary

PDFMASTER works on your phone. It has no account, no advertising, no analytics and no server of its own. This text describes how this version of the app behaves. It is not legal advice.

# Your documents

Files you import are copied into private app storage that other apps cannot read. They leave the app only when you share them, save them to your device, or open them in another app. Deleting a document in PDFMASTER removes the app's copy.

# Temporary files

Working copies are kept in the app's private cache and removed after each job and by a daily clean up. You can remove them at any time in Profile, Storage.

# Scanning and text recognition

The document scanner and text recognition use Google ML Kit on the device. The scanner screen is provided by Google Play services, which may download its scanning component the first time and may collect usage diagnostics under Google's own terms.

# Cloud AI (optional, off by default)

Only if you switch on cloud AI, add your own key and confirm for a document, the text of that document is sent directly from your phone to the AI service you chose. PDFMASTER does not receive it. That service's privacy policy applies to what it receives.

# Updates

By default PDFMASTER asks GitHub for the public list of its releases when it opens and every few hours in the background, and downloads a newer version when there is one. Only the request itself is sent (your phone's internet address, as with any website visit, and the app name and version); nothing about you or your documents. You can switch this off in Profile, Updates. A download is installed only if it matches the release checksum and is signed with the same key as the installed app.

# Backups

The app asks Android not to include its documents in cloud backups or device transfers.

# Permissions

Internet: used for the update check and, only if you switch it on, the optional cloud AI. Install apps: lets the app install its own downloaded updates (Android asks you once). Notifications: only if you ask to be told when long work finishes. Camera access for scanning is handled by the Google scanner, not by this app.
"""

private val TERMS = """
# Use of the app

You may use PDFMASTER for your own lawful document work. You are responsible for having the right to open, change, convert, sign and share the documents you use with it, including removing a password from a file.

# Results

Conversions, text recognition and the assistant can make mistakes. Check important documents, figures and dates before relying on them. Keep your originals: the app never overwrites them.

# Signatures

A drawn or imported signature is an electronic signature picture. It is not a certificate based digital signature and does not prove who signed or that the document was not changed afterwards. Whether it is acceptable for a particular purpose depends on the law and on the party receiving the document.

# Redaction and passwords

Redaction replaces the marked pages with pictures so the covered content is no longer in the file; check the result before sharing. A forgotten password cannot be recovered by the app.

# No warranty

The app is provided as it is, without warranty of any kind, to the extent the law allows. These terms describe this version and may be updated with the app.
"""
