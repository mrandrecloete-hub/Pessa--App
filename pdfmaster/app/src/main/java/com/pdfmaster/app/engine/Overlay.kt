package com.pdfmaster.app.engine

import android.content.Context
import android.graphics.BitmapFactory
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.blend.BlendMode
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.tom_roush.pdfbox.pdmodel.graphics.state.RenderingMode
import com.tom_roush.pdfbox.pdmodel.interactive.annotation.PDAnnotationText
import java.io.File
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

/**
 * Things the editor places ON TOP of a page. Coordinates are in points of the page as displayed,
 * with the origin at the top left. Nothing here changes the text that was already in the PDF.
 */
sealed interface Overlay { val page: Int }

data class TextOverlay(override val page: Int, val x: Float, val y: Float, val text: String, val size: Float = 14f, val color: Int = 0x111111,
                       val bold: Boolean = false, val align: Align = Align.LEFT, val background: Int? = null) : Overlay
class ImageOverlay(override val page: Int, val x: Float, val y: Float, val w: Float, val h: Float, val bytes: ByteArray) : Overlay
data class InkOverlay(override val page: Int, val strokes: List<List<Pair<Float, Float>>>, val color: Int = 0x111111, val width: Float = 2f) : Overlay
enum class ShapeKind { RECT, ELLIPSE, LINE, ARROW }
data class ShapeOverlay(override val page: Int, val kind: ShapeKind, val x1: Float, val y1: Float, val x2: Float, val y2: Float,
                        val color: Int = 0xE11D48, val width: Float = 2f, val fill: Int? = null) : Overlay
enum class MarkupKind { HIGHLIGHT, UNDERLINE, STRIKE }
data class MarkupOverlay(override val page: Int, val kind: MarkupKind, val x1: Float, val y1: Float, val x2: Float, val y2: Float, val color: Int = 0xFFE600) : Overlay
data class NoteOverlay(override val page: Int, val x: Float, val y: Float, val text: String, val author: String = "") : Overlay
data class StampOverlay(override val page: Int, val x: Float, val y: Float, val text: String, val color: Int = 0xDC2626, val size: Float = 22f) : Overlay

/** Lines of a text box and the box size, shared by the editor preview and the writer so both agree. */
fun textBoxLines(text: String): List<String> = text.replace("\r", "").split('\n')

object OverlayWriter {

    fun apply(context: Context, input: File, items: List<Overlay>, out: File, password: String? = null, progress: Progress = Progress.NONE) {
        openPdf(input, password).use { doc ->
            if (doc.isEncrypted) doc.isAllSecurityToBeRemoved = true
            val fonts = Fonts(context, doc)
            val byPage = items.groupBy { it.page }
            var n = 0
            for ((index, list) in byPage) {
                require(index in 0 until doc.numberOfPages) { "Page ${index + 1} does not exist" }
                val page = doc.getPage(index)
                val (_, h) = viewSize(page)
                overlayStream(doc, page).use { cs -> for (it in list) draw(doc, page, cs, fonts, it, h) }
                progress.report(++n, byPage.size)
            }
            doc.save(out)
        }
    }

    private fun draw(doc: PDDocument, page: PDPage, cs: PDPageContentStream, fonts: Fonts, o: Overlay, h: Float) {
        cs.saveGraphicsState()
        when (o) {
            is TextOverlay -> {
                val font = fonts.pick(o.bold)
                val lines = textBoxLines(o.text).map { fonts.clean(it) }
                val lh = o.size * 1.25f
                val widths = lines.map { fonts.width(font, it, o.size) }
                val boxW = widths.maxOrNull() ?: 0f
                if (o.background != null) {
                    cs.setNonStrokingColor(rgb(o.background)); cs.addRect(o.x - 2f, h - o.y - lines.size * lh - 2f, boxW + 4f, lines.size * lh + 4f); cs.fill()
                }
                cs.setNonStrokingColor(rgb(o.color))
                lines.forEachIndexed { i, line ->
                    if (line.isEmpty()) return@forEachIndexed
                    val dx = when (o.align) { Align.LEFT -> 0f; Align.CENTER -> (boxW - widths[i]) / 2; Align.RIGHT -> boxW - widths[i] }
                    cs.beginText(); cs.setFont(font, o.size)
                    cs.newLineAtOffset(o.x + dx, h - o.y - o.size * 0.95f - i * lh); cs.showText(line); cs.endText()
                }
            }
            is ImageOverlay -> {
                val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                BitmapFactory.decodeByteArray(o.bytes, 0, o.bytes.size, opts)
                val img = if (opts.outMimeType == "image/jpeg") JPEGFactory.createFromByteArray(doc, o.bytes) else {
                    val bmp = BitmapFactory.decodeByteArray(o.bytes, 0, o.bytes.size) ?: throw IllegalArgumentException("A picture could not be read")
                    LosslessFactory.createFromImage(doc, bmp).also { bmp.recycle() }
                }
                cs.drawImage(img, o.x, h - o.y - o.h, o.w, o.h)
            }
            is InkOverlay -> {
                cs.setStrokingColor(rgb(o.color)); cs.setLineWidth(o.width); cs.setLineCapStyle(1); cs.setLineJoinStyle(1)
                for (s in o.strokes) {
                    if (s.isEmpty()) continue
                    cs.moveTo(s[0].first, h - s[0].second)
                    if (s.size == 1) cs.lineTo(s[0].first + 0.1f, h - s[0].second)
                    for (i in 1 until s.size) cs.lineTo(s[i].first, h - s[i].second)
                    cs.stroke()
                }
            }
            is ShapeOverlay -> {
                cs.setStrokingColor(rgb(o.color)); cs.setLineWidth(o.width); cs.setLineCapStyle(1)
                val l = minOf(o.x1, o.x2); val r = maxOf(o.x1, o.x2); val b = h - maxOf(o.y1, o.y2); val t = h - minOf(o.y1, o.y2)
                when (o.kind) {
                    ShapeKind.RECT -> { cs.addRect(l, b, r - l, t - b); if (o.fill != null) { cs.setNonStrokingColor(rgb(o.fill)); if (o.width > 0) cs.fillAndStroke() else cs.fill() } else cs.stroke() }
                    ShapeKind.ELLIPSE -> {
                        val cx = (l + r) / 2; val cy = (b + t) / 2; val rx = (r - l) / 2; val ry = (t - b) / 2; val k = 0.5523f
                        cs.moveTo(cx + rx, cy)
                        cs.curveTo(cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry); cs.curveTo(cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy)
                        cs.curveTo(cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry); cs.curveTo(cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy)
                        if (o.fill != null) { cs.setNonStrokingColor(rgb(o.fill)); cs.fillAndStroke() } else cs.stroke()
                    }
                    ShapeKind.LINE, ShapeKind.ARROW -> {
                        val ax = o.x1; val ay = h - o.y1; val bx = o.x2; val by = h - o.y2
                        cs.moveTo(ax, ay); cs.lineTo(bx, by); cs.stroke()
                        if (o.kind == ShapeKind.ARROW) {
                            val a = atan2((by - ay).toDouble(), (bx - ax).toDouble()); val len = max(8f, o.width * 4.5f)
                            cs.setNonStrokingColor(rgb(o.color))
                            cs.moveTo(bx, by)
                            cs.lineTo(bx - (len * cos(a - 0.45)).toFloat(), by - (len * sin(a - 0.45)).toFloat())
                            cs.lineTo(bx - (len * cos(a + 0.45)).toFloat(), by - (len * sin(a + 0.45)).toFloat())
                            cs.closePath(); cs.fill()
                        }
                    }
                }
            }
            is MarkupOverlay -> {
                val l = minOf(o.x1, o.x2); val r = maxOf(o.x1, o.x2); val b = h - maxOf(o.y1, o.y2); val t = h - minOf(o.y1, o.y2)
                when (o.kind) {
                    MarkupKind.HIGHLIGHT -> {
                        val gs = PDExtendedGraphicsState(); gs.nonStrokingAlphaConstant = 0.45f; gs.blendMode = BlendMode.MULTIPLY
                        cs.setGraphicsStateParameters(gs); cs.setNonStrokingColor(rgb(o.color)); cs.addRect(l, b, r - l, t - b); cs.fill()
                    }
                    MarkupKind.UNDERLINE -> { cs.setStrokingColor(rgb(o.color)); cs.setLineWidth(1.5f); cs.moveTo(l, b); cs.lineTo(r, b); cs.stroke() }
                    MarkupKind.STRIKE -> { cs.setStrokingColor(rgb(o.color)); cs.setLineWidth(1.5f); cs.moveTo(l, (b + t) / 2); cs.lineTo(r, (b + t) / 2); cs.stroke() }
                }
            }
            is NoteOverlay -> {
                // A small visible marker plus a real PDF comment that PDF readers show when tapped.
                val s = 16f; val x = o.x; val yb = h - o.y - s
                cs.setNonStrokingColor(rgb(0xFACC15)); cs.setStrokingColor(rgb(0x92400E)); cs.setLineWidth(0.8f)
                cs.addRect(x, yb, s, s); cs.fillAndStroke()
                cs.setLineWidth(1f); for (i in 1..3) { cs.moveTo(x + 3, yb + s - i * 4f); cs.lineTo(x + s - 3, yb + s - i * 4f) }; cs.stroke()
                val ann = PDAnnotationText()
                ann.contents = o.text; ann.name = PDAnnotationText.NAME_COMMENT; if (o.author.isNotEmpty()) ann.titlePopup = o.author
                val m = viewMatrix(page)
                val p1 = m.transformPoint(x, yb); val p2 = m.transformPoint(x + s, yb + s)
                ann.rectangle = PDRectangle(minOf(p1.x, p2.x), minOf(p1.y, p2.y), kotlin.math.abs(p2.x - p1.x), kotlin.math.abs(p2.y - p1.y))
                ann.isPrinted = false
                page.annotations = page.annotations.toMutableList().apply { add(ann) }
            }
            is StampOverlay -> {
                val t = fonts.clean(o.text.uppercase()); val w = fonts.width(fonts.bold, t, o.size); val pad = o.size * 0.35f
                val gs = PDExtendedGraphicsState(); gs.nonStrokingAlphaConstant = 0.85f; gs.strokingAlphaConstant = 0.85f; cs.setGraphicsStateParameters(gs)
                cs.setStrokingColor(rgb(o.color)); cs.setLineWidth(max(1.5f, o.size / 9f))
                cs.addRect(o.x, h - o.y - o.size - 2 * pad, w + 2 * pad, o.size + 2 * pad); cs.stroke()
                cs.setNonStrokingColor(rgb(o.color)); cs.beginText(); cs.setFont(fonts.bold, o.size)
                cs.newLineAtOffset(o.x + pad, h - o.y - pad - o.size * 0.86f); cs.showText(t); cs.endText()
            }
        }
        cs.restoreGraphicsState()
    }
}

/** One recognised line of text with its box, as fractions (0 to 1) of the displayed page from the top left. */
data class OcrLine(val text: String, val left: Float, val top: Float, val right: Float, val bottom: Float, val confidence: Float = 1f)

object SearchablePdf {
    /**
     * Adds an invisible text layer over the pages so the PDF can be searched, selected and copied.
     * The page picture itself is not changed.
     */
    fun addTextLayer(context: Context, input: File, lines: Map<Int, List<OcrLine>>, out: File, password: String? = null) {
        openPdf(input, password).use { doc ->
            if (doc.isEncrypted) doc.isAllSecurityToBeRemoved = true
            val fonts = Fonts(context, doc)
            for ((index, list) in lines) {
                if (list.isEmpty() || index !in 0 until doc.numberOfPages) continue
                val page = doc.getPage(index)
                val (w, h) = viewSize(page)
                overlayStream(doc, page).use { cs ->
                    cs.setRenderingMode(RenderingMode.NEITHER)
                    for (l in list) {
                        val t = fonts.clean(l.text).trim(); if (t.isEmpty()) continue
                        val boxW = (l.right - l.left) * w; val boxH = (l.bottom - l.top) * h
                        if (boxW <= 1f || boxH <= 1f) continue
                        val size = (boxH * 0.8f).coerceIn(2f, 200f)
                        val tw = fonts.width(fonts.regular, t, size); if (tw <= 0f) continue
                        cs.beginText(); cs.setFont(fonts.regular, size)
                        cs.setHorizontalScaling((boxW / tw * 100f).coerceIn(10f, 1000f))
                        cs.newLineAtOffset(l.left * w, h - l.bottom * h + boxH * 0.2f); cs.showText(t); cs.endText()
                    }
                }
            }
            doc.save(out)
        }
    }
}
