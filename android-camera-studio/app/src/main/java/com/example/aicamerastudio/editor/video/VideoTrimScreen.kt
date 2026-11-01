package com.example.aicamerastudio.editor.video

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.Player
import androidx.media3.common.MediaItem as PlayerItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.transformer.*
import androidx.media3.transformer.Composition
import androidx.media3.ui.PlayerView
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.core.errors.*
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import kotlinx.coroutines.*
import java.io.File

@androidx.annotation.OptIn(UnstableApi::class)
private fun mapExportError(e: ExportException): AppError = when (e.errorCode) {
    ExportException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED, ExportException.ERROR_CODE_ENCODING_FORMAT_UNSUPPORTED,
    ExportException.ERROR_CODE_DECODER_INIT_FAILED, ExportException.ERROR_CODE_ENCODER_INIT_FAILED -> Errors.unsupportedCodec()
    ExportException.ERROR_CODE_IO_FILE_NOT_FOUND, ExportException.ERROR_CODE_IO_NO_PERMISSION -> Errors.invalidMedia()
    else -> Errors.exportFailed()
}

/** Frame accurate trim by re-encoding the selected range. Runs on the main looper as Transformer requires. */
@androidx.annotation.OptIn(UnstableApi::class)
private suspend fun exportTrim(context: android.content.Context, uri: Uri, cfg: TrimConfig, tmp: File, onProgress: (Float) -> Unit) = coroutineScope {
    val item = androidx.media3.common.MediaItem.Builder().setUri(uri).setClippingConfiguration(
        androidx.media3.common.MediaItem.ClippingConfiguration.Builder().setStartPositionMs(cfg.startMs).setEndPositionMs(cfg.endMs).build(),
    ).build()
    val edited = EditedMediaItem.Builder(item).setRemoveAudio(cfg.removeAudio).build()
    val done = CompletableDeferred<Unit>()
    val transformer = Transformer.Builder(context).addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) { done.complete(Unit) }
        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
            done.completeExceptionally(AppException(mapExportError(exportException), exportException))
        }
    }).build()
    val poller = launch {
        val holder = ProgressHolder()
        while (isActive) {
            if (transformer.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) onProgress(holder.progress / 100f)
            delay(200)
        }
    }
    try {
        transformer.start(edited, tmp.path)
        done.await()
    } finally {
        poller.cancel()
        if (!done.isCompleted) transformer.cancel()
    }
}

@androidx.annotation.OptIn(UnstableApi::class)
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoTrimScreen(uri: Uri, onBack: () -> Unit, onSaved: (Uri) -> Unit) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val scope = rememberCoroutineScope()
    var duration by remember { mutableLongStateOf(0L) }
    var range by remember { mutableStateOf(0f..1f) }
    var mute by remember { mutableStateOf(false) }
    var thumbs by remember { mutableStateOf<List<Bitmap>>(emptyList()) }
    var error by remember { mutableStateOf<AppError?>(null) }
    var progress by remember { mutableFloatStateOf(0f) }
    var exporting by remember { mutableStateOf(false) }
    var exportJob by remember { mutableStateOf<Job?>(null) }
    var playing by remember { mutableStateOf(false) }

    val player = remember(uri) { ExoPlayer.Builder(context).build().apply { setMediaItem(PlayerItem.fromUri(uri)); prepare() } }
    DisposableEffect(player) { onDispose { player.release() } }

    LaunchedEffect(uri) {
        withContext(Dispatchers.IO) {
            val r = MediaMetadataRetriever()
            try {
                r.setDataSource(context, uri)
                val d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
                if (d <= 0) throw AppException(Errors.invalidMedia())
                duration = d
                range = 0f..d.toFloat()
                thumbs = (0 until 8).mapNotNull { i ->
                    r.getScaledFrameAtTime(d * 1000L * i / 8, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 160, 90)
                }
            } catch (t: Throwable) { error = ErrorMapper.map(t) } finally { runCatching { r.release() } }
        }
    }
    val cfg = TrimConfig(duration, range.start.toLong(), range.endInclusive.toLong(), mute)
    val problem = if (duration > 0) TrimConfig.validate(cfg) else null

    LaunchedEffect(playing, cfg.endMs) {
        while (playing) {
            if (player.currentPosition >= cfg.endMs) { player.pause(); playing = false }
            delay(50)
        }
    }

    fun export() {
        exportJob = scope.launch {
            exporting = true; progress = 0f; error = null
            val tmp = File(context.cacheDir, "trim_${System.currentTimeMillis()}.mp4")
            try {
                graph.media.requireFree(MediaStoreRepository.MIN_VIDEO_FREE)
                exportTrim(context, uri, cfg, tmp) { progress = it }
                val out = withContext(Dispatchers.IO) {
                    // Integrity check: the exported file must open and have about the expected length.
                    val r = MediaMetadataRetriever()
                    try {
                        r.setDataSource(tmp.path)
                        val d = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
                        if (d <= 0 || kotlin.math.abs(d - cfg.durationMs) > 1500) throw AppException(Errors.exportFailed().copy(what = "The exported video did not pass the integrity check."))
                    } finally { runCatching { r.release() } }
                    graph.media.copyVideoInto(MediaStoreRepository.timestampName("AICS_", "_trim"), tmp)
                }
                onSaved(out)
            } catch (t: Throwable) {
                error = if (t is CancellationException) Errors.interrupted() else ErrorMapper.map(t)
            } finally {
                tmp.delete() // never leave partial or finished temp files behind
                exporting = false
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Trim video") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } })
        AndroidView({ PlayerView(it).apply { this.player = player } }, Modifier.weight(1f).fillMaxWidth())
        Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            error?.let { ErrorCard(it, onRetry = { export() }, onDismiss = { error = null }) }
            if (duration > 0) {
                Row(Modifier.fillMaxWidth().height(48.dp)) {
                    thumbs.forEach { Image(it.asImageBitmap(), null, Modifier.weight(1f).fillMaxHeight(), contentScale = ContentScale.Crop) }
                }
                RangeSlider(range, { r ->
                    val startMoved = r.start != range.start
                    range = r
                    if (startMoved) player.seekTo(r.start.toLong())
                }, valueRange = 0f..duration.toFloat(), enabled = !exporting,
                    modifier = Modifier.semantics { contentDescription = "Trim start and end" })
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("Start ${fmt(cfg.startMs)}"); Text("Length ${fmt(cfg.durationMs)}"); Text("End ${fmt(cfg.endMs)}")
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
                    FilledTonalIconButton({
                        if (playing) { player.pause(); playing = false } else { player.seekTo(cfg.startMs); player.play(); playing = true }
                    }) { Icon(if (playing) Icons.Default.Pause else Icons.Default.PlayArrow, if (playing) "Pause" else "Play selection") }
                    Text("Remove sound"); Switch(mute, { mute = it }, enabled = !exporting)
                }
                problem?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                if (exporting) {
                    LoadingIndicator("Exporting ${(progress * 100).toInt()}%", progress = progress)
                    TextButton({ exportJob?.cancel() }) { Text("Cancel export") }
                } else AppButton("Save trimmed copy", { export() }, Modifier.fillMaxWidth(), enabled = problem == null && !cfg.isFullClip)
                Text("The original video is never changed. The selected part is re-encoded into a new file, so cuts are frame accurate.", style = MaterialTheme.typography.bodySmall)
            } else if (error == null) LoadingIndicator("Reading video", modifier = Modifier.fillMaxWidth())
        }
    }
}

private fun fmt(ms: Long) = "%d:%02d.%d".format(ms / 60000, (ms / 1000) % 60, (ms % 1000) / 100)
