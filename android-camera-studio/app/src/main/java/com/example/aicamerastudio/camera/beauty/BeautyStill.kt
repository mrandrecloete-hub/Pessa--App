package com.example.aicamerastudio.camera.beauty

import android.content.Context
import android.graphics.Bitmap
import android.opengl.GLES30
import android.opengl.GLUtils
import android.opengl.Matrix
import com.example.aicamerastudio.camera.beauty.gl.BeautyRenderer
import com.example.aicamerastudio.camera.beauty.gl.EglCore
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.OnnxModel
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Applies the beauty look to a photo with the same GPU renderer as the live preview. Runs on the calling
 * (background) thread with its own OpenGL context. The original photo is never touched: the result is a
 * new bitmap that the camera saves as a separate copy.
 */
object BeautyStill {
    /** Largest side of the enhanced copy; larger photos are scaled down to fit the GPU memory of mid range phones. */
    const val MAX_SIDE = 4096

    class Result(val bitmap: Bitmap, val faces: Int)

    fun process(context: Context, photo: Bitmap, state: BeautyState, faceModels: Pair<OnnxModel, OnnxModel>? = null): Result {
        val core = EglCore()
        val renderer = BeautyRenderer()
        val owned = faceModels == null
        val models = faceModels ?: Pair(
            OnnxModel(context.assets.open(ModelNames.FACE_DETECT).use { it.readBytes() }, threads = 4),
            OnnxModel(context.assets.open(ModelNames.FACE_MESH).use { it.readBytes() }, threads = 4))
        try {
            renderer.init()
            val maxTex = IntArray(1).also { GLES30.glGetIntegerv(GLES30.GL_MAX_TEXTURE_SIZE, it, 0) }[0]
            val limit = minOf(MAX_SIDE, maxTex)
            val scale = minOf(1f, limit.toFloat() / max(photo.width, photo.height))
            val src = if (scale < 1f) Bitmap.createScaledBitmap(photo, (photo.width * scale).roundToInt(), (photo.height * scale).roundToInt(), true) else photo
            val faces = findFaces(src, models)
            val tex = IntArray(1).also { GLES30.glGenTextures(1, it, 0) }[0]
            GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, tex)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE)
            GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE)
            GLUtils.texImage2D(GLES30.GL_TEXTURE_2D, 0, src, 0)   // row 0 of the bitmap is v = 0
            val identity = FloatArray(16).also { Matrix.setIdentityM(it, 0) }
            val out = renderer.render(tex, false, identity, src.width, src.height, faces, state, 7f)
            val px = renderer.readFull(out)
            GLES30.glDeleteTextures(1, intArrayOf(tex), 0)
            val bmp = Bitmap.createBitmap(px, src.width, src.height, Bitmap.Config.ARGB_8888)
            if (src !== photo) src.recycle()
            return Result(bmp, faces.size)
        } finally {
            runCatching { renderer.release() }
            core.release()
            if (owned) { models.first.close(); models.second.close() }
        }
    }

    /** Faces in the photo's own normalised coordinates, from a copy at most 1024 pixels on its long side. */
    fun findFaces(photo: Bitmap, models: Pair<OnnxModel, OnnxModel>): List<TrackedFace> {
        val s = minOf(1f, 1024f / max(photo.width, photo.height))
        val small = if (s < 1f) Bitmap.createScaledBitmap(photo, max(1, (photo.width * s).roundToInt()), max(1, (photo.height * s).roundToInt()), true) else photo
        val w = small.width; val h = small.height
        val argb = IntArray(w * h); small.getPixels(argb, 0, w, 0, 0, w, h)
        if (small !== photo) small.recycle()
        val rgba = ByteArray(w * h * 4)
        for (i in argb.indices) { val c = argb[i]; rgba[4 * i] = (c shr 16).toByte(); rgba[4 * i + 1] = (c shr 8).toByte(); rgba[4 * i + 2] = c.toByte(); rgba[4 * i + 3] = -1 }
        return FaceTracker(models.first, models.second).detectStill(FaceTracker.Frame(rgba, w, h, flipY = false, quarterTurns = 0))
    }
}
