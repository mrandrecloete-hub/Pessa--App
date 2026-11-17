package com.pdfmaster.app.engine

import android.content.Context
import android.graphics.BitmapFactory
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.util.Matrix
import java.io.File
import kotlin.math.max
import kotlin.math.min

/** A simple rich document: what the DOCX, XLSX, PPTX, HTML, RTF and TXT readers produce and the PDF writer draws. */
data class Run(
    val text: String, val bold: Boolean = false, val italic: Boolean = false, val underline: Boolean = false,
    val size: Float = 11f, val color: Int = 0x111111, val mono: Boolean = false
)

enum class Align { LEFT, CENTER, RIGHT }

sealed interface Block
data class Para(val runs: List<Run>, val align: Align = Align.LEFT, val spaceAfter: Float = 6f, val indent: Float = 0f, val bullet: String? = null) : Block {
    val plain: String get() = runs.joinToString("") { it.text }
}
data class TableBlock(val rows: List<List<String>>, val headerRow: Boolean = false) : Block
class ImageBlock(val bytes: ByteArray) : Block
object PageBreak : Block

fun para(text: String, size: Float = 11f, bold: Boolean = false, align: Align = Align.LEFT, spaceAfter: Float = 6f) =
    Para(listOf(Run(text, bold = bold, size = size)), align, spaceAfter)

/** Draws blocks onto PDF pages with real, selectable text using the bundled fonts. */
class DocWriter(private val context: Context, private val pageSize: PDRectangle = PDRectangle.A4, private val margin: Float = 56f) {
    private lateinit var doc: PDDocument
    private lateinit var fonts: Fonts
    private var cs: PDPageContentStream? = null
    private var y = 0f
    private val left get() = margin
    private val width get() = pageSize.width - 2 * margin
    private val bottom get() = margin
    private var pageUsed = false

    fun write(blocks: List<Block>, out: File, title: String? = null, progress: Progress = Progress.NONE) {
        PDDocument().use { d ->
            doc = d; fonts = Fonts(context, d)
            newPage()
            blocks.forEachIndexed { i, b ->
                when (b) {
                    is Para -> drawPara(b)
                    is TableBlock -> drawTable(b)
                    is ImageBlock -> drawImage(b)
                    PageBreak -> if (pageUsed) newPage()
                }
                if (i % 50 == 0) progress.report(i + 1, blocks.size)
            }
            cs?.close(); cs = null
            if (title != null) d.documentInformation.title = title
            d.documentInformation.producer = "PDFMASTER"
            d.save(out)
        }
    }

    private fun newPage() {
        cs?.close()
        val page = PDPage(pageSize); doc.addPage(page)
        cs = PDPageContentStream(doc, page)
        y = pageSize.height - margin
        pageUsed = false
    }

    private class Seg(val text: String, val run: Run, val w: Float)

    private fun font(r: Run) = fonts.pick(r.bold, r.mono)

    /** Breaks runs into lines that fit [maxW]. */
    private fun wrap(runs: List<Run>, maxW: Float): List<List<Seg>> {
        val lines = ArrayList<MutableList<Seg>>()
        var line = ArrayList<Seg>(); var lw = 0f
        fun push() { lines.add(line); line = ArrayList(); lw = 0f }
        for (r0 in runs) {
            val r = r0.copy(text = fonts.clean(r0.text.replace("\r", "")))
            val parts = r.text.split('\n')
            parts.forEachIndexed { pi, part ->
                if (pi > 0) push()
                // Split into words keeping the spaces attached to the word before them.
                val tokens = Regex("\\S+\\s*|\\s+").findAll(part).map { it.value }.toList()
                for (tok in tokens) {
                    var t = tok
                    var w = fonts.width(font(r), t, r.size)
                    if (lw + fonts.width(font(r), t.trimEnd(), r.size) > maxW && line.isNotEmpty()) push()
                    // A single word wider than the line is cut into pieces.
                    while (w > maxW && t.length > 1) {
                        var n = t.length
                        while (n > 1 && fonts.width(font(r), t.substring(0, n), r.size) > maxW) n--
                        line.add(Seg(t.substring(0, n), r, fonts.width(font(r), t.substring(0, n), r.size))); push()
                        t = t.substring(n); w = fonts.width(font(r), t, r.size)
                    }
                    if (line.isEmpty() && t.isBlank()) continue
                    line.add(Seg(t, r, w)); lw += w
                }
            }
        }
        if (line.isNotEmpty() || lines.isEmpty()) lines.add(line)
        return lines
    }

    private fun drawSegs(segs: List<Seg>, x0: Float, baseline: Float) {
        val c = cs!!
        var x = x0
        for (s in segs) {
            if (s.text.isNotEmpty()) {
                c.setNonStrokingColor(rgb(s.run.color))
                c.beginText(); c.setFont(font(s.run), s.run.size)
                // Italic is drawn by slanting the upright font.
                c.setTextMatrix(if (s.run.italic) Matrix(1f, 0f, 0.2f, 1f, x, baseline) else Matrix.getTranslateInstance(x, baseline))
                c.showText(s.text); c.endText()
                if (s.run.underline) {
                    c.setStrokingColor(rgb(s.run.color)); c.setLineWidth(max(0.5f, s.run.size / 18f))
                    c.moveTo(x, baseline - s.run.size * 0.12f); c.lineTo(x + s.w, baseline - s.run.size * 0.12f); c.stroke()
                }
            }
            x += s.w
        }
    }

    private fun drawPara(p: Para) {
        val indent = p.indent + if (p.bullet != null) 16f else 0f
        val maxW = width - indent
        val lines = wrap(p.runs, maxW)
        val baseSize = p.runs.maxOfOrNull { it.size } ?: 11f
        lines.forEachIndexed { i, segs ->
            val size = segs.maxOfOrNull { it.run.size } ?: baseSize
            val lh = size * 1.32f
            if (y - lh < bottom) newPage()
            val lineW = segs.sumOf { it.w.toDouble() }.toFloat() - (segs.lastOrNull()?.let { it.w - fonts.width(font(it.run), it.text.trimEnd(), it.run.size) } ?: 0f)
            val x = left + indent + when (p.align) { Align.LEFT -> 0f; Align.CENTER -> (maxW - lineW) / 2; Align.RIGHT -> maxW - lineW }
            val baseline = y - size
            if (i == 0 && p.bullet != null) drawSegs(listOf(Seg(fonts.clean(p.bullet), Run(p.bullet, size = baseSize), 0f)), left + p.indent, baseline)
            drawSegs(segs, x, baseline)
            y -= lh; pageUsed = true
        }
        y -= p.spaceAfter
    }

    private fun drawTable(t: TableBlock) {
        val cols = t.rows.maxOfOrNull { it.size } ?: return
        if (cols == 0) return
        val size = if (cols > 8) 7f else if (cols > 5) 8.5f else 10f
        val pad = 4f
        // Column widths follow the longest content, within sensible limits, then are scaled to fill the page width.
        val natural = FloatArray(cols) { c ->
            val longest = t.rows.maxOf { r -> r.getOrNull(c)?.let { fonts.width(fonts.regular, fonts.clean(it), size) } ?: 0f }
            (longest + 2 * pad).coerceIn(28f, width * 0.6f)
        }
        val scale = width / natural.sum()
        val colW = FloatArray(cols) { natural[it] * scale }
        t.rows.forEachIndexed { ri, row ->
            val header = t.headerRow && ri == 0
            val wrapped = (0 until cols).map { c -> wrap(listOf(Run(row.getOrNull(c).orEmpty(), bold = header, size = size)), colW[c] - 2 * pad) }
            val lh = size * 1.3f
            val rowH = wrapped.maxOf { it.size } * lh + 2 * pad
            if (y - rowH < bottom && pageUsed) newPage()
            val c = cs!!
            var x = left
            for (ci in 0 until cols) {
                if (header) { c.setNonStrokingColor(rgb(0xE8EBFA)); c.addRect(x, y - rowH, colW[ci], rowH); c.fill() }
                c.setStrokingColor(rgb(0x9AA3B5)); c.setLineWidth(0.5f); c.addRect(x, y - rowH, colW[ci], rowH); c.stroke()
                var ly = y - pad - size
                for (segs in wrapped[ci]) { if (ly < bottom - 2) break; drawSegs(segs, x + pad, ly); ly -= lh }
                x += colW[ci]
            }
            y -= rowH; pageUsed = true
        }
        y -= 10f
    }

    private fun drawImage(b: ImageBlock) {
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(b.bytes, 0, b.bytes.size, opts)
        if (opts.outWidth <= 0) return
        val img: PDImageXObject = try {
            if (opts.outMimeType == "image/jpeg") JPEGFactory.createFromByteArray(doc, b.bytes) else {
                val bmp = BitmapFactory.decodeByteArray(b.bytes, 0, b.bytes.size) ?: return
                (if (bmp.hasAlpha()) Pdfx.lossless(doc, bmp) else Pdfx.jpeg(doc, bmp, 0.9f)).also { bmp.recycle() }
            }
        } catch (e: Throwable) { return }
        val natW = img.width * 0.75f; val natH = img.height * 0.75f // 96 pixels per inch
        val pageH = pageSize.height - 2 * margin
        var s = min(1f, min(width / natW, pageH / natH))
        if (natH * s > y - bottom) { if (y - bottom < pageH * 0.4f || natH * s > pageH * 0.9f) newPage(); s = min(s, (y - bottom) / natH) }
        val w = natW * s; val h = natH * s
        cs!!.drawImage(img, left + (width - w) / 2, y - h, w, h)
        y -= h + 10f; pageUsed = true
    }
}
