package com.example.aicamerastudio.editor.composite

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.example.aicamerastudio.core.design.LabeledSlider
import com.example.aicamerastudio.core.design.Tokens
import com.example.aicamerastudio.editor.masks.AlphaMask
import com.example.aicamerastudio.photo.enhancement.BitmapPixels
import com.example.aicamerastudio.photo.enhancement.ImageLoader

/** A photo decoded for interactive editing (long edge at most [maxEdge]) as ARGB pixels. */
class WorkImage(val uri: Uri, val px: IntArray, val w: Int, val h: Int, val fullW: Int, val fullH: Int) {
    companion object {
        fun load(context: Context, uri: Uri, maxEdge: Int): WorkImage {
            val (fw, fh) = ImageLoader.sizeOf(context.contentResolver, uri)
            val b = ImageLoader.decode(context.contentResolver, uri, maxEdge = maxEdge)
            val px = IntArray(b.width * b.height); BitmapPixels(b).readRows(0, b.height, px)
            val img = WorkImage(uri, px, b.width, b.height, if (fw > 0) fw else b.width, if (fh > 0) fh else b.height)
            b.recycle()
            return img
        }

        fun full(context: Context, uri: Uri): Triple<IntArray, Int, Int> {
            val b = ImageLoader.decode(context.contentResolver, uri)
            val px = IntArray(b.width * b.height); BitmapPixels(b).readRows(0, b.height, px)
            val r = Triple(px, b.width, b.height); b.recycle(); return r
        }
    }
}

fun bitmapOf(px: IntArray, w: Int, h: Int): Bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888).also { BitmapPixels(it).writeRows(0, h, px) }

/** Bounded undo / redo of mask edits (masks are stored as bytes to keep memory small). */
class MaskHistory(private val limit: Int = 15) {
    private val undo = ArrayDeque<ByteArray>(); private val redo = ArrayDeque<ByteArray>()
    val canUndo get() = undo.isNotEmpty(); val canRedo get() = redo.isNotEmpty()
    fun record(m: AlphaMask) { undo.addLast(m.toBytes()); if (undo.size > limit) undo.removeFirst(); redo.clear() }
    fun undo(cur: AlphaMask): AlphaMask? { val b = undo.removeLastOrNull() ?: return null; redo.addLast(cur.toBytes()); return AlphaMask.fromBytes(cur.width, cur.height, b) }
    fun redo(cur: AlphaMask): AlphaMask? { val b = redo.removeLastOrNull() ?: return null; undo.addLast(cur.toBytes()); return AlphaMask.fromBytes(cur.width, cur.height, b) }
}

/** Selection tools shared by both workflows. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SelectionTools(mode: CanvasMode, onMode: (CanvasMode) -> Unit, brush: Float, onBrush: (Float) -> Unit, extra: @Composable () -> Unit = {}) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            FilterChip(mode == CanvasMode.TAP, { onMode(CanvasMode.TAP) }, { Text("Tap to select") })
            FilterChip(mode == CanvasMode.BRUSH_ADD, { onMode(CanvasMode.BRUSH_ADD) }, { Text("Brush add") })
            FilterChip(mode == CanvasMode.BRUSH_REMOVE, { onMode(CanvasMode.BRUSH_REMOVE) }, { Text("Brush erase") })
            FilterChip(mode == CanvasMode.VIEW, { onMode(CanvasMode.VIEW) }, { Text("Pan") })
            extra()
        }
        if (mode == CanvasMode.BRUSH_ADD || mode == CanvasMode.BRUSH_REMOVE)
            LabeledSlider("Brush size", brush, 6f..120f, "${brush.toInt()} px", onBrush, modifier = Modifier.fillMaxWidth())
        Text("Two fingers zoom and pan to work on fine edges such as hair, fingers and glasses.", style = MaterialTheme.typography.bodySmall)
    }
}
