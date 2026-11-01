package com.example.aicamerastudio.photo.imaging

import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/** Resampling of ARGB pixels and float planes. Pure Kotlin. */
object Resample {
    private fun cubic(x: Float): Float { // Catmull-Rom
        val a = if (x < 0) -x else x
        return when {
            a < 1f -> 1.5f * a * a * a - 2.5f * a * a + 1f
            a < 2f -> -0.5f * a * a * a + 2.5f * a * a - 4f * a + 2f
            else -> 0f
        }
    }

    /** Bicubic (Catmull-Rom) resize, used for enlarging. Non-AI. */
    fun bicubic(src: IntArray, w: Int, h: Int, nw: Int, nh: Int): IntArray {
        val out = IntArray(nw * nh)
        val sx = w.toFloat() / nw; val sy = h.toFloat() / nh
        val wx = FloatArray(4); val ix = IntArray(4)
        for (y in 0 until nh) {
            val fy = (y + 0.5f) * sy - 0.5f
            val y0 = floor(fy).toInt(); val ty = fy - y0
            val wy0 = cubic(1 + ty); val wy1 = cubic(ty); val wy2 = cubic(1 - ty); val wy3 = cubic(2 - ty)
            val r0 = min(max(y0 - 1, 0), h - 1) * w; val r1 = min(max(y0, 0), h - 1) * w
            val r2 = min(max(y0 + 1, 0), h - 1) * w; val r3 = min(max(y0 + 2, 0), h - 1) * w
            for (x in 0 until nw) {
                val fx = (x + 0.5f) * sx - 0.5f
                val x0 = floor(fx).toInt(); val tx = fx - x0
                wx[0] = cubic(1 + tx); wx[1] = cubic(tx); wx[2] = cubic(1 - tx); wx[3] = cubic(2 - tx)
                for (k in 0..3) ix[k] = min(max(x0 - 1 + k, 0), w - 1)
                var r = 0f; var g = 0f; var b = 0f
                for (k in 0..3) {
                    val c0 = src[r0 + ix[k]]; val c1 = src[r1 + ix[k]]; val c2 = src[r2 + ix[k]]; val c3 = src[r3 + ix[k]]
                    val wk = wx[k]
                    r += wk * (wy0 * ((c0 shr 16) and 255) + wy1 * ((c1 shr 16) and 255) + wy2 * ((c2 shr 16) and 255) + wy3 * ((c3 shr 16) and 255))
                    g += wk * (wy0 * ((c0 shr 8) and 255) + wy1 * ((c1 shr 8) and 255) + wy2 * ((c2 shr 8) and 255) + wy3 * ((c3 shr 8) and 255))
                    b += wk * (wy0 * (c0 and 255) + wy1 * (c1 and 255) + wy2 * (c2 and 255) + wy3 * (c3 and 255))
                }
                out[y * nw + x] = (0xFF shl 24) or (clamp8(r) shl 16) or (clamp8(g) shl 8) or clamp8(b)
            }
        }
        return out
    }

    /** Box (area) average, used for shrinking. */
    fun area(src: IntArray, w: Int, h: Int, nw: Int, nh: Int): IntArray {
        val out = IntArray(nw * nh)
        for (y in 0 until nh) {
            val ya = (y.toLong() * h / nh).toInt(); val yb = max(ya + 1, ((y + 1).toLong() * h / nh).toInt())
            for (x in 0 until nw) {
                val xa = (x.toLong() * w / nw).toInt(); val xb = max(xa + 1, ((x + 1).toLong() * w / nw).toInt())
                var r = 0; var g = 0; var b = 0; var n = 0
                for (yy in ya until min(yb, h)) for (xx in xa until min(xb, w)) {
                    val c = src[yy * w + xx]; r += (c shr 16) and 255; g += (c shr 8) and 255; b += c and 255; n++
                }
                out[y * nw + x] = (0xFF shl 24) or ((r / n) shl 16) or ((g / n) shl 8) or (b / n)
            }
        }
        return out
    }

    fun resize(src: IntArray, w: Int, h: Int, nw: Int, nh: Int): IntArray = when {
        nw == w && nh == h -> src.copyOf()
        nw <= w && nh <= h -> area(src, w, h, nw, nh)
        else -> bicubic(src, w, h, nw, nh)
    }

    /** Bilinear resize of a float plane (masks, probabilities). */
    fun bilinear(src: FloatArray, w: Int, h: Int, nw: Int, nh: Int): FloatArray {
        val out = FloatArray(nw * nh)
        val sx = w.toFloat() / nw; val sy = h.toFloat() / nh
        for (y in 0 until nh) {
            val fy = ((y + 0.5f) * sy - 0.5f).coerceIn(0f, (h - 1).toFloat())
            val y0 = fy.toInt(); val y1 = min(y0 + 1, h - 1); val ty = fy - y0
            for (x in 0 until nw) {
                val fx = ((x + 0.5f) * sx - 0.5f).coerceIn(0f, (w - 1).toFloat())
                val x0 = fx.toInt(); val x1 = min(x0 + 1, w - 1); val tx = fx - x0
                val a = src[y0 * w + x0] + (src[y0 * w + x1] - src[y0 * w + x0]) * tx
                val b = src[y1 * w + x0] + (src[y1 * w + x1] - src[y1 * w + x0]) * tx
                out[y * nw + x] = a + (b - a) * ty
            }
        }
        return out
    }

    fun crop(src: IntArray, w: Int, x0: Int, y0: Int, cw: Int, ch: Int): IntArray {
        val out = IntArray(cw * ch)
        for (y in 0 until ch) System.arraycopy(src, (y0 + y) * w + x0, out, y * cw, cw)
        return out
    }

    fun cropF(src: FloatArray, w: Int, x0: Int, y0: Int, cw: Int, ch: Int): FloatArray {
        val out = FloatArray(cw * ch)
        for (y in 0 until ch) System.arraycopy(src, (y0 + y) * w + x0, out, y * cw, cw)
        return out
    }

    fun clamp8(v: Float): Int = if (v <= 0f) 0 else if (v >= 255f) 255 else (v + 0.5f).toInt()

    fun luma(px: IntArray): FloatArray = FloatArray(px.size) { i ->
        val c = px[i]; (0.299f * ((c shr 16) and 255) + 0.587f * ((c shr 8) and 255) + 0.114f * (c and 255)) / 255f
    }
}
