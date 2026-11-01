package com.example.aicamerastudio.photo.pipeline

/**
 * Luminance tone curve on the "tone" axis p = sqrt(linear light).
 * The curve is applied as a per pixel gain on linear RGB, so hue is preserved.
 */
object ToneCurve {
    const val SIZE = 4096

    fun mapTone(p: Float, a: EnhancementParams): Float {
        var x = ((p - a.blackPoint) / (a.whitePoint - a.blackPoint)).coerceIn(0f, 1f)
        x += a.shadows * 0.35f * x * (1f - x) * (1f - x)
        x += a.highlights * 0.35f * x * x * (1f - x)
        x = x.coerceIn(0f, 1f)
        val s = x * x * (3f - 2f * x)
        x += a.contrast * (s - x)
        return x.coerceIn(0f, 1f)
    }

    /** Gain table indexed by p scaled to 0 until SIZE. */
    fun buildGainTable(a: EnhancementParams): FloatArray {
        val t = FloatArray(SIZE)
        val first = 4
        for (i in first until SIZE) {
            val p = i / (SIZE - 1f)
            val q = mapTone(p, a)
            t[i] = (q * q) / (p * p)
        }
        for (i in 0 until first) t[i] = t[first]
        return t
    }
}
