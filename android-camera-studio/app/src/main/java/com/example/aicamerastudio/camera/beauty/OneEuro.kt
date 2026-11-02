package com.example.aicamerastudio.camera.beauty

import kotlin.math.PI
import kotlin.math.abs

/**
 * One Euro filter (Casiez, Roussel, Vogel 2012): strong smoothing while a value is still, little lag when
 * it moves fast. Used per landmark coordinate so effects stay put on the face without trailing behind it.
 */
class OneEuro(private val minCutoff: Float, private val beta: Float, private val dCutoff: Float = 1f) {
    private var x = 0f; private var dx = 0f; private var t = -1.0
    private var started = false

    private fun alpha(cutoff: Float, dt: Float): Float { val tau = 1f / (2f * PI.toFloat() * cutoff); return 1f / (1f + tau / dt) }

    /** [value] at time [seconds]; [scale] makes the speed term independent of face size. */
    fun filter(value: Float, seconds: Double, scale: Float = 1f): Float {
        if (!started) { started = true; x = value; dx = 0f; t = seconds; return value }
        val dt = (seconds - t).toFloat().coerceIn(1e-3f, 0.5f); t = seconds
        val d = (value - x) / dt
        dx += alpha(dCutoff, dt) * (d - dx)
        val cutoff = minCutoff + beta * abs(dx) / scale
        x += alpha(cutoff, dt) * (value - x)
        return x
    }

    fun reset() { started = false }
}
