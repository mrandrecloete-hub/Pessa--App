package com.example.aicamerastudio.photo.superresolution

import com.example.aicamerastudio.photo.ai.OnnxModel
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.pipeline.ArrayPixels
import com.example.aicamerastudio.photo.pipeline.EnhancementCancelled
import com.example.aicamerastudio.photo.pipeline.EnhancementParams
import com.example.aicamerastudio.photo.pipeline.Enhancer
import com.example.aicamerastudio.photo.pipeline.ImageAnalyzer
import kotlin.math.max
import kotlin.math.min

/** 4x AI super resolution with Real-ESRGAN General x4v3, run tile by tile so memory stays bounded. */
class SuperResolver(private val model: OnnxModel) {
    val scale = 4

    fun upscale4x(src: IntArray, w: Int, h: Int, tile: Int = 128, overlap: Int = 16,
                  progress: (Float) -> Unit = {}, isCancelled: () -> Boolean = { false }): IntArray =
        upscale(src, w, h, 4, tile, overlap, progress, isCancelled)

    /**
     * Runs the 4x model per tile and immediately reduces each tile to [factor] (2, 3 or 4), so memory is
     * proportional to the requested output, not to a full 4x image.
     */
    fun upscale(src: IntArray, w: Int, h: Int, factor: Int, tile: Int = 128, overlap: Int = 16,
                progress: (Float) -> Unit = {}, isCancelled: () -> Boolean = { false }): IntArray {
        require(factor in 2..4)
        val ow = w * factor; val oh = h * factor
        val out = IntArray(ow * oh)
        val tilesX = (w + tile - 1) / tile; val tilesY = (h + tile - 1) / tile
        var done = 0
        for (ty in 0 until tilesY) for (tx in 0 until tilesX) {
            if (isCancelled()) throw EnhancementCancelled()
            val x0 = tx * tile; val y0 = ty * tile
            val x1 = min(w, x0 + tile); val y1 = min(h, y0 + tile)
            val ex0 = max(0, x0 - overlap); val ey0 = max(0, y0 - overlap)
            val ex1 = min(w, x1 + overlap); val ey1 = min(h, y1 + overlap)
            val tw = ex1 - ex0; val th = ey1 - ey0
            val input = FloatArray(3 * tw * th)
            val plane = tw * th
            for (y in 0 until th) for (x in 0 until tw) {
                val c = src[(ey0 + y) * w + ex0 + x]; val i = y * tw + x
                input[i] = ((c shr 16) and 255) / 255f
                input[plane + i] = ((c shr 8) and 255) / 255f
                input[2 * plane + i] = (c and 255) / 255f
            }
            val (res, _) = model.run(input, longArrayOf(1, 3, th.toLong(), tw.toLong()))
            val rw = tw * scale; val rplane = rw * th * scale
            // Inner (non overlap) part of the 4x tile.
            val iw = (x1 - x0) * scale; val ih = (y1 - y0) * scale
            val inner = IntArray(iw * ih)
            for (y in 0 until ih) for (x in 0 until iw) {
                val i = (y + (y0 - ey0) * scale) * rw + x + (x0 - ex0) * scale
                val r = Resample.clamp8(res[i] * 255f); val g = Resample.clamp8(res[rplane + i] * 255f); val b = Resample.clamp8(res[2 * rplane + i] * 255f)
                inner[y * iw + x] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
            val fw = (x1 - x0) * factor; val fh = (y1 - y0) * factor
            val part = if (factor == scale) inner else Resample.area(inner, iw, ih, fw, fh)
            for (y in 0 until fh) System.arraycopy(part, y * fw, out, (y0 * factor + y) * ow + x0 * factor, fw)
            done++
            progress(done.toFloat() / (tilesX * tilesY))
        }
        return out
    }
}

/** Whether a source is suitable for AI reconstruction, measured from its pixels. */
data class SrAssessment(val suitable: Boolean, val reason: String?, val noiseSigma: Float, val detail: Float)

enum class SrMethod { AI, CLASSIC }

data class SrResult(val pixels: IntArray, val width: Int, val height: Int, val method: SrMethod, val notes: List<String>)

object SuperResolutionPipeline {
    const val MAX_INPUT_PIXELS = 4_000_000
    const val MAX_OUTPUT_PIXELS = 24_000_000

    fun assess(src: IntArray, w: Int, h: Int): SrAssessment {
        val s = ImageAnalyzer.analyze(ArrayPixels(w, h, src))
        return when {
            s.noiseSigma > 9f -> SrAssessment(false, "The image is very noisy, so AI reconstruction would mostly invent texture from noise.", s.noiseSigma, s.meanGradient)
            s.meanGradient < 1.2f -> SrAssessment(false, "The image is very blurred or flat, so there is too little real detail for reliable reconstruction.", s.noiseSigma, s.meanGradient)
            else -> SrAssessment(true, null, s.noiseSigma, s.meanGradient)
        }
    }

    /** Non AI fallback: bicubic enlargement plus a gentle, thresholded sharpen. */
    fun classic(src: IntArray, w: Int, h: Int, nw: Int, nh: Int): IntArray {
        val up = Resample.bicubic(src, w, h, nw, nh)
        val out = ArrayPixels(nw, nh)
        Enhancer().enhance(ArrayPixels(nw, nh, up), out, EnhancementParams(sharpenAmount = 0.5f, sharpenThreshold = 2f, sharpenLimit = 20f))
        return out.pixels
    }

    /**
     * Upscales by [factor] (2, 3 or 4). AI output is computed at 4x, then reduced to the requested size,
     * and mixed with the classic result by [strength] so detail can be dialled back.
     */
    fun run(src: IntArray, w: Int, h: Int, factor: Int, strength: Float, ai: SuperResolver?, forceAi: Boolean = false,
            progress: (Float) -> Unit = {}, isCancelled: () -> Boolean = { false }): SrResult {
        require(factor in 2..4) { "Factor must be 2, 3 or 4" }
        require(w.toLong() * h <= MAX_INPUT_PIXELS) { "Input is larger than ${MAX_INPUT_PIXELS / 1_000_000.0} MP; crop first" }
        val nw = w * factor; val nh = h * factor
        require(nw.toLong() * nh <= MAX_OUTPUT_PIXELS) { "Output would exceed ${MAX_OUTPUT_PIXELS / 1_000_000} MP" }
        val notes = ArrayList<String>()
        val classic = classic(src, w, h, nw, nh)
        if (ai == null) {
            notes += "AI model unavailable, so the non AI method was used."
            return SrResult(classic, nw, nh, SrMethod.CLASSIC, notes)
        }
        val a = assess(src, w, h)
        if (!a.suitable && !forceAi) {
            notes += "${a.reason} The non AI method was used instead."
            return SrResult(classic, nw, nh, SrMethod.CLASSIC, notes)
        }
        if (!a.suitable) notes += "Warning: ${a.reason}"
        val aiOut = ai.upscale(src, w, h, factor, progress = progress, isCancelled = isCancelled)
        val k = strength.coerceIn(0f, 1f)
        val out = IntArray(nw * nh) { i ->
            val p = classic[i]; val q = aiOut[i]
            val r = ((p shr 16) and 255) + (((q shr 16) and 255) - ((p shr 16) and 255)) * k
            val g = ((p shr 8) and 255) + (((q shr 8) and 255) - ((p shr 8) and 255)) * k
            val b = (p and 255) + ((q and 255) - (p and 255)) * k
            (0xFF shl 24) or (Resample.clamp8(r) shl 16) or (Resample.clamp8(g) shl 8) or Resample.clamp8(b)
        }
        notes += "AI super resolution (Real-ESRGAN) at ${(k * 100).toInt()}% strength. Added detail is generated by the model and is not guaranteed to be real."
        return SrResult(out, nw, nh, SrMethod.AI, notes)
    }
}
