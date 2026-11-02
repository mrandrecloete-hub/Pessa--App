package com.example.aicamerastudio.camera.beauty.gl

import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLExt
import android.opengl.EGLSurface
import android.view.Surface

/** An OpenGL ES 3 context whose surfaces can feed a video encoder (EGL_RECORDABLE_ANDROID). */
class EglCore {
    val display: EGLDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
    private val config: EGLConfig
    val context: EGLContext
    val pbuffer: EGLSurface

    init {
        val v = IntArray(2)
        check(EGL14.eglInitialize(display, v, 0, v, 1)) { "EGL could not start" }
        // Preferred: drawable to windows and off screen, and usable by the video encoder. Some phones only
        // offer that without the "recordable" flag; video encoders accept those surfaces on most of them.
        fun choose(recordable: Boolean): EGLConfig? {
            val attrs = intArrayOf(
                EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8, EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
                EGL14.EGL_RENDERABLE_TYPE, EGLExt.EGL_OPENGL_ES3_BIT_KHR,
                EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT or EGL14.EGL_PBUFFER_BIT,
                EGL_RECORDABLE_ANDROID, if (recordable) 1 else EGL_DONT_CARE, EGL14.EGL_NONE)
            val configs = arrayOfNulls<EGLConfig>(1); val n = IntArray(1)
            return if (EGL14.eglChooseConfig(display, attrs, 0, configs, 0, 1, n, 0) && n[0] > 0) configs[0] else null
        }
        config = choose(true) ?: choose(false) ?: throw IllegalStateException("This phone has no OpenGL ES 3 configuration")
        context = EGL14.eglCreateContext(display, config, EGL14.EGL_NO_CONTEXT, intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION, 3, EGL14.EGL_NONE), 0)
        check(context != EGL14.EGL_NO_CONTEXT) { "OpenGL ES 3 is not available" }
        pbuffer = EGL14.eglCreatePbufferSurface(display, config, intArrayOf(EGL14.EGL_WIDTH, 1, EGL14.EGL_HEIGHT, 1, EGL14.EGL_NONE), 0)
        makeCurrent(pbuffer)
    }

    fun windowSurface(surface: Surface): EGLSurface =
        EGL14.eglCreateWindowSurface(display, config, surface, intArrayOf(EGL14.EGL_NONE), 0).also { check(it != EGL14.EGL_NO_SURFACE) { "Could not draw to the camera output" } }

    fun makeCurrent(s: EGLSurface) { check(EGL14.eglMakeCurrent(display, s, s, context)) { "eglMakeCurrent failed: 0x${Integer.toHexString(EGL14.eglGetError())}" } }
    fun swap(s: EGLSurface, timestampNs: Long) { EGLExt.eglPresentationTimeANDROID(display, s, timestampNs); EGL14.eglSwapBuffers(display, s) }
    fun releaseSurface(s: EGLSurface) { EGL14.eglDestroySurface(display, s) }

    fun release() {
        EGL14.eglMakeCurrent(display, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT)
        EGL14.eglDestroySurface(display, pbuffer)
        EGL14.eglDestroyContext(display, context)
        EGL14.eglReleaseThread()
        // No eglTerminate: the display is shared with CameraX and the rest of the app.
    }

    companion object { const val EGL_RECORDABLE_ANDROID = 0x3142; const val EGL_DONT_CARE = -1 }
}
