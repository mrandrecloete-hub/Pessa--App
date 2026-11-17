package com.pdfmaster.app.engine

import android.content.Context
import android.graphics.Bitmap
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.pdmodel.font.PDFont
import com.tom_roush.pdfbox.pdmodel.font.PDType0Font
import com.tom_roush.pdfbox.pdmodel.graphics.color.PDColor
import com.tom_roush.pdfbox.pdmodel.graphics.color.PDDeviceRGB
import com.tom_roush.pdfbox.rendering.PDFRenderer
import com.tom_roush.pdfbox.util.Matrix
import java.io.Closeable
import java.io.File

/** Raised when a PDF needs a password that was not given or was wrong. */
class PasswordRequiredException(message: String = "This PDF is protected with a password") : Exception(message)

/** Reports progress of a long operation and lets it be cancelled. */
fun interface Progress {
    fun report(done: Int, total: Int)
    companion object { val NONE = Progress { _, _ -> } }
}

/** Opens a PDF keeping large documents on disk instead of in memory. */
fun openPdf(file: File, password: String? = null): PDDocument = try {
    PDDocument.load(file, password ?: "", MemoryUsageSetting.setupMixed(32L * 1024 * 1024))
} catch (e: InvalidPasswordException) {
    throw PasswordRequiredException()
}

/** True when the file cannot be opened without a password. */
fun needsPassword(file: File): Boolean = try {
    openPdf(file).use { false }
} catch (e: PasswordRequiredException) { true }

fun pageCount(file: File, password: String? = null): Int = openPdf(file, password).use { it.numberOfPages }

/** Turns page images into bitmaps. On a phone this is Android's PdfRenderer; in tests it is PDFBox. */
interface PageRasterizer : Closeable {
    val pageCount: Int
    /** Renders a page so that its longest side is about [maxSide] pixels. */
    fun render(index: Int, maxSide: Int): Bitmap
}

class PdfBoxRasterizer(file: File, password: String? = null) : PageRasterizer {
    private val doc = openPdf(file, password)
    private val renderer = PDFRenderer(doc)
    override val pageCount: Int get() = doc.numberOfPages
    override fun render(index: Int, maxSide: Int): Bitmap {
        val box = doc.getPage(index).cropBox
        val scale = maxSide / maxOf(box.width, box.height)
        return Pdfx.render(renderer, index, scale)
    }
    override fun close() = doc.close()
}

/** Fonts bundled with the app (DejaVu Sans, free licence) so text works the same on every phone. */
class Fonts(private val context: Context, private val doc: PDDocument) {
    val regular: PDFont by lazy { load("fonts/DejaVuSans.ttf") }
    val bold: PDFont by lazy { load("fonts/DejaVuSans-Bold.ttf") }
    val mono: PDFont by lazy { load("fonts/DejaVuSansMono.ttf") }
    private val okCache = HashMap<Int, Boolean>()

    private fun load(asset: String): PDFont =
        context.assets.open(asset).use { PDType0Font.load(doc, it, true) }

    fun pick(bold: Boolean, mono: Boolean = false): PDFont = if (mono) this.mono else if (bold) this.bold else regular

    /** Replaces characters the bundled font cannot draw, so writing never fails. */
    fun clean(text: String): String {
        val sb = StringBuilder(text.length)
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            i += Character.charCount(cp)
            when {
                cp == '\t'.code -> sb.append("    ")
                cp == 0x00A0 -> sb.append(' ')
                cp < 0x20 || cp == 0xFEFF || cp == 0x200B -> {}
                canShow(cp) -> sb.appendCodePoint(cp)
                else -> sb.append('?')
            }
        }
        return sb.toString()
    }

    private fun canShow(cp: Int): Boolean = okCache.getOrPut(cp) {
        try { regular.encode(String(Character.toChars(cp))); true } catch (e: Exception) { false }
    }

    fun width(font: PDFont, text: String, size: Float): Float =
        try { font.getStringWidth(text) / 1000f * size } catch (e: Exception) { text.length * size * 0.5f }
}

fun rgb(color: Int): PDColor = PDColor(
    floatArrayOf(((color shr 16) and 0xFF) / 255f, ((color shr 8) and 0xFF) / 255f, (color and 0xFF) / 255f),
    PDDeviceRGB.INSTANCE
)

/** Size of the page as a reader sees it (after the page's own rotation). */
fun viewSize(page: PDPage): Pair<Float, Float> {
    val c = page.cropBox
    return if (page.rotation % 180 == 0) c.width to c.height else c.height to c.width
}

/**
 * Matrix that lets drawing code work in "what the reader sees" coordinates
 * (origin bottom left of the displayed page, y up) whatever the page rotation is.
 */
fun viewMatrix(page: PDPage): Matrix {
    val c = page.cropBox
    return when (((page.rotation % 360) + 360) % 360) {
        90 -> Matrix(0f, 1f, -1f, 0f, c.upperRightX, c.lowerLeftY)
        180 -> Matrix(-1f, 0f, 0f, -1f, c.upperRightX, c.upperRightY)
        270 -> Matrix(0f, -1f, 1f, 0f, c.lowerLeftX, c.upperRightY)
        else -> Matrix(1f, 0f, 0f, 1f, c.lowerLeftX, c.lowerLeftY)
    }
}

/** Opens a content stream that draws on top of the page in displayed coordinates. */
fun overlayStream(doc: PDDocument, page: PDPage): PDPageContentStream {
    val cs = PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true)
    cs.transform(viewMatrix(page))
    return cs
}

/** Parses "1-3, 5, 8-" style page lists into zero based page indexes, in the order given. */
fun parsePages(spec: String, total: Int): List<Int> {
    val out = ArrayList<Int>()
    for (part in spec.split(',', ';', ' ').map { it.trim() }.filter { it.isNotEmpty() }) {
        val m = Regex("^(\\d*)\\s*-\\s*(\\d*)$").find(part)
        if (m != null) {
            val a = m.groupValues[1].toIntOrNull() ?: 1
            val b = m.groupValues[2].toIntOrNull() ?: total
            require(a >= 1 && b <= total && a <= b) { "Page range $part is outside 1 to $total" }
            for (p in a..b) out.add(p - 1)
        } else {
            val p = part.toIntOrNull() ?: throw IllegalArgumentException("\"$part\" is not a page number")
            require(p in 1..total) { "Page $p is outside 1 to $total" }
            out.add(p - 1)
        }
    }
    require(out.isNotEmpty()) { "No pages were given" }
    return out
}

val A4: PDRectangle get() = PDRectangle.A4
