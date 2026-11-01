package com.example.aicamerastudio.camera.ui

import android.graphics.Matrix
import androidx.camera.core.ImageProxy
import com.example.aicamerastudio.photo.ai.AiModels
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.portrait.PortraitRenderer
import com.example.aicamerastudio.photo.segmentation.PersonSegmenter

/** Face box in normalised coordinates of the upright camera frame (0..1), plus the frame's aspect ratio. */
data class FaceBox(val x: Float, val y: Float, val w: Float, val h: Float, val frameAspect: Float)

/**
 * Analyses live preview frames off the main thread: finds the face with the on-device segmentation
 * model (Portrait), or computes a brightness histogram (Pro). Throttled so the preview stays smooth.
 */
class FrameAnalysis(private val models: AiModels, private val post: (Runnable) -> Unit) {
    @Volatile var wantFaces = false
    @Volatile var wantHistogram = false
    var onFace: (FaceBox?) -> Unit = {}
    var onHistogram: (IntArray) -> Unit = {}
    private var lastFace = 0L; private var lastHist = 0L

    fun analyze(img: ImageProxy) {
        try {
            val now = System.currentTimeMillis()
            if (wantHistogram && now - lastHist > 200) { lastHist = now; histogram(img)?.let { h -> post(Runnable { onHistogram(h) }) } }
            if (wantFaces && now - lastFace > 300) {
                lastFace = now
                val bmp = img.toBitmap()
                val rot = img.imageInfo.rotationDegrees
                val up = if (rot == 0) bmp else android.graphics.Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rot.toFloat()) }, false)
                val w = up.width; val h = up.height
                val px = IntArray(w * h); up.getPixels(px, 0, w, 0, 0, w, h)
                val seg = runCatching { PersonSegmenter(models.get(ModelNames.PERSON_SEG)).segment(px, w, h) }.getOrNull()
                val box = seg?.let { PortraitRenderer.faceBox(it.face, w, h) }
                val fb = box?.let { FaceBox(it[0].toFloat() / w, it[1].toFloat() / h, it[2].toFloat() / w, it[3].toFloat() / h, w.toFloat() / h) }
                post(Runnable { onFace(fb) })
            }
        } catch (_: Throwable) {
        } finally { img.close() }
    }

    private fun histogram(img: ImageProxy): IntArray? {
        val plane = img.planes.firstOrNull() ?: return null
        val buf = plane.buffer; val rowStride = plane.rowStride; val pixStride = plane.pixelStride
        val bins = IntArray(64)
        var y = 0
        while (y < img.height) {
            var x = 0
            while (x < img.width) {
                val o = y * rowStride + x * pixStride
                if (o + 2 < buf.limit()) {
                    val r = buf.get(o).toInt() and 255; val g = buf.get(o + 1).toInt() and 255; val b = buf.get(o + 2).toInt() and 255
                    bins[((r * 77 + g * 151 + b * 28) shr 8) shr 2]++
                }
                x += 4
            }
            y += 4
        }
        return bins
    }
}
