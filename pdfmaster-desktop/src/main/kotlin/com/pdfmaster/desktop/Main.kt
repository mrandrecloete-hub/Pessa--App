package com.pdfmaster.desktop

import androidx.compose.foundation.Image
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Window
import androidx.compose.ui.window.WindowState
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import androidx.compose.ui.unit.DpSize
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun AppRoot(model: AppModel, exit: () -> Unit) {
    PdfMasterTheme(model.dark) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            val snack = remember { SnackbarHostState() }
            LaunchedEffect(model.toast) { model.toast?.let { snack.showSnackbar(it); model.toast = null } }
            Column(Modifier.fillMaxSize()) {
                UpdateBar(model, exit)
                Row(Modifier.weight(1f)) {
                    NavigationRail(containerColor = MaterialTheme.colorScheme.surface, header = { Image(painterResource("logo.png"), "PDFMASTER", Modifier.padding(top = 12.dp).size(48.dp)) }) {
                        Spacer(Modifier.height(12.dp))
                        @Composable fun item(sel: Boolean, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, go: () -> Unit) = NavigationRailItem(sel, go, { Icon(icon, label) }, label = { Text(label) })
                        item(model.screen is Screen.Home || model.screen is Screen.Viewer, Icons.Outlined.Home, "Home") { model.screen = Screen.Home }
                        item(model.screen is Screen.Tools || model.screen is Screen.Tool, Icons.Outlined.Widgets, "Tools") { model.screen = Screen.Tools }
                        item(model.screen is Screen.Restore, Icons.Outlined.PhotoFilter, "Restore") { val s = model.screen; if (s !is Screen.Restore) Files.pick("Choose a PDF or a photo of a document", Files.PDF + Files.IMAGES).firstOrNull()?.let { f -> model.open(f); model.screen = Screen.Restore(f) } }
                        item(model.screen is Screen.About, Icons.Outlined.Info, "About") { model.screen = Screen.About }
                    }
                    Box(Modifier.weight(1f).fillMaxHeight()) {
                        when (val s = model.screen) {
                            Screen.Home -> HomeScreen(model)
                            Screen.Tools -> ToolsScreen(model)
                            Screen.About -> AboutScreen(model)
                            is Screen.Viewer -> key(s.file) { ViewerScreen(model, s.file) }
                            is Screen.Tool -> key(s) { ToolScreen(model, s.id, s.files) }
                            is Screen.Restore -> key(s.file) { RestoreScreen(model, s.file) }
                        }
                        SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(16.dp))
                    }
                }
            }
        }
    }
}

@Composable
fun AboutScreen(model: AppModel) {
    var status by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("PDFMASTER for Windows", style = MaterialTheme.typography.headlineMedium)
        Text("Version ${Updater.current}", color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(verticalAlignment = Alignment.CenterVertically) { Column(Modifier.weight(1f)) { Text("Update automatically"); Text("Checks the public GitHub releases when the app opens (at most once an hour). Only checksum-verified installers are used. Nothing about you or your files is sent.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Switch(model.autoUpdate, { model.autoUpdate = it; model.saveSettings() }) }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Button({ status = "Checking..."; scope.launch { status = withContext(Dispatchers.IO) { runCatching { Updater.check()?.let { "Version ${it.version} is available. Restart the app to see the update bar, or install it from the releases page." } ?: "PDFMASTER is up to date." }.getOrElse { it.message ?: "Could not reach GitHub." } } } }) { Text("Check for updates now") }
            TextButton({ Files.open(java.io.File(".")) .also { runCatching { java.awt.Desktop.getDesktop().browse(java.net.URI(Updater.PAGE)) } } }) { Text("Releases page") }
            status?.let { Text(it) } }
        Row(verticalAlignment = Alignment.CenterVertically) { Text("Dark theme", Modifier.weight(1f)); Switch(model.dark, { model.dark = it; model.saveSettings() }) }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f)) { Text("Save results in"); Text(model.outputDir?.absolutePath ?: "Next to the original file", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            OutlinedButton({ val d = java.awt.FileDialog(null as java.awt.Frame?, "Choose any file in the folder you want", java.awt.FileDialog.LOAD); d.isVisible = true; d.directory?.let { model.outputDir = java.io.File(it); model.saveSettings() } }) { Text("Choose folder") }
            TextButton({ model.outputDir = null; model.saveSettings() }) { Text("Reset") } }
        HorizontalDivider()
        Text("What is in the Windows version", style = MaterialTheme.typography.titleMedium)
        Text("PDF viewer with search and zoom, merge, split, extract, delete, rotate, compress, watermark, page numbers, password protection (checked), remove password, remove metadata, repair, PDF to Word, Excel, PowerPoint, text, CSV, HTML, RTF, TIFF and pictures, pictures and Office files to PDF, and Professional Document Restoration with before and after comparison.", style = MaterialTheme.typography.bodyMedium)
        Text("Not in the Windows version yet: editing text and drawing on PDFs, form filling, signatures, the camera scanner, searchable text (OCR) and the AI assistant. The phone app has them.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text("Everything runs on your computer. Your original files are never changed: every tool saves a new file.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}




fun main() = application {
    val model = remember { AppModel() }
    val state = rememberWindowState(size = DpSize(1360.dp, 860.dp))
    Window(onCloseRequest = ::exitApplication, title = "PDFMASTER", state = state, icon = painterResource("icon.png")) { AppRoot(model) { exitApplication() } }
}
