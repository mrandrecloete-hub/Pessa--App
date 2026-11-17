package com.pdfmaster.app.engine

import android.graphics.Bitmap
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.rendering.PDFRenderer

/**
 * The few places where the shared document engine meets the platform's picture type. This file is the Android version.
 * The Windows app has its own Pdfx.kt (same functions, java.awt pictures); every other engine file is shared as it is.
 */
object Pdfx {
    fun jpeg(doc: PDDocument, b: Bitmap, quality: Float): PDImageXObject = JPEGFactory.createFromImage(doc, b, quality)
    fun lossless(doc: PDDocument, b: Bitmap): PDImageXObject = LosslessFactory.createFromImage(doc, b)
    fun imageOf(x: PDImageXObject): Bitmap? = x.image
    fun render(r: PDFRenderer, index: Int, scale: Float): Bitmap = r.renderImage(index, scale)
}
