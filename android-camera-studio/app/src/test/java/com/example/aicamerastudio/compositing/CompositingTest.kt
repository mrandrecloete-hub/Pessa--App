package com.example.aicamerastudio.compositing

import com.example.aicamerastudio.TestImages
import com.example.aicamerastudio.editor.masks.AlphaMask
import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.compositing.*
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.inpainting.InpaintPipeline
import com.example.aicamerastudio.photo.inpainting.PatchInpainter
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

class CompositingTest {
    private fun px(v: Int) = (0xFF shl 24) or (v shl 16) or (v shl 8) or v

    @Test fun homographyMapsCornersAndInverts() {
        val src = listOf(0.0 to 0.0, 100.0 to 0.0, 100.0 to 200.0, 0.0 to 200.0)
        val dst = listOf(10.0 to 20.0, 90.0 to 30.0, 120.0 to 220.0, -5.0 to 210.0)
        val h = Homography.fromPoints(src, dst)
        for (i in 0..3) { val (x, y) = h.map(src[i].first, src[i].second); assertEquals(dst[i].first, x, 1e-6); assertEquals(dst[i].second, y, 1e-6) }
        val (x, y) = h.inverse().map(h.map(37.0, 81.0).first, h.map(37.0, 81.0).second)
        assertEquals(37.0, x, 1e-6); assertEquals(81.0, y, 1e-6)
    }

    @Test fun layerCodecRoundTripAndRejectsGarbage() {
        val p = LayerParams(cx = 0.3f, cy = 0.7f, heightFrac = 0.4f, rotation = 12f, flip = true, perspTop = -0.1f, blur = 0.3f, shadowAngle = 200f, keepScaleWithDepth = true)
        assertEquals(p.validated(), LayerCodec.decode(LayerCodec.encode(p)))
        assertNull(LayerCodec.decode("nonsense")); assertNull(LayerCodec.decode("v=9;cx=1"))
        assertEquals(0.5f, LayerCodec.decode("v=1;cx=NaN")!!.cx, 0f)
    }

    @Test fun cornersFollowPositionScaleRotationAndPerspective() {
        val c = LayerGeometry.corners(LayerParams(cx = 0.5f, cy = 0.5f, heightFrac = 0.5f), 50, 100, 400, 400)
        assertEquals(150.0, c[0].first, 1e-6); assertEquals(100.0, c[0].second, 1e-6); assertEquals(250.0, c[2].first, 1e-6); assertEquals(300.0, c[2].second, 1e-6)
        val r = LayerGeometry.corners(LayerParams(cx = 0.5f, cy = 0.5f, heightFrac = 0.5f, rotation = 90f), 50, 100, 400, 400)
        assertEquals(300.0, r[0].first, 1e-6); assertEquals(150.0, r[0].second, 1e-6)
        val p = LayerGeometry.corners(LayerParams(cx = 0.5f, cy = 0.5f, heightFrac = 0.5f, perspTop = -0.5f), 50, 100, 400, 400)
        assertEquals(50.0, p[1].first - p[0].first, 1e-6); assertEquals(100.0, p[2].first - p[3].first, 1e-6)
    }

    @Test fun perspectiveScaleGuideKeepsHeightOverHorizonDistanceConstant() {
        val p = LayerParams(cx = 0.5f, cy = 0.6f, heightFrac = 0.4f, horizonY = 0.4f, keepScaleWithDepth = true)
        val k = p.heightFrac / (LayerGeometry.footY(p) - p.horizonY)
        val moved = LayerGeometry.scaledForMove(p, 0.5f, 0.5f)
        assertEquals(k, moved.heightFrac / (LayerGeometry.footY(moved) - moved.horizonY), 1e-4f)
        assertTrue(moved.heightFrac < p.heightFrac)
        assertEquals(p.heightFrac, LayerGeometry.scaledForMove(p.copy(keepScaleWithDepth = false), 0.5f, 0.5f).heightFrac, 0f)
    }

    @Test fun compositeKeepsSolidPixelsAndLeavesOutsideUntouched() {
        val dw = 200; val dh = 200
        val dest = IntArray(dw * dh) { px(60) }
        val cw = 40; val ch = 80
        val crop = IntArray(cw * ch) { px(220) }
        val alpha = FloatArray(cw * ch) { val x = it % cw; val y = it / cw; if (x in 5 until 35 && y in 5 until 75) 1f else 0f }
        val p = LayerParams(cx = 0.5f, cy = 0.5f, heightFrac = 0.4f, edgeFeather = 0f, shadows = false)
        val out = Compositor.render(dest, dw, dh, crop, alpha, cw, ch, p, null).pixels
        assertEquals(220, out[100 * dw + 100] and 255)
        assertEquals(60, out[10 * dw + 10] and 255)
        // flip keeps the solid centre
        assertEquals(220, Compositor.render(dest, dw, dh, crop, alpha, cw, ch, p.copy(flip = true), null).pixels[100 * dw + 100] and 255)
    }

    @Test fun occluderHidesThePersonWhenBehind() {
        val dw = 200; val dh = 200
        val dest = IntArray(dw * dh) { px(60) }
        val crop = IntArray(40 * 80) { px(220) }; val alpha = FloatArray(40 * 80) { 1f }
        val occ = FloatArray(dw * dh) { if (it / dw > 110) 1f else 0f } // a "table" covering the lower part
        val p = LayerParams(cx = 0.5f, cy = 0.5f, heightFrac = 0.4f, edgeFeather = 0f, shadows = false, behindOccluders = true)
        val out = Compositor.render(dest, dw, dh, crop, alpha, 40, 80, p, occ).pixels
        assertEquals(220, out[90 * dw + 100] and 255)
        assertEquals(60, out[130 * dw + 100] and 255)
        val front = Compositor.render(dest, dw, dh, crop, alpha, 40, 80, p.copy(behindOccluders = false), occ).pixels
        assertEquals(220, front[130 * dw + 100] and 255)
    }

    @Test fun shadowsDarkenGroundNearFeetOnly() {
        val dw = 300; val dh = 300
        val dest = IntArray(dw * dh) { px(200) }
        val crop = IntArray(40 * 100) { px(100) }; val alpha = FloatArray(40 * 100) { 1f }
        val p = LayerParams(cx = 0.5f, cy = 0.5f, heightFrac = 0.4f, edgeFeather = 0f, contactOpacity = 0.6f, castOpacity = 0.5f, shadowAngle = 160f)
        val out = Compositor.render(dest, dw, dh, crop, alpha, 40, 100, p, null).pixels
        val footY = 210
        assertTrue("contact shadow missing", (out[(footY + 2) * dw + 150] and 255) < 190)
        assertEquals("far pixel changed", 200, out[10 * dw + 10] and 255)
        val none = Compositor.render(dest, dw, dh, crop, alpha, 40, 100, p.copy(shadows = false), null).pixels
        assertEquals(200, none[(footY + 2) * dw + 150] and 255)
    }

    @Test fun colourSuggestionMovesTowardDestinationWithinLimits() {
        val warmDark = SceneAnalysis.Stats(0.05f, 0.1f, 0.08f, 0.05f, 0.03f, 1f)
        val coolBright = SceneAnalysis.Stats(0.3f, 0.15f, 0.25f, 0.3f, 0.4f, 1f)
        val s = SceneAnalysis.suggestColour(warmDark, coolBright)
        assertTrue(s.exposure > 0.5f && s.exposure <= 1.2f)
        assertTrue(s.temperature < 0f && s.temperature >= -0.5f)
        assertTrue(s.contrast > 0f && s.contrast <= 0.3f)
        assertEquals(0f, SceneAnalysis.suggestColour(coolBright, coolBright).exposure, 1e-4f)
    }

    @Test fun blurMatchFindsTheBlurThatWasApplied() {
        val img = TestImages.astronaut()
        val w = 128; val h = 128
        val small = Resample.resize(img.px, img.w, img.h, w, h)
        val target = SceneAnalysis.sharpness(BlurMatch.blur(small, w, h, 2f), w, h, null)
        val sigma = BlurMatch.suggestSigma(small, FloatArray(w * h) { 1f }, w, h, target)
        assertEquals(2f, sigma, 0.6f)
        assertEquals(0f, BlurMatch.suggestSigma(small, FloatArray(w * h) { 1f }, w, h, 99f), 0f)
    }

    @Test fun masksBrushMorphAndComponents() {
        val m = AlphaMask(100, 100)
        m.brush(30f, 30f, 10f, true); m.brush(80f, 80f, 6f, true)
        assertEquals(1f, m[30, 30], 0f); assertEquals(0f, m[55, 55], 0f)
        val (_, comps) = MaskOps.components(m.data, 100, 100)
        assertEquals(2, comps.size); assertTrue(comps[0].area > comps[1].area)
        m.stroke(30f, 30f, 80f, 80f, 3f, false)
        assertEquals(0f, m[55, 55], 0f); assertTrue(m[30, 30] < 0.5f)
        val grown = MaskOps.morph(FloatArray(100) { if (it == 55) 1f else 0f }, 10, 10, 1)
        assertEquals(9, grown.count { it == 1f })
        val bytes = m.toBytes(); val back = AlphaMask.fromBytes(100, 100, bytes)
        for (i in m.data.indices) assertEquals(m.data[i], back.data[i], 1f / 255f)
    }

    @Test fun guidedFilterSnapsAMaskToARealEdge() {
        val w = 80; val h = 40
        val guide = FloatArray(w * h) { if (it % w < 40) 0.1f else 0.9f } // real edge at x = 40
        val coarse = FloatArray(w * h) { if (it % w < 44) 1f else 0f }  // sloppy mask edge at x = 44
        val r = MaskOps.guidedFilter(guide, coarse, w, h, 6, 1e-3f)
        val plain = MaskOps.boxBlur(coarse, w, h, 6)
        println("guided filter: x=38 %.2f (plain %.2f), x=42 %.2f (plain %.2f)".format(r[20 * w + 38], plain[20 * w + 38], r[20 * w + 42], plain[20 * w + 42]))
        // Compared with a plain blur, the guided result is more solid inside the real edge and weaker outside it.
        assertTrue(r[20 * w + 38] > plain[20 * w + 38])
        assertTrue(r[20 * w + 42] < plain[20 * w + 42])
        assertTrue(r[20 * w + 30] > 0.95f && r[20 * w + 60] < 0.05f)
    }

    @Test fun patchInpaintingContinuesStripesBetterThanAFlatFill() {
        val w = 120; val h = 90
        val truth = IntArray(w * h) { val y = it / w; if ((y / 6) % 2 == 0) px(40) else px(210) }
        val hole = BooleanArray(w * h) { val x = it % w; val y = it / w; x in 50 until 72 && y in 30 until 58 }
        val filled = PatchInpainter.inpaint(truth, w, h, hole)
        val mean = truth.filterIndexed { i, _ -> !hole[i] }.map { it and 255 }.average().toInt()
        val flat = truth.copyOf().also { a -> for (i in a.indices) if (hole[i]) a[i] = px(mean) }
        val pInpaint = TestImages.psnr(filled, truth, hole); val pFlat = TestImages.psnr(flat, truth, hole)
        println("stripes: inpaint %.1f dB vs flat fill %.1f dB".format(pInpaint, pFlat))
        assertTrue(pInpaint > pFlat + 10)
        for (i in truth.indices) if (!hole[i]) assertEquals(truth[i], filled[i])
    }

    @Test fun removalOnARealPhotoOnlyChangesTheSelectionAndItsEdge() {
        val img = TestImages.astronaut()
        val sel = FloatArray(img.w * img.h) { val x = it % img.w; val y = it / img.w; if (x in 20 until 60 && y in 200 until 260) 1f else 0f } // part of the flag
        val t0 = System.nanoTime()
        val res = InpaintPipeline.remove(img.px, img.w, img.h, sel, expandPx = 3)
        val ms = (System.nanoTime() - t0) / 1_000_000
        val hole = BooleanArray(img.w * img.h) { val x = it % img.w; val y = it / img.w; x in 17 until 63 && y in 197 until 263 }
        val far = BooleanArray(img.w * img.h) { val x = it % img.w; val y = it / img.w; x !in 10 until 70 || y !in 190 until 270 }
        for (i in img.px.indices) if (far[i]) assertEquals("pixel outside the edit changed", img.px[i], res.pixels[i])
        val mean = img.px.filterIndexed { i, _ -> !hole[i] }.map { it and 255 }.average().toInt()
        val flat = img.px.copyOf().also { a -> for (i in a.indices) if (hole[i]) a[i] = px(mean) }
        val pIn = TestImages.psnr(res.pixels, img.px, hole); val pFlat = TestImages.psnr(flat, img.px, hole)
        println("astronaut flag removal: inpaint %.1f dB vs flat %.1f dB vs ground truth, %d ms on this JVM".format(pIn, pFlat, ms))
        assertTrue(pIn > pFlat)
        assertTrue(res.notes.any { it.contains("not what was really behind") })
    }
}
