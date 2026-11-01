package com.example.aicamerastudio.core.update

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.design.Tokens
import kotlinx.coroutines.launch

/** Shows an available or downloaded update and its progress. */
@Composable
fun UpdateDialog() {
    val context = LocalContext.current
    val updater = (context.applicationContext as App).graph.updater
    val state by updater.state.collectAsState()
    val result by Updater.lastResult.collectAsState()
    val scope = rememberCoroutineScope()
    var job by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    // Android 13+: ask once for notifications so a background update can say "ready" (optional).
    val notify = androidx.activity.compose.rememberLauncherForActivityResult(androidx.activity.result.contract.ActivityResultContracts.RequestPermission()) {}
    fun askNotificationsOnce() {
        val prefs = context.getSharedPreferences("updates", android.content.Context.MODE_PRIVATE)
        if (android.os.Build.VERSION.SDK_INT >= 33 && !prefs.getBoolean("askedNotify", false)) {
            prefs.edit().putBoolean("askedNotify", true).apply(); notify.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    LaunchedEffect(Unit) { updater.checkIfDue() }

    result?.let { r ->
        AlertDialog(onDismissRequest = { Updater.lastResult.value = null }, confirmButton = { TextButton({ Updater.lastResult.value = null }) { Text("OK") } },
            title = { Text("BlazeCam update") }, text = { Text(r) })
    }
    when (val s = state) {
        is UpdateState.Available -> AlertDialog(onDismissRequest = { updater.dismiss() },
            title = { Text("BlazeCam ${s.release.version} is available") },
            text = {
                Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("You have ${updater.currentVersion}. Download: ${size(s.release.downloadSize)}" +
                        (if (s.release.patchUrl != null) " (only the changes, instead of ${size(s.release.apkSize)})." else "."), style = MaterialTheme.typography.bodySmall)
                    if (s.release.notes.isNotBlank()) Text(s.release.notes, style = MaterialTheme.typography.bodyMedium)
                    if (updater.needsInstallPermission()) Text("Android will first ask you to allow BlazeCam to install updates. Turn it on, then come back and tap Update again.",
                        color = Tokens.warning, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton({
                if (updater.needsInstallPermission()) context.startActivity(updater.installPermissionIntent())
                else { askNotificationsOnce(); job = scope.launch { updater.downloadAndInstall(s.release) } }
            }) { Text("Update") } },
            dismissButton = { Row { TextButton({ updater.skip(s.release) }) { Text("Skip this version") }; TextButton({ updater.dismiss() }) { Text("Later") } } })
        is UpdateState.Downloading -> AlertDialog(onDismissRequest = {}, title = { Text(if (s.small) "Updating to ${s.release.version}" else "Downloading ${s.release.version}") },
            text = { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                LinearProgressIndicator(progress = { s.progress }, Modifier.fillMaxWidth())
                Text("${(s.progress * 100).toInt()}%" + if (s.small) "  ·  ${size(s.release.patchSize)} of changes" else "  ·  ${size(s.release.apkSize)}")
            } },
            confirmButton = { if (job != null) TextButton({ job?.cancel() }) { Text("Cancel") } })
        is UpdateState.Ready -> AlertDialog(onDismissRequest = { updater.dismiss() },
            title = { Text("BlazeCam ${s.release.version} is ready") },
            text = {
                Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Already downloaded and checked. Installing takes a few seconds; BlazeCam closes and opens again.", style = MaterialTheme.typography.bodySmall)
                    if (s.release.notes.isNotBlank()) Text(s.release.notes, style = MaterialTheme.typography.bodyMedium)
                    if (updater.needsInstallPermission()) Text("Android will first ask you to allow BlazeCam to install updates. Turn it on, then come back and tap Install again.",
                        color = Tokens.warning, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton({
                if (updater.needsInstallPermission()) context.startActivity(updater.installPermissionIntent())
                else { askNotificationsOnce(); job = null; scope.launch { updater.downloadAndInstall(s.release) } }
            }) { Text("Install now") } },
            dismissButton = { TextButton({ updater.dismiss() }) { Text("Later") } })
        UpdateState.Installing -> AlertDialog(onDismissRequest = {}, title = { Text("Installing") }, text = { Text("Checksum verified. Android is installing the update; BlazeCam will close and restart.") },
            confirmButton = {})
        else -> {}
    }
}

/** Settings section: current version, check now, automatic checks, releases page. */
@Composable
fun UpdateSettings() {
    val context = LocalContext.current
    val updater = (context.applicationContext as App).graph.updater
    val state by updater.state.collectAsState()
    val scope = rememberCoroutineScope()
    var auto by remember { mutableStateOf(updater.autoCheck) }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Installed version: ${updater.currentVersion}", style = MaterialTheme.typography.bodyMedium)
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Update automatically", style = MaterialTheme.typography.bodyLarge)
                Text("BlazeCam checks its public release list on GitHub when it opens (at most once an hour) and every few hours in the background, and downloads only the changes (usually under 1 MB; a full download waits for Wi-Fi). On Android 12 and newer it then installs the update by itself while you are not using BlazeCam. The very first update after installing from a browser still asks you once. Nothing about you or your photos is sent.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Switch(auto, { auto = it; updater.autoCheck = it })
        }
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button({ scope.launch { updater.check() } }, enabled = state !is UpdateState.Checking && state !is UpdateState.Downloading) { Text("Check for updates now") }
            TextButton({ context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://github.com/${UpdateSource.OWNER}/${UpdateSource.REPO}/releases"))) }) { Text("Releases") }
        }
        when (val s = state) {
            UpdateState.Checking -> Text("Checking GitHub...", style = MaterialTheme.typography.bodySmall)
            UpdateState.UpToDate -> Text("BlazeCam is up to date.", style = MaterialTheme.typography.bodySmall, color = Tokens.goldLight)
            is UpdateState.Failed -> Text(s.message, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
            else -> {}
        }
        if (!updater.canInstall) Text("This is a development build, so updates must be installed from the GitHub release page.", style = MaterialTheme.typography.bodySmall, color = Tokens.warning)
    }
}

private fun size(bytes: Long): String = if (bytes < 1_000_000) "${maxOf(1, bytes / 1000)} KB" else "%.1f MB".format(bytes / 1e6)
