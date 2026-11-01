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

    fun model(name: String): ByteArray = File("src/main/assets/$name").readBytes()

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
