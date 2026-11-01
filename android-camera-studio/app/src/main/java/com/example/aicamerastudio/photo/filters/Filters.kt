package com.example.aicamerastudio.photo.filters

import com.example.aicamerastudio.photo.imaging.Resample
import java.util.Random
import kotlin.math.sqrt

/**
 * A creative look. [matrix] is a 4x5 colour matrix on 0..255 RGBA (same layout as Android's ColorMatrix),
 * so the identical colour transform can run live on the camera preview (RenderEffect) and on the saved photo.
 * Vignette and grain are added only to saved photos.
 */
data class Filter(val id: String, val label: String, val matrix: FloatArray, val vignette: Float = 0f, val grain: Float = 0f) {
    override fun equals(other: Any?) = other is Filter && other.id == id
    override fun hashCode() = id.hashCode()
}

object FilterMath {
    val IDENTITY = floatArrayOf(1f, 0f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 0f, 1f, 0f)

    fun saturation(s: Float): FloatArray {
        val r = 0.2126f * (1 - s); val g = 0.7152f * (1 - s); val b = 0.0722f * (1 - s)
        return floatArrayOf(r + s, g, b, 0f, 0f, r, g + s, b, 0f, 0f, r, g, b + s, 0f, 0f, 0f, 0f, 0f, 1f, 0f)
    }

    /** Contrast around mid grey plus brightness offset (in 0..255 units). */
    fun contrast(c: Float, offset: Float = 0f): FloatArray {
        val t = 128f * (1 - c) + offset
        return floatArrayOf(c, 0f, 0f, 0f, t, 0f, c, 0f, 0f, t, 0f, 0f, c, 0f, t, 0f, 0f, 0f, 1f, 0f)
    }

    fun scale(r: Float, g: Float, b: Float, or: Float = 0f, og: Float = 0f, ob: Float = 0f) =
        floatArrayOf(r, 0f, 0f, 0f, or, 0f, g, 0f, 0f, og, 0f, 0f, b, 0f, ob, 0f, 0f, 0f, 1f, 0f)

    /** a then b (b applied to the output of a). */
    fun concat(a: FloatArray, b: FloatArray): FloatArray {
        val o = FloatArray(20)
        for (row in 0..3) {
            for (col in 0..3) { var s = 0f; for (k in 0..3) s += b[row * 5 + k] * a[k * 5 + col]; o[row * 5 + col] = s }
            var t = b[row * 5 + 4]; for (k in 0..3) t += b[row * 5 + k] * a[k * 5 + 4]; o[row * 5 + 4] = t
        }
        return o
    }

    fun chain(vararg m: FloatArray) = m.reduce { acc, x -> concat(acc, x) }

    /** Blend between identity and [m] by [k] in 0..1 (filter intensity). */
    fun mix(m: FloatArray, k: Float): FloatArray = FloatArray(20) { IDENTITY[it] + (m[it] - IDENTITY[it]) * k.coerceIn(0f, 1f) }

    fun apply(px: IntArray, m: FloatArray): IntArray = IntArray(px.size) { i ->
        val c = px[i]; val r = ((c shr 16) and 255).toFloat(); val g = ((c shr 8) and 255).toFloat(); val b = (c and 255).toFloat()
        val nr = m[0] * r + m[1] * g + m[2] * b + m[4]
        val ng = m[5] * r + m[6] * g + m[7] * b + m[9]
        val nb = m[10] * r + m[11] * g + m[12] * b + m[14]
        (c and 0xFF000000.toInt()) or (Resample.clamp8(nr) shl 16) or (Resample.clamp8(ng) shl 8) or Resample.clamp8(nb)
    }
}

object Filters {
    private val M = FilterMath
    val NATURAL = Filter("natural", "Natural", M.IDENTITY)
    val ALL: List<Filter> = listOf(
        NATURAL,
        Filter("vivid", "Vivid", M.chain(M.saturation(1.35f), M.contrast(1.12f))),
        Filter("cinematic", "Cinematic", M.chain(M.contrast(1.12f, -6f), M.saturation(0.85f), M.scale(0.95f, 1.0f, 1.06f, 0f, 4f, 10f)), vignette = 0.35f),
        Filter("vintage", "Vintage", M.chain(M.saturation(0.7f), M.contrast(0.88f, 14f), M.scale(1.06f, 1.0f, 0.86f, 12f, 6f, 0f)), vignette = 0.3f, grain = 0.25f),
        Filter("warm", "Warm", M.scale(1.08f, 1.02f, 0.88f, 6f, 2f, 0f)),
        Filter("cool", "Cool", M.scale(0.9f, 1.0f, 1.1f, 0f, 2f, 8f)),
        Filter("bw", "Black and White", M.chain(M.saturation(0f), M.contrast(1.1f))),
        Filter("golden", "Golden Hour", M.chain(M.scale(1.12f, 1.0f, 0.78f, 10f, 4f, 0f), M.saturation(1.1f)), vignette = 0.2f),
        Filter("dramatic", "Dramatic", M.chain(M.contrast(1.3f, -10f), M.saturation(0.8f)), vignette = 0.45f),
        Filter("film", "Film", M.chain(M.contrast(0.92f, 6f), M.saturation(0.92f), M.scale(1.02f, 1.0f, 0.96f, 4f, 2f, 6f)), grain = 0.35f),
    )

    fun byId(id: String?) = ALL.firstOrNull { it.id == id } ?: NATURAL

    /** Full quality: colour matrix at [intensity], then vignette and grain scaled by intensity. Deterministic. */
    fun render(px: IntArray, w: Int, h: Int, f: Filter, intensity: Float): IntArray {
        if (f.id == NATURAL.id || intensity <= 0f) return px.copyOf()
        val out = FilterMath.apply(px, FilterMath.mix(f.matrix, intensity))
        val v = f.vignette * intensity; val g = f.grain * intensity
        if (v <= 0f && g <= 0f) return out
        val rnd = Random(1234)
        val cx = w / 2f; val cy = h / 2f; val maxD = sqrt(cx * cx + cy * cy)
        val grainSigma = 14f * g
        for (y in 0 until h) for (x in 0 until w) {
            val i = y * w + x; val c = out[i]
            val d = sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / maxD
            val k = 1f - v * (d * d).coerceIn(0f, 1f)
            val n = if (g > 0f) (rnd.nextGaussian() * grainSigma).toFloat() else 0f
            out[i] = (c and 0xFF000000.toInt()) or (Resample.clamp8(((c shr 16) and 255) * k + n) shl 16) or
                (Resample.clamp8(((c shr 8) and 255) * k + n) shl 8) or Resample.clamp8((c and 255) * k + n)
        }
        return out
    }
}
