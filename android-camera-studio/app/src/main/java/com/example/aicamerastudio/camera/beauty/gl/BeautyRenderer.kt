package com.example.aicamerastudio.camera.beauty.gl

import android.graphics.Color
import android.opengl.GLES11Ext
import android.opengl.GLES30.*
import com.example.aicamerastudio.camera.beauty.BeautyState
import com.example.aicamerastudio.camera.beauty.FaceMesh
import com.example.aicamerastudio.camera.beauty.TrackedFace
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Runs the beauty passes on the GPU (OpenGL ES 3.0). Used for the live camera ([BeautyProcessor]) and for
 * photos ([BeautyStill]), so a saved photo gets exactly the look of the preview.
 *
 * Per frame: copy the camera image; if a face is present, draw soft face masks from the tracked points,
 * smooth at half resolution with an edge preserving filter, blur a small copy for blemish, tone and glow;
 * then one composite pass applies every effect and the colour grade.
 */
class BeautyRenderer {
    private var copyOes = 0; private var copy2d = 0; private var bilateral = 0; private var gauss = 0; private var mask = 0; private var composite = 0
    private val quad: FloatBuffer = Gl.floats(-1f, -1f, 1f, -1f, -1f, 1f, 1f, 1f)
    private val identity = FloatArray(16).also { android.opengl.Matrix.setIdentityM(it, 0) }
    private val locs = HashMap<Int, HashMap<String, Int>>()

    private var w = 0; private var h = 0
    private var cam: Target? = null; private var half: Target? = null; private var quarter: Target? = null
    private var smoothA: Target? = null; private var smoothB: Target? = null
    private var eighthA: Target? = null; private var eighthB: Target? = null
    private var maskA: Target? = null; private var maskB: Target? = null
    private var out: Target? = null; private var small: Target? = null
    private val pbo = IntArray(2); private var pboIndex = 0; private var pboPending = BooleanArray(2)

    /** 2 = full quality; 1 = smoothing at quarter resolution; 0 = also no large blur effects (blemish, tone, glow). */
    var quality = 2
    val width get() = w
    val height get() = h

    fun init() {
        copyOes = Gl.program(BeautyShaders.QUAD_VS, BeautyShaders.COPY_OES_FS)
        copy2d = Gl.program(BeautyShaders.QUAD_VS, BeautyShaders.COPY_FS)
        bilateral = Gl.program(BeautyShaders.QUAD_VS, BeautyShaders.BILATERAL_FS)
        gauss = Gl.program(BeautyShaders.QUAD_VS, BeautyShaders.GAUSS_FS)
        mask = Gl.program(BeautyShaders.MASK_VS, BeautyShaders.MASK_FS)
        composite = Gl.program(BeautyShaders.QUAD_VS, BeautyShaders.COMPOSITE_FS)
        glGenBuffers(2, pbo, 0)
        Gl.check("init")
    }

    private fun loc(p: Int, n: String): Int = locs.getOrPut(p) { HashMap() }.getOrPut(n) { glGetUniformLocation(p, n) }

    private fun ensure(width: Int, height: Int) {
        if (width == w && height == h && cam != null) return
        releaseTargets()
        w = width; h = height
        fun t(d: Int) = Target(max(1, w / d), max(1, h / d))
        cam = Target(w, h); half = t(2); quarter = t(4)
        smoothA = t(2); smoothB = t(2)
        eighthA = t(8); eighthB = t(8)
        maskA = t(4); maskB = t(4)
        out = Target(w, h)
        val s = 480f / max(w, h)
        small = Target(max(1, (w * s).roundToInt()), max(1, (h * s).roundToInt()))
        val bytes = small!!.w * small!!.h * 4
        for (b in pbo) { glBindBuffer(GL_PIXEL_PACK_BUFFER, b); glBufferData(GL_PIXEL_PACK_BUFFER, bytes, null, GL_STREAM_READ) }
        glBindBuffer(GL_PIXEL_PACK_BUFFER, 0)
        pboPending.fill(false)
    }

    private fun drawQuad(program: Int, tex: Int, oes: Boolean = false, matrix: FloatArray = identity) {
        glUseProgram(program)
        glActiveTexture(GL_TEXTURE0)
        glBindTexture(if (oes) GLES11Ext.GL_TEXTURE_EXTERNAL_OES else GL_TEXTURE_2D, tex)
        glUniform1i(loc(program, "uTex"), 0)
        glUniformMatrix4fv(loc(program, "uTexMatrix"), 1, false, matrix, 0)
        val a = glGetAttribLocation(program, "aPos")
        glEnableVertexAttribArray(a)
        glVertexAttribPointer(a, 2, GL_FLOAT, false, 0, quad)
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4)
        glDisableVertexAttribArray(a)
    }

    private fun pass(target: Target, program: Int, tex: Int, setup: () -> Unit = {}) {
        target.bind(); glUseProgram(program); setup(); drawQuad(program, tex)
    }

    /**
     * Renders one frame. [input] is the camera's OES texture (live) or a 2D texture (photo), sampled with
     * [inputMatrix] into the working space. Returns the texture with the finished picture.
     */
    fun render(input: Int, oes: Boolean, inputMatrix: FloatArray, width: Int, height: Int, faces: List<TrackedFace>, state: BeautyState, seed: Float): Int {
        ensure(width, height)
        glDisable(GL_BLEND); glDisable(GL_DEPTH_TEST)
        val cam = cam!!
        cam.bind(); drawQuad(if (oes) copyOes else copy2d, input, oes, inputMatrix)
        if (state.isNeutral) return cam.tex

        val lv = state.effective()
        val visible = faces.filter { it.alpha > 0.01f }.take(3)
        val faceSize = visible.maxOfOrNull { faceSizePx(it) } ?: 0f
        val skinWork = visible.isNotEmpty()

        // Small copies: half resolution (fine texture reference and smoothing input) and 1/8 (large blur).
        pass(half!!, copy2d, cam.tex)
        pass(quarter!!, copy2d, half!!.tex)
        pass(eighthA!!, copy2d, quarter!!.tex)
        if (quality > 0) {
            val stepX = 1f / eighthA!!.w; val stepY = 1f / eighthA!!.h
            pass(eighthB!!, gauss, eighthA!!.tex) { glUniform2f(loc(gauss, "uStep"), stepX, 0f) }
            pass(eighthA!!, gauss, eighthB!!.tex) { glUniform2f(loc(gauss, "uStep"), 0f, stepY) }
        }
        if (skinWork) {
            // Edge preserving smoothing, radius proportional to the face so it looks the same at any resolution.
            val src = if (quality >= 2) half!! else quarter!!
            val texel = faceSize / (if (quality >= 2) 2f else 4f) * 0.012f
            val sx = max(1f, texel) / src.w; val sy = max(1f, texel) / src.h
            pass(smoothB!!, bilateral, src.tex) { glUniform2f(loc(bilateral, "uStep"), sx, 0f); glUniform1f(loc(bilateral, "uSigmaR"), 0.075f) }
            pass(smoothA!!, bilateral, smoothB!!.tex) { glUniform2f(loc(bilateral, "uStep"), 0f, sy); glUniform1f(loc(bilateral, "uSigmaR"), 0.075f) }
            drawMasks(visible)
            val feather = max(1f, faceSize / 4f * 0.012f)
            pass(maskB!!, gauss, maskA!!.tex) { glUniform2f(loc(gauss, "uStep"), feather / maskA!!.w, 0f) }
            pass(maskA!!, gauss, maskB!!.tex) { glUniform2f(loc(gauss, "uStep"), 0f, feather / maskA!!.h) }
        } else {
            maskA!!.bind(); glClearColor(0f, 0f, 0f, 0f); glClear(GL_COLOR_BUFFER_BIT)
        }

        val out = out!!
        out.bind()
        val p = composite
        glUseProgram(p)
        val texs = intArrayOf(cam.tex, half!!.tex, if (skinWork) smoothA!!.tex else half!!.tex, eighthA!!.tex, maskA!!.tex)
        val names = arrayOf("uCam", "uHalf", "uSmooth", "uLarge", "uMask")
        for (i in texs.indices) { glActiveTexture(GL_TEXTURE0 + i); glBindTexture(GL_TEXTURE_2D, texs[i]); glUniform1i(loc(p, names[i]), i) }
        glUniform2f(loc(p, "uSize"), w.toFloat(), h.toFloat())
        val large = quality > 0
        glUniform1f(loc(p, "uSmoothAmt"), lv.smoothing)
        glUniform1f(loc(p, "uBright"), lv.brightness * 0.6f)
        glUniform1f(loc(p, "uBlemish"), if (large) lv.blemish else 0f)
        glUniform1f(loc(p, "uUnderEye"), lv.underEye)
        glUniform1f(loc(p, "uTone"), if (large) lv.toneBalance else 0f)
        glUniform1f(loc(p, "uLight"), lv.lighting)
        glUniform1f(loc(p, "uEyes"), lv.eyes)
        glUniform1f(loc(p, "uTeeth"), lv.teeth)
        glUniform1f(loc(p, "uLip"), if (lv.lipColor) lv.makeup else 0f)
        glUniform1f(loc(p, "uBlush"), if (lv.blush) lv.makeup else 0f)
        glUniform1f(loc(p, "uContour"), lv.makeup * lv.contour * 2f)
        glUniform1f(loc(p, "uJaw"), lv.jawline)
        glUniform3f(loc(p, "uLipTint"), Color.red(lv.lipTint) / 255f, Color.green(lv.lipTint) / 255f, Color.blue(lv.lipTint) / 255f)
        setFaces(p, visible)
        val g = state.preset.grade
        glUniform1f(loc(p, "uExposure"), g.exposure); glUniform1f(loc(p, "uContrast"), g.contrast); glUniform1f(loc(p, "uSat"), g.saturation)
        glUniform1f(loc(p, "uVib"), g.vibrance); glUniform1f(loc(p, "uTemp"), g.temperature); glUniform1f(loc(p, "uTint"), g.tint)
        glUniform1f(loc(p, "uFade"), g.fade); glUniform1f(loc(p, "uSplit"), g.splitAmount); glUniform1f(loc(p, "uGlow"), if (large) g.glow else 0f)
        glUniform1f(loc(p, "uVignette"), g.vignette); glUniform1f(loc(p, "uGrain"), g.grain)
        glUniform1f(loc(p, "uStrength"), state.filterStrength); glUniform1f(loc(p, "uSeed"), seed)
        fun tint(c: Int) = if (c == 0) floatArrayOf(0.5f, 0.5f, 0.5f) else floatArrayOf(((c shr 16) and 255) / 255f, ((c shr 8) and 255) / 255f, (c and 255) / 255f)
        tint(g.shadowTint).let { glUniform3f(loc(p, "uShadowTint"), it[0], it[1], it[2]) }
        tint(g.highlightTint).let { glUniform3f(loc(p, "uHighTint"), it[0], it[1], it[2]) }
        glUniformMatrix4fv(loc(p, "uTexMatrix"), 1, false, identity, 0)
        val a = glGetAttribLocation(p, "aPos")
        glEnableVertexAttribArray(a); glVertexAttribPointer(a, 2, GL_FLOAT, false, 0, quad)
        glDrawArrays(GL_TRIANGLE_STRIP, 0, 4); glDisableVertexAttribArray(a)
        glActiveTexture(GL_TEXTURE0)
        return out.tex
    }

    /** The camera picture of the last frame without any effect (for before / after). */
    val originalTexture: Int get() = cam?.tex ?: 0

    private fun faceSizePx(f: TrackedFace): Float = 2f * hypot((f.x(FaceMesh.LEFT_EYE_OUTER) - f.x(FaceMesh.RIGHT_EYE_OUTER)) * w, (f.y(FaceMesh.LEFT_EYE_OUTER) - f.y(FaceMesh.RIGHT_EYE_OUTER)) * h)

    private fun setFaces(p: Int, faces: List<TrackedFace>) {
        val n = faces.size
        glUniform1i(loc(p, "uFaces"), n)
        val face = FloatArray(12); val axis = FloatArray(12); val lid = FloatArray(12); val cheek = FloatArray(12); val bone = FloatArray(12)
        val jaw = FloatArray(12); val nose = FloatArray(12); val bridge = FloatArray(12)
        faces.forEachIndexed { i, f ->
            fun px(k: Int) = f.x(k) * w
            fun py(k: Int) = f.y(k) * h
            val o = i * 4
            val size = faceSizePx(f)
            var ex = px(FaceMesh.LEFT_EYE_OUTER) - px(FaceMesh.RIGHT_EYE_OUTER); var ey = py(FaceMesh.LEFT_EYE_OUTER) - py(FaceMesh.RIGHT_EYE_OUTER)
            val el = max(1e-3f, hypot(ex, ey)); ex /= el; ey /= el
            // "Down the face": from between the eyes towards the chin, made perpendicular to the eye line.
            var dx = px(FaceMesh.CHIN) - (px(FaceMesh.LEFT_EYE_OUTER) + px(FaceMesh.RIGHT_EYE_OUTER)) / 2
            var dy = py(FaceMesh.CHIN) - (py(FaceMesh.LEFT_EYE_OUTER) + py(FaceMesh.RIGHT_EYE_OUTER)) / 2
            val dot = dx * ex + dy * ey; dx -= dot * ex; dy -= dot * ey
            val dl = max(1e-3f, hypot(dx, dy)); dx /= dl; dy /= dl
            face[o] = px(FaceMesh.NOSE_TIP); face[o + 1] = py(FaceMesh.NOSE_TIP); face[o + 2] = size; face[o + 3] = f.alpha
            axis[o] = ex; axis[o + 1] = ey; axis[o + 2] = dx; axis[o + 3] = dy
            fun pair(arr: FloatArray, a: Int, b: Int) { arr[o] = px(a); arr[o + 1] = py(a); arr[o + 2] = px(b); arr[o + 3] = py(b) }
            pair(lid, FaceMesh.RIGHT_LOWER_LID, FaceMesh.LEFT_LOWER_LID)
            pair(cheek, FaceMesh.RIGHT_CHEEK, FaceMesh.LEFT_CHEEK)
            pair(bone, FaceMesh.RIGHT_CHEEKBONE, FaceMesh.LEFT_CHEEKBONE)
            pair(jaw, FaceMesh.RIGHT_JAW, FaceMesh.LEFT_JAW)
            pair(nose, FaceMesh.RIGHT_NOSE_SIDE, FaceMesh.LEFT_NOSE_SIDE)
            pair(bridge, FaceMesh.NOSE_BRIDGE, FaceMesh.FOREHEAD)
        }
        glUniform4fv(loc(p, "uFace"), 3, face, 0); glUniform4fv(loc(p, "uAxis"), 3, axis, 0); glUniform4fv(loc(p, "uLid"), 3, lid, 0)
        glUniform4fv(loc(p, "uCheek"), 3, cheek, 0); glUniform4fv(loc(p, "uCheekbone"), 3, bone, 0); glUniform4fv(loc(p, "uJawPt"), 3, jaw, 0)
        glUniform4fv(loc(p, "uNoseSide"), 3, nose, 0); glUniform4fv(loc(p, "uBridge"), 3, bridge, 0)
    }

    private val polyBuf: FloatBuffer = ByteBuffer.allocateDirect(64 * 2 * 4).order(ByteOrder.nativeOrder()).asFloatBuffer()

    /** Masks: R skin (face outline without eyes, brows and lips), G lips, B inside the mouth, A eyes. Faded with each face's visibility. */
    private fun drawMasks(faces: List<TrackedFace>) {
        val m = maskA!!
        m.bind(); glClearColor(0f, 0f, 0f, 0f); glClear(GL_COLOR_BUFFER_BIT)
        glUseProgram(mask)
        val a = glGetAttribLocation(mask, "aUv")
        glEnableVertexAttribArray(a)
        fun poly(f: TrackedFace, idx: IntArray, r: Boolean, g: Boolean, b: Boolean, al: Boolean, value: Float, grow: Float = 1f) {
            var cx = 0f; var cy = 0f
            for (i in idx) { cx += f.x(i); cy += f.y(i) }
            cx /= idx.size; cy /= idx.size
            polyBuf.clear(); polyBuf.put(cx); polyBuf.put(cy)
            for (k in 0..idx.size) { val i = idx[k % idx.size]; polyBuf.put(cx + (f.x(i) - cx) * grow); polyBuf.put(cy + (f.y(i) - cy) * grow) }
            polyBuf.position(0)
            glColorMask(r, g, b, al)
            glUniform4f(loc(mask, "uColor"), value, value, value, value)
            glVertexAttribPointer(a, 2, GL_FLOAT, false, 0, polyBuf)
            glDrawArrays(GL_TRIANGLE_FAN, 0, idx.size + 2)
        }
        for (f in faces) {
            val v = f.alpha
            poly(f, FaceMesh.OVAL, true, false, false, false, v, 0.97f)
            for (e in listOf(FaceMesh.RIGHT_EYE, FaceMesh.LEFT_EYE)) { poly(f, e, true, false, false, false, 0f, 1.35f); poly(f, e, false, false, false, true, v, 1.05f) }
            for (b in listOf(FaceMesh.RIGHT_BROW, FaceMesh.LEFT_BROW)) poly(f, b, true, false, false, false, 0f, 1.25f)
            poly(f, FaceMesh.LIPS_OUTER, true, false, false, false, 0f, 1.08f)
            poly(f, FaceMesh.LIPS_OUTER, false, true, false, false, v)
            poly(f, FaceMesh.LIPS_INNER, false, true, false, false, 0f)
            poly(f, FaceMesh.LIPS_INNER, false, false, true, false, v)
        }
        glColorMask(true, true, true, true)
        glDisableVertexAttribArray(a)
    }

    /** Draws [tex] into the current surface (size [vw] x [vh]) with [matrix] mapping output to texture coordinates. */
    fun blit(tex: Int, matrix: FloatArray, vw: Int, vh: Int) {
        glBindFramebuffer(GL_FRAMEBUFFER, 0); glViewport(0, 0, vw, vh)
        drawQuad(copy2d, tex, false, matrix)
    }

    /**
     * Starts reading a small copy of the camera picture for face tracking, and returns the copy started on the
     * previous call (one frame late, so the GPU never stalls). Rows are in texture order (row 0 = v 0).
     */
    fun readSmall(into: (ByteBuffer, Int, Int) -> Unit) {
        val s = small ?: return; val c = cam ?: return
        pass(s, copy2d, c.tex)
        val prev = 1 - pboIndex
        glBindBuffer(GL_PIXEL_PACK_BUFFER, pbo[pboIndex])
        glReadPixels(0, 0, s.w, s.h, GL_RGBA, GL_UNSIGNED_BYTE, 0)
        pboPending[pboIndex] = true
        if (pboPending[prev]) {
            glBindBuffer(GL_PIXEL_PACK_BUFFER, pbo[prev])
            val buf = glMapBufferRange(GL_PIXEL_PACK_BUFFER, 0, s.w * s.h * 4, GL_MAP_READ_BIT) as? ByteBuffer
            if (buf != null) { into(buf, s.w, s.h); glUnmapBuffer(GL_PIXEL_PACK_BUFFER) }
            pboPending[prev] = false
        }
        glBindBuffer(GL_PIXEL_PACK_BUFFER, 0)
        pboIndex = prev
    }

    /** Reads the whole [tex] (size of the working frame) into an ARGB array, rows in texture order. For photos. */
    fun readFull(tex: Int): IntArray {
        val t = out!!
        if (tex != t.tex) pass(t, copy2d, tex)
        t.bind()
        val buf = ByteBuffer.allocateDirect(w * h * 4).order(ByteOrder.nativeOrder())
        glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, buf)
        val px = IntArray(w * h)
        for (i in 0 until w * h) {
            val r = buf.get(4 * i).toInt() and 255; val g = buf.get(4 * i + 1).toInt() and 255; val b = buf.get(4 * i + 2).toInt() and 255
            px[i] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
        }
        return px
    }

    private fun releaseTargets() {
        listOf(cam, half, quarter, smoothA, smoothB, eighthA, eighthB, maskA, maskB, out, small).forEach { it?.release() }
        cam = null; half = null; quarter = null; smoothA = null; smoothB = null; eighthA = null; eighthB = null; maskA = null; maskB = null; out = null; small = null
        w = 0; h = 0
    }

    fun release() {
        releaseTargets()
        glDeleteBuffers(2, pbo, 0)
        listOf(copyOes, copy2d, bilateral, gauss, mask, composite).forEach { if (it != 0) glDeleteProgram(it) }
        locs.clear()
    }

    companion object {
        fun min3(a: Float, b: Float, c: Float) = min(a, min(b, c))
    }
}
