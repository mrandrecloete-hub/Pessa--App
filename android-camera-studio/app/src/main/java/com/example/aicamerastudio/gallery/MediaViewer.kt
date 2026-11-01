package com.example.aicamerastudio.gallery

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem as PlayerItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.data.database.MediaAsset
import com.example.aicamerastudio.data.preferences.UserPreferences
import com.example.aicamerastudio.photo.enhancement.EnhanceWorker
import com.example.aicamerastudio.photo.enhancement.ImageLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@androidx.annotation.OptIn(UnstableApi::class)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaViewer(
    uri: Uri, isVideo: Boolean, prefs: UserPreferences,
    onBack: () -> Unit, onEdit: (Uri) -> Unit, onTrim: (Uri) -> Unit,
) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val info = remember(uri) { queryInfo(context, uri) }
    var pair by remember { mutableStateOf<MediaAsset?>(null) }       // asset where this is the processed file
    var counterpart by remember { mutableStateOf<MediaAsset?>(null) } // asset where this is the original
    var comparing by remember { mutableStateOf(false) }
    var showInfo by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }
    var error by remember { mutableStateOf<AppError?>(null) }
    var scale by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }

    LaunchedEffect(uri) {
        pair = graph.database.assets().byProcessed(uri.toString())
        counterpart = graph.database.assets().latestFor(uri.toString())
        if (!isVideo) {
            try { bitmap = withContext(Dispatchers.IO) { ImageLoader.decode(context.contentResolver, uri, maxEdge = 2560) } }
            catch (t: Throwable) { if (t is kotlinx.coroutines.CancellationException) throw t; error = ErrorMapper.map(t) }
        }
    }
    val workFlow = remember(uri) { WorkManager.getInstance(context).getWorkInfosForUniqueWorkFlow(EnhanceWorker.uniqueName(uri)) }
    val work by workFlow.collectAsState(initial = emptyList())
    val w = work.firstOrNull()
    val running = w?.state == WorkInfo.State.RUNNING || w?.state == WorkInfo.State.ENQUEUED
    val otherUri: Uri? = (pair?.originalUri ?: counterpart?.processedUri)?.let(Uri::parse)
    val originalUri = if (pair != null) otherUri else uri
    val processedUri = if (pair != null) uri else otherUri

    Scaffold(topBar = {
        TopAppBar(title = { Text(info?.name ?: "Viewer", maxLines = 1) }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } },
            actions = {
                IconButton({ showInfo = true }) { Icon(Icons.Default.Info, "Details") }
                IconButton({
                    val send = Intent(Intent.ACTION_SEND).apply { type = if (isVideo) "video/*" else "image/*"; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                    context.startActivity(Intent.createChooser(send, "Share"))
                }) { Icon(Icons.Default.Share, "Share") }
                IconButton({ confirmDelete = true }) { Icon(Icons.Default.Delete, "Delete") }
            })
    }) { pad ->
        Column(Modifier.padding(pad).fillMaxSize()) {
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when {
                    comparing && originalUri != null && processedUri != null -> CompareView(originalUri, processedUri, Modifier.fillMaxSize())
                    isVideo -> VideoPlayer(uri)
                    error != null -> ErrorCard(error!!, Modifier.padding(Tokens.spaceMd))
                    bitmap == null -> LoadingIndicator("Opening photo", modifier = Modifier.align(Alignment.Center))
                    else -> Image(bitmap!!.asImageBitmap(), "Photo", Modifier.fillMaxSize()
                        .pointerInput(Unit) { detectTransformGestures { _, g, z, _ -> scale = (scale * z).coerceIn(1f, 8f); pan = if (scale == 1f) Offset.Zero else pan + g } }
                        .graphicsLayer(scaleX = scale, scaleY = scale, translationX = pan.x, translationY = pan.y), contentScale = ContentScale.Fit)
                }
            }
            if (running) {
                val p = w?.progress?.getFloat(EnhanceWorker.K_PROGRESS, 0f) ?: 0f
                Column(Modifier.padding(horizontal = Tokens.spaceMd, vertical = Tokens.spaceSm)) {
                    LoadingIndicator(if (w?.state == WorkInfo.State.ENQUEUED) "Enhancement is queued" else "Enhancing ${(p * 100).toInt()}%", progress = if (w?.state == WorkInfo.State.RUNNING) p else null)
                    TextButton({ EnhanceWorker.cancel(context, uri) }) { Text("Cancel") }
                }
            } else if (w?.state == WorkInfo.State.FAILED) {
                Text(w.outputData.getString(EnhanceWorker.K_ERROR) ?: "Enhancement failed. Your original is safe.", Modifier.padding(Tokens.spaceMd), color = MaterialTheme.colorScheme.error)
            } else if (w?.state == WorkInfo.State.SUCCEEDED) {
                Text("Enhanced copy saved in the gallery. " + w.outputData.getString(EnhanceWorker.K_NOTES).orEmpty() +
                    " Took ${w.outputData.getLong(EnhanceWorker.K_MS, 0) / 1000.0} s.", Modifier.padding(Tokens.spaceMd), style = MaterialTheme.typography.bodySmall)
            }
            Row(Modifier.fillMaxWidth().padding(Tokens.spaceSm), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm, Alignment.CenterHorizontally)) {
                if (!isVideo) {
                    if (originalUri != null && processedUri != null) AppButton(if (comparing) "Close compare" else "Before and after", { comparing = !comparing }, primary = false)
                    if (pair == null) AppButton("Enhance", { EnhanceWorker.enqueue(context, uri, prefs) }, enabled = !running)
                    AppButton("Edit", { onEdit(uri) }, primary = false)
                } else AppButton("Trim", { onTrim(uri) })
            }
        }
    }
    if (confirmDelete) ConfirmDialog("Delete this ${if (isVideo) "video" else "photo"}?", "It will be removed from this device. This cannot be undone.", "Delete",
        onConfirm = { graph.media.delete(uri); confirmDelete = false; onBack() }, onDismiss = { confirmDelete = false })
    if (showInfo) AlertDialog(onDismissRequest = { showInfo = false }, confirmButton = { TextButton({ showInfo = false }) { Text("Close") } },
        title = { Text("Details") }, text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(info?.name ?: "Unknown")
                if (info != null) { Text("${info.width} × ${info.height}"); Text(formatSize(info.sizeBytes)); Text(formatDate(info.dateMs)) }
                pair?.let { a ->
                    Text("Profile: ${a.profile ?: "none"}"); Text("Processing time: ${a.processingMs / 1000.0} s")
                    a.note?.let { Text("Notes: $it") }
                }
                Text("Location is never added or copied by this app.", style = MaterialTheme.typography.bodySmall)
            }
        })
}

@androidx.annotation.OptIn(UnstableApi::class)
@Composable
private fun VideoPlayer(uri: Uri) {
    val context = LocalContext.current
    val player = remember(uri) { ExoPlayer.Builder(context).build().apply { setMediaItem(PlayerItem.fromUri(uri)); prepare() } }
    DisposableEffect(player) { onDispose { player.release() } }
    AndroidView({ PlayerView(it).apply { this.player = player } }, Modifier.fillMaxSize())
}
