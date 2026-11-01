package com.example.aicamerastudio.photo.compositing

import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.pipeline.ArrayPixels
import com.example.aicamerastudio.photo.pipeline.ColorMath
import com.example.aicamerastudio.photo.pipeline.EnhancementParams
import com.example.aicamerastudio.photo.pipeline.Enhancer
import kotlin.math.*

/** 3x3 projective transform. Maps (x, y) to ((a x + b y + c) / (g x + h y + 1), (d x + e y + f) / (g x + h y + 1)). */
class Homography(val m: DoubleArray) {
    fun map(x: Double, y: Double): Pair<Double, Double> {
        val wv = m[6] * x + m[7] * y + m[8]
        return (m[0] * x + m[1] * y + m[2]) / wv to (m[3] * x + m[4] * y + m[5]) / wv
    }

    fun inverse(): Homography {
        val a = m
        val det = a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6])
        require(abs(det) > 1e-12) { "Transform is not invertible" }
        val inv = doubleArrayOf(
            a[4] * a[8] - a[5] * a[7], a[2] * a[7] - a[1] * a[8], a[1] * a[5] - a[2] * a[4],
            a[5] * a[6] - a[3] * a[8], a[0] * a[8] - a[2] * a[6], a[2] * a[3] - a[0] * a[5],
            a[3] * a[7] - a[4] * a[6], a[1] * a[6] - a[0] * a[7], a[0] * a[4] - a[1] * a[3],
        ).map { it / det }.toDoubleArray()
        return Homography(inv)
    }

    companion object {
        /** Direct linear transform from four point pairs (src[i] -> dst[i]). */
        fun fromPoints(src: List<Pair<Double, Double>>, dst: List<Pair<Double, Double>>): Homography {
            require(src.size == 4 && dst.size == 4)
            val a = Array(8) { DoubleArray(9) }
            for (i in 0..3) {
                val (x, y) = src[i]; val (u, v) = dst[i]
                a[2 * i] = doubleArrayOf(x, y, 1.0, 0.0, 0.0, 0.0, -u * x, -u * y, u)
                a[2 * i + 1] = doubleArrayOf(0.0, 0.0, 0.0, x, y, 1.0, -v * x, -v * y, v)
            }
            for (col in 0 until 8) { // Gaussian elimination with partial pivoting
                var piv = col
                for (r in col + 1 until 8) if (abs(a[r][col]) > abs(a[piv][col])) piv = r
                require(abs(a[piv][col]) > 1e-12) { "Degenerate corner positions" }
                val t = a[col]; a[col] = a[piv]; a[piv] = t
                for (r in 0 until 8) if (r != col) {
                    val f = a[r][col] / a[col][col]
                    for (k in col..8) a[r][k] -= f * a[col][k]
                }
            }
            val h = DoubleArray(9) { if (it < 8) a[it][8] / a[it][it] else 1.0 }
            return Homography(h)
        }
    }
}

/**
 * Everything about a placed person, in units that do not depend on resolution (fractions of the
 * destination height or width), so the same parameters render the preview and the full size export.
 */
data class LayerParams(
    val cx: Float = 0.5f, val cy: Float = 0.6f, val heightFrac: Float = 0.5f,
    val rotation: Float = 0f, val flip: Boolean = false,
    val perspTop: Float = 0f, val perspSkew: Float = 0f,
    val opacity: Float = 1f, val edgeChoke: Float = 0f, val edgeFeather: Float = 0.2f,
    val exposure: Float = 0f, val contrast: Float = 0f, val saturation: Float = 1f, val temperature: Float = 0f,
    val sharpen: Float = 0f, val blur: Float = 0f,
    val shadows: Boolean = true, val contactOpacity: Float = 0.45f, val castOpacity: Float = 0.3f,
    val shadowAngle: Float = 110f, val shadowLength: Float = 0.45f, val shadowSoftness: Float = 0.5f,
    val behindOccluders: Boolean = true, val horizonY: Float = 0.4f, val keepScaleWithDepth: Boolean = false,
) {
    fun validated() = copy(
        cx = cx.coerceIn(-0.5f, 1.5f), cy = cy.coerceIn(-0.5f, 1.5f), heightFrac = heightFrac.coerceIn(0.02f, 3f),
        rotation = ((rotation % 360f) + 360f) % 360f, perspTop = perspTop.coerceIn(-0.6f, 0.6f), perspSkew = perspSkew.coerceIn(-0.6f, 0.6f),
        opacity = opacity.coerceIn(0f, 1f), edgeChoke = edgeChoke.coerceIn(-1f, 1f), edgeFeather = edgeFeather.coerceIn(0f, 1f),
        exposure = exposure.coerceIn(-2f, 2f), contrast = contrast.coerceIn(-0.8f, 0.8f), saturation = saturation.coerceIn(0f, 2f),
        temperature = temperature.coerceIn(-1f, 1f), sharpen = sharpen.coerceIn(0f, 1f), blur = blur.coerceIn(0f, 1f),
        contactOpacity = contactOpacity.coerceIn(0f, 1f), castOpacity = castOpacity.coerceIn(0f, 1f),
        shadowAngle = ((shadowAngle % 360f) + 360f) % 360f, shadowLength = shadowLength.coerceIn(0.05f, 2f),
        shadowSoftness = shadowSoftness.coerceIn(0f, 1f), horizonY = horizonY.coerceIn(-0.5f, 1f),
    )
}

object LayerCodec {
    fun encode(p: LayerParams): String = p.validated().let { v ->
        listOf("v=1", "cx=${v.cx}", "cy=${v.cy}", "hf=${v.heightFrac}", "ro=${v.rotation}", "fl=${if (v.flip) 1 else 0}",
            "pt=${v.perspTop}", "ps=${v.perspSkew}", "op=${v.opacity}", "ec=${v.edgeChoke}", "ef=${v.edgeFeather}",
            "ex=${v.exposure}", "ct=${v.contrast}", "sa=${v.saturation}", "te=${v.temperature}", "sp=${v.sharpen}", "bl=${v.blur}",
            "sh=${if (v.shadows) 1 else 0}", "co=${v.contactOpacity}", "ca=${v.castOpacity}", "sg=${v.shadowAngle}",
            "sl=${v.shadowLength}", "ss=${v.shadowSoftness}", "bo=${if (v.behindOccluders) 1 else 0}", "hz=${v.horizonY}",
            "ks=${if (v.keepScaleWithDepth) 1 else 0}").joinToString(";")
    }

    fun decode(t: String?): LayerParams? {
        if (t.isNullOrBlank()) return null
        val m = HashMap<String, String>()
        for (part in t.split(';')) { val i = part.indexOf('='); if (i <= 0) return null; m[part.substring(0, i)] = part.substring(i + 1) }
        if ((m["v"]?.toIntOrNull() ?: return null) > 1) return null
        val d = LayerParams()
        fun f(k: String, def: Float): Float { val x = m[k]?.toFloatOrNull() ?: return def; return if (x.isNaN() || x.isInfinite()) def else x }
        fun b(k: String, def: Boolean) = m[k]?.let { it == "1" } ?: def
        return LayerParams(f("cx", d.cx), f("cy", d.cy), f("hf", d.heightFrac), f("ro", d.rotation), b("fl", d.flip),
            f("pt", d.perspTop), f("ps", d.perspSkew), f("op", d.opacity), f("ec", d.edgeChoke), f("ef", d.edgeFeather),
            f("ex", d.exposure), f("ct", d.contrast), f("sa", d.saturation), f("te", d.temperature), f("sp", d.sharpen), f("bl", d.blur),
            b("sh", d.shadows), f("co", d.contactOpacity), f("ca", d.castOpacity), f("sg", d.shadowAngle), f("sl", d.shadowLength),
            f("ss", d.shadowSoftness), b("bo", d.behindOccluders), f("hz", d.horizonY), b("ks", d.keepScaleWithDepth)).validated()
    }
}

object LayerGeometry {
    /** Destination corners TL, TR, BR, BL of the placed person for a crop of size cw x ch. */
    fun corners(p: LayerParams, cw: Int, ch: Int, dw: Int, dh: Int): List<Pair<Double, Double>> {
        val hgt = p.heightFrac * dh.toDouble()
        val wid = hgt * cw / ch
        val cx = p.cx * dw.toDouble(); val cy = p.cy * dh.toDouble()
        val topHalf = wid / 2 * (1 + p.perspTop); val botHalf = wid / 2
        val skew = p.perspSkew * hgt
        val pts = listOf(-topHalf + skew to -hgt / 2, topHalf + skew to -hgt / 2, botHalf to hgt / 2, -botHalf to hgt / 2)
        val a = Math.toRadians(p.rotation.toDouble()); val c = cos(a); val s = sin(a)
        return pts.map { (x, y) -> cx + x * c - y * s to cy + x * s + y * c }
    }

    fun footY(p: LayerParams): Float = p.cy + p.heightFrac / 2f

    /**
     * Keeps a constant real height when the person is moved nearer or farther on a flat ground plane:
     * apparent height is proportional to the distance between the feet and the horizon in the image.
     * This is a guide for level camera shots, not a measurement.
     */
    fun scaledForMove(p: LayerParams, newCx: Float, newCy: Float): LayerParams {
        if (!p.keepScaleWithDepth) return p.copy(cx = newCx, cy = newCy)
        val oldFoot = footY(p) - p.horizonY
        if (oldFoot < 0.01f) return p.copy(cx = newCx, cy = newCy)
        // Solve for the new height so that height / (foot - horizon) stays constant, with foot = cy + height/2.
        val k = p.heightFrac / oldFoot
        val newFootOffset = (newCy - p.horizonY)
        val newH = (k * newFootOffset / (1f - k / 2f)).coerceIn(0.02f, 3f)
        if (newFootOffset <= 0.005f || 1f - k / 2f <= 0.05f) return p.copy(cx = newCx, cy = newCy)
        return p.copy(cx = newCx, cy = newCy, heightFrac = newH)
    }
}

/** Measurements used for automatic matching. All of them are estimates shown to the user as suggestions. */
object SceneAnalysis {
    data class Stats(val meanLin: Float, val stdTone: Float, val meanR: Float, val meanG: Float, val meanB: Float, val sharpness: Float)

    fun stats(px: IntArray, w: Int, h: Int, weight: FloatArray?): Stats {
        var sw = 0.0; var sl = 0.0; var st = 0.0; var st2 = 0.0; var sr = 0.0; var sg = 0.0; var sb = 0.0
        val lin = ColorMath.srgbToLinear
        for (i in 0 until w * h) {
            val wt = (weight?.get(i) ?: 1f).toDouble(); if (wt <= 0.01) continue
            val c = px[i]; val r = lin[(c shr 16) and 255]; val g = lin[(c shr 8) and 255]; val b = lin[c and 255]
            val l = ColorMath.luma(r, g, b); val t = sqrt(l)
            sw += wt; sl += wt * l; st += wt * t; st2 += wt * t * t; sr += wt * r; sg += wt * g; sb += wt * b
        }
        if (sw <= 0) return Stats(0f, 0f, 0f, 0f, 0f, 0f)
        val mt = st / sw
        return Stats((sl / sw).toFloat(), sqrt(max(0.0, st2 / sw - mt * mt)).toFloat(), (sr / sw).toFloat(), (sg / sw).toFloat(), (sb / sw).toFloat(),
            sharpness(px, w, h, weight))
    }

    /** Mean gradient magnitude relative to local contrast, over weighted pixels. Scale dependent: compare at the same scale. */
    fun sharpness(px: IntArray, w: Int, h: Int, weight: FloatArray?): Float {
        val l = Resample.luma(px)
        var g = 0.0; var c = 0.0; var n = 0.0
        val mean = l.average()
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x
            val wt = (weight?.get(i) ?: 1f).toDouble(); if (wt < 0.95) continue
            g += abs(l[i + 1] - l[i - 1]) + abs(l[i + w] - l[i - w]); c += abs(l[i] - mean); n++
        }
        return if (n == 0.0 || c == 0.0) 0f else (g / (c + 1e-6)).toFloat()
    }

    data class Suggestion(val exposure: Float, val contrast: Float, val temperature: Float)

    /** Moves the person partly toward the destination's brightness, contrast and white balance. Skin is protected by the limits. */
    fun suggestColour(person: Stats, dest: Stats): Suggestion {
        if (person.meanLin <= 0f || dest.meanLin <= 0f) return Suggestion(0f, 0f, 0f)
        val ev = (ln(dest.meanLin / person.meanLin) / ln(2f) * 0.6f).coerceIn(-1.2f, 1.2f)
        val ratio = if (person.stdTone > 1e-4f) dest.stdTone / person.stdTone else 1f
        val contrast = ((ratio - 1f) * 0.5f).coerceIn(-0.3f, 0.3f)
        val k = sqrt(((dest.meanR / max(dest.meanB, 1e-4f)) / (person.meanR / max(person.meanB, 1e-4f))).coerceIn(0.25f, 4f))
        val t = ((k - 1f) / (0.3f * (k + 1f))).coerceIn(-0.5f, 0.5f)
        return Suggestion(ev, contrast, t)
    }

    /** A rough light direction: which side of the destination is brighter. Confidence 0..1. */
    data class Light(val shadowAngle: Float, val confidence: Float)

    fun estimateLight(px: IntArray, w: Int, h: Int): Light {
        val l = Resample.luma(px)
        var left = 0.0; var right = 0.0; var top = 0.0; var bottom = 0.0
        for (y in 0 until h) for (x in 0 until w) {
            val v = l[y * w + x].toDouble()
            if (x < w / 2) left += v else right += v
            if (y < h / 2) top += v else bottom += v
        }
        val n = w * h / 2.0
        val dx = (right - left) / n; val mean = (left + right) / (2 * n)
        val conf = (abs(dx) / max(mean, 0.05) * 3).coerceIn(0.0, 1.0)
        // Shadows fall away from the brighter side, and onto the ground (downward in the image).
        val angle = if (dx >= 0) 160.0 else 20.0
        return Light(angle.toFloat(), conf.toFloat())
    }
}

object BlurMatch {
    /** Finds the blur (in pixels) that makes the person's edge sharpness match the destination's, by bisection. */
    fun suggestSigma(layerPx: IntArray, layerAlpha: FloatArray, w: Int, h: Int, targetSharpness: Float): Float {
        val base = SceneAnalysis.sharpness(layerPx, w, h, layerAlpha)
        if (base <= targetSharpness || targetSharpness <= 0f) return 0f
        var lo = 0f; var hi = 6f
        repeat(8) {
            val mid = (lo + hi) / 2
            val s = SceneAnalysis.sharpness(blur(layerPx, w, h, mid), w, h, layerAlpha)
            if (s > targetSharpness) lo = mid else hi = mid
        }
        return (lo + hi) / 2
    }

    fun blur(px: IntArray, w: Int, h: Int, sigma: Float): IntArray {
        val r = FloatArray(w * h) { ((px[it] shr 16) and 255).toFloat() }
        val g = FloatArray(w * h) { ((px[it] shr 8) and 255).toFloat() }
        val b = FloatArray(w * h) { (px[it] and 255).toFloat() }
        val br = MaskOps.gaussian(r, w, h, sigma); val bg = MaskOps.gaussian(g, w, h, sigma); val bb = MaskOps.gaussian(b, w, h, sigma)
        return IntArray(w * h) { (0xFF shl 24) or (Resample.clamp8(br[it]) shl 16) or (Resample.clamp8(bg[it]) shl 8) or Resample.clamp8(bb[it]) }
    }
}

/** Renders a person layer, its shadows and occlusion onto a destination photo. Works at any resolution. */
object Compositor {
    class Rendered(val pixels: IntArray, val layerBox: IntArray /* x0,y0,x1,y1 */)

    fun render(dest: IntArray, dw: Int, dh: Int, crop: IntArray, alpha: FloatArray, cw: Int, ch: Int,
               params: LayerParams, occluder: FloatArray?): Rendered {
        val p = params.validated()
        // 1. Colour and detail adjustments on the person (exposure, contrast, saturation, temperature, sharpen).
        val adj = EnhancementParams(exposureEv = p.exposure, contrast = p.contrast, saturation = p.saturation, temperature = p.temperature,
            sharpenAmount = p.sharpen * 1.2f, sharpenThreshold = 2f, sharpenLimit = 25f)
        val colour = if (adj.isIdentity()) crop else ArrayPixels(cw, ch).also { Enhancer().enhance(ArrayPixels(cw, ch, crop), it, adj) }.pixels
        // 2. Edge choke and feather on the cut out.
        val chokePx = (p.edgeChoke * ch / 200f).roundToInt()
        var a = if (chokePx != 0) MaskOps.morph(alpha, cw, ch, chokePx) else alpha
        if (p.edgeFeather > 0f) a = MaskOps.gaussian(a, cw, ch, p.edgeFeather * ch / 300f)
        // 3. Projective warp into the destination with premultiplied bilinear sampling.
        val corners = LayerGeometry.corners(p, cw, ch, dw, dh)
        val hInv = Homography.fromPoints(listOf(0.0 to 0.0, cw.toDouble() to 0.0, cw.toDouble() to ch.toDouble(), 0.0 to ch.toDouble()), corners).inverse()
        val x0 = max(0, corners.minOf { it.first }.toInt() - 1); val x1 = min(dw - 1, corners.maxOf { it.first }.toInt() + 1)
        val y0 = max(0, corners.minOf { it.second }.toInt() - 1); val y1 = min(dh - 1, corners.maxOf { it.second }.toInt() + 1)
        val out = dest.copyOf()
        if (x1 < x0 || y1 < y0) return Rendered(out, intArrayOf(0, 0, -1, -1))
        val bw = x1 - x0 + 1; val bh = y1 - y0 + 1
        val la = FloatArray(bw * bh); val lr = FloatArray(bw * bh); val lg = FloatArray(bw * bh); val lb = FloatArray(bw * bh)
        val lin = ColorMath.srgbToLinear
        for (y in 0 until bh) for (x in 0 until bw) {
            val (u0, v0) = hInv.map(x0 + x + 0.5, y0 + y + 0.5)
            var u = u0 - 0.5; val v = v0 - 0.5
            if (p.flip) u = cw - 1 - u
            if (u < -0.5 || v < -0.5 || u > cw - 0.5 || v > ch - 0.5) continue
            val uc = u.coerceIn(0.0, cw - 1.0); val vc = v.coerceIn(0.0, ch - 1.0)
            val ix = min(uc.toInt(), cw - 2).coerceAtLeast(0); val iy = min(vc.toInt(), ch - 2).coerceAtLeast(0)
            val fx = (uc - ix).toFloat(); val fy = (vc - iy).toFloat()
            var sa = 0f; var sr = 0f; var sg = 0f; var sb = 0f
            for (k in 0..3) {
                val xx = min(ix + (k and 1), cw - 1); val yy = min(iy + (k shr 1), ch - 1)
                val wgt = (if (k and 1 == 1) fx else 1 - fx) * (if (k shr 1 == 1) fy else 1 - fy)
                val j = yy * cw + xx; val al = a[j] * wgt; val c = colour[j]
                sa += al; sr += al * lin[(c shr 16) and 255]; sg += al * lin[(c shr 8) and 255]; sb += al * lin[c and 255]
            }
            val i = y * bw + x; la[i] = sa; lr[i] = sr; lg[i] = sg; lb[i] = sb
        }
        // 4. Depth of field match: blur the premultiplied layer.
        val sigma = p.blur * dh / 300f
        val fa = if (sigma > 0.3f) MaskOps.gaussian(la, bw, bh, sigma) else la
        val fr = if (sigma > 0.3f) MaskOps.gaussian(lr, bw, bh, sigma) else lr
        val fg = if (sigma > 0.3f) MaskOps.gaussian(lg, bw, bh, sigma) else lg
        val fb = if (sigma > 0.3f) MaskOps.gaussian(lb, bw, bh, sigma) else lb
        // 5. Shadows, drawn under the person and hidden by foreground occluders.
        if (p.shadows && (p.contactOpacity > 0f || p.castOpacity > 0f)) drawShadows(out, dw, dh, fa, x0, y0, bw, bh, p, occluder)
        // 6. Person over destination in linear light, behind the user's occlusion mask if asked.
        for (y in 0 until bh) for (x in 0 until bw) {
            val i = y * bw + x
            var al = fa[i]; if (al <= 0.002f) continue
            val di = (y0 + y) * dw + x0 + x
            if (p.behindOccluders && occluder != null) al *= (1f - occluder[di])
            val o = (al * p.opacity).coerceIn(0f, 1f); if (o <= 0.002f) continue
            val inv = 1f / fa[i]
            val d = out[di]
            val r = fr[i] * inv * o + lin[(d shr 16) and 255] * (1 - o)
            val g = fg[i] * inv * o + lin[(d shr 8) and 255] * (1 - o)
            val b = fb[i] * inv * o + lin[d and 255] * (1 - o)
            out[di] = (0xFF shl 24) or (ColorMath.linearToSrgb8(r) shl 16) or (ColorMath.linearToSrgb8(g) shl 8) or ColorMath.linearToSrgb8(b)
        }
        return Rendered(out, intArrayOf(x0, y0, x1, y1))
    }

    private fun drawShadows(out: IntArray, dw: Int, dh: Int, la: FloatArray, x0: Int, y0: Int, bw: Int, bh: Int, p: LayerParams, occ: FloatArray?) {
        // Feet: the lowest rows of the solid part of the person.
        var foot = -1
        for (y in bh - 1 downTo 0) { var any = false; for (x in 0 until bw) if (la[y * bw + x] > 0.5f) { any = true; break }; if (any) { foot = y; break } }
        if (foot < 0) return
        var top = foot
        for (y in 0..foot) { var any = false; for (x in 0 until bw) if (la[y * bw + x] > 0.5f) { any = true; break }; if (any) { top = y; break } }
        val height = max(4, foot - top)
        val band = max(1, height / 25)
        var fx0 = bw; var fx1 = -1
        for (y in max(0, foot - band)..foot) for (x in 0 until bw) if (la[y * bw + x] > 0.5f) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x }
        val footX = (fx0 + fx1) / 2f + x0; val footYd = (foot + y0).toFloat(); val footW = max(2f, (fx1 - fx0 + 1).toFloat())
        val ang = Math.toRadians(p.shadowAngle.toDouble())
        val c = cos(ang).toFloat(); var s = sin(ang).toFloat()
        if (abs(s) < 0.15f) s = if (s < 0) -0.15f else 0.15f
        val len = p.shadowLength
        val reach = (height * len * 1.2f + height * 0.2f).toInt()
        val sx0 = max(0, (x0 - reach)); val sx1 = min(dw - 1, x0 + bw + reach)
        val sy0 = max(0, (footYd - reach).toInt()); val sy1 = min(dh - 1, (footYd + reach).toInt())
        val sw = sx1 - sx0 + 1; val sh = sy1 - sy0 + 1
        if (sw <= 0 || sh <= 0) return
        val cast = FloatArray(sw * sh)
        if (p.castOpacity > 0f) for (y in 0 until sh) for (x in 0 until sw) {
            val gx = (sx0 + x).toFloat(); val gy = (sy0 + y).toFloat()
            // Inverse of: gx = x0' + t*len*c, gy = foot + t*len*s, with t = foot - y0' (height above the feet).
            val t = (gy - footYd) / (len * s)
            if (t < 0f || t > height * 1.05f) continue
            val px = gx - t * len * c - x0; val py = footYd - t - y0
            val ix = px.toInt(); val iy = py.toInt()
            if (ix < 0 || iy < 0 || ix >= bw || iy >= bh) continue
            cast[y * sw + x] = la[iy * bw + ix] * (1f - 0.6f * t / height)
        }
        val soft = MaskOps.gaussian(cast, sw, sh, 1f + p.shadowSoftness * height * 0.04f)
        val rx = footW * 0.6f + height * 0.04f; val ry = height * (0.03f + 0.03f * p.shadowSoftness)
        val lin = ColorMath.srgbToLinear
        for (y in 0 until sh) for (x in 0 until sw) {
            val gx = sx0 + x; val gy = sy0 + y
            val dx = (gx - footX) / rx; val dy = (gy - footYd) / ry
            val contact = p.contactOpacity * exp(-2f * (dx * dx + dy * dy))
            var sa = max(contact, soft[y * sw + x] * p.castOpacity).coerceIn(0f, 0.9f)
            val di = gy * dw + gx
            if (occ != null) sa *= (1f - occ[di])
            if (sa <= 0.003f) continue
            val d = out[di]; val k = 1f - sa
            out[di] = (0xFF shl 24) or (ColorMath.linearToSrgb8(lin[(d shr 16) and 255] * k) shl 16) or
                (ColorMath.linearToSrgb8(lin[(d shr 8) and 255] * k) shl 8) or ColorMath.linearToSrgb8(lin[d and 255] * k)
        }
    }
}
