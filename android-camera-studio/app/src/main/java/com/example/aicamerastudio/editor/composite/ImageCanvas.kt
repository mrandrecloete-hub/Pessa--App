package com.example.aicamerastudio.editor.composite

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculateCentroid
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateRotation
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import com.example.aicamerastudio.editor.masks.AlphaMask
import kotlin.math.min

enum class CanvasMode { VIEW, TAP, BRUSH_ADD, BRUSH_REMOVE, MOVE }

/** View zoom and pan of a canvas. Image point p is drawn at T + p * S. */
class CanvasTransform {
    var zoom by mutableFloatStateOf(1f)
    var pan by mutableStateOf(Offset.Zero)
    fun reset() { zoom = 1f; pan = Offset.Zero }
}

private fun fit(w: Float, h: Float, bw: Int, bh: Int): Pair<Float, Offset> {
    val s = min(w / bw, h / bh)
    return s to Offset((w - bw * s) / 2f, (h - bh * s) / 2f)
}

/**
 * Image canvas used by the composite studio. One finger: tap, brush or drag depending on [mode]
 * (coordinates are reported in image pixels). Two fingers: zoom and pan the view (or, in MOVE mode,
 * scale and rotate the placed layer through [onLayerTransform]).
 */
@Composable
fun ImageCanvas(
    base: ImageBitmap, overlay: ImageBitmap?, mode: CanvasMode, t: CanvasTransform, modifier: Modifier = Modifier,
    checker: Boolean = false, brushRadiusScreen: Float = 30f, description: String = "Photo",
    onTap: (Float, Float) -> Unit = { _, _ -> }, onStroke: (Float, Float, Float, Float, Float) -> Unit = { _, _, _, _, _ -> },
    /** Brush strokes in image pixels; the last value is the brush radius converted to image pixels. */
    onStrokeEnd: () -> Unit = {}, onDrag: (Float, Float) -> Unit = { _, _ -> }, onLayerTransform: (Float, Float) -> Unit = { _, _ -> }, onMoveEnd: () -> Unit = {},
) {
    val modeState = rememberUpdatedState(mode)
    var cursor by remember { mutableStateOf<Offset?>(null) }
    Canvas(modifier.semantics { contentDescription = description }.pointerInput(base.width, base.height) {
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false)
            val (s0, o0) = fit(size.width.toFloat(), size.height.toFloat(), base.width, base.height)
            fun toImg(p: Offset): Offset { val sc = s0 * t.zoom; val tt = o0 + t.pan; return Offset((p.x - tt.x) / sc, (p.y - tt.y) / sc) }
            var last = down.position; var moved = false; var multi = false
            val slop = viewConfiguration.touchSlop
            do {
                val ev = awaitPointerEvent()
                val pressed = ev.changes.filter { it.pressed }
                if (pressed.size >= 2) {
                    multi = true
                    val z = ev.calculateZoom(); val pan = ev.calculatePan(); val c = ev.calculateCentroid()
                    if (modeState.value == CanvasMode.MOVE) onLayerTransform(z, ev.calculateRotation())
                    else {
                        val tt = o0 + t.pan
                        val nz = (t.zoom * z).coerceIn(1f, 12f); val f = nz / t.zoom
                        val newT = c - (c - tt) * f + pan
                        t.zoom = nz; t.pan = newT - o0
                    }
                    ev.changes.forEach { it.consume() }
                } else if (!multi && pressed.size == 1) {
                    val p = pressed[0].position
                    if (!moved && (p - down.position).getDistance() > slop) moved = true
                    if (moved) {
                        val sc = s0 * t.zoom
                        when (modeState.value) {
                            CanvasMode.BRUSH_ADD, CanvasMode.BRUSH_REMOVE -> { val a = toImg(last); val b = toImg(p); onStroke(a.x, a.y, b.x, b.y, brushRadiusScreen / sc); cursor = p }
                            CanvasMode.MOVE -> onDrag((p.x - last.x) / sc, (p.y - last.y) / sc)
                            CanvasMode.VIEW, CanvasMode.TAP -> if (t.zoom > 1f) t.pan += (p - last)
                        }
                        pressed[0].consume()
                    }
                    last = p
                }
            } while (ev.changes.any { it.pressed })
            cursor = null
            if (!multi && !moved) { val i = toImg(down.position); if (i.x >= 0 && i.y >= 0 && i.x < base.width && i.y < base.height) onTap(i.x, i.y) }
            if (!multi && moved && (modeState.value == CanvasMode.BRUSH_ADD || modeState.value == CanvasMode.BRUSH_REMOVE)) onStrokeEnd()
            if ((moved || multi) && modeState.value == CanvasMode.MOVE) onMoveEnd()
        }
    }) {
        val (s0, o0) = fit(size.width, size.height, base.width, base.height)
        val sc = s0 * t.zoom; val tt = o0 + t.pan
        val dst = IntSize((base.width * sc).toInt().coerceAtLeast(1), (base.height * sc).toInt().coerceAtLeast(1))
        if (checker) drawChecker(tt, dst)
        drawImage(base, dstOffset = IntOffset(tt.x.toInt(), tt.y.toInt()), dstSize = dst)
        if (overlay != null) drawImage(overlay, dstOffset = IntOffset(tt.x.toInt(), tt.y.toInt()), dstSize = dst)
        cursor?.let { drawCircle(Color.White, brushRadiusScreen, it, style = Stroke(2f)) }
    }
}

private fun DrawScope.drawChecker(o: Offset, s: IntSize) {
    val cell = 16f
    var y = o.y; var row = 0
    while (y < o.y + s.height) {
        var x = o.x; var col = row % 2
        while (x < o.x + s.width) {
            drawRect(if (col % 2 == 0) Color(0xFF9E9E9E) else Color(0xFFE0E0E0), Offset(x, y),
                androidx.compose.ui.geometry.Size(min(cell, o.x + s.width - x), min(cell, o.y + s.height - y)))
            x += cell; col++
        }
        y += cell; row++
    }
}

/** Selection shown as a translucent tint (not colour only: the edge is also outlined by the tint boundary). */
fun maskOverlay(m: AlphaMask, argb: Int = 0xFFFF4060.toInt()): ImageBitmap {
    val px = IntArray(m.width * m.height)
    val rgb = argb and 0xFFFFFF
    for (i in px.indices) px[i] = ((m.data[i] * 140f).toInt().coerceIn(0, 255) shl 24) or rgb
    return Bitmap.createBitmap(px, m.width, m.height, Bitmap.Config.ARGB_8888).asImageBitmap()
}

/** The selected subject with a transparent background. */
fun cutout(px: IntArray, m: AlphaMask): ImageBitmap {
    val out = IntArray(px.size) { ((m.data[it] * 255f).toInt().coerceIn(0, 255) shl 24) or (px[it] and 0xFFFFFF) }
    return Bitmap.createBitmap(out, m.width, m.height, Bitmap.Config.ARGB_8888).asImageBitmap()
}

fun pixelsToImage(px: IntArray, w: Int, h: Int): ImageBitmap = Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888).asImageBitmap()
