package com.example.aicamerastudio.photo.pipeline

import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** Chooses processing from measured image statistics. Nothing is applied blindly. */
object EnhancementPlanner {

    fun plan(
        stats: ImageStats,
        profile: EnhancementProfile,
        strength: Float,
        level: ProcessingLevel,
    ): EnhancementParams {
        val k = strength.coerceIn(0f, 1f)
        if (k == 0f) return EnhancementParams()
        val t = profile.tuning

        // Exposure: move the median toward the profile target without clipping highlights.
        val targetLin = ColorMath.srgbToLinear[(t.targetMedian * 255f).toInt().coerceIn(0, 255)]
        val medLin = max(stats.medianLinear, 0.002f)
        var ev = (ln(targetLin / medLin) / ln(2f)).coerceIn(-t.maxEvDown, t.maxEvUp)
        if (ev > 0f) {
            val p995Lin = max(ColorMath.srgbToLinear[stats.p995.coerceIn(0, 255)], 0.02f)
            val headroom = ln(1f / p995Lin) / ln(2f) + 0.15f
            ev = min(ev, max(headroom, 0f))
            if (stats.highlightClip > 0.02f) ev = min(ev, 0.1f)
        }
        ev *= k

        val shadowNeed = ((stats.darkFraction - 0.10f) / 0.40f).coerceIn(0.2f, 1f)
        val highlightNeed = ((stats.brightFraction - 0.03f) / 0.12f).coerceIn(0.2f, 1f)
        val shadows = t.shadowLift * shadowNeed * k
        val highlights = -t.highlightRecover * highlightNeed * k

        // Black and white points: stretch only when the histogram clearly leaves room.
        var black = 0f
        var white = 1f
        val p01Tone = ColorMath.srgb8ToTone(stats.p01)
        if (stats.shadowClip < 0.02f && p01Tone > 0.08f) black = min(p01Tone * 0.7f, 0.12f) * k
        val p995Tone = ColorMath.srgb8ToTone(stats.p995)
        if (stats.highlightClip < 0.005f && p995Tone < 0.88f) {
            white = 1f - (1f - max(p995Tone + 0.06f, 0.9f)) * 0.6f * k
        }

        // Noise driven denoise and sharpen.
        val sigma = stats.noiseSigma
        val denoise = (((sigma - 1.0f) / 6f).coerceIn(0f, 1f) * t.denoiseBias).coerceIn(0f, 1f)
        val sharpAmount = t.sharpen * k * (1f - ((sigma - 2f) / 8f).coerceIn(0f, 0.7f))

        // Conservative colour cast correction (gray world on neutral candidates only).
        var gr = 1f; var gb = 1f
        val usable = stats.neutralFraction >= 0.05f && stats.meanSaturation <= 0.40f &&
            !stats.neutralR.isNaN() && stats.neutralR > 0f && stats.neutralB > 0f
        if (usable) {
            val w = t.whiteBalance * k
            gr = (stats.neutralG / stats.neutralR).pow(w).coerceIn(0.85f, 1.18f)
            gb = (stats.neutralG / stats.neutralB).pow(w).coerceIn(0.85f, 1.18f)
            val norm = ColorMath.luma(gr, 1f, gb)
            gr /= norm; gb /= norm
        }

        return EnhancementParams(
            exposureEv = ev,
            contrast = t.contrast * k,
            highlights = highlights,
            shadows = shadows,
            blackPoint = black,
            whitePoint = white,
            saturation = 1f + (t.saturation - 1f) * k,
            vibrance = t.vibrance * k,
            gainR = gr, gainG = 1f, gainB = gb,
            denoiseStrength = denoise,
            denoiseRadius = level.denoiseRadius,
            denoiseRangeSigma = (sigma * 2.5f).coerceIn(5f, 40f),
            sharpenAmount = sharpAmount,
            sharpenThreshold = sigma * 1.2f + 1f,
            sharpenLimit = 25f + 25f * sharpAmount,
        ).validated()
    }
}
