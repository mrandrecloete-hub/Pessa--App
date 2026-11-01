package com.example.aicamerastudio.photo

import com.example.aicamerastudio.TestImages
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.OnnxModel
import com.example.aicamerastudio.photo.filters.FilterMath
import com.example.aicamerastudio.photo.filters.Filters
import com.example.aicamerastudio.photo.hdr.ExposureFusion
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.pipeline.*
import com.example.aicamerastudio.photo.portrait.PortraitLight
import com.example.aicamerastudio.photo.portrait.PortraitRenderer
import com.example.aicamerastudio.photo.segmentation.PersonSegmenter
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

class CreativeTest {
    private val img = TestImages.astronaut()

    @Test fun thereAreTenDistinctFiltersAndNaturalIsIdentity() {
        assertEquals(10, Filters.ALL.size)
        assertEquals(listOf("Natural", "Vivid", "Cinematic", "Vintage", "Warm", "Cool", "Black and White", "Golden Hour", "Dramatic", "Film"), Filters.ALL.map { it.label })
        assertArrayEquals(img.px, Filters.render(img.px, img.w, img.h, Filters.NATURAL, 1f))
        val outs = Filters.ALL.drop(1).map { Filters.render(img.px, img.w, img.h, it, 1f).contentHashCode() }.toSet()
        assertEquals(9, outs.size)
    }

    @Test fun intensityZeroIsOriginalAndBlackAndWhiteIsGrey() {
        val bw = Filters.byId("bw")
        assertArrayEquals(img.px, Filters.render(img.px, img.w, img.h, bw, 0f))
        val out = Filters.render(img.px, img.w, img.h, bw, 1f)
        for (i in out.indices step 997) { val c = out[i]; assertTrue(abs(((c shr 16) and 255) - (c and 255)) <= 1) }
        val half = FilterMath.mix(bw.matrix, 0.5f)
        assertEquals((1f + bw.matrix[0]) / 2, half[0], 1e-6f)
    }

    @Test fun matrixConcatEqualsSequentialApplication() {
        val a = FilterMath.saturation(1.3f); val b = FilterMath.contrast(1.2f, 5f)
        val seq = FilterMath.apply(FilterMath.apply(img.px, a), b)
        val once = FilterMath.apply(img.px, FilterMath.concat(a, b))
        var maxD = 0
        for (i in seq.indices step 101) for (sh in intArrayOf(16, 8, 0)) maxD = maxOf(maxD, abs(((seq[i] shr sh) and 255) - ((once[i] shr sh) and 255)))
        assertTrue("max diff $maxD (rounding between steps only)", maxD <= 3)
    }

    @Test fun warmAndCoolMoveColourTheRightWay() {
        val grey = IntArray(16) { (0xFF shl 24) or 0x808080 }
        val warm = Filters.render(grey, 4, 4, Filters.byId("warm"), 1f)[5]; val cool = Filters.render(grey, 4, 4, Filters.byId("cool"), 1f)[5]
        assertTrue(((warm shr 16) and 255) > (warm and 255)); assertTrue((cool and 255) > ((cool shr 16) and 255))
    }

    @Test fun exposureFusionRecoversShadowsAndHighlights() {
        // Simulate a bracket from the real photo: dark (-1.5 EV) and bright (+1.5 EV) with clipping.
        val small = Resample.resize(img.px, img.w, img.h, 256, 256)
        fun ev(e: Float): IntArray { val o = ArrayPixels(256, 256); Enhancer().enhance(ArrayPixels(256, 256, small), o, EnhancementParams(exposureEv = e)); return o.pixels }
        val dark = ev(-1.5f); val bright = ev(1.5f)
        val fused = ExposureFusion.fuse(listOf(dark, small, bright), 256, 256)
        val s = ImageAnalyzer.analyze(ArrayPixels(256, 256, fused)); val sb = ImageAnalyzer.analyze(ArrayPixels(256, 256, bright)); val sd = ImageAnalyzer.analyze(ArrayPixels(256, 256, dark))
        println("HDR fusion: clipped highlights bright %.3f -> fused %.3f; crushed shadows dark %.3f -> fused %.3f".format(sb.highlightClip, s.highlightClip, sd.shadowClip, s.shadowClip))
        val sm = ImageAnalyzer.analyze(ArrayPixels(256, 256, small))
        println("normal exposure: highlights %.3f, shadows %.3f".format(sm.highlightClip, sm.shadowClip))
        assertTrue(s.highlightClip <= sm.highlightClip + 0.001f && s.highlightClip < sb.highlightClip)
        assertTrue(s.shadowClip <= sm.shadowClip + 0.01f && s.shadowClip < sb.shadowClip + sd.shadowClip)
        val p = TestImages.psnr(fused, small); println("fused vs middle exposure PSNR %.1f dB".format(p)); assertTrue(p > 20)
        assertArrayEquals(small, ExposureFusion.fuse(listOf(small), 256, 256))
    }

    @Test fun portraitBlursBackgroundAndKeepsTheSubject() {
        OnnxModel(TestImages.model(ModelNames.PERSON_SEG)).use { m ->
            val seg = PersonSegmenter(m).segment(img.px, img.w, img.h)
            val out = PortraitRenderer.render(img.px, img.w, img.h, seg.person, 0.8f, PortraitLight.NATURAL, 0f)
            val subj = BooleanArray(img.px.size) { seg.person[it] > 0.98f }; val bg = BooleanArray(img.px.size) { seg.person[it] < 0.02f }
            val pSub = TestImages.psnr(out, img.px, subj); val pBg = TestImages.psnr(out, img.px, bg)
            println("portrait: subject PSNR %.1f dB (unchanged), background PSNR %.1f dB (blurred)".format(pSub, pBg))
            assertTrue(pSub > 40); assertTrue(pBg < 30)
            val face = PortraitRenderer.faceBox(seg.face, img.w, img.h)
            println("face box: ${face?.toList()}")
            assertNotNull(face); val (x, y, w, h) = face!!.toList()
            assertTrue("face box should contain the face centre (~220,100)", 220 in x..(x + w) && 100 in y..(y + h))
            val stage = PortraitRenderer.render(img.px, img.w, img.h, seg.person, 0f, PortraitLight.STAGE, 1f)
            var bgL = 0.0; var n = 0; for (i in stage.indices) if (bg[i]) { bgL += stage[i] and 255; n++ }
            assertTrue("stage light darkens background", bgL / n < 40)
            TestImages.save("portrait", out, img.w, img.h); TestImages.save("stage", stage, img.w, img.h)
        }
    }
}

class PortraitScaleTest {
    @Test fun reducedResolutionBlurLooksTheSameAsAFullBlurWouldOnALargePhoto() {
        val img = TestImages.astronaut()
        // Enlarge to a 2048x2048 "phone photo" and use a synthetic soft subject mask.
        val big = Resample.bicubic(img.px, 512, 512, 2048, 2048)
        val mask = FloatArray(2048 * 2048) { val x = it % 2048; val y = it / 2048; val d = Math.hypot(x - 1000.0, y - 1000.0); ((700 - d) / 40).toFloat().coerceIn(0f, 1f) }
        val t0 = System.nanoTime()
        val out = PortraitRenderer.render(big, 2048, 2048, mask, 0.8f, PortraitLight.NATURAL, 0f)
        println("portrait 4 MP render: %d ms".format((System.nanoTime() - t0) / 1_000_000))
        // Subject stays sharp, background is blurred and smooth (no blocky upsampling artefacts).
        val inner = BooleanArray(out.size) { mask[it] == 1f }
        assertTrue(TestImages.psnr(out, big, inner) > 45)
        var maxStep = 0
        for (y in 10 until 300) for (x in 10 until 300) { val a = out[y * 2048 + x] and 255; val b = out[y * 2048 + x + 1] and 255; maxStep = maxOf(maxStep, kotlin.math.abs(a - b)) }
        println("largest neighbouring step in blurred corner: $maxStep")
        assertTrue("blur must be smooth", maxStep <= 3)
    }
}
