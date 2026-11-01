package com.example.aicamerastudio.photo

import com.example.aicamerastudio.photo.pipeline.*
import org.junit.Assert.*
import org.junit.Test
import java.util.Random
import kotlin.math.abs
import kotlin.math.log2
import kotlin.math.sqrt

class PipelineTest {

    private fun px(r: Int, g: Int, b: Int) = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
    private fun solid(w: Int, h: Int, r: Int, g: Int, b: Int) =
        ArrayPixels(w, h, IntArray(w * h) { px(r, g, b) })

    private fun noisy(w: Int, h: Int, base: Int, sigma: Double, seed: Long = 7): ArrayPixels {
        val rnd = Random(seed)
        return ArrayPixels(w, h, IntArray(w * h) {
            val v = (base + rnd.nextGaussian() * sigma).toInt().coerceIn(0, 255)
            px(v, v, v)
        })
    }

    private fun run(src: ArrayPixels, p: EnhancementParams, band: Int = 1_000_000): ArrayPixels {
        val dst = ArrayPixels(src.width, src.height)
        Enhancer(band).enhance(src, dst, p)
        return dst
    }

    private fun lumaOf(p: Int) = ColorMath.luma8(p)

    // ---- colour math -------------------------------------------------------------------------

    @Test fun srgbRoundTripIsExact() {
        for (v in 0..255) {
            assertEquals(v, ColorMath.linearToSrgb8(ColorMath.srgbToLinear[v]))
        }
    }

    @Test fun midGreyIsAbout21PercentLinear() {
        assertEquals(0.2140f, ColorMath.srgbToLinear[128], 0.002f)
    }

    // ---- tone curve --------------------------------------------------------------------------

    @Test fun toneCurveIsMonotonicForExtremeSettings() {
        val extremes = listOf(
            EnhancementParams(shadows = 1f, highlights = -1f, contrast = 0.8f),
            EnhancementParams(shadows = -1f, highlights = 1f, contrast = -1f),
            EnhancementParams(blackPoint = 0.2f, whitePoint = 0.8f, contrast = 0.8f, shadows = 1f),
        ).map { it.validated() }
        for (a in extremes) {
            var prev = -1f
            for (i in 0..1000) {
                val v = ToneCurve.mapTone(i / 1000f, a)
                assertTrue("not monotonic at $i for $a", v >= prev - 1e-6f)
                prev = v
            }
        }
    }

    @Test fun neutralParamsGiveIdentityCurve() {
        val a = EnhancementParams().validated()
        for (i in 0..100) assertEquals(i / 100f, ToneCurve.mapTone(i / 100f, a), 1e-5f)
    }

    // ---- params ------------------------------------------------------------------------------

    @Test fun validationClampsOutOfRangeValues() {
        val v = EnhancementParams(exposureEv = 99f, saturation = -4f, denoiseRadius = 40, whitePoint = 0.1f).validated()
        assertEquals(3f, v.exposureEv, 0f)
        assertEquals(0f, v.saturation, 0f)
        assertEquals(3, v.denoiseRadius)
        assertTrue(v.whitePoint - v.blackPoint >= 0.3f - 1e-6f)
    }

    // ---- enhancer ----------------------------------------------------------------------------

    @Test fun identityParamsLeavePixelsUnchanged() {
        val rnd = Random(1)
        val src = ArrayPixels(37, 29, IntArray(37 * 29) { px(rnd.nextInt(256), rnd.nextInt(256), rnd.nextInt(256)) })
        val out = run(src, EnhancementParams())
        for (i in src.pixels.indices) {
            for (shift in intArrayOf(16, 8, 0)) {
                val d = abs(((src.pixels[i] shr shift) and 255) - ((out.pixels[i] shr shift) and 255))
                assertTrue("pixel $i channel shift $shift differs by $d", d <= 1)
            }
        }
    }

    @Test fun bandedProcessingMatchesWholeImageProcessing() {
        val rnd = Random(3)
        val w = 41; val h = 53
        val src = ArrayPixels(w, h, IntArray(w * h) {
            val v = (110 + rnd.nextGaussian() * 12).toInt().coerceIn(0, 255)
            px(v, (v * 0.9).toInt(), (v * 0.8).toInt())
        })
        val p = EnhancementParams(
            exposureEv = 0.4f, contrast = 0.2f, shadows = 0.3f, highlights = -0.2f, saturation = 1.1f, vibrance = 0.2f,
            denoiseStrength = 0.8f, denoiseRadius = 2, denoiseRangeSigma = 15f,
            sharpenAmount = 0.8f, sharpenThreshold = 3f,
        )
        val whole = run(src, p, band = 1_000_000)
        val banded = run(src, p, band = w * 16) // forces bands of 16 rows, many boundaries
        assertArrayEquals(whole.pixels, banded.pixels)
    }

    @Test fun positiveExposureBrightensAndNegativeDarkens() {
        val src = solid(8, 8, 100, 100, 100)
        val up = run(src, EnhancementParams(exposureEv = 1f))
        val down = run(src, EnhancementParams(exposureEv = -1f))
        val lu = ColorMath.srgbToLinear[up.pixels[0] and 255]
        val l0 = ColorMath.srgbToLinear[100]
        val ld = ColorMath.srgbToLinear[down.pixels[0] and 255]
        assertEquals(1.0, log2((lu / l0).toDouble()), 0.05)
        assertEquals(-1.0, log2((ld / l0).toDouble()), 0.05)
    }

    @Test fun exposureWorksInLinearLightNotOnEncodedValues() {
        // Doubling encoded 100 would give 200; +1 EV in linear light gives about 137*... check it differs.
        val out = run(solid(4, 4, 100, 100, 100), EnhancementParams(exposureEv = 1f))
        val v = out.pixels[0] and 255
        assertTrue("expected ~137, got $v", v in 130..145)
    }

    @Test fun saturationZeroGivesGreyAndKeepsLuma() {
        val out = run(solid(4, 4, 200, 80, 40), EnhancementParams(saturation = 0f))
        val p = out.pixels[0]
        val r = (p shr 16) and 255; val g = (p shr 8) and 255; val b = p and 255
        assertTrue(abs(r - g) <= 1 && abs(g - b) <= 1)
        val lin = ColorMath.luma(ColorMath.srgbToLinear[200], ColorMath.srgbToLinear[80], ColorMath.srgbToLinear[40])
        assertEquals(lin, ColorMath.srgbToLinear[g], 0.01f)
    }

    @Test fun whiteBalanceGainsCorrectWarmCast() {
        val warm = solid(4, 4, 160, 130, 100)
        // Gains are applied in linear light, so derive them from linear values.
        val lin = ColorMath.srgbToLinear
        val gr = lin[130] / lin[160]; val gb = lin[130] / lin[100]
        val out = run(warm, EnhancementParams(gainR = gr, gainB = gb))
        val p = out.pixels[0]
        val r = (p shr 16) and 255; val g = (p shr 8) and 255; val b = p and 255
        assertTrue("r=$r g=$g b=$b", abs(r - g) <= 3 && abs(b - g) <= 3)
    }

    @Test fun denoiseReducesNoiseOnFlatAreaButKeepsAnEdge() {
        val w = 64; val h = 64
        val rnd = Random(11)
        val src = ArrayPixels(w, h, IntArray(w * h) { i ->
            val x = i % w
            val base = if (x < w / 2) 60 else 190
            val v = (base + rnd.nextGaussian() * 6).toInt().coerceIn(0, 255)
            px(v, v, v)
        })
        fun sd(p: ArrayPixels, x0: Int, x1: Int): Double {
            val vals = ArrayList<Int>()
            for (y in 8 until h - 8) for (x in x0 until x1) vals += p.pixels[y * w + x] and 255
            val m = vals.average()
            return sqrt(vals.sumOf { (it - m) * (it - m) } / vals.size)
        }
        val out = run(src, EnhancementParams(denoiseStrength = 1f, denoiseRadius = 2, denoiseRangeSigma = 18f))
        assertTrue(sd(out, 8, 24) < sd(src, 8, 24) * 0.6)
        val dark = (8 until 24).map { out.pixels[32 * w + it] and 255 }.average()
        val bright = (40 until 56).map { out.pixels[32 * w + it] and 255 }.average()
        assertTrue("edge contrast lost: $dark vs $bright", bright - dark > 110)
    }

    @Test fun sharpenIncreasesEdgeContrastButRespectsLimit() {
        val w = 40; val h = 20
        val src = ArrayPixels(w, h, IntArray(w * h) { i -> val v = if (i % w < w / 2) 90 else 160; px(v, v, v) })
        val p = EnhancementParams(sharpenAmount = 1.5f, sharpenThreshold = 1f, sharpenLimit = 20f)
        val out = run(src, p)
        val x = w / 2
        val dark = out.pixels[10 * w + x - 1] and 255
        val bright = out.pixels[10 * w + x] and 255
        assertTrue(dark < 90)
        assertTrue(bright > 160)
        assertTrue("overshoot beyond limit", dark >= 90 - 20 && bright <= 160 + 20)
    }

    @Test fun sharpenDoesNotTouchSubThresholdTexture() {
        val rnd = Random(5)
        val w = 32; val h = 32
        val src = ArrayPixels(w, h, IntArray(w * h) { val v = 120 + rnd.nextInt(3) - 1; px(v, v, v) })
        val out = run(src, EnhancementParams(sharpenAmount = 2f, sharpenThreshold = 8f))
        assertArrayEquals(src.pixels, out.pixels)
    }

    @Test fun cancellationStopsProcessing() {
        val src = solid(100, 100, 100, 100, 100)
        try {
            Enhancer(1000).enhance(src, ArrayPixels(100, 100), EnhancementParams(exposureEv = 1f), isCancelled = { true })
            fail("expected cancellation")
        } catch (e: EnhancementCancelled) {
            // expected
        }
    }

    // ---- analyzer ----------------------------------------------------------------------------

    @Test fun analyzerDetectsDarkAndClippedImages() {
        val dark = ImageAnalyzer.analyze(solid(50, 50, 20, 20, 20))
        assertEquals(1f, dark.darkFraction, 0.001f)
        assertEquals(0f, dark.highlightClip, 0.001f)
        val white = ImageAnalyzer.analyze(solid(50, 50, 255, 255, 255))
        assertEquals(1f, white.highlightClip, 0.001f)
    }

    @Test fun analyzerEstimatesNoiseReasonably() {
        val s = ImageAnalyzer.analyze(noisy(200, 200, 110, 5.0))
        assertEquals(5.0, s.noiseSigma.toDouble(), 1.0)
        val clean = ImageAnalyzer.analyze(solid(200, 200, 110, 110, 110))
        assertEquals(0.0, clean.noiseSigma.toDouble(), 0.01)
    }

    @Test fun analyzerFindsColourCastInNeutralScene() {
        val s = ImageAnalyzer.analyze(solid(60, 60, 170, 140, 110))
        assertTrue(s.neutralR > s.neutralG && s.neutralG > s.neutralB)
    }

    // ---- planner -----------------------------------------------------------------------------

    @Test fun darkImageGetsBrightened() {
        val st = ImageAnalyzer.analyze(noisy(100, 100, 35, 3.0))
        val p = EnhancementPlanner.plan(st, EnhancementProfile.NATURAL, 1f, ProcessingLevel.BALANCED)
        assertTrue("ev=${p.exposureEv}", p.exposureEv > 0.3f)
    }

    @Test fun brightImageWithClippingIsNotBrightened() {
        val w = 100; val h = 100
        val src = ArrayPixels(w, h, IntArray(w * h) { i -> if (i % 10 == 0) px(255, 255, 255) else px(90, 90, 90) })
        val st = ImageAnalyzer.analyze(src)
        val p = EnhancementPlanner.plan(st, EnhancementProfile.IPHONE_INSPIRED, 1f, ProcessingLevel.BALANCED)
        assertTrue("ev=${p.exposureEv}", p.exposureEv <= 0.11f)
    }

    @Test fun strengthZeroProducesIdentity() {
        val st = ImageAnalyzer.analyze(noisy(60, 60, 40, 4.0))
        assertTrue(EnhancementPlanner.plan(st, EnhancementProfile.NIGHT, 0f, ProcessingLevel.MAXIMUM).isIdentity())
    }

    @Test fun cleanImageGetsNoDenoise_noisyImageDoes() {
        val clean = EnhancementPlanner.plan(ImageAnalyzer.analyze(solid(80, 80, 100, 100, 100)), EnhancementProfile.NATURAL, 1f, ProcessingLevel.BALANCED)
        val noisy = EnhancementPlanner.plan(ImageAnalyzer.analyze(noisy(80, 80, 100, 8.0)), EnhancementProfile.NATURAL, 1f, ProcessingLevel.BALANCED)
        assertEquals(0f, clean.denoiseStrength, 0.001f)
        assertTrue(noisy.denoiseStrength > 0.3f)
    }

    @Test fun highlySaturatedSceneIsNotWhiteBalanced() {
        val st = ImageAnalyzer.analyze(solid(60, 60, 220, 30, 30))
        val p = EnhancementPlanner.plan(st, EnhancementProfile.NATURAL, 1f, ProcessingLevel.BALANCED)
        assertEquals(1f, p.gainR, 0.001f)
        assertEquals(1f, p.gainB, 0.001f)
    }

    @Test fun colourCastCorrectionIsConservative() {
        val st = ImageAnalyzer.analyze(solid(60, 60, 170, 140, 110))
        val p = EnhancementPlanner.plan(st, EnhancementProfile.PROFESSIONAL, 1f, ProcessingLevel.BALANCED)
        assertTrue(p.gainR < 1f && p.gainB > 1f)
        assertTrue("r=${p.gainR} b=${p.gainB}", p.gainR >= 0.85f / 1.2f && p.gainB <= 1.18f * 1.2f)
    }

    @Test fun profilesProduceDifferentSettings() {
        val st = ImageAnalyzer.analyze(noisy(80, 80, 60, 3.0))
        val all = EnhancementProfile.values().map { EnhancementPlanner.plan(st, it, 0.8f, ProcessingLevel.BALANCED) }
        assertEquals(EnhancementProfile.values().size, all.toSet().size)
    }

    @Test fun maximumLevelUsesLargerDenoiseRadius() {
        val st = ImageAnalyzer.analyze(noisy(80, 80, 60, 6.0))
        val q = EnhancementPlanner.plan(st, EnhancementProfile.NATURAL, 1f, ProcessingLevel.QUICK)
        val m = EnhancementPlanner.plan(st, EnhancementProfile.NATURAL, 1f, ProcessingLevel.MAXIMUM)
        assertTrue(m.denoiseRadius > q.denoiseRadius)
    }

    // ---- validator ---------------------------------------------------------------------------

    @Test fun validatorRejectsHeavyHighlightClipping() {
        val before = ImageAnalyzer.analyze(solid(50, 50, 120, 120, 120))
        val after = ImageAnalyzer.analyze(solid(50, 50, 255, 255, 255))
        assertFalse(QualityValidator.validate(before, after).ok)
    }

    @Test fun fullPipelineOnDarkNoisyImageValidatesAndImproves() {
        val src = noisy(160, 120, 40, 4.0)
        val st = ImageAnalyzer.analyze(src)
        val params = EnhancementPlanner.plan(st, EnhancementProfile.NIGHT, 0.8f, ProcessingLevel.BALANCED)
        val out = run(src, params)
        val after = ImageAnalyzer.analyze(out)
        assertTrue(after.meanLuma > st.meanLuma + 0.05f)
        assertTrue(QualityValidator.validate(st, after).ok)
        assertEquals(lumaOf(out.pixels[0]) in 0..255, true)
    }
}
