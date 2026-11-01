package com.example.aicamerastudio.photo.hdr

import com.example.aicamerastudio.photo.imaging.Resample
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min

/**
 * Exposure fusion (Mertens, Kautz and Van Reeth, 2007): blends differently exposed frames using
 * per pixel weights for contrast, saturation and well exposedness, merged through Laplacian pyramids
 * so there are no seams. Produces an ordinary 8 bit photo directly (no tone mapping step). Frames must
 * be aligned (see FrameAligner) and the same size.
 */
object ExposureFusion {
    private class Plane(val w: Int, val h: Int, val d: FloatArray)

    /**
     * [reference] is the normally exposed frame; it gets [referenceBias] times more weight so dark areas
     * are not pulled toward the underexposed frame (plain Mertens weights can crush near black shadows).
     */
    fun fuse(frames: List<IntArray>, w: Int, h: Int, levels: Int = 0, reference: Int = frames.size / 2, referenceBias: Float = 3f): IntArray {
        require(frames.isNotEmpty())
        if (frames.size == 1) return frames[0].copyOf()
        val n = frames.size
        // Weights
        val weights = frames.mapIndexed { idx, px ->
            val bias = if (idx == reference) referenceBias else 1f
            val l = Resample.luma(px)
            FloatArray(w * h) { i ->
                val x = i % w; val y = i / w
                val lap = if (x in 1 until w - 1 && y in 1 until h - 1) abs(4 * l[i] - l[i - 1] - l[i + 1] - l[i - w] - l[i + w]) else 0f
                val c = px[i]; val r = ((c shr 16) and 255) / 255f; val g = ((c shr 8) and 255) / 255f; val b = (c and 255) / 255f
                val m = (r + g + b) / 3f
                val sat = kotlin.math.sqrt(((r - m) * (r - m) + (g - m) * (g - m) + (b - m) * (b - m)) / 3f)
                fun we(v: Float) = exp(-((v - 0.5f) * (v - 0.5f)) / (2 * 0.2f * 0.2f))
                bias * ((lap + 1e-3f) * (sat + 1e-3f) * we(r) * we(g) * we(b) + 1e-6f)
            }
        }
        for (i in 0 until w * h) { var s = 0f; for (k in 0 until n) s += weights[k][i]; for (k in 0 until n) weights[k][i] /= s }
        val lv = if (levels > 0) levels else max(1, (Math.log(min(w, h).toDouble()) / Math.log(2.0)).toInt() - 5)
        val outCh = Array(3) { ch ->
            var acc: List<Plane>? = null
            for (k in 0 until n) {
                val plane = Plane(w, h, FloatArray(w * h) { ((frames[k][it] shr (16 - 8 * ch)) and 255) / 255f })
                val lap = laplacianPyramid(plane, lv)
                val gw = gaussianPyramid(Plane(w, h, weights[k]), lv)
                val contrib = lap.indices.map { i -> Plane(lap[i].w, lap[i].h, FloatArray(lap[i].d.size) { j -> lap[i].d[j] * gw[i].d[j] }) }
                acc = acc?.mapIndexed { i, p -> Plane(p.w, p.h, FloatArray(p.d.size) { j -> p.d[j] + contrib[i].d[j] }) } ?: contrib
            }
            collapse(acc!!)
        }
        return IntArray(w * h) { i ->
            (0xFF shl 24) or (Resample.clamp8(outCh[0].d[i] * 255f) shl 16) or (Resample.clamp8(outCh[1].d[i] * 255f) shl 8) or Resample.clamp8(outCh[2].d[i] * 255f)
        }
    }

    private fun down(p: Plane): Plane {
        val nw = max(1, (p.w + 1) / 2); val nh = max(1, (p.h + 1) / 2)
        val b = blur(p)
        return Plane(nw, nh, FloatArray(nw * nh) { i -> b.d[min(2 * (i / nw), p.h - 1) * p.w + min(2 * (i % nw), p.w - 1)] })
    }

    private fun up(p: Plane, w: Int, h: Int): Plane =
        Plane(w, h, Resample.bilinear(p.d, p.w, p.h, w, h))

    private fun blur(p: Plane): Plane {
        val k = floatArrayOf(1f, 4f, 6f, 4f, 1f); val tmp = FloatArray(p.d.size); val out = FloatArray(p.d.size)
        for (y in 0 until p.h) for (x in 0 until p.w) { var s = 0f; for (j in -2..2) s += k[j + 2] * p.d[y * p.w + min(max(x + j, 0), p.w - 1)]; tmp[y * p.w + x] = s / 16f }
        for (y in 0 until p.h) for (x in 0 until p.w) { var s = 0f; for (j in -2..2) s += k[j + 2] * tmp[min(max(y + j, 0), p.h - 1) * p.w + x]; out[y * p.w + x] = s / 16f }
        return Plane(p.w, p.h, out)
    }

    private fun gaussianPyramid(p: Plane, levels: Int): List<Plane> {
        val out = arrayListOf(p); repeat(levels) { out += down(out.last()) }; return out
    }

    private fun laplacianPyramid(p: Plane, levels: Int): List<Plane> {
        val g = gaussianPyramid(p, levels)
        return g.indices.map { i ->
            if (i == g.lastIndex) g[i] else { val u = up(g[i + 1], g[i].w, g[i].h); Plane(g[i].w, g[i].h, FloatArray(g[i].d.size) { j -> g[i].d[j] - u.d[j] }) }
        }
    }

    private fun collapse(l: List<Plane>): Plane {
        var cur = l.last()
        for (i in l.lastIndex - 1 downTo 0) { val u = up(cur, l[i].w, l[i].h); cur = Plane(l[i].w, l[i].h, FloatArray(l[i].d.size) { j -> l[i].d[j] + u.d[j] }) }
        return cur
    }
}
