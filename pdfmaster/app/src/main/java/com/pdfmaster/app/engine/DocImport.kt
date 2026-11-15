package com.pdfmaster.app.engine

import android.content.Context
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import org.w3c.dom.Element
import org.w3c.dom.Node
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory

/** What a reader understood from a file, ready for [DocWriter]. */
class ImportedDoc(val blocks: List<Block>, val pageSize: PDRectangle = PDRectangle.A4, val notes: List<String> = emptyList())

private fun ZipFile.text(name: String): ByteArray? = getEntry(name)?.let { getInputStream(it).use { s -> s.readBytes() } }

private fun dom(bytes: ByteArray): Element {
    val f = DocumentBuilderFactory.newInstance()
    f.isNamespaceAware = true
    runCatching { f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true) }
    runCatching { f.isExpandEntityReferences = false }
    return f.newDocumentBuilder().parse(bytes.inputStream()).documentElement
}

private val Node.kids: List<Element> get() { val l = ArrayList<Element>(); var n = firstChild; while (n != null) { if (n is Element) l.add(n); n = n.nextSibling }; return l }
private fun Element.child(name: String): Element? = kids.firstOrNull { it.localName == name }
private fun Element.all(name: String): List<Element> { val l = ArrayList<Element>(); val nl = getElementsByTagNameNS("*", name); for (i in 0 until nl.length) l.add(nl.item(i) as Element); return l }
/** Reads an attribute whatever its namespace prefix is. */
private fun Element.at(name: String): String? {
    val a = attributes
    for (i in 0 until a.length) { val n = a.item(i); if ((n.localName ?: n.nodeName.substringAfter(':')) == name) return n.nodeValue }
    return null
}
/** The relationship id of an element (r:id, r:embed), whatever prefix the file uses. */
private fun Element.rid(name: String = "id"): String? {
    val a = attributes
    for (i in 0 until a.length) { val n = a.item(i); if (n.nodeName.contains(':') && n.nodeName.substringAfter(':') == name && !n.nodeName.startsWith("xmlns")) return n.nodeValue }
    return null
}
private fun on(e: Element?): Boolean = e != null && e.at("val").let { it == null || (it != "0" && it != "false" && it != "none") }

/** Relationship id to target path, resolved against the folder of the part that owns the rels file. */
private fun rels(zip: ZipFile, part: String): Map<String, String> {
    val dir = part.substringBeforeLast('/', ""); val name = part.substringAfterLast('/')
    val bytes = zip.text((if (dir.isEmpty()) "" else "$dir/") + "_rels/$name.rels") ?: return emptyMap()
    return dom(bytes).kids.filter { it.localName == "Relationship" && it.getAttribute("TargetMode") != "External" }.associate { r ->
        val t = r.getAttribute("Target")
        val full = if (t.startsWith("/")) t.drop(1) else {
            val parts = ArrayList(dir.split('/').filter { it.isNotEmpty() })
            for (seg in t.split('/')) when (seg) { ".." -> if (parts.isNotEmpty()) parts.removeAt(parts.size - 1); ".", "" -> {}; else -> parts.add(seg) }
            parts.joinToString("/")
        }
        r.getAttribute("Id") to full
    }
}

object DocImport {
    private const val MAX_IMAGE = 12 * 1024 * 1024

    fun read(file: File, ext: String = file.extension): ImportedDoc = when (ext.lowercase()) {
        "docx" -> docx(file)
        "xlsx" -> xlsx(file)
        "pptx" -> pptx(file)
        "html", "htm" -> ImportedDoc(Html.parse(file.readText(Charsets.UTF_8)), notes = listOf("Text, headings, lists, tables and embedded pictures are converted. Page styling (CSS) and scripts are not."))
        "rtf" -> ImportedDoc(Rtf.parse(file.readText(Charsets.ISO_8859_1)), notes = listOf("Text with bold, italic, underline and font sizes is converted. Pictures and tables in RTF files are not."))
        "txt", "csv", "md", "log" -> txt(file)
        "doc", "xls", "ppt" -> throw IllegalArgumentException("Old ${ext.uppercase()} files are not supported. Save the file as ${ext.uppercase()}X in your office app first.")
        else -> throw IllegalArgumentException("${ext.uppercase()} files cannot be converted to PDF yet")
    }

    fun toPdf(context: Context, file: File, out: File, ext: String = file.extension, progress: Progress = Progress.NONE): List<String> {
        val d = read(file, ext)
        require(d.blocks.any { it !is PageBreak }) { "Nothing to convert was found in this file" }
        DocWriter(context, d.pageSize).write(d.blocks, out, file.nameWithoutExtension, progress)
        return d.notes
    }

    private fun txt(file: File): ImportedDoc {
        val text = file.readText(Charsets.UTF_8).removePrefix("\uFEFF")
        return ImportedDoc(text.split('\n').map { Para(listOf(Run(it.trimEnd('\r'), size = 10.5f)), spaceAfter = 2f) })
    }

    // ---------- Word ----------
    private fun docx(file: File): ImportedDoc = ZipFile(file).use { zip ->
        val root = dom(zip.text("word/document.xml") ?: throw IllegalArgumentException("This is not a valid Word (DOCX) file"))
        val rel = rels(zip, "word/document.xml")
        var defSize = 11f
        // Style id to (size, bold) for paragraph styles such as headings.
        val styles = HashMap<String, Pair<Float?, Boolean>>()
        val listStyles = HashSet<String>() // paragraph styles that are bulleted or numbered lists
        zip.text("word/styles.xml")?.let { b ->
            val s = dom(b)
            s.child("docDefaults")?.child("rPrDefault")?.child("rPr")?.child("sz")?.at("val")?.toFloatOrNull()?.let { defSize = it / 2 }
            for (st in s.kids.filter { it.localName == "style" }) {
                val id = st.at("styleId") ?: continue
                val rp = st.child("rPr")
                if (st.child("pPr")?.child("numPr") != null) listStyles.add(id)
                styles[id] = (rp?.child("sz")?.at("val")?.toFloatOrNull()?.div(2)) to on(rp?.child("b"))
                if (st.at("default") == "1" && st.at("type") == "paragraph") rp?.child("sz")?.at("val")?.toFloatOrNull()?.let { defSize = it / 2 }
            }
        }
        val blocks = ArrayList<Block>()
        var skipped = 0
        fun runsOf(p: Element, baseSize: Float, baseBold: Boolean, into: MutableList<Run>, images: MutableList<ByteArray>) {
            for (k in p.kids) when (k.localName) {
                "hyperlink", "smartTag", "ins", "sdt", "sdtContent", "fldSimple" -> runsOf(k, baseSize, baseBold, into, images)
                "r" -> {
                    val rp = k.child("rPr")
                    val bold = if (rp?.child("b") != null) on(rp.child("b")) else baseBold
                    val size = rp?.child("sz")?.at("val")?.toFloatOrNull()?.div(2) ?: baseSize
                    val color = rp?.child("color")?.at("val")?.takeIf { it.length == 6 }?.toIntOrNull(16) ?: 0x111111
                    val style = Run("", bold, on(rp?.child("i")), on(rp?.child("u")), size, color)
                    for (c in k.kids) when (c.localName) {
                        "t" -> into.add(style.copy(text = c.textContent))
                        "tab" -> into.add(style.copy(text = "    "))
                        "br", "cr" -> if (c.at("type") == "page") into.add(style.copy(text = "\u000C")) else into.add(style.copy(text = "\n"))
                        "noBreakHyphen" -> into.add(style.copy(text = "-"))
                        "drawing", "pict" -> for (blip in c.all("blip") + c.all("imagedata")) {
                            val id = blip.rid("embed") ?: blip.rid("id")
                            val bytes = rel[id]?.let { zip.getEntry(it) }?.takeIf { it.size in 1..MAX_IMAGE }?.let { zip.getInputStream(it).use { s -> s.readBytes() } }
                            if (bytes != null) images.add(bytes) else skipped++
                        }
                    }
                }
            }
        }
        fun paragraph(p: Element) {
            val pp = p.child("pPr")
            val styleId = pp?.child("pStyle")?.at("val").orEmpty()
            val st = styles[styleId]
            val low = styleId.lowercase()
            val heading = Regex("heading\\s?(\\d)").find(low)?.groupValues?.get(1)?.toIntOrNull()
            val size = st?.first ?: when { low == "title" -> 26f; heading == 1 -> 20f; heading == 2 -> 16f; heading == 3 -> 14f; heading != null -> 12f; else -> defSize }
            val bold = st?.second == true || heading != null
            val runs = ArrayList<Run>(); val images = ArrayList<ByteArray>()
            if (pp?.child("pageBreakBefore") != null && on(pp.child("pageBreakBefore"))) blocks.add(PageBreak)
            runsOf(p, size, bold, runs, images)
            val align = when (pp?.child("jc")?.at("val")) { "center" -> Align.CENTER; "right", "end" -> Align.RIGHT; else -> Align.LEFT }
            val bullet = if (pp?.child("numPr") != null || styleId in listStyles) "\u2022" else null
            val indent = (pp?.child("ind")?.at("left")?.toFloatOrNull() ?: 0f) / 20f
            // A page break inside a paragraph splits it.
            var cur = ArrayList<Run>()
            fun emit() { if (cur.isNotEmpty() || images.isEmpty()) blocks.add(Para(cur, align, if (heading != null) 8f else 6f, if (bullet != null) 0f else indent.coerceIn(0f, 200f), bullet)); cur = ArrayList() }
            for (r in runs) if (r.text == "\u000C") { emit(); blocks.add(PageBreak) } else cur.add(r)
            emit()
            images.forEach { blocks.add(ImageBlock(it)) }
        }
        fun body(parent: Element) {
            for (k in parent.kids) when (k.localName) {
                "p" -> paragraph(k)
                "tbl" -> blocks.add(TableBlock(k.kids.filter { it.localName == "tr" }.map { tr ->
                    tr.kids.filter { it.localName == "tc" }.map { tc -> tc.all("p").joinToString("\n") { p -> p.all("t").joinToString("") { it.textContent } }.trim() }
                }))
                "sdt" -> k.child("sdtContent")?.let { body(it) }
            }
        }
        body(root.child("body") ?: root)
        ImportedDoc(blocks, notes = listOfNotNull(
            "Text, headings, bold, italic, lists, tables and pictures are converted. Exact fonts, columns, headers, footers and text boxes are not, so page breaks can differ from Word.",
            "$skipped picture(s) could not be read and were left out.".takeIf { skipped > 0 }))
    }

    // ---------- Excel ----------
    private val BUILTIN_DATE_FORMATS = setOf(14, 15, 16, 17, 22, 27, 30, 36, 50, 57)

    private fun xlsx(file: File): ImportedDoc = ZipFile(file).use { zip ->
        val wb = dom(zip.text("xl/workbook.xml") ?: throw IllegalArgumentException("This is not a valid Excel (XLSX) file"))
        val rel = rels(zip, "xl/workbook.xml")
        val shared = zip.text("xl/sharedStrings.xml")?.let { b -> dom(b).kids.filter { it.localName == "si" }.map { si -> si.all("t").filter { (it.parentNode as? Element)?.localName != "rPh" }.joinToString("") { it.textContent } } } ?: emptyList()
        // Which cell styles are dates.
        val dateStyles = HashSet<Int>()
        zip.text("xl/styles.xml")?.let { b ->
            val s = dom(b)
            val custom = s.child("numFmts")?.kids?.associate { (it.getAttribute("numFmtId").toIntOrNull() ?: -1) to it.getAttribute("formatCode") } ?: emptyMap()
            s.child("cellXfs")?.kids?.forEachIndexed { i, xf ->
                val id = xf.getAttribute("numFmtId").toIntOrNull() ?: 0
                val code = custom[id]?.replace(Regex("\"[^\"]*\"|\\[[^\\]]*\\]"), "")?.lowercase()
                if (id in BUILTIN_DATE_FORMATS || (code != null && code.any { it == 'y' || it == 'd' } && !code.contains("general"))) dateStyles.add(i)
            }
        }
        val dateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
        val blocks = ArrayList<Block>()
        var maxCols = 0; var truncated = false
        val sheets = wb.child("sheets")?.kids.orEmpty()
        sheets.forEachIndexed { si, sh ->
            val path = rel[sh.rid()] ?: "xl/worksheets/sheet${si + 1}.xml"
            val sheet = zip.text(path)?.let { dom(it) } ?: return@forEachIndexed
            val rows = ArrayList<MutableList<String>>()
            for (row in sheet.child("sheetData")?.kids.orEmpty()) {
                val r = (row.getAttribute("r").toIntOrNull() ?: (rows.size + 1)) - 1
                if (r > 5000) { truncated = true; break }
                while (rows.size <= r) rows.add(ArrayList())
                var nextCol = 0
                for (c in row.kids.filter { it.localName == "c" }) {
                    val ref = c.getAttribute("r")
                    val col = if (ref.isNotEmpty()) ref.takeWhile { it.isLetter() }.fold(0) { a, ch -> a * 26 + (ch.uppercaseChar() - 'A' + 1) } - 1 else nextCol
                    nextCol = col + 1
                    if (col > 60) { truncated = true; continue }
                    val v = c.child("v")?.textContent
                    val text = when (c.getAttribute("t")) {
                        "s" -> v?.toIntOrNull()?.let { shared.getOrNull(it) }.orEmpty()
                        "inlineStr" -> c.child("is")?.all("t")?.joinToString("") { it.textContent }.orEmpty()
                        "b" -> if (v == "1") "TRUE" else "FALSE"
                        "str", "e" -> v.orEmpty()
                        else -> {
                            val d = v?.toDoubleOrNull()
                            if (d == null) v.orEmpty()
                            else if ((c.getAttribute("s").toIntOrNull() ?: -1) in dateStyles && d > 0 && d < 2958466) dateFmt.format(Date(Math.round((d - 25569) * 86400000.0)))
                            else if (d == Math.rint(d) && Math.abs(d) < 1e15) d.toLong().toString()
                            else java.math.BigDecimal(d).round(java.math.MathContext(12)).stripTrailingZeros().toPlainString()
                        }
                    }
                    val line = rows[r]; while (line.size <= col) line.add(""); line[col] = text
                }
            }
            while (rows.isNotEmpty() && rows.last().all { it.isBlank() }) rows.removeAt(rows.size - 1)
            if (rows.isEmpty()) return@forEachIndexed
            if (blocks.isNotEmpty()) blocks.add(PageBreak)
            blocks.add(para(sh.getAttribute("name").ifEmpty { "Sheet ${si + 1}" }, 14f, bold = true, spaceAfter = 8f))
            val width = rows.maxOf { it.size }; maxCols = maxOf(maxCols, width)
            blocks.add(TableBlock(rows.filter { r -> r.any { it.isNotBlank() } }.map { r -> List(width) { r.getOrElse(it) { "" } } }))
        }
        val a4 = PDRectangle.A4
        ImportedDoc(blocks, if (maxCols > 6) PDRectangle(a4.height, a4.width) else a4, listOfNotNull(
            "Cell values are converted as a table per sheet. Colours, column widths, charts, pictures and number formats (other than dates) are not kept.",
            "Very large sheets were cut at 5000 rows or 60 columns.".takeIf { truncated }))
    }

    // ---------- PowerPoint ----------
    private fun pptx(file: File): ImportedDoc = ZipFile(file).use { zip ->
        val pres = dom(zip.text("ppt/presentation.xml") ?: throw IllegalArgumentException("This is not a valid PowerPoint (PPTX) file"))
        val rel = rels(zip, "ppt/presentation.xml")
        val sz = pres.child("sldSz")
        val w = (sz?.getAttribute("cx")?.toFloatOrNull() ?: 9144000f) / 12700f
        val h = (sz?.getAttribute("cy")?.toFloatOrNull() ?: 6858000f) / 12700f
        val blocks = ArrayList<Block>()
        val ids = pres.child("sldIdLst")?.kids.orEmpty()
        ids.forEachIndexed { n, id ->
            val path = rel[id.rid()] ?: return@forEachIndexed
            val slide = zip.text(path)?.let { dom(it) } ?: return@forEachIndexed
            val srel = rels(zip, path)
            if (n > 0) blocks.add(PageBreak)
            var any = false
            fun shapes(tree: Element) {
                for (sp in tree.kids) when (sp.localName) {
                    "grpSp" -> shapes(sp)
                    "sp" -> {
                        val ph = sp.child("nvSpPr")?.child("nvPr")?.child("ph")?.getAttribute("type").orEmpty()
                        val title = ph == "title" || ph == "ctrTitle"
                        for (p in sp.child("txBody")?.kids.orEmpty().filter { it.localName == "p" }) {
                            val runs = p.kids.mapNotNull { r ->
                                when (r.localName) {
                                    "r", "fld" -> {
                                        val rp = r.child("rPr")
                                        val size = rp?.getAttribute("sz")?.toFloatOrNull()?.div(100)?.times(0.6f)?.coerceIn(9f, 30f) ?: if (title) 22f else 13f
                                        Run(r.child("t")?.textContent.orEmpty(), bold = title || rp?.getAttribute("b") == "1", italic = rp?.getAttribute("i") == "1", size = size)
                                    }
                                    "br" -> Run("\n")
                                    else -> null
                                }
                            }
                            if (runs.any { it.text.isNotBlank() }) {
                                val lvl = p.child("pPr")?.getAttribute("lvl")?.toIntOrNull() ?: 0
                                blocks.add(Para(runs, spaceAfter = if (title) 12f else 6f, indent = lvl * 14f, bullet = if (title || ph == "subTitle") null else "\u2022")); any = true
                            }
                        }
                    }
                    "pic" -> {
                        val idr = sp.all("blip").firstOrNull()?.rid("embed")
                        val bytes = srel[idr]?.let { zip.getEntry(it) }?.takeIf { it.size in 1..MAX_IMAGE }?.let { zip.getInputStream(it).use { s -> s.readBytes() } }
                        if (bytes != null) { blocks.add(ImageBlock(bytes)); any = true }
                    }
                    "graphicFrame" -> for (tbl in sp.all("tbl")) {
                        blocks.add(TableBlock(tbl.kids.filter { it.localName == "tr" }.map { tr -> tr.kids.filter { it.localName == "tc" }.map { tc -> tc.all("t").joinToString(" ") { it.textContent } } })); any = true
                    }
                }
            }
            slide.child("cSld")?.child("spTree")?.let { shapes(it) }
            if (!any) blocks.add(para("(Slide ${n + 1} has no text or pictures)", 10f))
        }
        ImportedDoc(blocks, PDRectangle(w, h), listOf("Each slide becomes a page with its text, tables and pictures in reading order. Slide design, exact positions, backgrounds, charts and animations are not kept."))
    }
}

/** Small HTML reader: headings, paragraphs, bold, italic, underline, lists, tables, line breaks and embedded (data:) pictures. */
object Html {
    private val ENT = mapOf("amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ", "copy" to "\u00A9", "reg" to "\u00AE",
        "ndash" to "\u2013", "mdash" to "\u2014", "hellip" to "\u2026", "euro" to "\u20AC", "pound" to "\u00A3", "lsquo" to "\u2018", "rsquo" to "\u2019",
        "ldquo" to "\u201C", "rdquo" to "\u201D", "bull" to "\u2022", "deg" to "\u00B0", "trade" to "\u2122", "times" to "\u00D7")

    fun decode(s: String): String = Regex("&(#x?[0-9a-fA-F]+|[a-zA-Z]+);").replace(s) { m ->
        val e = m.groupValues[1]
        when {
            e.startsWith("#x") || e.startsWith("#X") -> e.drop(2).toIntOrNull(16)?.takeIf { Character.isValidCodePoint(it) }?.let { String(Character.toChars(it)) } ?: m.value
            e.startsWith("#") -> e.drop(1).toIntOrNull()?.takeIf { Character.isValidCodePoint(it) }?.let { String(Character.toChars(it)) } ?: m.value
            else -> ENT[e] ?: m.value
        }
    }

    fun parse(html: String): List<Block> {
        val src = html.replace(Regex("(?is)<!--.*?-->|<(script|style|head|svg|noscript)\\b.*?</\\1\\s*>"), " ")
        val blocks = ArrayList<Block>()
        var runs = ArrayList<Run>()
        var bold = 0; var italic = 0; var under = 0; var pre = 0
        var size = 11f; var align = Align.LEFT; var bullet: String? = null; var indent = 0f; var after = 6f
        val lists = ArrayList<IntArray>() // [ordered 0/1, counter]
        var table: ArrayList<ArrayList<String>>? = null; var cell: StringBuilder? = null
        fun flush() {
            val text = runs.joinToString("") { it.text }
            if (text.isNotBlank()) {
                // Trim the white space at both ends of the paragraph.
                if (pre == 0) { runs[0] = runs[0].copy(text = runs[0].text.trimStart()); runs[runs.size - 1] = runs.last().copy(text = runs.last().text.trimEnd()) }
                blocks.add(Para(runs, align, after, indent, bullet))
            }
            runs = ArrayList(); bullet = null
        }
        fun text(t0: String) {
            var t = decode(t0)
            if (pre == 0) { t = t.replace(Regex("\\s+"), " "); if (t == " " && (runs.isEmpty() || runs.last().text.endsWith(" ") || runs.last().text.endsWith("\n"))) return }
            if (t.isEmpty()) return
            val c = cell
            if (c != null) { c.append(t); return }
            runs.add(Run(t, bold > 0, italic > 0, under > 0, size, mono = pre > 0))
        }
        var i = 0
        val tagRe = Regex("<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:\"[^\"]*\"|'[^']*'|[^>\"'])*)>")
        while (i < src.length) {
            val lt = src.indexOf('<', i)
            if (lt < 0) { text(src.substring(i)); break }
            if (lt > i) text(src.substring(i, lt))
            val m = tagRe.find(src, lt)
            if (m == null || m.range.first != lt) { val gt = src.indexOf('>', lt); if (gt < 0) { text(src.substring(lt)); break }; i = gt + 1; continue }
            i = m.range.last + 1
            val close = m.groupValues[1] == "/"; val tag = m.groupValues[2].lowercase(); val attrs = m.groupValues[3]
            when (tag) {
                "b", "strong" -> bold += if (close) -1 else 1
                "i", "em" -> italic += if (close) -1 else 1
                "u" -> under += if (close) -1 else 1
                "br" -> if (cell != null) cell!!.append('\n') else runs.add(Run("\n", size = size))
                "h1", "h2", "h3", "h4", "h5", "h6" -> { flush(); if (close) { size = 11f; bold--; after = 6f } else { size = floatArrayOf(22f, 18f, 15f, 13f, 12f, 11f)[tag[1] - '1']; bold++; after = 8f } }
                "p", "div", "section", "article", "header", "footer", "blockquote", "figure", "figcaption", "address", "main", "nav", "aside" -> {
                    flush()
                    align = if (close) Align.LEFT else when { attrs.contains(Regex("text-align:\\s*center|align=[\"']?center", RegexOption.IGNORE_CASE)) -> Align.CENTER
                        attrs.contains(Regex("text-align:\\s*right|align=[\"']?right", RegexOption.IGNORE_CASE)) -> Align.RIGHT; else -> Align.LEFT }
                }
                "center" -> { flush(); align = if (close) Align.LEFT else Align.CENTER }
                "pre" -> { flush(); pre += if (close) -1 else 1 }
                "hr" -> { flush(); blocks.add(para("\u2014".repeat(30), 8f, align = Align.CENTER)) }
                "ul", "ol" -> { flush(); if (close) { if (lists.isNotEmpty()) lists.removeAt(lists.size - 1) } else lists.add(intArrayOf(if (tag == "ol") 1 else 0, 0)); indent = maxOf(0, lists.size - 1) * 16f }
                "li" -> { flush(); if (!close) { val l = lists.lastOrNull(); bullet = if (l != null && l[0] == 1) { l[1]++; "${l[1]}." } else "\u2022" } }
                "table" -> { flush(); if (close) { table?.takeIf { it.isNotEmpty() }?.let { blocks.add(TableBlock(it)) }; table = null; cell = null } else table = ArrayList() }
                "tr" -> if (!close) table?.add(ArrayList())
                "td", "th" -> if (close) { cell?.let { c -> table?.lastOrNull()?.add(c.toString().trim()) }; cell = null } else if (table != null) { if (table!!.isEmpty()) table!!.add(ArrayList()); cell = StringBuilder() }
                "img" -> Regex("src\\s*=\\s*[\"']data:image/[a-zA-Z+]+;base64,([^\"']+)[\"']").find(attrs)?.let { d ->
                    runCatching { android.util.Base64.decode(d.groupValues[1], android.util.Base64.DEFAULT) }.getOrNull()?.let { flush(); blocks.add(ImageBlock(it)) }
                }
            }
            bold = maxOf(0, bold); italic = maxOf(0, italic); under = maxOf(0, under); pre = maxOf(0, pre)
        }
        flush()
        return blocks
    }
}

/** Small RTF reader: text with bold, italic, underline, font size, paragraphs, page breaks and Unicode characters. */
object Rtf {
    private class St(var bold: Boolean = false, var italic: Boolean = false, var under: Boolean = false, var size: Float = 12f, var skip: Boolean = false, var uc: Int = 1) {
        fun copy() = St(bold, italic, under, size, skip, uc)
    }
    private val SKIP = setOf("fonttbl", "colortbl", "stylesheet", "info", "pict", "header", "footer", "headerl", "headerr", "footerl", "footerr", "footnote",
        "object", "themedata", "colorschememapping", "latentstyles", "datastore", "generator", "listtable", "listoverridetable", "rsidtbl", "xmlnstbl", "fldinst")

    fun parse(rtf: String): List<Block> {
        require(rtf.trimStart().startsWith("{\\rtf")) { "This is not a valid RTF file" }
        val blocks = ArrayList<Block>(); var runs = ArrayList<Run>()
        val stack = ArrayList<St>(); var st = St()
        val sb = StringBuilder(); var align = Align.LEFT
        fun endRun() { if (sb.isNotEmpty()) { if (!st.skip) runs.add(Run(sb.toString(), st.bold, st.italic, st.under, st.size)); sb.setLength(0) } }
        fun endPara() { endRun(); blocks.add(Para(runs, align)); runs = ArrayList() }
        var i = 0; var skipChars = 0
        fun put(s: String) { if (skipChars > 0) { skipChars--; return }; if (!st.skip) sb.append(s) }
        while (i < rtf.length) {
            val ch = rtf[i]
            when (ch) {
                '{' -> { endRun(); stack.add(st); st = st.copy(); i++ }
                '}' -> { endRun(); if (stack.isNotEmpty()) st = stack.removeAt(stack.size - 1); i++ }
                '\r', '\n' -> i++
                '\\' -> {
                    i++
                    if (i >= rtf.length) break
                    val c = rtf[i]
                    if (c == '\'') {
                        val hex = rtf.substring(i + 1, minOf(i + 3, rtf.length)).toIntOrNull(16)
                        if (hex != null) put(String(byteArrayOf(hex.toByte()), charset("windows-1252")))
                        i += 3
                    } else if (!c.isLetter()) {
                        when (c) { '\\', '{', '}' -> put(c.toString()); '~' -> put(" "); '-' -> {}; '_' -> put("-"); '*' -> st.skip = true; '\n', '\r' -> endPara() }
                        i++
                    } else {
                        val start = i
                        while (i < rtf.length && rtf[i].isLetter()) i++
                        val word = rtf.substring(start, i)
                        val ns = i
                        if (i < rtf.length && (rtf[i] == '-' || rtf[i].isDigit())) { i++; while (i < rtf.length && rtf[i].isDigit()) i++ }
                        val num = rtf.substring(ns, i).toIntOrNull()
                        if (i < rtf.length && rtf[i] == ' ') i++
                        when (word) {
                            "par", "sect" -> endPara()
                            "line" -> put("\n")
                            "tab" -> put("    ")
                            "page" -> { endPara(); blocks.add(PageBreak) }
                            "pard" -> align = Align.LEFT
                            "qc" -> align = Align.CENTER
                            "qr" -> align = Align.RIGHT
                            "ql", "qj" -> align = Align.LEFT
                            "b" -> { endRun(); st.bold = num != 0 }
                            "i" -> { endRun(); st.italic = num != 0 }
                            "ul" -> { endRun(); st.under = num != 0 }
                            "ulnone" -> { endRun(); st.under = false }
                            "plain" -> { endRun(); st.bold = false; st.italic = false; st.under = false }
                            "fs" -> { endRun(); st.size = ((num ?: 24) / 2f).coerceIn(4f, 96f) }
                            "uc" -> st.uc = num ?: 1
                            "u" -> if (num != null) { put(String(Character.toChars(if (num < 0) num + 65536 else num))); skipChars = st.uc }
                            "emdash" -> put("\u2014"); "endash" -> put("\u2013"); "bullet" -> put("\u2022")
                            "lquote" -> put("\u2018"); "rquote" -> put("\u2019"); "ldblquote" -> put("\u201C"); "rdblquote" -> put("\u201D")
                            "bin" -> i += (num ?: 0)
                            else -> if (word in SKIP) st.skip = true
                        }
                    }
                }
                else -> { put(ch.toString()); i++ }
            }
        }
        endRun(); if (runs.isNotEmpty()) blocks.add(Para(runs, align))
        while (blocks.isNotEmpty() && (blocks.last() as? Para)?.plain?.isBlank() == true) blocks.removeAt(blocks.size - 1)
        return blocks
    }
}
