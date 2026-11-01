package com.example.aicamerastudio.photo.portrait

import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.pipeline.ColorMath
import kotlin.math.min

enum class PortraitLight(val label: String) { NATURAL("Natural"), STUDIO("Studio"), CONTOUR("Contour"), STAGE("Stage"), STAGE_MONO("Stage mono") }

/**
 * Portrait effect from a person mask: background blur that grows with [blur] (0..1), and lighting looks
 * applied separately to subject and background. The subject's face is never reshaped or smoothed.
 */
object PortraitRenderer {
    fun render(px: IntArray, w: Int, h: Int, subject: FloatArray, blur: Float, light: PortraitLight, intensity: Float): IntArray {
        val k = intensity.coerceIn(0f, 1f)
        // Blur the background only. Premultiply by background weight so the subject does not bleed into the blur (no halo).
        val sigma = blur.coerceIn(0f, 1f) * min(w, h) / 70f
        val out = IntArray(w * h)
        val lin = ColorMath.srgbToLinear
        // The background is blurred anyway, so blur it at reduced resolution (factor f) and sample it back up.
        // Memory and time then stay small even for 12 MP photos.
        val f = (sigma / 3f).toInt().coerceIn(1, 8)
        val sw = (w + f - 1) / f; val sh = (h + f - 1) / f
        val smallW = FloatArray(sw * sh); val small = Array(3) { FloatArray(sw * sh) }; val cnt = FloatArray(sw * sh)
        for (y in 0 until h) for (x in 0 until w) {
            val i = y * w + x; val j = (y / f) * sw + x / f; val bw = 1f - subject[i]; val c = px[i]
            smallW[j] += bw; cnt[j] += 1f
            small[0][j] += lin[(c shr 16) and 255] * bw; small[1][j] += lin[(c shr 8) and 255] * bw; small[2][j] += lin[c and 255] * bw
        }
        for (j in 0 until sw * sh) { val n = cnt[j]; smallW[j] /= n; for (ch in 0..2) small[ch][j] /= n }
        val sSig = sigma / f
        val wbS = if (sSig > 0.3f) MaskOps.gaussian(smallW, sw, sh, sSig) else smallW
        val blS = small.map { if (sSig > 0.3f) MaskOps.gaussian(it, sw, sh, sSig) else it }
        fun sample(a: FloatArray, x: Int, y: Int): Float {
            if (f == 1) return a[y * sw + x]
            val fx = ((x + 0.5f) / f - 0.5f).coerceIn(0f, sw - 1f); val fy = ((y + 0.5f) / f - 0.5f).coerceIn(0f, sh - 1f)
            val x0 = fx.toInt(); val y0 = fy.toInt(); val x1 = min(x0 + 1, sw - 1); val y1 = min(y0 + 1, sh - 1); val tx = fx - x0; val ty = fy - y0
            val p = a[y0 * sw + x0] + (a[y0 * sw + x1] - a[y0 * sw + x0]) * tx
            val q = a[y1 * sw + x0] + (a[y1 * sw + x1] - a[y1 * sw + x0]) * tx
            return p + (q - p) * ty
        }
        // Subject centre for contour light falloff.
        var sx = 0.0; var sy = 0.0; var sn = 0.0
        for (i in 0 until w * h) if (subject[i] > 0.5f) { sx += i % w; sy += i / w; sn++ }
        val cx = if (sn > 0) (sx / sn).toFloat() else w / 2f; val cy = if (sn > 0) (sy / sn).toFloat() else h / 2f
        for (i in 0 until w * h) {
            val a = subject[i]
            val c = px[i]
            var fr = lin[(c shr 16) and 255]; var fg = lin[(c shr 8) and 255]; var fb = lin[c and 255]
            val x = i % w; val y = i / w
            val wv = sample(wbS, x, y)
            var br = if (wv > 1e-4f) sample(blS[0], x, y) / wv else fr
            var bg = if (wv > 1e-4f) sample(blS[1], x, y) / wv else fg
            var bb = if (wv > 1e-4f) sample(blS[2], x, y) / wv else fb
            when (light) {
                PortraitLight.NATURAL -> {}
                PortraitLight.STUDIO -> { val s = 1f + 0.35f * k; fr *= s; fg *= s; fb *= s }
                PortraitLight.CONTOUR -> {
                    val dx = (i % w - cx) / w; val dy = (i / w - cy) / h
                    val f = 1f + k * (0.25f - 1.6f * (dx * dx + dy * dy)).coerceIn(-0.35f, 0.25f)
                    fr *= f; fg *= f; fb *= f; val d = 1f - 0.35f * k; br *= d; bg *= d; bb *= d
                }
                PortraitLight.STAGE, PortraitLight.STAGE_MONO -> {
                    val d = (1f - 0.97f * k); br *= d; bg *= d; bb *= d
                    val s = 1f + 0.15f * k; fr *= s; fg *= s; fb *= s
                    if (light == PortraitLight.STAGE_MONO) { val l = ColorMath.luma(fr, fg, fb); fr = l + (fr - l) * (1 - k); fg = l + (fg - l) * (1 - k); fb = l + (fb - l) * (1 - k) }
                }
            }
            val r = fr * a + br * (1 - a); val g = fg * a + bg * (1 - a); val b = fb * a + bb * (1 - a)
            out[i] = (0xFF shl 24) or (ColorMath.linearToSrgb8(r) shl 16) or (ColorMath.linearToSrgb8(g) shl 8) or ColorMath.linearToSrgb8(b)
        }
        return out
    }

    /** Face box from the segmentation's face class (largest region), in pixels: x, y, w, h, or null. */
    fun faceBox(face: FloatArray, w: Int, h: Int): IntArray? {
        val (_, comps) = MaskOps.components(face, w, h, 0.5f)
        val c = comps.firstOrNull { it.area > w * h / 400 } ?: return null
        return intArrayOf(c.x, c.y, c.w, c.h)
    }
}
