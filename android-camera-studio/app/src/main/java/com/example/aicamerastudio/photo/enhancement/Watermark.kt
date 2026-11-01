package com.example.aicamerastudio.photo.enhancement

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface

/** Draws the user's watermark (Settings > Watermark) in gold at the lower right corner. */
object Watermark {
    fun draw(bmp: Bitmap, text: String) {
        if (text.isBlank()) return
        val c = Canvas(bmp)
        val size = minOf(bmp.width, bmp.height) * 0.032f
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textSize = size; typeface = Typeface.create(Typeface.SERIF, Typeface.BOLD); textAlign = Paint.Align.RIGHT
            setShadowLayer(size * 0.12f, 0f, size * 0.06f, 0x99000000.toInt())
        }
        val x = bmp.width - size; val y = bmp.height - size
        p.shader = LinearGradient(x - p.measureText(text), y - size, x, y, intArrayOf(0xFFFFE08A.toInt(), 0xFFE8B84A.toInt(), 0xFFA9781E.toInt()), null, Shader.TileMode.CLAMP)
        c.drawText(text, x, y, p)
    }
}
