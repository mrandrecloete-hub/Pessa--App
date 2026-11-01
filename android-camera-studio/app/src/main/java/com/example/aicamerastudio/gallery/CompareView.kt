package com.example.aicamerastudio.gallery

import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.core.design.ErrorCard
import com.example.aicamerastudio.core.design.LoadingIndicator
import com.example.aicamerastudio.core.design.Tokens
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.photo.enhancement.ImageLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class FileInfo(val name: String, val width: Int, val height: Int, val sizeBytes: Long, val dateMs: Long)

fun queryInfo(context: android.content.Context, uri: Uri): FileInfo? = runCatching {
    context.contentResolver.query(uri, arrayOf(
        android.provider.MediaStore.MediaColumns.DISPLAY_NAME, android.provider.MediaStore.MediaColumns.WIDTH,
        android.provider.MediaStore.MediaColumns.HEIGHT, android.provider.MediaStore.MediaColumns.SIZE,
        android.provider.MediaStore.MediaColumns.DATE_ADDED), null, null, null)?.use { c ->
        if (c.moveToFirst()) FileInfo(c.getString(0).orEmpty(), c.getInt(1), c.getInt(2), c.getLong(3), c.getLong(4) * 1000) else null
    }
}.getOrNull()

/** Compares the real original and processed files, with a draggable divider or side by side. Pinch to zoom, drag to pan. */
@Composable
fun CompareView(originalUri: Uri, processedUri: Uri, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var original by remember { mutableStateOf<Bitmap?>(null) }
    var processed by remember { mutableStateOf<Bitmap?>(null) }
    var error by remember { mutableStateOf<AppError?>(null) }
    var sideBySide by remember { mutableStateOf(false) }
    var divider by remember { mutableFloatStateOf(0.5f) }
    var scale by remember { mutableFloatStateOf(1f) }
    var pan by remember { mutableStateOf(Offset.Zero) }

    LaunchedEffect(originalUri, processedUri) {
        try {
            withContext(Dispatchers.IO) {
                original = ImageLoader.decode(context.contentResolver, originalUri, maxEdge = 2048)
                processed = ImageLoader.decode(context.contentResolver, processedUri, maxEdge = 2048)
            }
        } catch (t: Throwable) {
            if (t is kotlinx.coroutines.CancellationException) throw t
            error = ErrorMapper.map(t).copy(what = "The original or the processed photo could not be loaded. It may have been deleted.", retryable = false)
        }
    }
    val infoA = remember(originalUri) { queryInfo(context, originalUri) }
    val infoB = remember(processedUri) { queryInfo(context, processedUri) }

    Column(modifier) {
        error?.let { ErrorCard(it, Modifier.padding(Tokens.spaceMd)); return@Column }
        val o = original; val p = processed
        if (o == null || p == null) { LoadingIndicator("Loading both versions", modifier = Modifier.fillMaxWidth().padding(Tokens.spaceLg)); return@Column }
        Row(Modifier.fillMaxWidth().padding(horizontal = Tokens.spaceMd), verticalAlignment = Alignment.CenterVertically) {
            FilterChip(!sideBySide, { sideBySide = false }, { Text("Slider") })
            Spacer(Modifier.width(Tokens.spaceSm))
            FilterChip(sideBySide, { sideBySide = true }, { Text("Side by side") })
            Spacer(Modifier.weight(1f))
            TextButton({ scale = 1f; pan = Offset.Zero }) { Text("Reset zoom") }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            if (sideBySide) {
                Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                    listOf(o to "Original", p to "Processed").forEach { (b, label) ->
                        Box(Modifier.weight(1f).fillMaxHeight().pointerInput(Unit) {
                            detectTransformGestures { _, g, z, _ -> scale = (scale * z).coerceIn(1f, 8f); pan += g }
                        }) {
                            Image(b.asImageBitmap(), "$label photo", Modifier.fillMaxSize().graphicsLayerZoom(scale, pan), contentScale = ContentScale.Fit)
                            Text(label, Modifier.align(Alignment.TopStart).padding(6.dp), color = Color.White, style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }
            } else {
                Canvas(Modifier.fillMaxSize().pointerInput(Unit) {
                    detectTransformGestures { _, g, z, _ -> scale = (scale * z).coerceIn(1f, 8f); pan += g }
                }.semantics { contentDescription = "Before and after comparison. Original on the left, processed on the right." }) {
                    fun fit(b: Bitmap): Pair<Offset, Float> {
                        val s = minOf(size.width / b.width, size.height / b.height)
                        return Offset((size.width - b.width * s) / 2, (size.height - b.height * s) / 2) to s
                    }
                    fun drawFitted(b: Bitmap) {
                        val (off, s) = fit(b)
                        withTransform({ translate(pan.x, pan.y); scale(scaleX = scale, scaleY = scale, pivot = Offset(size.width / 2, size.height / 2)) }) {
                            drawImage(b.asImageBitmap(), dstOffset = IntOffset(off.x.toInt(), off.y.toInt()),
                                dstSize = IntSize((b.width * s).toInt(), (b.height * s).toInt()))
                        }
                    }
                    drawFitted(p)
                    val x = size.width * divider
                    clipRect(right = x) { drawFitted(o) }
                    drawLine(Color.White, Offset(x, 0f), Offset(x, size.height), 3.dp.toPx())
                    drawCircle(Color.White, 16.dp.toPx(), Offset(x, size.height / 2))
                }
                // Dedicated drag strip for the divider so it never fights with pan gestures.
                Slider(divider, { divider = it }, Modifier.align(Alignment.BottomCenter).padding(horizontal = Tokens.spaceLg).semantics { contentDescription = "Comparison divider" })
                Text("Original", Modifier.align(Alignment.TopStart).padding(8.dp), color = Color.White, style = MaterialTheme.typography.labelLarge)
                Text("Processed", Modifier.align(Alignment.TopEnd).padding(8.dp), color = Color.White, style = MaterialTheme.typography.labelLarge)
            }
        }
        Row(Modifier.fillMaxWidth().padding(Tokens.spaceMd), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
            listOf("Original" to infoA, "Processed" to infoB).forEach { (t, i) ->
                Column(Modifier.weight(1f)) {
                    Text(t, style = MaterialTheme.typography.labelLarge)
                    Text(if (i == null) "Details unavailable" else "${i.width} × ${i.height}\n${formatSize(i.sizeBytes)}", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

private fun Modifier.graphicsLayerZoom(scale: Float, pan: Offset) = this.then(
    Modifier.graphicsLayer(scaleX = scale, scaleY = scale, translationX = pan.x, translationY = pan.y),
)
