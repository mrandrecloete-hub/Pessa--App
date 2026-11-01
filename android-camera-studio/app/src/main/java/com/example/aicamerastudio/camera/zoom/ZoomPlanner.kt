package com.example.aicamerastudio.camera.zoom

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/** One camera lens as reported by Camera2. Sensor size in mm (physical size), focal length in mm. */
data class LensSpec(val cameraId: String, val focalMm: Float, val sensorWidthMm: Float, val sensorHeightMm: Float, val directlyOpenable: Boolean) {
    /** Field of view measure: focal length over sensor diagonal. Larger means more telephoto. */
    val fovRatio: Float get() = focalMm / hypot(sensorWidthMm, sensorHeightMm).coerceAtLeast(0.1f)
}

enum class ZoomKind { OPTICAL, DIGITAL, EXTENDED }

/** How a requested magnification will be produced, described honestly. */
data class ZoomPlan(
    val requested: Float,
    /** Lens expected to serve the request (the phone may still choose differently inside a logical camera). */
    val lens: LensSpec?,
    val lensFactor: Float,
    /** Ratio passed to CameraX on the bound camera. */
    val cameraRatio: Float,
    /** Extra crop after capture (1 = none). Beyond the camera's own maximum. */
    val extendedCrop: Float,
    val kind: ZoomKind,
    val label: String,
    val warning: String?,
)

/**
 * Plans zoom from real lens data. Optical only when a lens' own field of view matches the request;
 * anything between lenses is a crop (digital), and anything beyond the camera's maximum ratio is an
 * after capture crop with optional AI upscaling (extended).
 */
class ZoomPlanner(
    lenses: List<LensSpec>,
    private val mainLens: LensSpec?,
    private val cameraMinRatio: Float,
    private val cameraMaxRatio: Float,
    private val maxExtended: Float = 4f,
) {
    private val main = mainLens
    private val factors: List<Pair<LensSpec, Float>> = if (main == null) emptyList()
        else lenses.distinctBy { it.cameraId }.map { it to it.fovRatio / main.fovRatio }.sortedBy { it.second }

    val opticalFactors: List<Float> get() = factors.map { it.second }
    val minZoom: Float get() = min(cameraMinRatio, factors.firstOrNull()?.second ?: cameraMinRatio).coerceAtMost(1f)
    val maxZoom: Float get() = min(100f, cameraMaxRatio * maxExtended)

    /** Quick buttons the device can actually reach, from a standard list. */
    fun quickStops(candidates: List<Float> = listOf(0.6f, 1f, 3f, 10f, 20f, 30f, 50f, 100f)): List<Float> {
        val stops = candidates.filter { it >= minZoom - 0.05f && it <= maxZoom + 0.01f }.toMutableList()
        if (minZoom < 0.95f && stops.none { abs(it - minZoom) < 0.1f }) stops.add(0, (minZoom * 10).toInt() / 10f)
        // add real optical telephoto factors so the user can jump to them
        factors.map { it.second }.filter { it > 1.5f && it <= maxZoom }.forEach { f -> if (stops.none { abs(it - f) < 0.3f }) stops += f }
        return stops.sorted()
    }

    fun plan(requested: Float): ZoomPlan {
        val r = requested.coerceIn(minZoom, maxZoom)
        val cameraRatio = min(r, cameraMaxRatio).coerceAtLeast(cameraMinRatio)
        val extended = if (r > cameraMaxRatio) r / cameraMaxRatio else 1f
        val lensPair = factors.lastOrNull { it.second <= min(r, cameraMaxRatio) + 0.05f } ?: factors.firstOrNull()
        val lens = lensPair?.first; val lf = lensPair?.second ?: 1f
        val optical = extended == 1f && lensPair != null && abs(cameraRatio - lf) / lf < 0.05f
        val crop = cameraRatio / lf
        val kind = when { extended > 1f -> ZoomKind.EXTENDED; optical -> ZoomKind.OPTICAL; else -> ZoomKind.DIGITAL }
        val fmt = if (r < 10f) "%.1f×".format(r) else "%.0f×".format(r)
        val label = when (kind) {
            ZoomKind.OPTICAL -> "$fmt optical"
            ZoomKind.DIGITAL -> "$fmt digital (${"%.1f".format(crop)}× crop of the ${lensName(lf)} lens)"
            ZoomKind.EXTENDED -> "$fmt extended (camera at ${"%.1f".format(cameraRatio)}×, then ${"%.1f".format(extended)}× crop and upscale after capture)"
        }
        val totalCrop = crop * extended
        val warning = when {
            kind == ZoomKind.EXTENDED -> "Beyond the camera's own zoom. Detail is upscaled after capture, and AI upscaling adds generated detail."
            totalCrop >= 4f -> "Heavy digital crop: expect soft detail and more noise. Hold very still."
            totalCrop >= 2f -> "Digital crop: some loss of detail."
            else -> null
        }
        return ZoomPlan(r, lens, lf, cameraRatio, extended, kind, label, warning)
    }

    private fun lensName(f: Float) = when { f < 0.9f -> "ultra wide"; f < 1.3f -> "main"; else -> "%.1f× telephoto".format(f) }

    companion object {
        /** Maps a 0..1 slider position to a zoom ratio on a logarithmic scale and back. */
        fun sliderToZoom(t: Float, min: Float, max: Float): Float =
            (min.toDouble() * Math.pow(max.toDouble() / min, t.coerceIn(0f, 1f).toDouble())).toFloat()

        fun zoomToSlider(z: Float, min: Float, max: Float): Float =
            (Math.log(z.coerceIn(min, max).toDouble() / min) / Math.log(max.toDouble() / min)).toFloat()
    }
}
