package com.example.aicamerastudio.photo.pipeline

import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Banded image enhancer: edge preserving denoise, then linear light exposure / white balance /
 * tone / colour, then thresholded unsharp masking.
 *
 * Bands carry enough surrounding rows (see [EnhancementParams.haloRows]) that the result is
 * identical to processing the whole image at once, while memory stays bounded.
 */
class Enhancer(private val targetBandPixels: Int = 1_000_000) {

    fun enhance(
        src: PixelSource,
        dst: PixelSink,
        params: EnhancementParams,
        progress: (Float) -> Unit = {},
        isCancelled: () -> Boolean = { false },
    ) {
        val a = params.validated()
        val w = src.width
        val h = src.height
        val halo = a.haloRows()
        val bandRows = max(16, targetBandPixels / w)
        val maxRows = bandRows + 2 * halo

        val inBuf = IntArray(w * maxRows)
        val work = IntArray(w * maxRows)
        val luma = IntArray(w * maxRows)
        val out = IntArray(w * bandRows)

        val rd = if (a.hasDenoise) a.denoiseRadius else 0
        val side = 2 * rd + 1
        val spatial = FloatArray(side * side)
        if (rd > 0) {
            val ss = rd * 0.75f + 0.25f
            for (dy in -rd..rd) for (dx in -rd..rd) {
                spatial[(dy + rd) * side + dx + rd] = exp(-(dx * dx + dy * dy) / (2f * ss * ss))
            }
        }
        val rangeLut = FloatArray(256) { d -> exp(-(d * d) / (2f * a.denoiseRangeSigma * a.denoiseRangeSigma)) }

        val mr = a.gainR * 2f.pow(a.exposureEv) * (1f + 0.30f * a.temperature)
        val mg = a.gainG * 2f.pow(a.exposureEv) * (1f - 0.15f * a.tint)
        val mb = a.gainB * 2f.pow(a.exposureEv) * (1f - 0.30f * a.temperature)
        val gainTable = ToneCurve.buildGainTable(a)

        var y0 = 0
        while (y0 < h) {
            if (isCancelled()) throw EnhancementCancelled()
            val y1 = min(h, y0 + bandRows)
            val b0 = max(0, y0 - halo)
            val b1 = min(h, y1 + halo)
            val rows = b1 - b0
            src.readRows(b0, b1, inBuf)

            if (a.hasDenoise) {
                denoise(inBuf, work, luma, w, rows, rd, a.denoiseStrength, spatial, side, rangeLut)
            } else {
                System.arraycopy(inBuf, 0, work, 0, w * rows)
            }

            tone(work, w * rows, mr, mg, mb, gainTable, a)

            val cy0 = y0 - b0
            val cy1 = y1 - b0
            if (a.hasSharpen) {
                for (i in 0 until w * rows) luma[i] = ColorMath.luma8(work[i])
                sharpen(work, luma, out, w, rows, cy0, cy1, a)
            } else {
                System.arraycopy(work, cy0 * w, out, 0, (cy1 - cy0) * w)
            }
            dst.writeRows(y0, y1, out)
            y0 = y1
            progress(y0.toFloat() / h)
        }
    }

    private fun denoise(
        inp: IntArray, out: IntArray, luma: IntArray, w: Int, rows: Int, r: Int,
        strength: Float, spatial: FloatArray, side: Int, rangeLut: FloatArray,
    ) {
        for (i in 0 until w * rows) luma[i] = ColorMath.luma8(inp[i])
        for (y in 0 until rows) {
            for (x in 0 until w) {
                val c = y * w + x
                val yc = luma[c]
                var sw = 0f; var sr = 0f; var sg = 0f; var sb = 0f
                for (dy in -r..r) {
                    val yy = min(max(y + dy, 0), rows - 1)
                    for (dx in -r..r) {
                        val xx = min(max(x + dx, 0), w - 1)
                        val idx = yy * w + xx
                        val wt = spatial[(dy + r) * side + dx + r] * rangeLut[abs(luma[idx] - yc)]
                        val p = inp[idx]
                        sw += wt
                        sr += wt * ((p shr 16) and 255)
                        sg += wt * ((p shr 8) and 255)
                        sb += wt * (p and 255)
                    }
                }
                val p0 = inp[c]
                val r0 = (p0 shr 16) and 255
                val g0 = (p0 shr 8) and 255
                val b0 = p0 and 255
                val nr = (r0 + (sr / sw - r0) * strength + 0.5f).toInt().coerceIn(0, 255)
                val ng = (g0 + (sg / sw - g0) * strength + 0.5f).toInt().coerceIn(0, 255)
                val nb = (b0 + (sb / sw - b0) * strength + 0.5f).toInt().coerceIn(0, 255)
                out[c] = (0xFF shl 24) or (nr shl 16) or (ng shl 8) or nb
            }
        }
    }

    private fun tone(
        px: IntArray, n: Int, mr: Float, mg: Float, mb: Float,
        gainTable: FloatArray, a: EnhancementParams,
    ) {
        val lin = ColorMath.srgbToLinear
        val sat = a.saturation
        val vib = a.vibrance
        val last = ToneCurve.SIZE - 1
        for (i in 0 until n) {
            val p = px[i]
            var r = lin[(p shr 16) and 255] * mr
            var g = lin[(p shr 8) and 255] * mg
            var b = lin[p and 255] * mb
            val l = ColorMath.luma(r, g, b)
            val idx = if (l >= 1f) last else (sqrt(l) * last + 0.5f).toInt()
            val gain = gainTable[idx]
            r *= gain; g *= gain; b *= gain
            val lt = l * gain
            var s = sat
            if (vib != 0f) {
                val mx = max(r, max(g, b))
                val mn = min(r, min(g, b))
                val cs = if (mx > 1e-6f) (mx - mn) / mx else 0f
                s += vib * (1f - cs.coerceIn(0f, 1f))
            }
            if (s != 1f) {
                r = lt + (r - lt) * s
                g = lt + (g - lt) * s
                b = lt + (b - lt) * s
            }
            px[i] = (0xFF shl 24) or
                (ColorMath.linearToSrgb8(r) shl 16) or
                (ColorMath.linearToSrgb8(g) shl 8) or
                ColorMath.linearToSrgb8(b)
        }
    }

    private fun sharpen(
        px: IntArray, luma: IntArray, out: IntArray, w: Int, rows: Int,
        cy0: Int, cy1: Int, a: EnhancementParams,
    ) {
        val amount = a.sharpenAmount
        val thr = a.sharpenThreshold
        val limit = a.sharpenLimit
        for (y in cy0 until cy1) {
            val ym = max(y - 1, 0) * w
            val yc = y * w
            val yp = min(y + 1, rows - 1) * w
            for (x in 0 until w) {
                val xm = max(x - 1, 0)
                val xp = min(x + 1, w - 1)
                val blur = (luma[ym + xm] + 2 * luma[ym + x] + luma[ym + xp] +
                    2 * luma[yc + xm] + 4 * luma[yc + x] + 2 * luma[yc + xp] +
                    luma[yp + xm] + 2 * luma[yp + x] + luma[yp + xp]) / 16f
                var d = luma[yc + x] - blur
                // Coring: leave small differences (mostly noise) untouched.
                d = if (d > thr) d - thr else if (d < -thr) d + thr else 0f
                var delta = d * amount
                if (delta > limit) delta = limit else if (delta < -limit) delta = -limit
                val p = px[yc + x]
                val dr = delta.toInt()
                val r = (((p shr 16) and 255) + dr).coerceIn(0, 255)
                val g = (((p shr 8) and 255) + dr).coerceIn(0, 255)
                val b = ((p and 255) + dr).coerceIn(0, 255)
                out[(y - cy0) * w + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
        }
    }
}
