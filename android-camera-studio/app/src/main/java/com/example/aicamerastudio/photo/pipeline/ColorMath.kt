package com.example.aicamerastudio.photo.pipeline

import kotlin.math.pow
import kotlin.math.sqrt

/**
 * Colour helpers. Tonal and colour operations run on linear light (sRGB transfer function removed),
 * not on encoded gamma values.
 */
object ColorMath {
    private const val ENC_N = 8192

    /** sRGB 8 bit value to linear light 0..1. */
    val srgbToLinear: FloatArray = FloatArray(256) { i ->
        val c = i / 255f
        if (c <= 0.04045f) c / 12.92f else ((c + 0.055f) / 1.055f).pow(2.4f)
    }

    private val linearToSrgbLut: IntArray = IntArray(ENC_N) { i ->
        val l = i / (ENC_N - 1).toFloat()
        val c = if (l <= 0.0031308f) 12.92f * l else 1.055f * l.pow(1f / 2.4f) - 0.055f
        (c * 255f + 0.5f).toInt().coerceIn(0, 255)
    }

    fun linearToSrgb8(l: Float): Int {
        val c = if (l < 0f) 0f else if (l > 1f) 1f else l
        return linearToSrgbLut[(c * (ENC_N - 1) + 0.5f).toInt()]
    }

    fun luma(r: Float, g: Float, b: Float): Float = 0.2126f * r + 0.7152f * g + 0.0722f * b

    /** Integer luma of an encoded pixel, 0..255 (Rec.601 weights, used for analysis and filtering). */
    fun luma8(p: Int): Int = (((p shr 16) and 255) * 77 + ((p shr 8) and 255) * 151 + (p and 255) * 28) shr 8

    /** Perceptual "tone" axis used by the tone curve: square root of linear light. */
    fun srgb8ToTone(v8: Int): Float = sqrt(srgbToLinear[v8.coerceIn(0, 255)])
}
