package com.example.aicamerastudio.beauty

import com.example.aicamerastudio.TestImages
import com.example.aicamerastudio.camera.beauty.FaceMesh
import com.example.aicamerastudio.camera.beauty.FaceTracker
import com.example.aicamerastudio.camera.beauty.TrackedFace
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.OnnxModel
import org.junit.AfterClass
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.hypot

/** Runs the real face models on the public domain astronaut photo (512x512) in many orientations. */
class FaceTrackerTest {
    companion object {
        private val det = OnnxModel(TestImages.model(ModelNames.FACE_DETECT), threads = 2)
        private val mesh = OnnxModel(TestImages.model(ModelNames.FACE_MESH), threads = 2)
        @JvmStatic @AfterClass fun close() { det.close(); mesh.close() }

        // Reference points (pixels) measured with the Python prototype of the same pipeline.
        val EYE_R = 194.4f to 101.0f; val EYE_L = 256.3f to 104.3f; val NOSE = 224.2f to 130.9f; val CHIN = 222.7f to 175.1f
    }

    private val img = TestImages.astronaut()

    /** The astronaut as RGBA, transformed into "camera texture layout": stored after turning it anticlockwise [turns] times, optionally flipped. */
    private fun frame(turns: Int, flipY: Boolean, hint: Int = turns, blank: Boolean = false, wide: Boolean = false): FaceTracker.Frame {
        val sw = if (wide) img.w * 2 else img.w; val sh = img.h
        fun srcPx(x: Int, y: Int): Int = if (blank) 0xff808080.toInt() else img.px[y * img.w + (x % img.w)]
        val w = if (turns % 2 == 0) sw else sh; val h = if (turns % 2 == 0) sh else sw
        val out = ByteArray(w * h * 4)
        for (y in 0 until h) for (x in 0 until w) {
            // Stored pixel (x, y) shows upright pixel ... : turning the stored image clockwise [turns] times (after flipping) makes it upright.
            var u = (x + 0.5f) / w; var v = (y + 0.5f) / h
            if (flipY) v = 1f - v
            repeat(turns) { val nu = 1f - v; val nv = u; u = nu; v = nv }
            val c = srcPx((u * sw).toInt().coerceIn(0, sw - 1), (v * sh).toInt().coerceIn(0, sh - 1))
            val o = (y * w + x) * 4
            out[o] = (c shr 16).toByte(); out[o + 1] = (c shr 8).toByte(); out[o + 2] = c.toByte(); out[o + 3] = -1
        }
        return FaceTracker.Frame(out, w, h, flipY, hint)
    }

    /** Converts a result point back to upright astronaut pixels for comparison. */
    private fun upright(face: TrackedFace, i: Int, turns: Int, flipY: Boolean, sw: Int = 512): Pair<Float, Float> {
        var u = face.x(i); var v = face.y(i)
        if (flipY) v = 1f - v
        repeat(turns) { val nu = 1f - v; val nv = u; u = nu; v = nv }
        return u * sw to v * 512
    }

    private fun near(p: Pair<Float, Float>, q: Pair<Float, Float>, tol: Float, what: String) =
        assertTrue("$what at $p, expected $q", hypot(p.first - q.first, p.second - q.second) < tol)

    @Test fun findsTheFaceInEveryOrientation() {
        for (turns in 0..3) for (flip in listOf(false, true)) {
            val f = FaceTracker(det, mesh).detectStill(frame(turns, flip))
            assertEquals("faces for turns=$turns flip=$flip", 1, f.size)
            near(upright(f[0], FaceMesh.RIGHT_EYE_OUTER, turns, flip), EYE_R, 4f, "right eye t=$turns f=$flip")
            near(upright(f[0], FaceMesh.LEFT_EYE_OUTER, turns, flip), EYE_L, 4f, "left eye t=$turns f=$flip")
            near(upright(f[0], FaceMesh.NOSE_TIP, turns, flip), NOSE, 4f, "nose t=$turns f=$flip")
            near(upright(f[0], FaceMesh.CHIN, turns, flip), CHIN, 5f, "chin t=$turns f=$flip")
        }
    }

    @Test fun liveTrackingIsSteadyFadesOutAndComesBack() {
        val t = FaceTracker(det, mesh)
        val face = frame(1, true); val blank = frame(1, true, blank = true)
        var faces = emptyList<TrackedFace>()
        val nose = ArrayList<Pair<Float, Float>>()
        val t0 = System.nanoTime()
        for (i in 0 until 12) { faces = t.track(face, i / 30.0); if (i >= 4) nose += upright(faces[0], FaceMesh.NOSE_TIP, 1, true) }
        println("tracking: %.1f ms per frame (JVM, 2 threads)".format((System.nanoTime() - t0) / 12e6))
        assertEquals(1, faces.size); assertEquals(1f, faces[0].alpha, 1e-4f)
        val id = faces[0].id
        val spread = nose.maxOf { hypot(it.first - nose[0].first, it.second - nose[0].second) }
        assertTrue("points must hold still on a still face, moved $spread px", spread < 1.5f)
        near(nose.last(), NOSE, 4f, "tracked nose")

        // Face leaves: effects fade over a few frames instead of vanishing or jumping.
        val alphas = (0 until 6).map { i -> t.track(blank, (12 + i) / 30.0).firstOrNull()?.alpha ?: 0f }
        assertTrue("fades: $alphas", alphas[0] in 0.5f..0.95f && alphas[1] < alphas[0])
        assertEquals("gone after a few frames: $alphas", 0f, alphas.last())

        // Face returns: found again.
        var back = emptyList<TrackedFace>()
        for (i in 0 until 4) back = t.track(face, (20 + i) / 30.0)
        assertEquals(1, back.size); assertNotEquals("new track", id, back[0].id)
        near(upright(back[0], FaceMesh.NOSE_TIP, 1, true), NOSE, 4f, "re-found nose")
    }

    @Test fun wrongOrientationHintCorrectsItself() {
        val t = FaceTracker(det, mesh)
        val f = frame(1, false, hint = 3)  // tell it the wrong way round
        var faces = emptyList<TrackedFace>(); var n = 0
        while ((faces.isEmpty() || faces[0].alpha < 1f) && n < 60) { faces = t.track(f, n / 30.0); n++ }
        println("fully tracked after $n frames with a wrong hint")
        assertTrue("found within 60 frames", faces.isNotEmpty())
        near(upright(faces[0], FaceMesh.NOSE_TIP, 1, false), NOSE, 4f, "nose")
    }

    @Test fun followsTwoFaces() {
        val f = frame(0, false, wide = true)
        val faces = FaceTracker(det, mesh).detectStill(f)
        assertEquals(2, faces.size)
        val xs = faces.map { upright(it, FaceMesh.NOSE_TIP, 0, false, 1024).first }.sorted()
        assertEquals(NOSE.first, xs[0], 5f); assertEquals(NOSE.first + 512, xs[1], 5f)
    }
}
