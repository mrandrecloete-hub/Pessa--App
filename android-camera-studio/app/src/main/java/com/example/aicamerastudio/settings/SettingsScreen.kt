package com.example.aicamerastudio.settings

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.camera.capabilities.CameraCapabilityService
import com.example.aicamerastudio.camera.capabilities.CameraFacts
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.data.preferences.UserPreferences
import com.example.aicamerastudio.photo.pipeline.EnhancementProfile
import com.example.aicamerastudio.photo.pipeline.ProcessingLevel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
private fun SwitchRow(title: String, body: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = Tokens.minTouch), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.bodyLarge); Text(body, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Switch(checked, onChange)
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = Tokens.spaceMd))
    content()
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(prefs: UserPreferences, onCapabilities: () -> Unit, onPrivacy: () -> Unit, onAbout: () -> Unit) {
    val repo = (LocalContext.current.applicationContext as App).graph.preferences
    val scope = rememberCoroutineScope()
    fun set(f: (UserPreferences) -> UserPreferences) { scope.launch { repo.update(f) } }
    var profileMenu by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        AppToolbar("Settings")
        Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = Tokens.spaceMd).padding(bottom = Tokens.spaceLg)) {
            Section("Photo enhancement") {
                SwitchRow("Enhance after capture", "Saves a separate enhanced copy in the background. The original is kept.", prefs.autoEnhance) { v -> set { it.copy(autoEnhance = v) } }
                ExposedDropdownMenuBox(profileMenu, { profileMenu = it }) {
                    OutlinedTextField(prefs.profile.label, {}, readOnly = true, label = { Text("Profile") }, modifier = Modifier.menuAnchor().fillMaxWidth())
                    ExposedDropdownMenu(profileMenu, { profileMenu = false }) {
                        EnhancementProfile.values().forEach { p ->
                            DropdownMenuItem(text = { Column { Text(p.label); Text(p.description, style = MaterialTheme.typography.bodySmall) } }, onClick = { set { it.copy(profile = p) }; profileMenu = false })
                        }
                    }
                }
                Text(prefs.profile.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                LabeledSlider("Strength", prefs.strength, 0f..1f, "${(prefs.strength * 100).toInt()}%", { v -> set { it.copy(strength = v) } })
                Text("Processing level", style = MaterialTheme.typography.labelLarge)
                ProcessingLevel.values().forEach { l ->
                    Row(Modifier.fillMaxWidth().heightIn(min = Tokens.minTouch), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        RadioButton(prefs.level == l, { set { it.copy(level = l) } })
                        Column { Text(l.label); Text(l.note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
                LabeledSlider("JPEG quality", prefs.jpegQuality.toFloat(), 60f..100f, "${prefs.jpegQuality}", { v -> set { it.copy(jpegQuality = v.toInt()) } })
                SwitchRow("Keep original photos", "Turn off to delete the original after a successful enhancement. Not recommended.", prefs.keepOriginals) { v -> set { it.copy(keepOriginals = v) } }
                SwitchRow("Battery conscious", "Waits for enough battery and avoids Maximum quality in battery saver. The device temperature also lowers the level when it is warm.", prefs.batteryConscious) { v -> set { it.copy(batteryConscious = v) } }
            }
            Section("Camera") { SwitchRow("Grid lines", "Rule of thirds overlay on the preview.", prefs.grid) { v -> set { it.copy(grid = v) } } }
            Section("Appearance") {
                ThemeMode.values().forEach { m ->
                    Row(Modifier.fillMaxWidth().heightIn(min = Tokens.minTouch), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        RadioButton(prefs.theme == m, { set { it.copy(theme = m) } }); Text(m.name.lowercase().replaceFirstChar { it.uppercase() })
                    }
                }
            }
            Section("About") {
                TextButton(onCapabilities) { Text("Device camera capabilities") }
                TextButton(onPrivacy) { Text("Privacy") }
                TextButton(onAbout) { Text("What works and what does not yet") }
            }
        }
    }
}

@Composable
fun CapabilitiesScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    var facts by remember { mutableStateOf<List<CameraFacts>?>(null) }
    LaunchedEffect(Unit) { facts = withContext(Dispatchers.IO) { CameraCapabilityService(context).read() } }
    Column(Modifier.fillMaxSize()) {
        AppToolbar("Device capabilities", onBack)
        val list = facts
        if (list == null) LoadingIndicator("Reading cameras", modifier = Modifier.fillMaxWidth().padding(Tokens.spaceLg))
        else if (list.isEmpty()) EmptyState("No cameras found", "This device does not report any camera.")
        else Column(Modifier.verticalScroll(rememberScrollState()).padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            Text("Read from the Android Camera2 API on this device. Only what the hardware reports is listed.", style = MaterialTheme.typography.bodySmall)
            list.forEach { c ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text("Camera ${c.id}: ${c.facing}", style = MaterialTheme.typography.titleSmall)
                        Text("Hardware level: ${c.hardwareLevel}")
                        if (c.physicalIds.isNotEmpty()) Text("Physical cameras: ${c.physicalIds.joinToString()}")
                        Text("Focal lengths: ${c.focalLengthsMm.joinToString { "%.1f mm".format(it) }.ifBlank { "not reported" }}")
                        Text("Largest JPEG: ${c.maxJpegSize ?: "not reported"}")
                        Text("Minimum focus distance: ${c.minFocusDistanceDiopters?.let { if (it > 0) "%.1f cm".format(100f / it) else "fixed focus" } ?: "not reported"}")
                        Text("ISO: ${c.isoRange?.let { "${it.first} to ${it.last}" } ?: "not reported"}")
                        Text("Exposure time: ${c.exposureTimeNs?.let { "%.6f s to %.2f s".format(it.first / 1e9, it.last / 1e9) } ?: "not reported"}")
                        Text("Exposure compensation: ${c.exposureCompRange?.let { "${it.first} to ${it.last} steps of ${c.exposureCompStep}" } ?: "not reported"}")
                        Text("RAW: ${if (c.supportsRaw) "supported by hardware (this app does not capture RAW yet)" else "not supported"}")
                        Text("Flash: ${if (c.hasFlash) "yes" else "no"}")
                        Text("Optical stabilisation: ${if (c.opticalStabilisation) "yes" else "no"}; video stabilisation: ${if (c.videoStabilisation) "yes" else "no"}")
                        Text("Autofocus modes: ${c.autoFocusModes}")
                        Text("Frame rate ranges: ${c.fpsRanges.joinToString().ifBlank { "not reported" }}")
                        c.maxDigitalZoom?.let { Text("Maximum digital zoom: %.1f×".format(it)) }
                        if (c.capabilities.isNotEmpty()) Text("Capabilities: ${c.capabilities.joinToString()}")
                    }
                }
            }
        }
    }
}

@Composable
fun InfoScreen(title: String, sections: List<Pair<String, String>>, onBack: () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        AppToolbar(title, onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
            sections.forEach { (h, b) -> Column { Text(h, style = MaterialTheme.typography.titleSmall); Text(b, style = MaterialTheme.typography.bodyMedium) } }
        }
    }
}

val PRIVACY_SECTIONS = listOf(
    "Local processing" to "Photos and videos are captured, enhanced, edited and trimmed on this device. The enhancement uses classical image processing code that runs locally. No artificial intelligence model is used yet.",
    "No uploads" to "This app has no internet permission, so it cannot upload your photos or videos. Sharing only happens when you choose Share and pick another app.",
    "Permissions" to "Camera: to take photos and video. Microphone: only to record sound with video, and optional. The app needs no storage permission because it saves into its own folders (Pictures/AI Camera Studio and Movies/AI Camera Studio). Photos you pick for editing are opened with the system picker.",
    "Location" to "The app does not read your location and never writes it into files. Enhanced and edited copies keep camera details such as date, make, model and exposure, and drop location and orientation tags.",
    "Originals" to "Your original photo is kept by default. Enhancement and editing always create a new file. The original is deleted only if you turn off Keep original photos or delete it yourself.",
    "Stored app data" to "A small local database remembers which enhanced copy belongs to which original and your saved edit settings. It contains file addresses and numbers, never pictures. Backups of this data are turned off.",
    "Analytics" to "There is no analytics, tracking or advertising.",
)

val ABOUT_SECTIONS = listOf(
    "Working now" to "Camera preview, photo capture, video recording (quality, frame rate and stabilisation choices come from what your camera reports), front and back camera, zoom, tap to focus, exposure compensation, flash and torch, timer, grid, aspect ratio. Automatic photo enhancement in the background (exposure, white balance, tone, colour, noise reduction, sharpening, with six profiles and three processing levels). Gallery with search, filters, sorting, selection, share and delete. Before and after comparison using the real files. Photo editor with undo, redo, reset and saved edit settings. Video trimming with export progress and cancel.",
    "Not built yet" to "AI models and AI super resolution, background removal, object removal, face aware and portrait processing, Pro mode manual controls, RAW capture, Night and HDR multi frame capture, Burst, Document scanning, Macro, slow motion and timelapse, automatic video enhancement, multi clip video timeline, text and music, curves, HSL, vignette, grain, filters, albums and favourites.",
    "Zoom" to "Zoom values beyond 1× may be digital zoom. The app does not claim optical zoom. The Device capabilities page lists the focal lengths your camera reports.",
    "Colour" to "Photos are processed in sRGB. Wide gamut sources are converted to sRGB first, so some very saturated colours are reduced.",
    "Testing" to "Processing logic is covered by automated unit tests. This build has not been run on a physical phone or an emulator by its author. Treat camera behaviour on your device as untested until you try it.",
)
