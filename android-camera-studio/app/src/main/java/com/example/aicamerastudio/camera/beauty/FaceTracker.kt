package com.example.aicamerastudio.camera.beauty

import com.example.aicamerastudio.photo.ai.OnnxModel
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** One face: 468 points in normalised source frame coordinates (x0,y0,x1,y1,...), and how visible it is (0..1, fades when lost). */
class TrackedFace(val id: Int, val points: FloatArray, val alpha: Float) {
    fun x(i: Int) = points[2 * i]
    fun y(i: Int) = points[2 * i + 1]
}

/**
 * Finds and follows faces on device with two Google MediaPipe models run by ONNX Runtime:
 * BlazeFace short range (finds faces, 128x128) and Face Mesh (468 points, 192x192 crop around a face).
 *
 * Like MediaPipe's own pipeline, a face found once is then followed by running only the mesh model on a
 * crop placed from the previous points, so detection runs rarely. Points are smoothed with a One Euro
 * filter so effects stay on the face without lagging. A face that disappears fades out over a few frames
 * instead of effects jumping, and it is picked up again by detection when it comes back.
 *
 * Frames arrive in the camera texture's layout. [Frame.quarterTurns] and [Frame.flipY] say how to make them
 * upright; if no face is found for a while, other turns are tried, so a wrong hint corrects itself.
 * Nothing here is stored: points live only in memory for the current frame.
 */
class FaceTracker(private val detector: OnnxModel, private val mesh: OnnxModel, private val maxFaces: Int = 3) {

    /** RGBA pixels, row 0 first. Point (u, v) of the result is pixel (u * width, v * height) of this buffer. */
    class Frame(val rgba: ByteArray, val width: Int, val height: Int, val flipY: Boolean, val quarterTurns: Int)

    private class Roi(val cx: Float, val cy: Float, val size: Float, val angle: Float)

    private inner class Track(val id: Int) {
        var roi: Roi? = null
        var alpha = 0f
        var missed = 0
        var raw: FloatArray? = null            // upright pixel coordinates, smoothed
        val filters = Array(FaceMesh.POINTS * 2) { OneEuro(1.2f, 15f) }
    }

    private val tracks = ArrayList<Track>()
    private var nextId = 1
    private var frameNo = 0L
    private var turnsLocked: Int? = null
    private var emptyDetections = 0
    private var candidate = 0
    private var lastHint = -1
    private val anchors = anchors()

    // Current frame geometry (upright size and the source buffer), set per call.
    private lateinit var f: Frame
    private var turns = 0
    private var uw = 0; private var uh = 0

    fun reset() { tracks.clear(); turnsLocked = null; emptyDetections = 0; candidate = 0 }

    /** Live frames: detection when needed, then the mesh on each followed face. */
    fun track(frame: Frame, seconds: Double): List<TrackedFace> {
        if (frame.quarterTurns != lastHint) { lastHint = frame.quarterTurns; turnsLocked = null; candidate = 0; tracks.clear() }
        val order = intArrayOf(0, 1, 3, 2).map { (frame.quarterTurns + it) and 3 }
        setFrame(frame, turnsLocked ?: order[candidate])
        frameNo++

        // Follow known faces with the mesh model.
        for (t in tracks) {
            val roi = t.roi
            val pts = roi?.let { runMesh(it) }
            if (pts != null) {
                val size = faceSize(pts)
                for (i in pts.indices) pts[i] = t.filters[i].filter(pts[i], seconds, size)
                t.raw = pts; t.roi = roiFromPoints(pts); t.missed = 0
                t.alpha = min(1f, t.alpha + 0.34f)
            } else {
                t.missed++; t.alpha -= 0.2f
                if (t.missed == 1) t.filters.forEach { it.reset() }
            }
        }
        tracks.removeAll { it.alpha <= 0f && it.missed > 0 }

        // Look for new faces: every frame while none is followed, otherwise every 10th frame.
        val lost = tracks.any { it.missed > 0 }
        if (tracks.size < maxFaces && (tracks.isEmpty() || lost || frameNo % 10 == 0L)) {
            val found = detect()
            var added = false
            for (d in found) {
                if (tracks.size >= maxFaces) break
                val near = tracks.firstOrNull { t -> t.roi?.let { hypot(it.cx - d.cx, it.cy - d.cy) < it.size * 0.5f } ?: false }
                if (near != null) { if (near.missed > 0) near.roi = d; continue }
                val t = Track(nextId++); t.roi = d
                // The detector's box is rough: place the crop again from the first points before using them.
                val first = runMesh(d) ?: continue
                val pts = runMesh(roiFromPoints(first)) ?: first
                for (i in pts.indices) pts[i] = t.filters[i].filter(pts[i], seconds, faceSize(pts))
                t.raw = pts; t.roi = roiFromPoints(pts); t.alpha = 0.34f
                tracks += t; added = true
            }
            if (tracks.isNotEmpty() || added) { turnsLocked = turns; emptyDetections = 0 }
            else if (turnsLocked == null && ++emptyDetections >= 12) { emptyDetections = 0; candidate = (candidate + 1) % 4 }
            else if (turnsLocked != null && ++emptyDetections >= 45) { turnsLocked = null; emptyDetections = 0 }
        }
        return tracks.mapNotNull { t -> t.raw?.let { TrackedFace(t.id, toSource(it), t.alpha.coerceIn(0f, 1f)) } }
    }

    /** A still photo: detect, then refine each face once from its own points. No smoothing. */
    fun detectStill(frame: Frame): List<TrackedFace> {
        for (k in intArrayOf(0, 1, 3, 2)) {
            setFrame(frame, (frame.quarterTurns + k) and 3)
            val faces = detect().take(maxFaces).mapNotNull { d ->
                val first = runMesh(d) ?: return@mapNotNull null
                runMesh(roiFromPoints(first)) ?: first
            }
            if (faces.isNotEmpty()) return faces.mapIndexed { i, p -> TrackedFace(i + 1, toSource(p), 1f) }
        }
        return emptyList()
    }

    // ---- geometry -------------------------------------------------------------------------------

    private fun setFrame(frame: Frame, t: Int) {
        f = frame; turns = t
        if (t % 2 == 0) { uw = frame.width; uh = frame.height } else { uw = frame.height; uh = frame.width }
    }

    /** Upright normalised (a, b) -> source normalised (u, v). */
    private fun uprightToSource(a: Float, b: Float, out: FloatArray) {
        var x = a; var y = b
        repeat(turns) { val nx = y; val ny = 1f - x; x = nx; y = ny }   // undo the clockwise turns
        out[0] = x; out[1] = if (f.flipY) 1f - y else y
    }

    private fun toSource(upright: FloatArray): FloatArray {
        val out = FloatArray(upright.size); val tmp = FloatArray(2)
        for (i in 0 until upright.size / 2) {
            uprightToSource(upright[2 * i] / uw, upright[2 * i + 1] / uh, tmp)
            out[2 * i] = tmp[0]; out[2 * i + 1] = tmp[1]
        }
        return out
    }

    private val tmp2 = FloatArray(2)
    /** Bilinear sample of the source at an upright pixel position, channel values 0..255; false outside. */
    private fun sample(ux: Float, uy: Float, rgb: FloatArray): Boolean {
        if (ux < 0 || uy < 0 || ux >= uw || uy >= uh) return false
        uprightToSource(ux / uw, uy / uh, tmp2)
        val sx = (tmp2[0] * f.width - 0.5f).coerceIn(0f, f.width - 1f); val sy = (tmp2[1] * f.height - 0.5f).coerceIn(0f, f.height - 1f)
        val x0 = sx.toInt(); val y0 = sy.toInt(); val x1 = min(x0 + 1, f.width - 1); val y1 = min(y0 + 1, f.height - 1)
        val fx = sx - x0; val fy = sy - y0
        val px = f.rgba; val w = f.width
        for (c in 0..2) {
            val a = (px[(y0 * w + x0) * 4 + c].toInt() and 255).toFloat(); val b = (px[(y0 * w + x1) * 4 + c].toInt() and 255).toFloat()
            val cc = (px[(y1 * w + x0) * 4 + c].toInt() and 255).toFloat(); val d = (px[(y1 * w + x1) * 4 + c].toInt() and 255).toFloat()
            rgb[c] = (a + (b - a) * fx) * (1 - fy) + (cc + (d - cc) * fx) * fy
        }
        return true
    }

    private fun faceSize(p: FloatArray): Float {
        val dx = p[2 * FaceMesh.LEFT_EYE_OUTER] - p[2 * FaceMesh.RIGHT_EYE_OUTER]; val dy = p[2 * FaceMesh.LEFT_EYE_OUTER + 1] - p[2 * FaceMesh.RIGHT_EYE_OUTER + 1]
        return max(1f, hypot(dx, dy) * 2f)
    }

    /** Crop for the next frame: rotated by the eye line, 1.5 times the points' extent. */
    private fun roiFromPoints(p: FloatArray): Roi {
        val ang = atan2(p[2 * FaceMesh.LEFT_EYE_OUTER + 1] - p[2 * FaceMesh.RIGHT_EYE_OUTER + 1], p[2 * FaceMesh.LEFT_EYE_OUTER] - p[2 * FaceMesh.RIGHT_EYE_OUTER])
        val c = cos(-ang); val s = sin(-ang)
        var mx = 0f; var my = 0f
        for (i in 0 until FaceMesh.POINTS) { mx += p[2 * i]; my += p[2 * i + 1] }
        mx /= FaceMesh.POINTS; my /= FaceMesh.POINTS
        var x0 = Float.MAX_VALUE; var x1 = -Float.MAX_VALUE; var y0 = Float.MAX_VALUE; var y1 = -Float.MAX_VALUE
        for (i in 0 until FaceMesh.POINTS) {
            val dx = p[2 * i] - mx; val dy = p[2 * i + 1] - my
            val rx = c * dx - s * dy; val ry = s * dx + c * dy
            x0 = min(x0, rx); x1 = max(x1, rx); y0 = min(y0, ry); y1 = max(y1, ry)
        }
        val fcx = (x0 + x1) / 2; val fcy = (y0 + y1) / 2
        val cb = cos(ang); val sb = sin(ang)
        return Roi(mx + cb * fcx - sb * fcy, my + sb * fcx + cb * fcy, max(x1 - x0, y1 - y0) * 1.5f, ang)
    }

    // ---- models ---------------------------------------------------------------------------------

    private val meshIn = FloatArray(192 * 192 * 3)
    private val rgb = FloatArray(3)

    /** Face Mesh on a rotated square crop; 468 points in upright pixels, or null if the crop holds no face. */
    private fun runMesh(r: Roi): FloatArray? {
        val s = r.size / 192f; val ca = cos(r.angle); val sa = sin(r.angle)
        var k = 0
        for (v in 0 until 192) for (u in 0 until 192) {
            val du = (u - 96) * s; val dv = (v - 96) * s
            if (sample(r.cx + ca * du - sa * dv, r.cy + sa * du + ca * dv, rgb)) {
                meshIn[k] = rgb[0] / 255f; meshIn[k + 1] = rgb[1] / 255f; meshIn[k + 2] = rgb[2] / 255f
            } else { meshIn[k] = 0f; meshIn[k + 1] = 0f; meshIn[k + 2] = 0f }
            k += 3
        }
        val out = mesh.runAll(meshIn, longArrayOf(1, 192, 192, 3))
        val flag = 1f / (1f + exp(-out[1][0]))
        if (flag < 0.5f) return null
        val lm = out[0]
        val pts = FloatArray(FaceMesh.POINTS * 2)
        for (i in 0 until FaceMesh.POINTS) {
            val du = (lm[3 * i] - 96f) * s; val dv = (lm[3 * i + 1] - 96f) * s
            pts[2 * i] = r.cx + ca * du - sa * dv; pts[2 * i + 1] = r.cy + sa * du + ca * dv
        }
        return pts
    }

    private val detIn = FloatArray(128 * 128 * 3)

    /**
     * BlazeFace on the upright frame; faces as crops for the mesh model. A tall or wide frame is covered by
     * overlapping square tiles instead of one letterboxed square, so smaller faces (rear camera, groups) are found.
     */
    private fun detect(): List<Roi> {
        val short = min(uw, uh).toFloat(); val long = max(uw, uh).toFloat()
        val tiles = ArrayList<Triple<Float, Float, Float>>()   // left, top, side in upright pixels
        if (long / short < 1.3f) tiles += Triple((uw - long) / 2, (uh - long) / 2, long)
        else {
            val n = kotlin.math.ceil((long - short) / (short * 0.8f)).toInt() + 1
            for (i in 0 until n) {
                val off = (long - short) * i / (n - 1)
                tiles += if (uw > uh) Triple(off, 0f, short) else Triple(0f, off, short)
            }
        }
        class Det(val score: Float, val cx: Float, val cy: Float, val w: Float, val h: Float, val ang: Float)
        val dets = ArrayList<Det>()
        for ((left, top, side) in tiles) {
            val step = side / 128f
            var k = 0
            for (y in 0 until 128) for (x in 0 until 128) {
                if (sample(left + (x + 0.5f) * step, top + (y + 0.5f) * step, rgb)) {
                    detIn[k] = rgb[0] / 127.5f - 1f; detIn[k + 1] = rgb[1] / 127.5f - 1f; detIn[k + 2] = rgb[2] / 127.5f - 1f
                } else { detIn[k] = -1f; detIn[k + 1] = -1f; detIn[k + 2] = -1f }
                k += 3
            }
            val out = detector.runAll(detIn, longArrayOf(1, 128, 128, 3))
            val reg = out[0]; val cls = out[1]
            for (i in 0 until 896) {
                val score = 1f / (1f + exp(-cls[i].coerceIn(-80f, 80f)))
                if (score < 0.6f) continue
                val o = i * 16; val ax = anchors[2 * i]; val ay = anchors[2 * i + 1]
                fun px(v: Float) = left + v * side
                fun py(v: Float) = top + v * side
                // Crop rotation from the eyes-to-mouth direction (keypoints 0, 1 eyes, 3 mouth): right for any
                // roll, including an upside down face, where the eye line alone would be ambiguous.
                val emx = (px(reg[o + 4] / 128f + ax) + px(reg[o + 6] / 128f + ax)) / 2; val emy = (py(reg[o + 5] / 128f + ay) + py(reg[o + 7] / 128f + ay)) / 2
                val mx = px(reg[o + 10] / 128f + ax); val my = py(reg[o + 11] / 128f + ay)
                dets += Det(score, px(reg[o] / 128f + ax), py(reg[o + 1] / 128f + ay), reg[o + 2] / 128f * side, reg[o + 3] / 128f * side, atan2(-(mx - emx), my - emy))
            }
        }
        dets.sortByDescending { it.score }
        val kept = ArrayList<Det>()
        for (d in dets) {
            if (kept.none { iou(it.cx, it.cy, it.w, it.h, d.cx, d.cy, d.w, d.h) > 0.3f }) kept += d
            if (kept.size == maxFaces) break
        }
        return kept.map { d -> Roi(d.cx, d.cy, max(d.w, d.h) * 1.5f, d.ang) }
    }

    private fun iou(ax: Float, ay: Float, aw: Float, ah: Float, bx: Float, by: Float, bw: Float, bh: Float): Float {
        val ix = max(0f, min(ax + aw / 2, bx + bw / 2) - max(ax - aw / 2, bx - bw / 2))
        val iy = max(0f, min(ay + ah / 2, by + bh / 2) - max(ay - ah / 2, by - bh / 2))
        val inter = ix * iy
        return inter / (aw * ah + bw * bh - inter + 1e-6f)
    }

    companion object {
        /** BlazeFace short range anchors: 16x16 cells with 2 anchors (stride 8) and 8x8 cells with 6 anchors (strides 16, 16, 16). */
        fun anchors(): FloatArray {
            val list = ArrayList<Float>(896 * 2)
            for ((grid, per) in listOf(16 to 2, 8 to 6)) for (y in 0 until grid) for (x in 0 until grid) repeat(per) {
                list += (x + 0.5f) / grid; list += (y + 0.5f) / grid
            }
            return list.toFloatArray()
        }
    }
}
