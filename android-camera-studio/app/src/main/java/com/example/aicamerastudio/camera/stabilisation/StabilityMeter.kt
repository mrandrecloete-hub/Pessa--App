package com.example.aicamerastudio.camera.stabilisation

import kotlin.math.sqrt

enum class Steadiness { STEADY, OK, SHAKY }

/**
 * Turns gyroscope angular speed into a steadiness state. Image blur grows with zoom, so the allowed
 * angular speed shrinks in proportion to the zoom ratio.
 */
class StabilityMeter(private val smoothing: Float = 0.2f) {
    var smoothed = 0f
        private set

    fun add(wx: Float, wy: Float, wz: Float) {
        val m = sqrt(wx * wx + wy * wy) + 0.3f * kotlin.math.abs(wz) // roll blurs less at the centre
        smoothed += (m - smoothed) * smoothing
    }

    /** [zoom] is the total magnification relative to the main lens. Thresholds are in rad/s. */
    fun state(zoom: Float): Steadiness {
        val z = zoom.coerceAtLeast(1f)
        return when {
            smoothed <= 0.08f / z -> Steadiness.STEADY
            smoothed <= 0.25f / z -> Steadiness.OK
            else -> Steadiness.SHAKY
        }
    }
}
