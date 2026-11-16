package com.pdfmaster.app.engine

import android.graphics.Bitmap
import java.awt.image.BufferedImage
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.graphics.image.JPEGFactory
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject
import org.apache.pdfbox.rendering.PDFRenderer

/** The Windows version of Pdfx: the same functions as the Android file, using java.awt pictures. */
object Pdfx {
    private fun rgb(b: Bitmap): BufferedImage {
        val o = BufferedImage(b.width, b.height, BufferedImage.TYPE_INT_RGB)
        o.createGraphics().apply { drawImage(b.image, 0, 0, java.awt.Color.WHITE, null); dispose() }; return o
    }
    fun jpeg(doc: PDDocument, b: Bitmap, quality: Float): PDImageXObject = JPEGFactory.createFromImage(doc, rgb(b), quality)
    fun lossless(doc: PDDocument, b: Bitmap): PDImageXObject = LosslessFactory.createFromImage(doc, if (b.hasAlpha()) b.image else rgb(b))
    fun imageOf(x: PDImageXObject): Bitmap? = x.image?.let { Bitmap.wrap(it) }
    fun render(r: PDFRenderer, index: Int, scale: Float): Bitmap = Bitmap.wrap(r.renderImage(index, scale))
}
