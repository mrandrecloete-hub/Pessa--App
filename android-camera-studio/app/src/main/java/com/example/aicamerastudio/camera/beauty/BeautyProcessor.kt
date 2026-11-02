package com.example.aicamerastudio.camera.beauty

import android.content.Context
import android.graphics.SurfaceTexture
import android.opengl.EGLSurface
import android.opengl.GLES30
import android.opengl.Matrix
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import android.util.Log
import android.util.Size
import android.view.Surface
import androidx.camera.core.CameraEffect
import androidx.camera.core.SurfaceOutput
import androidx.camera.core.SurfaceProcessor
import androidx.camera.core.SurfaceRequest
import com.example.aicamerastudio.camera.beauty.gl.BeautyRenderer
import com.example.aicamerastudio.camera.beauty.gl.EglCore
import com.example.aicamerastudio.camera.beauty.gl.Gl
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.OnnxModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.nio.ByteBuffer
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Live status for the camera screen. */
data class BeautyStatus(val faces: Int = 0, val fps: Float = 0f, val quality: Int = 2, val error: String? = null)

/**
 * The live beauty camera: a CameraX [SurfaceProcessor]. CameraX sends every camera frame here; each frame is
 * processed on the GPU and drawn into every output CameraX asks for — the preview and, while recording,
 * the video encoder — so the saved video looks the same as the preview. Audio is recorded by CameraX as usual.
 *
 * Faces are tracked on a separate thread from a small copy of the frame, so the GPU and the camera never wait
 * for the face models. If the phone cannot keep up, quality steps down automatically.
 */
class BeautyProcessor(private val context: Context) : SurfaceProcessor {
    private val thread = HandlerThread("BeautyGL").apply { start() }
    private val handler = Handler(thread.looper)
    val executor: Executor = Executor { handler.post(it) }
    private val trackerThread = Executors.newSingleThreadExecutor { r -> Thread(r, "BeautyFaces").apply { priority = Thread.NORM_PRIORITY - 1 } }

    @Volatile var state: BeautyState = BeautyState()
    /** Shows the camera picture without effects while true (before / after). */
    @Volatile var compare = false

    private val _status = MutableStateFlow(BeautyStatus())
    val status: StateFlow<BeautyStatus> = _status

    private var egl: EglCore? = null
    private val renderer = BeautyRenderer()
    private var released = false

    private class Input(val tex: Int, val st: SurfaceTexture, val surface: Surface, val size: Size)
    private class Output(val egl: EGLSurface, val size: Size)
    private var input: Input? = null
    @Volatile private var rotation = 0
    private val outputs = LinkedHashMap<SurfaceOutput, Output>()

    private var tracker: FaceTracker? = null
    private val trackerModels = ArrayList<OnnxModel>()
    private var trackerFailed = false
    private val trackerBusy = AtomicBoolean(false)
    @Volatile private var faces: List<TrackedFace> = emptyList()
    private var trackBytes = ByteArray(0)

    private val st = FloatArray(16); private val stInv = FloatArray(16); private val outM = FloatArray(16); private val m = FloatArray(16)
    private var renderScheduled = false
    private var available = 0; private var rendered = 0; private var windowStart = 0L; private var calmWindows = 0

    private fun gl(): EglCore = egl ?: EglCore().also { egl = it; renderer.init() }

    override fun onInputSurface(request: SurfaceRequest) {
        if (released) { request.willNotProvideSurface(); return }
        val core = try { gl() } catch (t: Throwable) { fail(t); request.willNotProvideSurface(); return }
        core.makeCurrent(core.pbuffer)
        val tex = Gl.oesTexture()
        val tx = SurfaceTexture(tex)
        tx.setDefaultBufferSize(request.resolution.width, request.resolution.height)
        val surface = Surface(tx)
        val inp = Input(tex, tx, surface, request.resolution)
        request.setTransformationInfoListener(executor) { info -> rotation = info.rotationDegrees }
        tx.setOnFrameAvailableListener({ onFrameAvailable() }, handler)
        request.provideSurface(surface, executor) {
            tx.setOnFrameAvailableListener(null)
            surface.release(); tx.release()
            runCatching { egl?.let { it.makeCurrent(it.pbuffer) }; GLES30.glDeleteTextures(1, intArrayOf(tex), 0) }
            if (input === inp) input = null
        }
        input = inp
    }

    override fun onOutputSurface(surfaceOutput: SurfaceOutput) {
        if (released) { surfaceOutput.close(); return }
        val core = try { gl() } catch (t: Throwable) { fail(t); surfaceOutput.close(); return }
        val surface = surfaceOutput.getSurface(executor) { event ->
            if (event.eventCode == SurfaceOutput.Event.EVENT_REQUEST_CLOSE) {
                outputs.remove(surfaceOutput)?.let { runCatching { core.releaseSurface(it.egl) } }
                surfaceOutput.close()
            }
        }
        try { outputs[surfaceOutput] = Output(core.windowSurface(surface), surfaceOutput.size) } catch (t: Throwable) { fail(t); surfaceOutput.close() }
    }

    private fun onFrameAvailable() {
        available++
        if (renderScheduled) return   // the next render takes the newest frame; older ones are dropped
        renderScheduled = true
        handler.post { renderScheduled = false; render() }
    }

    private fun render() {
        val inp = input ?: return
        val core = egl ?: return
        try {
            core.makeCurrent(core.pbuffer)
            inp.st.updateTexImage()
            inp.st.getTransformMatrix(st)
            Matrix.invertM(stInv, 0, st, 0)
            val s = state
            // The working picture is the camera frame as the texture transform shows it (texture space).
            val w = inp.size.width; val h = inp.size.height
            val needFaces = s.enabled && !s.isNeutral && s.effective().let { l ->
                l.smoothing + l.brightness + l.blemish + l.underEye + l.toneBalance + l.lighting + l.eyes + l.teeth + l.jawline > 0f || l.makeup > 0f }
            // Sample the OES texture with the transform so the working copy is the real picture.
            val tex = renderer.render(inp.tex, true, st, w, h, if (needFaces) faces else emptyList(), s, (rendered % 1000).toFloat())
            if (needFaces && !trackerFailed && !trackerBusy.get()) renderer.readSmall { buf, sw, sh -> startTracking(buf, sw, sh, inp.st.timestamp) }
            else if (!needFaces && faces.isNotEmpty()) faces = emptyList()
            val show = if (compare) renderer.originalTexture else tex
            // Output coordinates -> camera texture coordinates -> working copy coordinates.
            for ((out, o) in outputs) {
                core.makeCurrent(o.egl)
                out.updateTransformMatrix(outM, st)
                Matrix.multiplyMM(m, 0, stInv, 0, outM, 0)
                renderer.blit(show, m, o.size.width, o.size.height)
                core.swap(o.egl, inp.st.timestamp)
            }
            rendered++
            adaptQuality()
        } catch (t: Throwable) {
            fail(t)
        }
    }

    private fun adaptQuality() {
        val now = SystemClock.elapsedRealtime()
        if (windowStart == 0L) windowStart = now
        if (now - windowStart < 2000) return
        val secs = (now - windowStart) / 1000f
        val dropped = if (available > 0) 1f - rendered.toFloat() / available else 0f
        if (dropped > 0.2f && renderer.quality > 0) { renderer.quality--; calmWindows = 0 }
        else if (dropped < 0.02f) { if (++calmWindows >= 5 && renderer.quality < 2) { renderer.quality++; calmWindows = 0 } }
        else calmWindows = 0
        _status.value = _status.value.copy(fps = rendered / secs, quality = renderer.quality, faces = faces.count { it.alpha > 0.5f })
        available = 0; rendered = 0; windowStart = now
    }

    private fun startTracking(buf: ByteBuffer, w: Int, h: Int, timestampNs: Long) {
        val n = w * h * 4
        if (trackBytes.size != n) trackBytes = ByteArray(n)
        buf.position(0); buf.get(trackBytes, 0, n)
        val bytes = trackBytes   // safe to reuse: a new copy is only made while the tracker is idle
        val turns = (rotation / 90) and 3
        trackerBusy.set(true)
        trackerThread.execute {
            try {
                val t = tracker ?: run {
                    val d = OnnxModel(context.assets.open(ModelNames.FACE_DETECT).use { it.readBytes() }, threads = 2, tryXnnpack = true)
                    val mesh = OnnxModel(context.assets.open(ModelNames.FACE_MESH).use { it.readBytes() }, threads = 2, tryXnnpack = true)
                    trackerModels += d; trackerModels += mesh
                    FaceTracker(d, mesh)
                }.also { tracker = it }
                // Rows come from the GPU bottom first, so the picture is upside down until flipped.
                faces = t.track(FaceTracker.Frame(bytes, w, h, flipY = true, quarterTurns = turns), timestampNs / 1e9)
            } catch (t: Throwable) {
                trackerFailed = true
                Log.w(TAG, "Face tracking stopped", t)
                _status.value = _status.value.copy(error = "Face tracking is not available on this phone. Colour filters still work.")
            } finally { trackerBusy.set(false) }
        }
    }

    private fun fail(t: Throwable) {
        Log.e(TAG, "Beauty processing failed", t)
        _status.value = _status.value.copy(error = "Beauty effects could not run on this phone: ${t.message ?: t.javaClass.simpleName}")
    }

    /** Frees the GPU and the face models. The processor cannot be used afterwards. */
    fun release() {
        released = true
        handler.post {
            for ((out, o) in outputs) { runCatching { egl?.releaseSurface(o.egl) }; out.close() }
            outputs.clear()
            runCatching { egl?.let { it.makeCurrent(it.pbuffer); renderer.release() } }
            runCatching { egl?.release() }
            egl = null
            thread.quitSafely()
        }
        trackerThread.execute { faces = emptyList(); tracker = null; trackerModels.forEach { runCatching { it.close() } }; trackerModels.clear() }
        trackerThread.shutdown()
    }

    companion object { private const val TAG = "BeautyProcessor" }
}

/** The effect CameraX applies to the preview and to video recording. */
class BeautyEffect(processor: BeautyProcessor, targets: Int = PREVIEW or VIDEO_CAPTURE) :
    CameraEffect(targets, processor.executor, processor, { t -> Log.e("BeautyEffect", "Camera effect error", t) })
