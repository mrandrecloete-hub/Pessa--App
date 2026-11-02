package com.example.aicamerastudio.beauty

import android.graphics.Bitmap
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.example.aicamerastudio.camera.beauty.BeautyLevels
import com.example.aicamerastudio.camera.beauty.BeautyPreset
import com.example.aicamerastudio.camera.beauty.BeautyState
import com.example.aicamerastudio.camera.beauty.BeautyStill
import com.example.aicamerastudio.camera.beauty.FaceMesh
import com.example.aicamerastudio.camera.beauty.TrackedFace
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.OnnxModel
import org.junit.AfterClass
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.abs

/**
 * Runs the real GPU beauty renderer (OpenGL ES 3) on a device or emulator with the public domain astronaut
 * photo, scaled to 1536 px so the face is about 300 px wide like a real selfie. Writes the results to the
 * app's external files folder (beauty-test/) for a visual check.
 */
@RunWith(AndroidJUnit4::class)
class BeautyGpuTest {
    companion object {
        private val ctx = InstrumentationRegistry.getInstrumentation().targetContext
        private val testCtx = InstrumentationRegistry.getInstrumentation().context
        private val models = Pair(
            OnnxModel(ctx.assets.open(ModelNames.FACE_DETECT).use { it.readBytes() }, threads = 2),
            OnnxModel(ctx.assets.open(ModelNames.FACE_MESH).use { it.readBytes() }, threads = 2))
        private val photo: Bitmap by lazy {
            val b = testCtx.assets.open("astronaut_512x512.rgb").use { it.readBytes() }
            val px = IntArray(512 * 512) { i -> Color.rgb(b[3 * i].toInt() and 255, b[3 * i + 1].toInt() and 255, b[3 * i + 2].toInt() and 255) }
            Bitmap.createScaledBitmap(Bitmap.createBitmap(px, 512, 512, Bitmap.Config.ARGB_8888), 1536, 1536, true)
        }
        private val face: TrackedFace by lazy { BeautyStill.findFaces(photo, models).single() }
        val outDir: File by lazy { File(ctx.getExternalFilesDir(null), "beauty-test").apply { mkdirs() } }
        @JvmStatic @AfterClass fun close() { models.first.close(); models.second.close() }
    }

    private fun run(state: BeautyState, name: String): Bitmap {
        val t0 = System.nanoTime()
        val r = BeautyStill.process(ctx, photo, state, models)
        println("$name: ${(System.nanoTime() - t0) / 1_000_000} ms, faces ${r.faces}")
        assertEquals("faces found in $name", 1, r.faces)
        File(outDir, "$name.jpg").outputStream().use { r.bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        return r.bitmap
    }

    private fun pt(i: Int) = (face.x(i) * 1536).toInt() to (face.y(i) * 1536).toInt()

    /** Mean absolute difference per channel (0..255) in a square around (x, y). */
    private fun diff(a: Bitmap, b: Bitmap, x: Int, y: Int, r: Int): Float {
        var s = 0L; var n = 0
        for (yy in y - r..y + r) for (xx in x - r..x + r) {
            val p = a.getPixel(xx, yy); val q = b.getPixel(xx, yy)
            s += abs(Color.red(p) - Color.red(q)) + abs(Color.green(p) - Color.green(q)) + abs(Color.blue(p) - Color.blue(q)); n += 3
        }
        return s.toFloat() / n
    }

    /** High frequency energy: mean absolute difference between neighbouring pixels' brightness. */
    private fun roughness(b: Bitmap, x: Int, y: Int, r: Int): Float {
        var s = 0f; var n = 0
        fun l(p: Int) = 0.3f * Color.red(p) + 0.59f * Color.green(p) + 0.11f * Color.blue(p)
        for (yy in y - r..y + r) for (xx in x - r..x + r) { s += abs(l(b.getPixel(xx, yy)) - l(b.getPixel(xx + 1, yy))) + abs(l(b.getPixel(xx, yy)) - l(b.getPixel(xx, yy + 1))); n += 2 }
        return s / n
    }

    private val noGrade = BeautyState(enabled = true, preset = BeautyPreset.ORIGINAL, levels = BeautyLevels.NONE)

    @Test fun originalPresetLeavesThePhotoUnchanged() {
        val out = run(BeautyState(enabled = true).withPreset(BeautyPreset.ORIGINAL), "original")
        val (cx, cy) = pt(FaceMesh.NOSE_TIP)
        assertTrue(diff(out, photo, cx, cy, 40) < 1.0f)
        assertTrue(diff(out, photo, 1300, 300, 40) < 1.0f)
    }

    @Test fun smoothingWorksOnSkinOnlyAndKeepsEyesAndBackground() {
        val out = run(noGrade.copy(levels = BeautyLevels(smoothing = 1f, blemish = 1f)), "smoothing_only")
        val (cx, cy) = pt(FaceMesh.RIGHT_CHEEK)
        val before = roughness(photo, cx, cy, 20); val after = roughness(out, cx, cy, 20)
        println("cheek roughness %.2f -> %.2f".format(before, after))
        assertTrue("cheek must get smoother ($before -> $after)", after < before * 0.8f)
        assertTrue("background unchanged", diff(out, photo, 1300, 300, 40) < 1.0f)
        assertTrue("suit unchanged", diff(out, photo, 768, 1300, 40) < 1.0f)
        val (ex, ey) = pt(FaceMesh.RIGHT_EYE_INNER)
        val eyeChange = diff(out, photo, ex - 15, ey, 6)
        println("eye change %.2f".format(eyeChange))
        assertTrue("eyes are not smoothed ($eyeChange)", eyeChange < 3f)
    }

    @Test fun teethGetWhiterAndLipsTakeTheTint() {
        val teeth = run(noGrade.copy(levels = BeautyLevels(teeth = 1f)), "teeth_only")
        val (mx, my) = pt(13).let { (x, y) -> x to (y + pt(14).second) / 2 }   // between upper and lower inner lip
        fun cb(b: Bitmap): Float { var s = 0f; for (yy in my - 4..my + 4) for (xx in mx - 20..mx + 20) { val p = b.getPixel(xx, yy); s += -0.1687f * Color.red(p) - 0.3313f * Color.green(p) + 0.5f * Color.blue(p) }; return s / (9 * 41) }
        println("teeth blue-yellow %.2f -> %.2f".format(cb(photo), cb(teeth)))
        assertTrue("teeth less yellow", cb(teeth) > cb(photo) + 2f)
        assertTrue("background unchanged", diff(teeth, photo, 1300, 300, 40) < 1.0f)

        val tint = BeautyLevels.LIP_TINTS[2]
        val lips = run(noGrade.copy(levels = BeautyLevels(makeup = 1f, lipColor = true, lipTint = tint)), "lips_berry")
        val (lx, ly) = pt(17)   // lower lip centre
        val p0 = photo.getPixel(lx, ly - 4); val p1 = lips.getPixel(lx, ly - 4)
        println("lip %s -> %s".format(Integer.toHexString(p0), Integer.toHexString(p1)))
        assertTrue("lip colour changed", diff(lips, photo, lx, ly - 4, 3) > 6f)
        assertTrue("cheek untouched by lip colour", diff(lips, photo, pt(FaceMesh.RIGHT_CHEEK).first, pt(FaceMesh.RIGHT_CHEEK).second, 10) < 1.5f)
    }

    @Test fun jawlineIsOffByDefaultAndSubtleWhenOn() {
        val off = run(BeautyState(enabled = true).withPreset(BeautyPreset.NATURAL).let { it.copy(levels = it.levels.copy(jawline = 0f)) }, "natural")
        val on = run(noGrade.copy(levels = BeautyLevels(jawline = 1f)), "jaw_full")
        val (jx, jy) = pt(FaceMesh.RIGHT_JAW)
        val d = diff(on, photo, jx, jy, 12)
        println("jaw full strength change %.2f".format(d))
        assertTrue("jaw refinement does something when switched on", d > 0.5f)
        assertTrue("eyes do not move", diff(on, photo, pt(FaceMesh.RIGHT_EYE_INNER).first - 15, pt(FaceMesh.RIGHT_EYE_INNER).second, 6) < 0.5f)
        assertNotNull(off)
    }

    @Test fun everyPresetChangesThePictureAndMatchesTheReferenceGrade() {
        for (p in BeautyPreset.entries) {
            val out = run(BeautyState(enabled = true).withPreset(p), "preset_${p.id}")
            val d = diff(out, photo, 768, 768, 300)
            println("%-16s mean change %.2f".format(p.label, d))
            if (p == BeautyPreset.ORIGINAL) assertTrue(d < 0.5f) else assertTrue("${p.label} must change the picture ($d)", d > 1.5f)
        }
        // Colour grade on the GPU equals the Kotlin reference (a background pixel near the centre: no vignette, no face effects).
        val p = BeautyPreset.COOL_TONE
        val out = run(BeautyState(enabled = true).withPreset(p).copy(levels = BeautyLevels.NONE), "grade_check")
        val x = 1150; val y = 700
        val src = photo.getPixel(x, y); val got = out.getPixel(x, y)
        val ref = p.grade.apply(floatArrayOf(Color.red(src) / 255f, Color.green(src) / 255f, Color.blue(src) / 255f))
        println("grade check src ${Integer.toHexString(src)} gpu ${Integer.toHexString(got)} kotlin ${ref.map { (it * 255).toInt() }}")
        assertEquals(ref[0] * 255, Color.red(got).toFloat(), 3f); assertEquals(ref[1] * 255, Color.green(got).toFloat(), 3f); assertEquals(ref[2] * 255, Color.blue(got).toFloat(), 3f)
    }

    @Test fun strongSettingsSheet() {
        run(BeautyState(enabled = true, master = 1f).withPreset(BeautyPreset.SOFT_GLAM), "softglam_max")
        run(BeautyState(enabled = true, master = 1f, levels = BeautyLevels(smoothing = 1f, brightness = 1f, blemish = 1f, underEye = 1f, toneBalance = 1f,
            lighting = 1f, eyes = 1f, teeth = 1f, makeup = 1f, lipColor = true, blush = true, contour = 1f)), "everything_max")
    }
}
