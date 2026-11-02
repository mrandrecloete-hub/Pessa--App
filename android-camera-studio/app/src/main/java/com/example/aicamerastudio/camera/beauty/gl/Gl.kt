package com.example.aicamerastudio.camera.beauty.gl

import android.opengl.GLES11Ext
import android.opengl.GLES30.*
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer

/** Small OpenGL ES 3 helpers for the beauty pipeline. All calls must run on the GL thread. */
object Gl {
    fun check(what: String) {
        val e = glGetError()
        if (e != GL_NO_ERROR) throw IllegalStateException("GL error 0x${Integer.toHexString(e)} after $what")
    }

    fun program(vs: String, fs: String): Int {
        fun shader(type: Int, src: String): Int {
            val s = glCreateShader(type)
            glShaderSource(s, src); glCompileShader(s)
            val ok = IntArray(1); glGetShaderiv(s, GL_COMPILE_STATUS, ok, 0)
            if (ok[0] == 0) { val log = glGetShaderInfoLog(s); glDeleteShader(s); throw IllegalStateException("Shader did not compile: $log") }
            return s
        }
        val p = glCreateProgram()
        val v = shader(GL_VERTEX_SHADER, vs); val f = shader(GL_FRAGMENT_SHADER, fs)
        glAttachShader(p, v); glAttachShader(p, f); glLinkProgram(p)
        glDeleteShader(v); glDeleteShader(f)
        val ok = IntArray(1); glGetProgramiv(p, GL_LINK_STATUS, ok, 0)
        if (ok[0] == 0) { val log = glGetProgramInfoLog(p); glDeleteProgram(p); throw IllegalStateException("Program did not link: $log") }
        return p
    }

    fun floats(vararg v: Float): FloatBuffer = ByteBuffer.allocateDirect(v.size * 4).order(ByteOrder.nativeOrder()).asFloatBuffer().apply { put(v); position(0) }

    fun oesTexture(): Int {
        val t = IntArray(1); glGenTextures(1, t, 0)
        glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, t[0])
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MIN_FILTER, GL_LINEAR)
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MAG_FILTER, GL_LINEAR)
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE)
        glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE)
        return t[0]
    }

    fun texture2d(w: Int, h: Int): Int {
        val t = IntArray(1); glGenTextures(1, t, 0)
        glBindTexture(GL_TEXTURE_2D, t[0])
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, w, h, 0, GL_RGBA, GL_UNSIGNED_BYTE, null)
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR)
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR)
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE)
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE)
        return t[0]
    }
}

/** A texture with its framebuffer. */
class Target(val w: Int, val h: Int) {
    val tex = Gl.texture2d(w, h)
    val fbo: Int = IntArray(1).also { glGenFramebuffers(1, it, 0) }[0]

    init {
        glBindFramebuffer(GL_FRAMEBUFFER, fbo)
        glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, tex, 0)
        val s = glCheckFramebufferStatus(GL_FRAMEBUFFER)
        glBindFramebuffer(GL_FRAMEBUFFER, 0)
        check(s == GL_FRAMEBUFFER_COMPLETE) { "Framebuffer incomplete: 0x${Integer.toHexString(s)}" }
    }

    fun bind() { glBindFramebuffer(GL_FRAMEBUFFER, fbo); glViewport(0, 0, w, h) }

    fun release() { glDeleteFramebuffers(1, intArrayOf(fbo), 0); glDeleteTextures(1, intArrayOf(tex), 0) }
}
