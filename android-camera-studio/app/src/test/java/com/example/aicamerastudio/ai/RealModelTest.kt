package com.example.aicamerastudio.ai

import com.example.aicamerastudio.TestImages
import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.OnnxModel
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.segmentation.PeopleFinder
import com.example.aicamerastudio.photo.segmentation.PersonSegmenter
import com.example.aicamerastudio.photo.segmentation.TapSegmenter
import com.example.aicamerastudio.photo.superresolution.SrMethod
import com.example.aicamerastudio.photo.superresolution.SuperResolutionPipeline
import com.example.aicamerastudio.photo.superresolution.SuperResolver
import com.example.aicamerastudio.photo.compositing.SceneAnalysis
import org.junit.Assert.*
import org.junit.Test

/** Runs the three bundled ONNX models for real on the public domain astronaut photo. */
class RealModelTest {
    private val img = TestImages.astronaut()

    @Test fun personSegmentationFindsTheAstronautAndNotTheBackground() {
        OnnxModel(TestImages.model(ModelNames.PERSON_SEG)).use { m ->
            val t0 = System.nanoTime()
            val seg = PersonSegmenter(m).segment(img.px, img.w, img.h)
            println("segmentation: %d ms".format((System.nanoTime() - t0) / 1_000_000))
            fun frac(x0: Int, y0: Int, x1: Int, y1: Int): Float { var s = 0f; var n = 0; for (y in y0 until y1) for (x in x0 until x1) { s += seg.person[y * img.w + x]; n++ }; return s / n }
            assertTrue("face", frac(190, 60, 250, 140) > 0.9f)
            assertTrue("hair", frac(170, 20, 240, 50) > 0.6f)
            assertTrue("top right background ${frac(420, 0, 512, 80)}", frac(420, 0, 512, 80) < 0.01f)
            assertTrue("whole frame must not carry a faint ghost", seg.person.count { it in 0.01f..0.2f } < seg.person.size / 20)
            var hairSum = 0f; for (y in 20 until 50) for (x in 170 until 240) hairSum += seg.hair[y * img.w + x]
            assertTrue("hair class detected on the hair", hairSum / (30 * 70) > 0.3f)
            val people = PeopleFinder.find(seg)
            println("people found: ${people.size}, boxes ${people.map { listOf(it.x, it.y, it.w, it.h) }}")
            assertTrue(people.isNotEmpty())
            val refined = MaskOps.refine(seg.person, Resample.luma(img.px), img.w, img.h, hair = seg.hair)
            val before = seg.person.count { it > 0.5f }; val after = refined.count { it > 0.5f }
            assertEquals(before.toFloat(), after.toFloat(), before * 0.08f)
        }
    }

    @Test fun tapSelectionSeparatesTheHelmetFromThePerson() {
        OnnxModel(TestImages.model(ModelNames.TAP_SELECT)).use { m ->
            val tap = TapSegmenter(m)
            val helmet = tap.select(img.px, img.w, img.h, 400f, 430f)
            val person = tap.select(img.px, img.w, img.h, 230f, 120f)
            val h = helmet.count { it > 0.5f }; val p = person.count { it > 0.5f }
            val overlap = helmet.indices.count { helmet[it] > 0.5f && person[it] > 0.5f }
            println("tap select: helmet %d px, person %d px, overlap %d px".format(h, p, overlap))
            assertTrue(helmet[430 * img.w + 400] > 0.5f && person[120 * img.w + 230] > 0.5f)
            assertTrue(h in 15_000..60_000)
            assertTrue(overlap < h * 0.1)
        }
    }

    @Test fun superResolutionRunsTheRealModelAndIsSharperThanBicubic() {
        OnnxModel(TestImages.model(ModelNames.SUPER_RES)).use { m ->
            // Downscale a 192x192 crop 4x, then rebuild it 4x with AI and with bicubic, compare with the real crop.
            val crop = Resample.crop(img.px, img.w, 160, 30, 192, 192)
            val small = Resample.area(crop, 192, 192, 48, 48)
            val t0 = System.nanoTime()
            val ai = SuperResolutionPipeline.run(small, 48, 48, 4, 1f, SuperResolver(m), forceAi = true)
            val ms = (System.nanoTime() - t0) / 1_000_000
            val classic = SuperResolutionPipeline.classic(small, 48, 48, 192, 192)
            assertEquals(SrMethod.AI, ai.method); assertEquals(192, ai.width)
            val pAi = TestImages.psnr(ai.pixels, crop); val pBi = TestImages.psnr(classic, crop)
            val sAi = SceneAnalysis.sharpness(ai.pixels, 192, 192, null); val sBi = SceneAnalysis.sharpness(classic, 192, 192, null); val sTrue = SceneAnalysis.sharpness(crop, 192, 192, null)
            println("super resolution 48->192: AI PSNR %.2f dB, bicubic+sharpen %.2f dB; sharpness AI %.3f, bicubic %.3f, original %.3f; %d ms".format(pAi, pBi, sAi, sBi, sTrue, ms))
            assertTrue(pAi > 20.0)
            assertTrue(sAi > sBi)
            assertTrue(ai.notes.any { it.contains("not guaranteed") })
            // Strength 0 equals the non AI result.
            val zero = SuperResolutionPipeline.run(small, 48, 48, 4, 0f, SuperResolver(m), forceAi = true)
            assertArrayEquals(classic, zero.pixels)
            // Tiled processing gives the same image size and no failure on odd sizes.
            val odd = SuperResolver(m).upscale4x(Resample.crop(img.px, img.w, 0, 0, 70, 45), 70, 45, tile = 32, overlap = 8)
            assertEquals(280 * 180, odd.size)
        }
    }

    @Test fun superResolutionRefusesNoisyOrFlatInputUnlessForced() {
        val flat = IntArray(64 * 64) { (0xFF shl 24) or 0x808080 }
        val a = SuperResolutionPipeline.assess(flat, 64, 64)
        assertFalse(a.suitable)
        val r = SuperResolutionPipeline.run(flat, 64, 64, 2, 1f, null)
        assertEquals(SrMethod.CLASSIC, r.method)
        assertTrue(r.notes.first().contains("unavailable"))
    }
}
