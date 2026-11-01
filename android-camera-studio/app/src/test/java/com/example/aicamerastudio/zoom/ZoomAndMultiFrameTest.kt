package com.example.aicamerastudio.zoom

import com.example.aicamerastudio.camera.stabilisation.StabilityMeter
import com.example.aicamerastudio.camera.stabilisation.Steadiness
import com.example.aicamerastudio.camera.zoom.*
import com.example.aicamerastudio.photo.multiframe.*
import com.example.aicamerastudio.photo.imaging.Resample
import org.junit.Assert.*
import org.junit.Test
import java.util.Random

class ZoomAndMultiFrameTest {
    // Lens data shaped like a phone with ultra wide, main and 3x telephoto inside one logical camera (values in mm).
    private val ultra = LensSpec("2", 2.2f, 5.6f, 4.2f, false)
    private val main = LensSpec("0", 6.0f, 7.4f, 5.55f, false)
    private val tele = LensSpec("3", 9.0f, 3.7f, 2.775f, false) // 9 mm on a sensor half the size = 3x

    @Test fun lensFactorsComeFromFocalLengthAndSensorSize() {
        val f = ZoomPlanner(listOf(ultra, tele), main, 0.6f, 30f).opticalFactors
        assertEquals(3, f.size); assertEquals(1f, f[1], 0.01f); assertEquals(3f, f[2], 0.05f); assertTrue(f[0] < 0.7f)
    }

    @Test fun opticalOnlyAtRealLensFactors() {
        val z = ZoomPlanner(listOf(ultra, tele), main, 0.6f, 30f)
        assertEquals(ZoomKind.OPTICAL, z.plan(1f).kind)
        assertEquals(ZoomKind.OPTICAL, z.plan(3f).kind)
        assertEquals(ZoomKind.DIGITAL, z.plan(2f).kind)
        val ten = z.plan(10f)
        assertEquals(ZoomKind.DIGITAL, ten.kind); assertTrue(ten.label.contains("digital")); assertFalse(ten.label.contains("optical"))
        assertEquals("3", ten.route.lens?.cameraId); assertNotNull(ten.warning)
        assertNull(ten.route.bindCameraId) // logical camera switches lenses by itself
    }

    @Test fun beyondCameraMaximumIsExtendedNotOptical() {
        val z = ZoomPlanner(emptyList(), main, 1f, 8f)
        val p = z.plan(20f)
        assertEquals(ZoomKind.EXTENDED, p.kind); assertEquals(8f, p.route.cameraRatio, 0.001f); assertEquals(2.5f, p.route.extendedCrop, 0.001f)
        assertTrue(p.warning!!.contains("generated")); assertEquals(32f, z.maxZoom, 0.001f)
    }

    @Test fun separateTelephotoCameraIsBoundWhenItHelps() {
        val sepTele = tele.copy(cameraId = "5", separateCamera = true)
        val sepUltra = ultra.copy(cameraId = "6", separateCamera = true)
        val z = ZoomPlanner(listOf(sepTele, sepUltra), main, 1f, 8f, separateMaxRatio = mapOf("5" to 10f))
        assertEquals("5", z.route(3f).bindCameraId); assertEquals(1f, z.route(3f).cameraRatio, 0.02f)
        assertEquals(ZoomKind.OPTICAL, z.plan(3f).kind)
        val r = z.route(20f); assertEquals("5", r.bindCameraId); assertEquals(20f / 3f, r.cameraRatio, 0.1f); assertEquals(1f, r.extendedCrop, 0.01f)
        assertNull(z.route(2f).bindCameraId) // main camera digital zoom is better than nothing below 3x
        assertEquals("6", z.route(0.6f).bindCameraId)
        // Unknown maximum of an unbound camera is treated as 1x: the rest becomes an honest extended crop.
        val unknown = ZoomPlanner(listOf(sepTele), main, 1f, 2f)
        assertEquals(ZoomKind.EXTENDED, unknown.plan(6f).kind)
    }

    @Test fun quickStopsOnlyIncludeReachableLevels() {
        assertEquals(listOf(1f, 3f, 10f, 20f, 30f), ZoomPlanner(emptyList(), main, 1f, 8f).quickStops())
        val stops = ZoomPlanner(listOf(ultra, tele), main, 0.6f, 30f).quickStops()
        assertTrue(stops.first() < 0.7f); assertTrue(100f in stops); assertTrue(stops.any { kotlin.math.abs(it - 3f) < 0.1f })
        assertEquals(listOf(1f, 3f, 10f), ZoomPlanner(emptyList(), null, 1f, 4f).quickStops())
    }

    @Test fun sliderMappingIsLogarithmicAndInvertible() {
        assertEquals(1f, ZoomPlanner.sliderToZoom(0f, 1f, 100f), 1e-4f)
        assertEquals(10f, ZoomPlanner.sliderToZoom(0.5f, 1f, 100f), 1e-3f)
        assertEquals(0.5f, ZoomPlanner.zoomToSlider(10f, 1f, 100f), 1e-4f)
    }

    @Test fun stabilityThresholdsTightenWithZoom() {
        val m = StabilityMeter(smoothing = 1f)
        m.add(0.05f, 0f, 0f)
        assertEquals(Steadiness.STEADY, m.state(1f))
        assertEquals(Steadiness.SHAKY, m.state(10f))
        m.add(0f, 0f, 0f)
        assertEquals(Steadiness.STEADY, m.state(30f))
    }

    // --- multi frame ---------------------------------------------------------------------------

    /** Real photo content (public domain astronaut), not a synthetic repeating pattern. */
    private fun scene(w: Int, h: Int): IntArray {
        val img = com.example.aicamerastudio.TestImages.astronaut()
        return Resample.crop(img.px, img.w, (img.w - w) / 2, (img.h - h) / 2, w, h)
    }

    @Test fun alignerIsNotFooledByARepeatingPattern() {
        val w = 320; val h = 240
        val stripes = IntArray(w * h) { i -> val x = i % w; val y = i / w
            val v = (128 + 60 * Math.sin(x / 5.0) * Math.cos(y / 7.0) + (if ((x / 16 + y / 16) % 2 == 0) 30 else -30)).toInt().coerceIn(0, 255)
            (0xFF shl 24) or (v shl 16) or (v shl 8) or v }
        val f = shifted(stripes, w, h, 5, -3, 3.0, 9)
        assertEquals(5 to -3, FrameAligner.estimateShift(Resample.luma(stripes), Resample.luma(f), w, h))
    }

    private fun shifted(src: IntArray, w: Int, h: Int, dx: Int, dy: Int, noise: Double, seed: Long): IntArray {
        val rnd = Random(seed)
        return IntArray(w * h) { i ->
            val x = (i % w - dx).coerceIn(0, w - 1); val y = (i / w - dy).coerceIn(0, h - 1)
            val c = src[y * w + x]
            fun ch(v: Int) = (v + rnd.nextGaussian() * noise).toInt().coerceIn(0, 255)
            (0xFF shl 24) or (ch((c shr 16) and 255) shl 16) or (ch((c shr 8) and 255) shl 8) or ch(c and 255)
        }
    }

    @Test fun alignerRecoversKnownShifts() {
        val w = 320; val h = 240; val s = scene(w, h)
        for ((dx, dy) in listOf(5 to -3, -12 to 7, 0 to 0, 20 to 15)) {
            val f = shifted(s, w, h, dx, dy, 3.0, 9)
            assertEquals(dx to dy, FrameAligner.estimateShift(Resample.luma(s), Resample.luma(f), w, h))
        }
    }

    @Test fun mergeReducesNoiseRejectsBlurAndAvoidsGhosts() {
        val w = 256; val h = 192; val clean = scene(w, h)
        val frames = (0 until 5).map { k -> shifted(clean, w, h, k * 2 - 4, 3 - k, 8.0, 100L + k) }.toMutableList()
        // Frame 4 is badly blurred: it must be rejected.
        val blurred = com.example.aicamerastudio.photo.compositing.BlurMatch.blur(frames[4], w, h, 3f)
        frames[4] = blurred
        // A moving object (white square) appears only in frame 2: it must not ghost into the result.
        val f2 = frames[2]; val (dx2, dy2) = 0 to 1
        for (y in 40 until 80) for (x in 150 until 190) f2[(y + dy2) * w + x + dx2] = -1
        val (out, rep) = FrameMerger.merge(frames, w, h, noiseSigma = 8f, reference = 0)
        assertTrue("blurred frame not rejected: ${rep.rejectedBlurry}", 4 in rep.rejectedBlurry)
        assertTrue(rep.framesUsed >= 3)
        assertTrue(rep.ghostRejectedFraction > 0f)
        // Compare with the clean scene aligned to the reference frame.
        val refIdx = rep.referenceIndex
        assertEquals(0, refIdx)
        val refClean = shifted(clean, w, h, refIdx * 2 - 4, 3 - refIdx, 0.0, 1)
        val inner = BooleanArray(w * h) { val x = it % w; val y = it / w; x in 20 until w - 20 && y in 20 until h - 20 }
        val single = com.example.aicamerastudio.TestImages.psnr(frames[refIdx], refClean, inner)
        val merged = com.example.aicamerastudio.TestImages.psnr(out, refClean, inner)
        println("multi-frame: single frame PSNR %.2f dB, merged PSNR %.2f dB, used %d of %d, ghost tiles %.3f".format(single, merged, rep.framesUsed, rep.framesGiven, rep.ghostRejectedFraction))
        assertTrue("merge should reduce noise", merged > single + 2.0)
        // No ghost: the moving square area must not be whitened in the output.
        var white = 0
        for (y in 50 until 70) for (x in 160 until 180) if ((out[y * w + x] and 255) > 240 && ((out[y * w + x] shr 16) and 255) > 240) white++
        assertEquals(0, white)
    }
}
