package com.example.aicamerastudio.photo.inpainting

import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.pipeline.ArrayPixels
import com.example.aicamerastudio.photo.pipeline.EnhancementCancelled
import com.example.aicamerastudio.photo.pipeline.ImageAnalyzer
import java.util.Random
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Exemplar based image completion: multi scale PatchMatch (Barnes et al. 2009) with
 * expectation-maximisation voting (Wexler et al. 2007). The hole is rebuilt only from patches that
 * exist elsewhere in the same photo, so it can continue textures, lines and patterns, but it cannot
 * know what was really hidden.
 */
object PatchInpainter {
    data class Params(val patchRadius: Int = 3, val coarseEm: Int = 6, val fineEm: Int = 2, val pmIterations: Int = 3, val seed: Long = 42)

    private class Level(val w: Int, val h: Int, val px: IntArray, val hole: BooleanArray)

    fun inpaint(src: IntArray, w: Int, h: Int, hole: BooleanArray, p: Params = Params(),
                progress: (Float) -> Unit = {}, isCancelled: () -> Boolean = { false }): IntArray {
        if (hole.none { it }) return src.copyOf()
        val levels = ArrayList<Level>()
        levels += Level(w, h, src.copyOf(), hole.copyOf())
        while (true) {
            val l = levels.last()
            if (min(l.w, l.h) / 2 < 4 * (2 * p.patchRadius + 1) || max(l.w, l.h) / 2 < 48) break
            levels += downsample(l)
        }
        val rnd = Random(p.seed)
        var nnx: IntArray? = null; var nny: IntArray? = null; var prevW = 0
        var cur: IntArray? = null
        val total = levels.size
        for (li in levels.indices.reversed()) {
            if (isCancelled()) throw EnhancementCancelled()
            val lv = levels[li]
            val img = lv.px.copyOf()
            if (cur == null) {
                diffusionFill(img, lv.w, lv.h, lv.hole)
            } else {
                val coarse = levels[li + 1]
                for (y in 0 until lv.h) for (x in 0 until lv.w) {
                    val i = y * lv.w + x
                    if (lv.hole[i]) img[i] = cur[min(y / 2, coarse.h - 1) * coarse.w + min(x / 2, coarse.w - 1)]
                }
            }
            val em = if (li == levels.lastIndex) p.coarseEm else max(p.fineEm, p.coarseEm - (levels.lastIndex - li))
            val result = solveLevel(img, lv.w, lv.h, lv.hole, p, em, rnd, nnx, nny, prevW, isCancelled)
            cur = img
            nnx = result.first; nny = result.second; prevW = lv.w
            progress((total - li).toFloat() / total)
        }
        val out = src.copyOf()
        for (i in out.indices) if (hole[i]) out[i] = cur!![i]
        return out
    }

    private fun downsample(l: Level): Level {
        val nw = l.w / 2; val nh = l.h / 2
        val px = IntArray(nw * nh); val hole = BooleanArray(nw * nh)
        for (y in 0 until nh) for (x in 0 until nw) {
            var r = 0; var g = 0; var b = 0; var n = 0; var anyHole = false
            for (dy in 0..1) for (dx in 0..1) {
                val i = (2 * y + dy) * l.w + 2 * x + dx
                if (l.hole[i]) { anyHole = true; continue }
                val c = l.px[i]; r += (c shr 16) and 255; g += (c shr 8) and 255; b += c and 255; n++
            }
            hole[y * nw + x] = anyHole
            px[y * nw + x] = if (n == 0) 0xFF000000.toInt() else (0xFF shl 24) or ((r / n) shl 16) or ((g / n) shl 8) or (b / n)
        }
        return Level(nw, nh, px, hole)
    }

    /** Onion peel diffusion: fills the hole from its border inwards with neighbour averages. */
    private fun diffusionFill(img: IntArray, w: Int, h: Int, hole: BooleanArray) {
        val known = BooleanArray(w * h) { !hole[it] }
        var remaining = hole.count { it }
        if (remaining == w * h) return
        val next = ArrayList<Int>()
        while (remaining > 0) {
            next.clear()
            for (y in 0 until h) for (x in 0 until w) {
                val i = y * w + x
                if (known[i]) continue
                var r = 0; var g = 0; var b = 0; var n = 0
                for (dy in -1..1) for (dx in -1..1) {
                    val xx = x + dx; val yy = y + dy
                    if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
                    val j = yy * w + xx
                    if (!known[j]) continue
                    val c = img[j]; r += (c shr 16) and 255; g += (c shr 8) and 255; b += c and 255; n++
                }
                if (n > 0) { img[i] = (0xFF shl 24) or ((r / n) shl 16) or ((g / n) shl 8) or (b / n); next += i }
            }
            if (next.isEmpty()) break
            for (i in next) known[i] = true
            remaining -= next.size
        }
    }

    private fun solveLevel(img: IntArray, w: Int, h: Int, hole: BooleanArray, p: Params, emIters: Int, rnd: Random,
                           prevX: IntArray?, prevY: IntArray?, prevW: Int, isCancelled: () -> Boolean): Pair<IntArray, IntArray> {
        val pr = p.patchRadius
        // Integral image of hole pixels, to test "patch fully known" in O(1).
        val integ = IntArray((w + 1) * (h + 1))
        for (y in 0 until h) { var s = 0; for (x in 0 until w) { if (hole[y * w + x]) s++; integ[(y + 1) * (w + 1) + x + 1] = integ[y * (w + 1) + x + 1] + s } }
        fun holeCount(x0: Int, y0: Int, x1: Int, y1: Int) = integ[(y1 + 1) * (w + 1) + x1 + 1] - integ[y0 * (w + 1) + x1 + 1] - integ[(y1 + 1) * (w + 1) + x0] + integ[y0 * (w + 1) + x0]
        val srcOk = BooleanArray(w * h)
        val srcList = ArrayList<Int>()
        for (y in pr until h - pr) for (x in pr until w - pr) if (holeCount(x - pr, y - pr, x + pr, y + pr) == 0) { srcOk[y * w + x] = true; srcList += y * w + x }
        if (srcList.isEmpty()) return IntArray(0) to IntArray(0) // nothing to copy from: keep the diffusion fill
        val isTarget = BooleanArray(w * h)
        val targets = ArrayList<Int>()
        for (y in 0 until h) for (x in 0 until w) {
            if (holeCount(max(0, x - pr), max(0, y - pr), min(w - 1, x + pr), min(h - 1, y + pr)) > 0) { isTarget[y * w + x] = true; targets += y * w + x }
        }
        val nx = IntArray(w * h); val ny = IntArray(w * h); val nd = LongArray(w * h)

        fun dist(cx: Int, cy: Int, sx: Int, sy: Int, limit: Long): Long {
            var d = 0L
            for (dy in -pr..pr) {
                val ty = cy + dy; if (ty < 0 || ty >= h) continue
                val trow = ty * w; val srow = (sy + dy) * w
                for (dx in -pr..pr) {
                    val tx = cx + dx; if (tx < 0 || tx >= w) continue
                    val a = img[trow + tx]; val b = img[srow + sx + dx]
                    val dr = ((a shr 16) and 255) - ((b shr 16) and 255)
                    val dg = ((a shr 8) and 255) - ((b shr 8) and 255)
                    val db = (a and 255) - (b and 255)
                    d += (dr * dr + dg * dg + db * db).toLong()
                }
                if (d >= limit) return d
            }
            return d
        }

        // Initialise: from the coarser level's field when available, otherwise randomly.
        for (c in targets) {
            val x = c % w; val y = c / w
            var sx = -1; var sy = -1
            if (prevX != null && prevX.isNotEmpty() && prevY != null && prevW > 0) {
                val pi = min(y / 2, prevX.size / prevW - 1) * prevW + min(x / 2, prevW - 1)
                val cx = prevX[pi] * 2 + (x and 1); val cy = prevY[pi] * 2 + (y and 1)
                if (cx in 0 until w && cy in 0 until h && srcOk[cy * w + cx]) { sx = cx; sy = cy }
            }
            if (sx < 0) { val s = srcList[rnd.nextInt(srcList.size)]; sx = s % w; sy = s / w }
            nx[c] = sx; ny[c] = sy; nd[c] = dist(x, y, sx, sy, Long.MAX_VALUE)
        }
        val maxR = max(w, h)
        val ord = targets.toIntArray()
        for (em in 0 until emIters) {
            if (isCancelled()) throw EnhancementCancelled()
            for (c in ord) nd[c] = dist(c % w, c / w, nx[c], ny[c], Long.MAX_VALUE)
            for (it in 0 until p.pmIterations) {
                val fwd = it % 2 == 0
                val step = if (fwd) 1 else -1
                var k = if (fwd) 0 else ord.size - 1
                while (k in ord.indices) {
                    val c = ord[k]; k += step
                    val x = c % w; val y = c / w
                    var bx = nx[c]; var by = ny[c]; var bd = nd[c]
                    // propagation from the previous neighbour in scan order
                    val px = x - step; val py = y - step
                    if (px in 0 until w && isTarget[y * w + px]) {
                        val cx = nx[y * w + px] + step; val cy = ny[y * w + px]
                        if (cx in 0 until w && srcOk[cy * w + cx]) { val d = dist(x, y, cx, cy, bd); if (d < bd) { bd = d; bx = cx; by = cy } }
                    }
                    if (py in 0 until h && isTarget[py * w + x]) {
                        val cx = nx[py * w + x]; val cy = ny[py * w + x] + step
                        if (cy in 0 until h && srcOk[cy * w + cx]) { val d = dist(x, y, cx, cy, bd); if (d < bd) { bd = d; bx = cx; by = cy } }
                    }
                    // random search in shrinking windows
                    var r = maxR
                    while (r >= 1) {
                        val cx = (bx + rnd.nextInt(2 * r + 1) - r).coerceIn(pr, w - 1 - pr)
                        val cy = (by + rnd.nextInt(2 * r + 1) - r).coerceIn(pr, h - 1 - pr)
                        if (srcOk[cy * w + cx]) { val d = dist(x, y, cx, cy, bd); if (d < bd) { bd = d; bx = cx; by = cy } }
                        r /= 2
                    }
                    nx[c] = bx; ny[c] = by; nd[c] = bd
                }
            }
            // Voting: each hole pixel becomes the weighted average of the matched patches covering it.
            val sorted = ord.map { nd[it] }.sorted()
            val sigma2 = max(1.0, sorted[(sorted.size * 3) / 4].toDouble())
            val ar = FloatArray(w * h); val ag = FloatArray(w * h); val ab = FloatArray(w * h); val aw = FloatArray(w * h)
            for (c in ord) {
                val x = c % w; val y = c / w
                val wt = exp(-nd[c] / (2.0 * sigma2)).toFloat() + 1e-6f
                val sx = nx[c]; val sy = ny[c]
                for (dy in -pr..pr) {
                    val ty = y + dy; if (ty < 0 || ty >= h) continue
                    for (dx in -pr..pr) {
                        val tx = x + dx; if (tx < 0 || tx >= w) continue
                        val t = ty * w + tx
                        if (!hole[t]) continue
                        val s = img[(sy + dy) * w + sx + dx]
                        ar[t] += wt * ((s shr 16) and 255); ag[t] += wt * ((s shr 8) and 255); ab[t] += wt * (s and 255); aw[t] += wt
                    }
                }
            }
            for (i in 0 until w * h) if (hole[i] && aw[i] > 0f) {
                img[i] = (0xFF shl 24) or (Resample.clamp8(ar[i] / aw[i]) shl 16) or (Resample.clamp8(ag[i] / aw[i]) shl 8) or Resample.clamp8(ab[i] / aw[i])
            }
        }
        return nx to ny
    }
}

/** Removal at full resolution: works on a bounded region around the hole, then blends back with grain matching. */
object InpaintPipeline {
    data class Result(val pixels: IntArray, val workScale: Float, val notes: List<String>)

    fun remove(src: IntArray, w: Int, h: Int, selection: FloatArray, expandPx: Int, maxWorkPixels: Int = 450_000,
               progress: (Float) -> Unit = {}, isCancelled: () -> Boolean = { false }): Result {
        val bin = FloatArray(w * h) { if (selection[it] > 0.3f) 1f else 0f }
        val grown = MaskOps.morph(bin, w, h, max(1, expandPx))
        var x0 = w; var y0 = h; var x1 = -1; var y1 = -1
        for (y in 0 until h) for (x in 0 until w) if (grown[y * w + x] > 0.5f) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
        if (x1 < 0) return Result(src.copyOf(), 1f, listOf("Nothing was selected."))
        val margin = (max(x1 - x0, y1 - y0) * 0.8f).toInt() + 24
        val rx0 = max(0, x0 - margin); val ry0 = max(0, y0 - margin); val rx1 = min(w - 1, x1 + margin); val ry1 = min(h - 1, y1 + margin)
        val rw = rx1 - rx0 + 1; val rh = ry1 - ry0 + 1
        val roi = Resample.crop(src, w, rx0, ry0, rw, rh)
        val roiHole = Resample.cropF(grown, w, rx0, ry0, rw, rh)
        val holeFrac = roiHole.count { it > 0.5f }.toFloat() / roiHole.size
        val scale = min(1f, sqrt(maxWorkPixels.toFloat() / (rw * rh)))
        val ww = max(8, (rw * scale).toInt()); val wh = max(8, (rh * scale).toInt())
        val workPx = if (scale < 1f) Resample.area(roi, rw, rh, ww, wh) else roi
        val workHole = if (scale < 1f) Resample.bilinear(roiHole, rw, rh, ww, wh).let { m -> BooleanArray(ww * wh) { m[it] > 0.01f } } else BooleanArray(rw * rh) { roiHole[it] > 0.5f }
        val filled = PatchInpainter.inpaint(workPx, ww, wh, workHole, progress = { progress(it * 0.95f) }, isCancelled = isCancelled)
        val back = if (scale < 1f) Resample.bicubic(filled, ww, wh, rw, rh) else filled
        val notes = ArrayList<String>()
        if (holeFrac > 0.45f) notes += "The removed area is large compared with its surroundings, so the fill has little to copy from."
        // Grain: the work copy was smaller, so restore the photo's measured noise level in the filled area.
        val sigma = ImageAnalyzer.analyze(ArrayPixels(rw, rh, roi)).noiseSigma
        val grain = if (scale < 1f) sigma * (1f - scale) else 0f
        val soft = MaskOps.gaussian(roiHole, rw, rh, 1.5f)
        val rnd = Random(7)
        val out = src.copyOf()
        for (y in 0 until rh) for (x in 0 until rw) {
            val i = y * rw + x
            val a = max(roiHole[i], soft[i]).coerceIn(0f, 1f)
            if (a <= 0.001f) continue
            val o = roi[i]; val f = back[i]
            val n = if (grain > 0.2f && roiHole[i] > 0.5f) (rnd.nextGaussian() * grain).toFloat() else 0f
            val r = ((o shr 16) and 255) + ((((f shr 16) and 255) + n) - ((o shr 16) and 255)) * a
            val g = ((o shr 8) and 255) + ((((f shr 8) and 255) + n) - ((o shr 8) and 255)) * a
            val b = (o and 255) + (((f and 255) + n) - (o and 255)) * a
            out[(ry0 + y) * w + rx0 + x] = (0xFF shl 24) or (Resample.clamp8(r) shl 16) or (Resample.clamp8(g) shl 8) or Resample.clamp8(b)
        }
        if (scale < 1f) notes += "The fill was computed at ${(scale * 100).toInt()}% resolution of the surrounding area and enlarged, then the photo's grain was added back."
        notes += "Hidden areas are reconstructed from other parts of the photo. They are a plausible fill, not what was really behind the person."
        progress(1f)
        return Result(out, scale, notes)
    }
}
