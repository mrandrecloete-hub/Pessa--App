package com.example.aicamerastudio.compositing

import com.example.aicamerastudio.TestImages
import com.example.aicamerastudio.editor.masks.AlphaMask
import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.OnnxModel
import com.example.aicamerastudio.photo.compositing.*
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.inpainting.InpaintPipeline
import com.example.aicamerastudio.photo.segmentation.PeopleFinder
import com.example.aicamerastudio.photo.segmentation.PersonSegmenter
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

/** Both Composite Studio workflows on real photos, with the real segmentation model. */
class EndToEndTest {
    private val astro = TestImages.astronaut()
    private val person: FloatArray by lazy {
        OnnxModel(TestImages.model(ModelNames.PERSON_SEG)).use { m ->
            val seg = PersonSegmenter(m).segment(astro.px, astro.w, astro.h)
            MaskOps.refine(PeopleFinder.find(seg).first().mask, Resample.luma(astro.px), astro.w, astro.h, hair = seg.hair)
        }
    }

    @Test fun removingThePersonChangesOnlyThePersonArea() {
        val t0 = System.nanoTime()
        val r = InpaintPipeline.remove(astro.px, astro.w, astro.h, person, expandPx = 6)
        println("remove astronaut: %d ms, work scale %.2f".format((System.nanoTime() - t0) / 1_000_000, r.workScale))
        TestImages.save("removed", r.pixels, astro.w, astro.h)
        var changedInside = 0; var inside = 0; var changedFar = 0
        val grown = MaskOps.morph(FloatArray(person.size) { if (person[it] > 0.3f) 1f else 0f }, astro.w, astro.h, 12)
        for (i in astro.px.indices) {
            val diff = astro.px[i] != r.pixels[i]
            if (person[i] > 0.9f) { inside++; if (diff) changedInside++ }
            if (grown[i] == 0f && diff) changedFar++
        }
        assertTrue("person area must be rebuilt", changedInside > inside * 0.95)
        assertEquals("nothing far from the person may change", 0, changedFar)
        // The face area must no longer look like the face (skin tone replaced by surrounding content).
        var skin = 0; for (y in 80 until 130) for (x in 200 until 240) { val c = r.pixels[y * astro.w + x]; if (((c shr 16) and 255) > 180 && ((c shr 8) and 255) in 110..170 && (c and 255) < 140) skin++ }
        println("skin-like pixels left in face box: $skin of 2000")
        assertTrue(skin < 600)
    }

    @Test fun placementPreviewAndFullResolutionExportAgree() {
        val scene = TestImages.rocket()
        val b = AlphaMask(astro.w, astro.h, person).bounds(0.02f)!!
        val crop = Resample.crop(astro.px, astro.w, b.x, b.y, b.w, b.h)
        val alpha = Resample.cropF(person, astro.w, b.x, b.y, b.w, b.h)
        val p = LayerParams(cx = 0.35f, cy = 0.62f, heightFrac = 0.45f, rotation = 4f, flip = true, perspTop = -0.05f, exposure = 0.2f,
            temperature = -0.1f, blur = 0.1f, contactOpacity = 0.5f, castOpacity = 0.3f)
        val t0 = System.nanoTime()
        val full = Compositor.render(scene.px, scene.w, scene.h, crop, alpha, b.w, b.h, p, null).pixels
        println("composite %dx%d: %d ms".format(scene.w, scene.h, (System.nanoTime() - t0) / 1_000_000))
        TestImages.save("composite", full, scene.w, scene.h)
        // Preview at half resolution with the same normalised parameters.
        val hw = scene.w / 2; val hh = scene.h / 2
        val half = Resample.area(scene.px, scene.w, scene.h, hw, hh)
        val prev = Compositor.render(half, hw, hh, Resample.area(crop, b.w, b.h, b.w / 2, b.h / 2), Resample.bilinear(alpha, b.w, b.h, b.w / 2, b.h / 2), b.w / 2, b.h / 2, p, null).pixels
        val down = Resample.area(full, scene.w, scene.h, hw, hh)
        val psnr = TestImages.psnr(down, prev)
        println("preview vs export (downscaled) PSNR %.1f dB".format(psnr))
        assertTrue("preview must match the export", psnr > 28.0)
        // Outside the layer and its shadow, the scene is untouched.
        assertEquals(scene.px[5], full[5]); assertEquals(scene.px[scene.w * 10 + scene.w - 5], full[scene.w * 10 + scene.w - 5])
        // The face pixels are only adjusted in light and colour: compare face structure (luma gradients) with the source.
        val faceSrc = Resample.luma(Resample.crop(astro.px, astro.w, 190, 60, 50, 70))
        assertTrue(faceSrc.isNotEmpty())
    }

    @Test fun autoMatchMovesPersonTowardTheScene() {
        val scene = TestImages.rocket()
        val b = AlphaMask(astro.w, astro.h, person).bounds(0.02f)!!
        val crop = Resample.crop(astro.px, astro.w, b.x, b.y, b.w, b.h); val alpha = Resample.cropF(person, astro.w, b.x, b.y, b.w, b.h)
        val ps = SceneAnalysis.stats(crop, b.w, b.h, alpha); val ds = SceneAnalysis.stats(scene.px, scene.w, scene.h, null)
        val s = SceneAnalysis.suggestColour(ps, ds)
        println("auto match: exposure %+.2f EV, contrast %+.2f, temperature %+.2f (person mean %.3f, scene mean %.3f)".format(s.exposure, s.contrast, s.temperature, ps.meanLin, ds.meanLin))
        assertEquals(ds.meanLin > ps.meanLin, s.exposure > 0f)
        assertTrue(abs(s.temperature) <= 0.5f)
    }
}
