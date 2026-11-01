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

/** Shows an available update and its progress. Nothing is downloaded until the user taps Update. */
@Composable
fun UpdateDialog() {
    val context = LocalContext.current
    val updater = (context.applicationContext as App).graph.updater
    val state by updater.state.collectAsState()
    val result by Updater.lastResult.collectAsState()
    val scope = rememberCoroutineScope()
    var job by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
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
                    Text("You have ${updater.currentVersion}. Download: ${"%.1f".format(s.release.apkSize / 1e6)} MB.", style = MaterialTheme.typography.bodySmall)
                    if (s.release.notes.isNotBlank()) Text(s.release.notes, style = MaterialTheme.typography.bodyMedium)
                    if (updater.needsInstallPermission()) Text("Android will first ask you to allow BlazeCam to install updates. Turn it on, then come back and tap Update again.",
                        color = Tokens.warning, style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = { TextButton({
                if (updater.needsInstallPermission()) context.startActivity(updater.installPermissionIntent())
                else job = scope.launch { updater.downloadAndInstall(s.release) }
            }) { Text("Update") } },
            dismissButton = { Row { TextButton({ updater.skip(s.release) }) { Text("Skip this version") }; TextButton({ updater.dismiss() }) { Text("Later") } } })
        is UpdateState.Downloading -> AlertDialog(onDismissRequest = {}, title = { Text("Downloading ${s.release.version}") },
            text = { Column { LinearProgressIndicator(progress = { s.progress }, Modifier.fillMaxWidth()); Text("${(s.progress * 100).toInt()}%") } },
            confirmButton = { TextButton({ job?.cancel() }) { Text("Cancel") } })
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
                Text("Check for updates automatically", style = MaterialTheme.typography.bodyLarge)
                Text("Once a day, BlazeCam reads its public release list on GitHub. Nothing about you or your photos is sent. Updates install only when you tap Update.",
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
