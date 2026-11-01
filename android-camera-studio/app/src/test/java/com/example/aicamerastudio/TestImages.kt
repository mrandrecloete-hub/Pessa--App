package com.example.aicamerastudio

import java.io.File

/** Test helpers: the public domain NASA "astronaut" portrait (from scikit-image) and the bundled models. */
object TestImages {
    data class Img(val px: IntArray, val w: Int, val h: Int)

    fun astronaut(): Img {
        // Raw 8 bit RGB, 512 x 512, converted from scikit-image's astronaut.png (public domain, NASA).
        val b = TestImages::class.java.getResourceAsStream("/astronaut_512x512.rgb")!!.readBytes()
        val px = IntArray(512 * 512) { i -> (0xFF shl 24) or ((b[3 * i].toInt() and 255) shl 16) or ((b[3 * i + 1].toInt() and 255) shl 8) or (b[3 * i + 2].toInt() and 255) }
        return Img(px, 512, 512)
    }

    /** NASA rocket launch photo from scikit-image (public domain), raw RGB. */
    fun rocket(): Img {
        val f = java.io.File("src/test/resources").listFiles()!!.first { it.name.startsWith("rocket_") }
        val (w, h) = Regex("rocket_(\\d+)x(\\d+)").find(f.name)!!.destructured.let { it.component1().toInt() to it.component2().toInt() }
        val b = f.readBytes()
        return Img(IntArray(w * h) { i -> (0xFF shl 24) or ((b[3 * i].toInt() and 255) shl 16) or ((b[3 * i + 1].toInt() and 255) shl 8) or (b[3 * i + 2].toInt() and 255) }, w, h)
    }

    fun model(name: String): ByteArray = File("src/main/assets/$name").readBytes()

    /** Writes raw RGB to build/test-output so results can be inspected visually. */
    fun save(name: String, px: IntArray, w: Int, h: Int) {
        val d = java.io.File("build/test-output").apply { mkdirs() }
        val b = ByteArray(w * h * 3)
        for (i in 0 until w * h) { b[3 * i] = (px[i] shr 16).toByte(); b[3 * i + 1] = (px[i] shr 8).toByte(); b[3 * i + 2] = px[i].toByte() }
        java.io.File(d, "${name}_${w}x$h.rgb").writeBytes(b)
    }

    fun psnr(a: IntArray, b: IntArray, mask: BooleanArray? = null): Double {
        var s = 0.0; var n = 0
        for (i in a.indices) {
            if (mask != null && !mask[i]) continue
            for (sh in intArrayOf(16, 8, 0)) { val d = ((a[i] shr sh) and 255) - ((b[i] shr sh) and 255); s += d * d; n++ }
        }
        val mse = s / n
        return if (mse == 0.0) 99.0 else 10 * Math.log10(255.0 * 255.0 / mse)
    }
}
