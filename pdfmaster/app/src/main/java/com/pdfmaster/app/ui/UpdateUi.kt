package com.pdfmaster.app.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.pdfmaster.app.tools.human
import com.pdfmaster.app.update.UpdateState
import com.pdfmaster.app.update.Updater
import kotlinx.coroutines.launch

/** Shows an available or downloaded update, its progress and the result of the last install. */
@Composable
fun UpdateDialog() {
    val context = LocalContext.current
    val updater = remember { Updater.get(context) }
    val state by updater.state.collectAsState()
    val result by Updater.lastResult.collectAsState()
    val scope = rememberCoroutineScope()
    var job by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    LaunchedEffect(Unit) { updater.checkIfDue() }
    result?.let { r -> AlertDialog({ Updater.lastResult.value = null }, confirmButton = { TextButton({ Updater.lastResult.value = null }) { Text("OK") } }, title = { Text("PDFMASTER update") }, text = { Text(r) }) }
    when (val s = state) {
        is UpdateState.Available, is UpdateState.Ready -> {
            val r = if (s is UpdateState.Available) s.release else (s as UpdateState.Ready).release
            val ready = s is UpdateState.Ready
            AlertDialog({ updater.dismiss() }, title = { Text("PDFMASTER ${r.version} is ${if (ready) "ready" else "available"}") }, text = {
                Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(if (ready) "Already downloaded and checked. Installing takes a few seconds, then the app opens again. Your documents are kept." else "You have ${updater.currentVersion}. Download: ${human(r.apkSize)}. Your documents are kept.", style = MaterialTheme.typography.bodySmall)
                    if (r.notes.isNotBlank()) Text(r.notes, style = MaterialTheme.typography.bodyMedium)
                    if (updater.needsInstallPermission()) Text("Android will first ask you to allow PDFMASTER to install updates. Turn it on, come back and tap ${if (ready) "Install now" else "Update"} again.", color = MaterialTheme.colorScheme.tertiary, style = MaterialTheme.typography.bodySmall)
                }
            }, confirmButton = { TextButton({
                if (updater.needsInstallPermission()) context.startActivity(updater.installPermissionIntent()) else job = scope.launch { updater.downloadAndInstall(r) }
            }) { Text(if (ready) "Install now" else "Update") } },
                dismissButton = { Row { if (!ready) TextButton({ updater.skip(r) }) { Text("Skip this version") }; TextButton({ updater.dismiss() }) { Text("Later") } } })
        }
        is UpdateState.Downloading -> AlertDialog({}, title = { Text("Downloading ${s.release.version}") }, text = { Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            LinearProgressIndicator(progress = { s.progress }, Modifier.fillMaxWidth()); Text("${(s.progress * 100).toInt()}%  ·  ${human(s.release.apkSize)}") } },
            confirmButton = { TextButton({ job?.cancel() }) { Text("Cancel") } })
        UpdateState.Installing -> AlertDialog({}, title = { Text("Installing") }, text = { Text("Checksum verified. Android is installing the update and PDFMASTER will restart.") }, confirmButton = {})
        else -> {}
    }
}
