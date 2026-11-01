package com.example.aicamerastudio.photo.segmentation

import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.ai.OnnxModel
import com.example.aicamerastudio.photo.imaging.Resample
import kotlin.math.exp
import kotlin.math.max

/** Person probability and hair probability at the input resolution. */
class PersonMasks(val width: Int, val height: Int, val person: FloatArray, val hair: FloatArray)

/** MediaPipe multiclass selfie segmentation (Apache 2.0), run through ONNX Runtime. */
class PersonSegmenter(private val model: OnnxModel) {
    private val n = 256

    private fun ramp(v: Float): Float { val t = ((v - 0.2f) / 0.6f).coerceIn(0f, 1f); return t * t * (3f - 2f * t) }

    fun segment(px: IntArray, w: Int, h: Int): PersonMasks {
        val small = Resample.resize(px, w, h, n, n)
        val input = FloatArray(n * n * 3)
        for (i in 0 until n * n) {
            val c = small[i]
            input[i * 3] = ((c shr 16) and 255) / 255f
            input[i * 3 + 1] = ((c shr 8) and 255) / 255f
            input[i * 3 + 2] = (c and 255) / 255f
        }
        val (logits, shape) = model.run(input, longArrayOf(1, n.toLong(), n.toLong(), 3))
        val classes = shape.last().toInt()
        val person = FloatArray(n * n); val hair = FloatArray(n * n)
        val e = FloatArray(classes)
        for (i in 0 until n * n) {
            var m = Float.NEGATIVE_INFINITY
            for (k in 0 until classes) m = max(m, logits[i * classes + k])
            var s = 0f
            for (k in 0 until classes) { e[k] = exp(logits[i * classes + k] - m); s += e[k] }
            // Calibration: the model leaves about 8% spread over the non background classes even on clear
            // background, which would show as a faint ghost of the whole frame. Ramp so clear background is 0.
            person[i] = ramp(1f - e[0] / s)
            hair[i] = ramp(e[1] / s)
        }
        return PersonMasks(w, h, Resample.bilinear(person, n, n, w, h), Resample.bilinear(hair, n, n, w, h))
    }
}

/** MediaPipe MagicTouch interactive segmentation (Apache 2.0): tap a point, get that object's mask. */
class TapSegmenter(private val model: OnnxModel) {
    private val n = 512

    fun select(px: IntArray, w: Int, h: Int, tapX: Float, tapY: Float): FloatArray {
        val small = Resample.resize(px, w, h, n, n)
        val input = FloatArray(n * n * 4)
        val cx = tapX / w * n; val cy = tapY / h * n
        val r = 6f
        for (y in 0 until n) for (x in 0 until n) {
            val i = y * n + x; val c = small[i]
            input[i * 4] = ((c shr 16) and 255) / 255f
            input[i * 4 + 1] = ((c shr 8) and 255) / 255f
            input[i * 4 + 2] = (c and 255) / 255f
            val dx = x + 0.5f - cx; val dy = y + 0.5f - cy
            input[i * 4 + 3] = if (dx * dx + dy * dy <= r * r) 1f else 0f
        }
        val (prob, _) = model.run(input, longArrayOf(1, n.toLong(), n.toLong(), 4))
        return Resample.bilinear(prob, n, n, w, h)
    }
}

/** A detected person, as a separate connected region of the person mask. */
data class DetectedPerson(val index: Int, val x: Int, val y: Int, val w: Int, val h: Int, val area: Int, val mask: FloatArray)

object PeopleFinder {
    /** Splits the person mask into separate people (regions that do not touch). Small specks are ignored. */
    fun find(m: PersonMasks, minFraction: Float = 0.004f): List<DetectedPerson> {
        val (labels, comps) = MaskOps.components(m.person, m.width, m.height, 0.5f)
        val minArea = (m.width * m.height * minFraction).toInt()
        return comps.filter { it.area >= minArea }.sortedBy { it.x }.mapIndexed { i, c ->
            DetectedPerson(i + 1, c.x, c.y, c.w, c.h, c.area, MaskOps.isolate(m.person, labels, m.width, m.height, c.id))
        }
    }
}
