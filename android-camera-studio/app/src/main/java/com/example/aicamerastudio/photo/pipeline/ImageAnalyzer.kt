package com.example.aicamerastudio.photo.pipeline

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Measured properties of an image, all derived from its real pixels. */
data class ImageStats(
    val width: Int,
    val height: Int,
    /** Percentiles of encoded luma, 0..255. */
    val p01: Int,
    val p50: Int,
    val p995: Int,
    val meanLuma: Float,
    /** Fraction of pixels with encoded luma >= 250. */
    val highlightClip: Float,
    /** Fraction of pixels with encoded luma <= 5. */
    val shadowClip: Float,
    /** Fraction of pixels darker than encoded luma 40. */
    val darkFraction: Float,
    /** Fraction of pixels brighter than encoded luma 215. */
    val brightFraction: Float,
    /** Estimated sensor noise standard deviation in encoded 8 bit units (Immerkaer, median based). */
    val noiseSigma: Float,
    /** Mean absolute horizontal luma gradient. A rough sharpness indicator, not an absolute measure. */
    val meanGradient: Float,
    val meanSaturation: Float,
    /** Mean linear light of neutral candidate pixels, or NaN when there were too few. */
    val neutralR: Float,
    val neutralG: Float,
    val neutralB: Float,
    val neutralFraction: Float,
) {
    val medianLinear: Float get() = ColorMath.srgbToLinear[p50.coerceIn(0, 255)]
}

object ImageAnalyzer {
    private const val CHUNK = 64

    fun analyze(src: PixelSource, isCancelled: () -> Boolean = { false }): ImageStats {
        val w = src.width
        val h = src.height
        val hist = IntArray(256)
        val noiseHist = IntArray(1024)
        var noiseSamples = 0L
        var gradSum = 0.0
        var gradCount = 0L
        var satSum = 0.0
        var satCount = 0L
        var nr = 0.0; var ng = 0.0; var nb = 0.0
        var neutralCount = 0L
        var lumaSum = 0.0
        val buf = IntArray(w * (CHUNK + 2))
        val luma = IntArray(w * (CHUNK + 2))

        var y0 = 0
        while (y0 < h) {
            if (isCancelled()) throw EnhancementCancelled()
            val y1 = min(h, y0 + CHUNK)
            val r0 = max(0, y0 - 1)
            val r1 = min(h, y1 + 1)
            src.readRows(r0, r1, buf)
            val rows = r1 - r0
            for (i in 0 until rows * w) luma[i] = ColorMath.luma8(buf[i])
            for (y in y0 until y1) {
                val ly = y - r0
                for (x in 0 until w) {
                    val i = ly * w + x
                    val p = buf[i]
                    val l = luma[i]
                    hist[l]++
                    lumaSum += l
                    val r = (p shr 16) and 255
                    val g = (p shr 8) and 255
                    val b = p and 255
                    val mx = max(r, max(g, b))
                    val mn = min(r, min(g, b))
                    if (mx > 16) {
                        val s = (mx - mn).toFloat() / mx
                        satSum += s
                        satCount++
                        if (mx < 245 && mn > 12 && s < 0.45f) {
                            nr += ColorMath.srgbToLinear[r]
                            ng += ColorMath.srgbToLinear[g]
                            nb += ColorMath.srgbToLinear[b]
                            neutralCount++
                        }
                    }
                    if (x < w - 1) {
                        gradSum += abs(luma[i + 1] - l)
                        gradCount++
                    }
                    if (y in 1 until h - 1 && x in 1 until w - 1) {
                        // Immerkaer kernel [1 -2 1; -2 4 -2; 1 -2 1]
                        val up = i - w
                        val dn = i + w
                        val c = luma[up - 1] - 2 * luma[up] + luma[up + 1] -
                            2 * luma[i - 1] + 4 * l - 2 * luma[i + 1] +
                            luma[dn - 1] - 2 * luma[dn] + luma[dn + 1]
                        noiseHist[min(abs(c), 1023)]++
                        noiseSamples++
                    }
                }
            }
            y0 = y1
        }

        val total = w.toLong() * h
        fun percentile(q: Double): Int {
            val target = (total * q).toLong()
            var acc = 0L
            for (v in 0..255) {
                acc += hist[v]
                if (acc > target) return v
            }
            return 255
        }

        var noise = 0f
        if (noiseSamples > 0) {
            val half = noiseSamples / 2
            var acc = 0L
            var med = 0
            for (v in noiseHist.indices) {
                acc += noiseHist[v]
                if (acc > half) { med = v; break }
            }
            // For zero mean Gaussian noise the median of |conv| is 0.6745 * 6 * sigma.
            noise = med / (0.6745f * 6f)
        }

        var clipHi = 0L; var clipLo = 0L; var dark = 0L; var bright = 0L
        for (v in 0..255) {
            if (v >= 250) clipHi += hist[v]
            if (v <= 5) clipLo += hist[v]
            if (v < 40) dark += hist[v]
            if (v > 215) bright += hist[v]
        }
        val nf = if (total > 0) neutralCount.toFloat() / total else 0f
        val nan = Float.NaN
        return ImageStats(
            width = w, height = h,
            p01 = percentile(0.01), p50 = percentile(0.5), p995 = percentile(0.995),
            meanLuma = (lumaSum / total).toFloat() / 255f,
            highlightClip = clipHi.toFloat() / total,
            shadowClip = clipLo.toFloat() / total,
            darkFraction = dark.toFloat() / total,
            brightFraction = bright.toFloat() / total,
            noiseSigma = noise,
            meanGradient = if (gradCount > 0) (gradSum / gradCount).toFloat() else 0f,
            meanSaturation = if (satCount > 0) (satSum / satCount).toFloat() else 0f,
            neutralR = if (neutralCount > 0) (nr / neutralCount).toFloat() else nan,
            neutralG = if (neutralCount > 0) (ng / neutralCount).toFloat() else nan,
            neutralB = if (neutralCount > 0) (nb / neutralCount).toFloat() else nan,
            neutralFraction = nf,
        )
    }

}
