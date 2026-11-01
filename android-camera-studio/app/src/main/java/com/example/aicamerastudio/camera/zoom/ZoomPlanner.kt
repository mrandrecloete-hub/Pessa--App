package com.example.aicamerastudio.camera.zoom

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * One lens as reported by Camera2. Sensor size is the physical size in mm, focal length in mm.
 * [separateCamera] is true when the lens is its own camera that this app must bind to switch to it;
 * false when it is part of the main (logical) camera, which switches lenses by itself while zooming.
 */
data class LensSpec(val cameraId: String, val focalMm: Float, val sensorWidthMm: Float, val sensorHeightMm: Float, val separateCamera: Boolean) {
    /** Focal length over sensor diagonal. Proportional to the 35 mm equivalent focal length. */
    val fovRatio: Float get() = focalMm / hypot(sensorWidthMm, sensorHeightMm).coerceAtLeast(0.1f)
}

enum class ZoomKind { OPTICAL, DIGITAL, EXTENDED }

/** Which camera to bind and how to reach a requested magnification. */
data class ZoomRoute(
    /** Null: the main camera. Otherwise a separate camera id to bind. */
    val bindCameraId: String?,
    /** Zoom ratio to set on the bound camera, relative to that camera. */
    val cameraRatio: Float,
    /** Further crop after capture, 1 = none. */
    val extendedCrop: Float,
    /** Lens expected to produce the image, and its magnification relative to the main lens. */
    val lens: LensSpec?,
    val lensFactor: Float,
)

data class ZoomPlan(val requested: Float, val route: ZoomRoute, val kind: ZoomKind, val label: String, val warning: String?)

/**
 * Plans zoom from real lens data. A level is called optical only when a lens' own field of view
 * matches it; anything between lenses is a crop (digital); anything beyond what the bound camera can
 * zoom is an after capture crop with optional AI upscaling (extended). Nothing assumes a particular phone.
 */
class ZoomPlanner(
    lenses: List<LensSpec>,
    private val main: LensSpec?,
    private val mainMinRatio: Float,
    private val mainMaxRatio: Float,
    /** Known maximum zoom ratio of separate cameras (learned after binding them). Unknown counts as 1. */
    private val separateMaxRatio: Map<String, Float> = emptyMap(),
    private val maxExtended: Float = 4f,
) {
    private val factors: List<Pair<LensSpec, Float>> = if (main == null) emptyList()
        else (lenses + main).distinctBy { it.cameraId }.map { it to it.fovRatio / main.fovRatio }.sortedBy { it.second }

    val opticalFactors: List<Float> get() = factors.map { it.second }

    private fun maxFor(l: LensSpec, f: Float) = if (l.separateCamera) f * (separateMaxRatio[l.cameraId] ?: 1f) else mainMaxRatio

    val minZoom: Float get() {
        val sep = factors.filter { it.first.separateCamera }.minOfOrNull { it.second } ?: mainMinRatio
        return min(mainMinRatio, sep).coerceAtMost(1f)
    }
    val maxHardware: Float get() = max(mainMaxRatio, factors.maxOfOrNull { maxFor(it.first, it.second) } ?: mainMaxRatio)
    val maxZoom: Float get() = min(100f, maxHardware * maxExtended)

    fun route(requested: Float): ZoomRoute {
        val r = requested.coerceIn(minZoom, maxZoom)
        // Best separate camera: the longest one whose own field of view is not narrower than requested.
        val sep = factors.filter { it.first.separateCamera && it.second <= r + 0.02f }.maxByOrNull { it.second }
        val useSep = sep != null && (r < mainMinRatio - 0.01f || sep.second > min(r, mainMaxRatio) * 0.98f ||
            (r > mainMaxRatio && maxFor(sep.first, sep.second) > mainMaxRatio))
        return if (useSep && sep != null) {
            val camMax = separateMaxRatio[sep.first.cameraId] ?: 1f
            val ratio = (r / sep.second).coerceIn(1f, camMax)
            ZoomRoute(sep.first.cameraId, ratio, max(1f, r / (sep.second * ratio)), sep.first, sep.second)
        } else {
            val ratio = r.coerceIn(mainMinRatio, mainMaxRatio)
            val inside = factors.filter { !it.first.separateCamera && it.second <= ratio + 0.02f }.maxByOrNull { it.second }
            ZoomRoute(null, ratio, max(1f, r / ratio), inside?.first ?: main, inside?.second ?: 1f)
        }
    }

    fun plan(requested: Float): ZoomPlan {
        val r = requested.coerceIn(minZoom, maxZoom)
        val route = route(r)
        val hw = route.lensFactor * if (route.bindCameraId != null) route.cameraRatio else route.cameraRatio / route.lensFactor
        val crop = hw / route.lensFactor
        val kind = when {
            route.extendedCrop > 1.01f -> ZoomKind.EXTENDED
            route.lens != null && abs(crop - 1f) < 0.05f -> ZoomKind.OPTICAL
            else -> ZoomKind.DIGITAL
        }
        val fmt = if (r < 10f) "%.1f×".format(r) else "%.0f×".format(r)
        val lensName = when { route.lensFactor < 0.9f -> "ultra wide"; route.lensFactor < 1.3f -> "main"; else -> "%.1f× telephoto".format(route.lensFactor) }
        val label = when (kind) {
            ZoomKind.OPTICAL -> "$fmt optical ($lensName lens)"
            ZoomKind.DIGITAL -> "$fmt digital (${"%.1f".format(crop)}× crop of the $lensName lens)"
            ZoomKind.EXTENDED -> "$fmt extended (${"%.1f".format(hw)}× from the camera, then ${"%.1f".format(route.extendedCrop)}× crop and upscale after capture)"
        }
        val totalCrop = crop * route.extendedCrop
        val warning = when {
            kind == ZoomKind.EXTENDED -> "Beyond the camera's own zoom. Detail is upscaled after capture; AI upscaling adds generated detail."
            totalCrop >= 4f -> "Heavy digital crop: expect soft detail and more noise. Hold very still or use a support."
            totalCrop >= 2f -> "Digital crop: some loss of detail."
            else -> null
        }
        return ZoomPlan(r, route, kind, label, warning)
    }

    /** Quick buttons the device can actually reach, from a standard list plus the real telephoto factors. */
    fun quickStops(candidates: List<Float> = listOf(0.6f, 1f, 3f, 10f, 20f, 30f, 50f, 100f)): List<Float> {
        val stops = candidates.filter { it >= minZoom - 0.05f && it <= maxZoom + 0.01f }.toMutableList()
        if (minZoom < 0.95f && stops.none { abs(it - minZoom) < 0.1f }) stops.add(0, (minZoom * 10).toInt() / 10f)
        factors.map { it.second }.filter { it > 1.5f && it <= maxZoom }.forEach { f -> if (stops.none { abs(it - f) < 0.3f }) stops += (f * 10).toInt() / 10f }
        return stops.sorted()
    }

    companion object {
        fun sliderToZoom(t: Float, min: Float, max: Float): Float =
            (min.toDouble() * Math.pow(max.toDouble() / min, t.coerceIn(0f, 1f).toDouble())).toFloat()

        fun zoomToSlider(z: Float, min: Float, max: Float): Float =
            (Math.log(z.coerceIn(min, max).toDouble() / min) / Math.log(max.toDouble() / min)).toFloat()
    }
}
