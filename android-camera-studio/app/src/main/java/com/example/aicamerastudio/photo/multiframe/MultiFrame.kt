package com.example.aicamerastudio.photo.multiframe

import com.example.aicamerastudio.photo.imaging.Resample
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Frame quality scoring: variance of the Laplacian (higher is sharper). */
object FrameScorer {
    fun sharpness(luma: FloatArray, w: Int, h: Int): Double {
        var s = 0.0; var s2 = 0.0; var n = 0
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x
            val l = (4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - w] - luma[i + w]).toDouble()
            s += l; s2 += l * l; n++
        }
        if (n == 0) return 0.0
        val m = s / n
        return s2 / n - m * m
    }
}

/** Translation alignment by coarse to fine block matching on luma pyramids. Rotation is not modelled. */
object FrameAligner {
    private fun down(l: FloatArray, w: Int, h: Int): Triple<FloatArray, Int, Int> {
        val nw = w / 2; val nh = h / 2
        return Triple(FloatArray(nw * nh) { i -> val x = i % nw; val y = i / nw
            (l[2 * y * w + 2 * x] + l[2 * y * w + 2 * x + 1] + l[(2 * y + 1) * w + 2 * x] + l[(2 * y + 1) * w + 2 * x + 1]) / 4f }, nw, nh)
    }

    private fun sad(a: FloatArray, b: FloatArray, w: Int, h: Int, dx: Int, dy: Int, margin: Int): Double {
        var s = 0.0; var n = 0
        val step = max(1, min(w, h) / 160)
        var y = margin
        while (y < h - margin) {
            val yy = y + dy
            if (yy in 0 until h) {
                var x = margin
                while (x < w - margin) {
                    val xx = x + dx
                    if (xx in 0 until w) { s += abs(a[y * w + x] - b[yy * w + xx]); n++ }
                    x += step
                }
            }
            y += step
        }
        return if (n == 0) Double.MAX_VALUE else s / n
    }

    private fun cost(a: FloatArray, b: FloatArray, w: Int, h: Int, dx: Int, dy: Int, margin: Int) =
        // Small preference for shorter shifts: hand shake between burst frames is small.
        sad(a, b, w, h, dx, dy, margin) * (1.0 + 0.004 * (abs(dx) + abs(dy)))

    /**
     * Returns (dx, dy) such that frame(x + dx, y + dy) matches ref(x, y). The four best candidates from
     * the coarsest level are all refined to full resolution, so repeating patterns (windows, fences)
     * cannot lock the search onto a shift one period away.
     */
    fun estimateShift(ref: FloatArray, img: FloatArray, w: Int, h: Int, maxShift: Int = 64): Pair<Int, Int> {
        val pyrA = arrayListOf(Triple(ref, w, h)); val pyrB = arrayListOf(Triple(img, w, h))
        while (min(pyrA.last().second, pyrA.last().third) > 64 && pyrA.size < 6) {
            pyrA += down(pyrA.last().first, pyrA.last().second, pyrA.last().third)
            pyrB += down(pyrB.last().first, pyrB.last().second, pyrB.last().third)
        }
        val top = pyrA.lastIndex
        val (ta, tw, th) = pyrA[top]; val tb = pyrB[top].first
        val range = max(2, maxShift shr top)
        val scored = ArrayList<Triple<Int, Int, Double>>()
        for (oy in -range..range) for (ox in -range..range) scored += Triple(ox, oy, cost(ta, tb, tw, th, ox, oy, min(tw, th) / 8))
        val seeds = ArrayList<Pair<Int, Int>>()
        for (c in scored.sortedBy { it.third }) {
            if (seeds.none { abs(it.first - c.first) <= 1 && abs(it.second - c.second) <= 1 }) seeds += c.first to c.second
            if (seeds.size == 4) break
        }
        var best = 0 to 0; var bestCost = Double.MAX_VALUE
        for (seed in seeds) {
            var dx = seed.first; var dy = seed.second
            for (lv in top - 1 downTo 0) {
                dx *= 2; dy *= 2
                val (a, lw, lh) = pyrA[lv]; val b = pyrB[lv].first
                var bc = Double.MAX_VALUE; var bx = dx; var by = dy
                for (oy in -2..2) for (ox in -2..2) {
                    val c = cost(a, b, lw, lh, dx + ox, dy + oy, min(lw, lh) / 8)
                    if (c < bc) { bc = c; bx = dx + ox; by = dy + oy }
                }
                dx = bx; dy = by
            }
            val final = cost(ref, img, w, h, dx, dy, min(w, h) / 8)
            if (final < bestCost) { bestCost = final; best = dx to dy }
        }
        return best
    }
}

data class MergeReport(
    val referenceIndex: Int,
    val framesGiven: Int,
    val framesUsed: Int,
    val rejectedBlurry: List<Int>,
    val shifts: List<Pair<Int, Int>>,
    /** Fraction of tile decisions where a frame was excluded because of motion (ghosting). */
    val ghostRejectedFraction: Float,
)

/**
 * Merges a burst into one lower noise frame: rejects blurred frames, aligns the rest to the sharpest,
 * and excludes, tile by tile, any frame whose content differs from the reference by more than noise
 * would explain (moving people, cars, leaves). Excluded tiles fall back to the reference, so moving
 * things never appear as ghosts.
 */
object FrameMerger {
    fun merge(frames: List<IntArray>, w: Int, h: Int, noiseSigma: Float, tile: Int = 32, blurRatio: Double = 0.6,
              reference: Int? = null, isCancelled: () -> Boolean = { false }): Pair<IntArray, MergeReport> {
        require(frames.isNotEmpty())
        val lumas = frames.map { Resample.luma(it) }
        val sharp = lumas.map { FrameScorer.sharpness(it, w, h) }
        val best = sharp.max()
        val refIdx = reference?.takeIf { it in frames.indices } ?: sharp.indices.maxByOrNull { sharp[it] }!!
        val blurry = sharp.indices.filter { it != refIdx && sharp[it] < best * blurRatio }
        val candidates = sharp.indices.filter { it != refIdx && it !in blurry }
        val shifts = MutableList(frames.size) { 0 to 0 }
        for (i in candidates) { if (isCancelled()) throw com.example.aicamerastudio.photo.pipeline.EnhancementCancelled(); shifts[i] = FrameAligner.estimateShift(lumas[refIdx], lumas[i], w, h) }
        val ref = frames[refIdx]; val refL = lumas[refIdx]
        val tx = (w + tile - 1) / tile; val ty = (h + tile - 1) / tile
        // Per frame, per tile acceptance (1 = use, 0 = ghost).
        val accept = Array(frames.size) { FloatArray(tx * ty) }
        var decisions = 0; var rejected = 0
        val thr = 3.0f * max(noiseSigma, 1f) / 255f + 0.01f
        for (f in candidates) {
            val (dx, dy) = shifts[f]; val l = lumas[f]
            for (j in 0 until ty) for (i in 0 until tx) {
                var s = 0f; var n = 0
                for (y in j * tile until min(h, (j + 1) * tile)) {
                    val yy = y + dy; if (yy !in 0 until h) continue
                    for (x in i * tile until min(w, (i + 1) * tile)) { val xx = x + dx; if (xx !in 0 until w) continue; s += abs(refL[y * w + x] - l[yy * w + xx]); n++ }
                }
                val ok = n > tile * tile / 2 && s / n < thr
                accept[f][j * tx + i] = if (ok) 1f else 0f
                decisions++; if (!ok) rejected++
            }
        }
        val out = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val c0 = ref[y * w + x]
            var r = ((c0 shr 16) and 255).toFloat(); var g = ((c0 shr 8) and 255).toFloat(); var b = (c0 and 255).toFloat(); var wsum = 1f
            // Smooth tile weights by bilinear interpolation between tile centres, to avoid visible seams.
            val gx = ((x + 0.5f) / tile - 0.5f).coerceIn(0f, tx - 1f); val gy = ((y + 0.5f) / tile - 0.5f).coerceIn(0f, ty - 1f)
            val ix = gx.toInt(); val iy = gy.toInt(); val fx = gx - ix; val fy = gy - iy
            val ix1 = min(ix + 1, tx - 1); val iy1 = min(iy + 1, ty - 1)
            for (f in candidates) {
                val a = accept[f]
                val wt = (a[iy * tx + ix] * (1 - fx) + a[iy * tx + ix1] * fx) * (1 - fy) + (a[iy1 * tx + ix] * (1 - fx) + a[iy1 * tx + ix1] * fx) * fy
                if (wt < 0.999f) continue // only blend where the frame is trusted everywhere nearby
                val (dx, dy) = shifts[f]; val xx = x + dx; val yy = y + dy
                if (xx !in 0 until w || yy !in 0 until h) continue
                val c = frames[f][yy * w + xx]
                r += ((c shr 16) and 255); g += ((c shr 8) and 255); b += (c and 255); wsum += 1f
            }
            out[y * w + x] = (0xFF shl 24) or (Resample.clamp8(r / wsum) shl 16) or (Resample.clamp8(g / wsum) shl 8) or Resample.clamp8(b / wsum)
        }
        return out to MergeReport(refIdx, frames.size, 1 + candidates.size, blurry, shifts, if (decisions == 0) 0f else rejected.toFloat() / decisions)
    }

    /** Expected noise reduction factor for n averaged frames: sqrt(n). */
    fun expectedNoiseFactor(n: Int) = sqrt(n.toFloat())
}
