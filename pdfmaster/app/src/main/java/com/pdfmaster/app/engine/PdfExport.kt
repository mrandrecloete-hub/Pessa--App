package com.pdfmaster.app.engine

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.io.StringWriter
import kotlin.math.max
import kotlin.math.roundToInt

/** One cell of text on a line with its horizontal extent in points. */
class Cell(val text: String, val x0: Float, val x1: Float)

/** One line of text as it sits on the page. */
class TextLine(val cells: List<Cell>, val size: Float, val bold: Boolean, val italic: Boolean, val y: Float, val paraStart: Boolean) {
    val text: String get() = cells.joinToString("  ") { it.text }
    val x: Float get() = cells.firstOrNull()?.x0 ?: 0f
}

class PageLayout(val width: Float, val height: Float, val lines: List<TextLine>)

/** Reads text with its position, size and weight so that paragraphs, headings and table columns can be rebuilt. */
class LayoutStripper : PDFTextStripper() {
    val pages = ArrayList<PageLayout>()
    private var lines = ArrayList<TextLine>()
    private val pending = ArrayList<TextPosition>()
    private var paraStart = true

    init { sortByPosition = true }

    override fun startPage(page: PDPage) { lines = ArrayList(); pending.clear(); paraStart = true }
    override fun endPage(page: PDPage) {
        flush()
        val c = page.cropBox
        val rot = page.rotation % 180 != 0
        pages.add(PageLayout(if (rot) c.height else c.width, if (rot) c.width else c.height, lines))
    }
    override fun writeString(text: String, textPositions: List<TextPosition>) { pending.addAll(textPositions) }
    override fun writeLineSeparator() = flush()
    override fun writeParagraphStart() { flush(); paraStart = true }
    override fun writeParagraphEnd() = flush()
    override fun writeWordSeparator() {}
    override fun writePageStart() {}
    override fun writePageEnd() {}

    private fun flush() {
        if (pending.isEmpty()) return
        val tps = pending.sortedBy { it.xDirAdj }
        val cells = ArrayList<Cell>()
        val sb = StringBuilder()
        var start = tps[0].xDirAdj; var end = start
        var prev: TextPosition? = null
        for (tp in tps) {
            val p = prev
            if (p != null) {
                val gap = tp.xDirAdj - (p.xDirAdj + p.widthDirAdj)
                val space = max(1.5f, p.widthOfSpace.takeIf { it > 0 && !it.isNaN() } ?: (p.fontSizeInPt * 0.3f))
                if (gap > max(7f, space * 2.4f)) {
                    cells.add(Cell(sb.toString().trim(), start, end)); sb.setLength(0); start = tp.xDirAdj
                } else if (gap > space * 0.45f && sb.isNotEmpty() && !sb.endsWith(" ")) sb.append(' ')
            }
            sb.append(tp.unicode ?: "")
            end = tp.xDirAdj + tp.widthDirAdj; prev = tp
        }
        cells.add(Cell(sb.toString().trim(), start, end))
        val real = cells.filter { it.text.isNotEmpty() }
        if (real.isNotEmpty()) {
            val visible = tps.filter { !it.unicode.isNullOrBlank() }.ifEmpty { tps }
            val size = visible.map { it.fontSizeInPt }.sorted()[visible.size / 2]
            val names = visible.map { runCatching { it.font.name }.getOrNull().orEmpty().lowercase() }
            val bold = names.count { it.contains("bold") || it.contains("black") || it.contains("heavy") } * 2 > names.size
            val italic = names.count { it.contains("italic") || it.contains("oblique") } * 2 > names.size
            lines.add(TextLine(real, size, bold, italic, tps[0].yDirAdj, paraStart))
            paraStart = false
        }
        pending.clear()
    }

    companion object {
        fun read(doc: PDDocument, progress: Progress = Progress.NONE): List<PageLayout> {
            val s = LayoutStripper()
            for (p in 1..doc.numberOfPages) {
                s.startPage = p; s.endPage = p
                val before = s.pages.size
                runCatching { s.writeText(doc, StringWriter()) }
                if (s.pages.size == before) { val pg = doc.getPage(p - 1); val (w, h) = viewSize(pg); s.pages.add(PageLayout(w, h, emptyList())) }
                progress.report(p, doc.numberOfPages)
            }
            return s.pages
        }
    }
}

/** Places cells of several lines into shared columns by merging overlapping horizontal extents. */
fun toGrid(lines: List<TextLine>): List<List<String>> {
    val spans = lines.filter { it.cells.size >= 2 }.flatMap { l -> l.cells.map { floatArrayOf(it.x0, it.x1) } }.sortedBy { it[0] }
    val cols = ArrayList<FloatArray>()
    for (s in spans) {
        val last = cols.lastOrNull()
        if (last != null && s[0] <= last[1] + 1f) last[1] = max(last[1], s[1]) else cols.add(floatArrayOf(s[0], s[1]))
    }
    if (cols.isEmpty()) return lines.map { listOf(it.text) }
    return lines.map { l ->
        val row = MutableList(cols.size) { "" }
        if (l.cells.size == 1) {
            // A lone cell goes under the column it starts in.
            val c = l.cells[0]
            val idx = cols.indexOfLast { c.x0 >= it[0] - 2f }.coerceAtLeast(0)
            row[idx] = c.text
        } else for (c in l.cells) {
            var best = 0; var bestOv = -Float.MAX_VALUE
            cols.forEachIndexed { i, col -> val ov = minOf(c.x1, col[1]) - maxOf(c.x0, col[0]); if (ov > bestOv) { bestOv = ov; best = i } }
            row[best] = if (row[best].isEmpty()) c.text else row[best] + " " + c.text
        }
        row
    }
}

/** Result of a conversion: files written and plain notes about anything that could not be kept. */
class ExportResult(val files: List<File>, val notes: List<String> = emptyList())

sealed interface Piece
class TextPiece(val lines: List<TextLine>) : Piece
class TablePiece(val rows: List<List<String>>) : Piece

/** Groups the lines of a page into paragraphs and tables (two or more neighbouring lines that have columns). */
fun pieces(page: PageLayout): List<Piece> {
    val out = ArrayList<Piece>()
    var i = 0
    val ls = page.lines
    while (i < ls.size) {
        if (ls[i].cells.size >= 2) {
            var j = i
            while (j < ls.size && (ls[j].cells.size >= 2 || (j + 1 < ls.size && ls[j + 1].cells.size >= 2 && j > i))) j++
            if (j - i >= 2) { out.add(TablePiece(toGrid(ls.subList(i, j)))); i = j; continue }
        }
        val para = ArrayList<TextLine>(); para.add(ls[i]); i++
        while (i < ls.size && !ls[i].paraStart && ls[i].cells.size < 2 && kotlin.math.abs(ls[i].size - para[0].size) < 0.6f && ls[i].bold == para[0].bold) { para.add(ls[i]); i++ }
        out.add(TextPiece(para))
    }
    return out
}

private fun joinLines(lines: List<TextLine>): String {
    val sb = StringBuilder()
    for (l in lines) {
        val t = l.text
        if (sb.isEmpty()) sb.append(t)
        else if (sb.endsWith("-") && sb.length > 1 && sb[sb.length - 2].isLetter() && t.firstOrNull()?.isLowerCase() == true) { sb.setLength(sb.length - 1); sb.append(t) }
        else sb.append(' ').append(t)
    }
    return sb.toString()
}

object PdfExport {
    private const val SCAN_NOTE = "No text was found on some pages. They are probably scans: run OCR first to get their text."
    private const val LAYOUT_NOTE = "Text, headings, bold and tables are rebuilt from the PDF. Exact positions, columns, fonts and pictures can differ from the original."

    fun toText(input: File, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val t = PdfOps.pageTexts(input, password, progress)
        out.writeText(t.joinToString("\n\u000C\n") { it.trimEnd() }, Charsets.UTF_8)
        return ExportResult(listOf(out), if (t.any { it.isBlank() }) listOf(SCAN_NOTE) else emptyList())
    }

    private fun layout(input: File, password: String?, progress: Progress) = openPdf(input, password).use { LayoutStripper.read(it, progress) }

    /** Word document with editable text. */
    fun toDocx(input: File, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val pages = layout(input, password, progress)
        val items = ArrayList<DocxItem>()
        pages.forEachIndexed { pi, page ->
            var first = pi > 0
            val centre = page.width / 2
            for (pc in pieces(page)) when (pc) {
                is TablePiece -> { if (first) { items.add(DocxPara(emptyList(), pageBreakBefore = true)); first = false }; items.add(DocxTable(pc.rows)) }
                is TextPiece -> {
                    val l0 = pc.lines[0]
                    val mid = (l0.cells.first().x0 + l0.cells.last().x1) / 2
                    val centred = pc.lines.size == 1 && kotlin.math.abs(mid - centre) < 12f && l0.x > page.width * 0.2f
                    items.add(DocxPara(listOf(Run(joinLines(pc.lines), bold = l0.bold, italic = l0.italic, size = (l0.size * 2).roundToInt() / 2f)),
                        if (centred) Align.CENTER else Align.LEFT, first)); first = false
                }
            }
            if (first) items.add(DocxPara(emptyList(), pageBreakBefore = true))
        }
        val p0 = pages.firstOrNull()
        Ooxml.writeDocx(items, out, p0?.width ?: 595f, p0?.height ?: 842f)
        return ExportResult(listOf(out), listOfNotNull(LAYOUT_NOTE, SCAN_NOTE.takeIf { pages.any { it.lines.isEmpty() } }))
    }

    /** Word document where every page is a picture: looks exactly like the PDF but the text cannot be edited. */
    fun toDocxExact(input: File, raster: PageRasterizer, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val sizes = openPdf(input, password).use { d -> d.pages.map { viewSize(it) } }
        val items = sizes.mapIndexed { i, (w, h) ->
            val bmp = raster.render(i, 1700)
            progress.report(i + 1, sizes.size)
            DocxPicture(Picture(bmp.toJpegBytes(88), w, h), pageBreakBefore = i > 0).also { bmp.recycle() }
        }
        Ooxml.writeDocx(items, out, sizes[0].first, sizes[0].second, marginPt = 0f)
        return ExportResult(listOf(out), listOf("Each page is a picture, so it looks the same as the PDF but the text cannot be edited in Word."))
    }

    private fun grids(input: File, password: String?, progress: Progress) = layout(input, password, progress).map { toGrid(it.lines) }

    fun toXlsx(input: File, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val g = grids(input, password, progress)
        require(g.any { it.isNotEmpty() }) { "No text was found in this PDF. If it is a scan, run OCR first." }
        Ooxml.writeXlsx(g.mapIndexed { i, rows -> "Page ${i + 1}" to rows }, out)
        return ExportResult(listOf(out), listOf("Each page becomes a sheet. Columns are detected from the gaps between text, so check merged or split cells."))
    }

    fun toCsv(input: File, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val g = grids(input, password, progress)
        require(g.any { it.isNotEmpty() }) { "No text was found in this PDF. If it is a scan, run OCR first." }
        val q = { s: String -> if (s.any { it == ',' || it == '"' || it == '\n' }) "\"" + s.replace("\"", "\"\"") + "\"" else s }
        out.writeText("\uFEFF" + g.flatten().joinToString("\r\n") { row -> row.joinToString(",") { q(it) } } + "\r\n", Charsets.UTF_8)
        return ExportResult(listOf(out), listOf("Columns are detected from the gaps between text, so check merged or split cells."))
    }

    fun toHtml(input: File, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val pages = layout(input, password, progress)
        val sb = StringBuilder("<!DOCTYPE html>\n<html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">")
            .append("<title>").append(xml(input.nameWithoutExtension)).append("</title><style>body{font-family:sans-serif;max-width:50em;margin:auto;padding:1em;line-height:1.45}")
            .append("section{border-bottom:1px solid #ccc;padding:1em 0}table{border-collapse:collapse;margin:.6em 0}td{border:1px solid #999;padding:.25em .5em}</style></head><body>\n")
        pages.forEachIndexed { i, page ->
            sb.append("<section id=\"page${i + 1}\">\n")
            for (pc in pieces(page)) when (pc) {
                is TablePiece -> { sb.append("<table>"); for (r in pc.rows) { sb.append("<tr>"); for (c in r) sb.append("<td>").append(xml(c)).append("</td>"); sb.append("</tr>") }; sb.append("</table>\n") }
                is TextPiece -> {
                    val l = pc.lines[0]; val t = xml(joinLines(pc.lines))
                    val tag = if (l.size >= 18f) "h1" else if (l.size >= 14f) "h2" else if (l.bold && pc.lines.size == 1) "h3" else "p"
                    sb.append("<$tag>").append(if (l.italic) "<em>$t</em>" else if (l.bold && tag == "p") "<strong>$t</strong>" else t).append("</$tag>\n")
                }
            }
            sb.append("</section>\n")
        }
        sb.append("</body></html>\n")
        out.writeText(sb.toString(), Charsets.UTF_8)
        return ExportResult(listOf(out), listOfNotNull(LAYOUT_NOTE, SCAN_NOTE.takeIf { pages.any { it.lines.isEmpty() } }))
    }

    private fun rtf(s: String): String {
        val sb = StringBuilder()
        for (ch in s) when {
            ch == '\\' || ch == '{' || ch == '}' -> sb.append('\\').append(ch)
            ch.code < 128 -> sb.append(ch)
            else -> sb.append("\\u").append(ch.code.toShort().toInt()).append('?')
        }
        return sb.toString()
    }

    fun toRtf(input: File, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val pages = layout(input, password, progress)
        val sb = StringBuilder("{\\rtf1\\ansi\\ansicpg1252\\deff0{\\fonttbl{\\f0\\fswiss Arial;}}\\f0\n")
        pages.forEachIndexed { i, page ->
            if (i > 0) sb.append("\\page\n")
            for (pc in pieces(page)) when (pc) {
                is TablePiece -> for (r in pc.rows) sb.append("\\pard\\fs20 ").append(r.joinToString("\\tab ") { rtf(it) }).append("\\par\n")
                is TextPiece -> {
                    val l = pc.lines[0]
                    sb.append("\\pard\\sa120\\fs").append((l.size * 2).roundToInt()).append(if (l.bold) "\\b " else "\\b0 ").append(if (l.italic) "\\i " else "\\i0 ")
                        .append(rtf(joinLines(pc.lines))).append("\\par\n")
                }
            }
        }
        sb.append("}")
        out.writeText(sb.toString(), Charsets.US_ASCII)
        return ExportResult(listOf(out), listOfNotNull(LAYOUT_NOTE, SCAN_NOTE.takeIf { pages.any { it.lines.isEmpty() } }))
    }

    /** PowerPoint file with one slide per page. Each slide is a picture of the page. */
    fun toPptx(input: File, raster: PageRasterizer, out: File, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val sizes = openPdf(input, password).use { d -> d.pages.map { viewSize(it) } }
        val slides = sizes.mapIndexed { i, (w, h) ->
            val bmp = raster.render(i, 1900)
            progress.report(i + 1, sizes.size)
            Picture(bmp.toJpegBytes(88), w, h).also { bmp.recycle() }
        }
        Ooxml.writePptx(slides, out)
        return ExportResult(listOf(out), listOf("Each slide is a picture of one page, so it looks the same as the PDF but the text on the slides cannot be edited."))
    }

    private fun pixels(raster: PageRasterizer, input: File, password: String?, dpi: Int): List<Int> =
        openPdf(input, password).use { d -> d.pages.map { val (w, h) = viewSize(it); (max(w, h) / 72f * dpi).roundToInt().coerceIn(200, 6000) } }

    /** One PNG or JPG file per page. */
    fun toImages(input: File, raster: PageRasterizer, outDir: File, baseName: String, png: Boolean, dpi: Int = 150, pages: List<Int>? = null,
                 password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        outDir.mkdirs()
        val px = pixels(raster, input, password, dpi)
        val list = pages ?: px.indices.toList()
        val files = list.mapIndexed { n, i ->
            val bmp = flatten(raster.render(i, px[i]))
            val f = File(outDir, "$baseName page ${i + 1}.${if (png) "png" else "jpg"}")
            FileOutputStream(f).use { bmp.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, 90, it) }
            bmp.recycle(); progress.report(n + 1, list.size); f
        }
        return ExportResult(files)
    }

    private fun flatten(src: Bitmap): Bitmap {
        if (!src.hasAlpha() && src.config == Bitmap.Config.ARGB_8888) return src
        val b = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        Canvas(b).apply { drawColor(Color.WHITE); drawBitmap(src, 0f, 0f, null) }
        src.recycle(); return b
    }

    /** One multi page TIFF file (RGB, PackBits compression, readable by standard TIFF software). */
    fun toTiff(input: File, raster: PageRasterizer, out: File, dpi: Int = 150, password: String? = null, progress: Progress = Progress.NONE): ExportResult {
        val px = pixels(raster, input, password, dpi)
        RandomAccessFile(out, "rw").use { raf ->
            raf.setLength(0)
            raf.write(byteArrayOf(0x49, 0x49, 42, 0)); raf.write(le32(0)) // little endian header, first IFD offset patched later
            var prevIfdPointer = 4L
            for (i in px.indices) {
                val bmp = flatten(raster.render(i, px[i]))
                val w = bmp.width; val h = bmp.height
                val stripOffset = raf.filePointer
                val row = IntArray(w); val rgb = ByteArray(w * 3); val packed = java.io.ByteArrayOutputStream(w * 3 + 16)
                val buf = java.io.ByteArrayOutputStream(1 shl 16)
                for (y in 0 until h) {
                    bmp.getPixels(row, 0, w, 0, y, w, 1)
                    for (x in 0 until w) { val c = row[x]; rgb[x * 3] = (c shr 16).toByte(); rgb[x * 3 + 1] = (c shr 8).toByte(); rgb[x * 3 + 2] = c.toByte() }
                    packed.reset(); packBits(rgb, packed); packed.writeTo(buf)
                    if (buf.size() > (1 shl 20)) { raf.write(buf.toByteArray()); buf.reset() }
                }
                raf.write(buf.toByteArray())
                val stripBytes = raf.filePointer - stripOffset
                bmp.recycle()
                if (raf.filePointer % 2L == 1L) raf.write(0)
                val bitsOffset = raf.filePointer; raf.write(le16(8)); raf.write(le16(8)); raf.write(le16(8))
                val resOffset = raf.filePointer; raf.write(le32(dpi)); raf.write(le32(1))
                val ifd = raf.filePointer
                raf.seek(prevIfdPointer); raf.write(le32(ifd.toInt())); raf.seek(ifd)
                val entries = listOf(
                    entry(256, 4, 1, w), entry(257, 4, 1, h), entry(258, 3, 3, bitsOffset.toInt()), entry(259, 3, 1, 32773), entry(262, 3, 1, 2),
                    entry(273, 4, 1, stripOffset.toInt()), entry(277, 3, 1, 3), entry(278, 4, 1, h), entry(279, 4, 1, stripBytes.toInt()),
                    entry(282, 5, 1, resOffset.toInt()), entry(283, 5, 1, resOffset.toInt()), entry(296, 3, 1, 2)
                )
                raf.write(le16(entries.size)); entries.forEach { raf.write(it) }
                prevIfdPointer = raf.filePointer; raf.write(le32(0))
                progress.report(i + 1, px.size)
            }
        }
        return ExportResult(listOf(out))
    }

    private fun le16(v: Int) = byteArrayOf(v.toByte(), (v shr 8).toByte())
    private fun le32(v: Int) = byteArrayOf(v.toByte(), (v shr 8).toByte(), (v shr 16).toByte(), (v shr 24).toByte())
    private fun entry(tag: Int, type: Int, count: Int, value: Int): ByteArray =
        le16(tag) + le16(type) + le32(count) + (if (type == 3 && count == 1) le16(value) + le16(0) else le32(value))

    internal fun packBits(src: ByteArray, out: java.io.ByteArrayOutputStream) {
        var i = 0; val n = src.size
        while (i < n) {
            var run = 1
            while (i + run < n && run < 128 && src[i + run] == src[i]) run++
            if (run >= 3) { out.write(257 - run); out.write(src[i].toInt()); i += run; continue }
            val start = i; var len = 0
            while (i < n && len < 128) {
                if (i + 2 < n && src[i] == src[i + 1] && src[i] == src[i + 2]) break
                i++; len++
            }
            out.write(len - 1); out.write(src, start, len)
        }
    }
}
