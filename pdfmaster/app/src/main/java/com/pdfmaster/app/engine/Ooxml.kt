package com.pdfmaster.app.engine

import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/** Escapes text for XML and drops characters XML 1.0 does not allow. */
fun xml(s: String): String {
    val sb = StringBuilder(s.length + 16)
    for (ch in s) when {
        ch == '&' -> sb.append("&amp;"); ch == '<' -> sb.append("&lt;"); ch == '>' -> sb.append("&gt;"); ch == '"' -> sb.append("&quot;")
        ch == '\t' || ch == '\n' || ch == '\r' || ch >= ' ' -> if (ch != '￾' && ch != '￿') sb.append(ch)
    }
    return sb.toString()
}

internal class Zip(file: File) : AutoCloseable {
    private val z = ZipOutputStream(file.outputStream().buffered())
    fun put(name: String, text: String) = put(name, text.toByteArray(Charsets.UTF_8))
    fun put(name: String, bytes: ByteArray) { z.putNextEntry(ZipEntry(name)); z.write(bytes); z.closeEntry() }
    override fun close() = z.close()
}

private const val HEAD = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>\n"
private const val REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
private const val PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"

/** A picture placed in a document, with its size in points. */
class Picture(val jpeg: ByteArray, val widthPt: Float, val heightPt: Float)

sealed interface DocxItem
data class DocxPara(val runs: List<Run>, val align: Align = Align.LEFT, val pageBreakBefore: Boolean = false) : DocxItem
class DocxPicture(val pic: Picture, val pageBreakBefore: Boolean = false) : DocxItem
data class DocxTable(val rows: List<List<String>>) : DocxItem

/** Writes real Word (DOCX), Excel (XLSX) and PowerPoint (PPTX) files. These are proper Office Open XML packages. */
object Ooxml {

    fun writeDocx(items: List<DocxItem>, out: File, pageWidthPt: Float = 595f, pageHeightPt: Float = 842f, marginPt: Float = 56f) {
        val body = StringBuilder()
        val media = ArrayList<ByteArray>()
        for (it in items) when (it) {
            is DocxPara -> {
                body.append("<w:p><w:pPr>")
                if (it.pageBreakBefore) body.append("<w:pageBreakBefore/>")
                body.append("<w:spacing w:after=\"120\"/>")
                if (it.align != Align.LEFT) body.append("<w:jc w:val=\"${if (it.align == Align.CENTER) "center" else "right"}\"/>")
                body.append("</w:pPr>")
                for (r in it.runs) {
                    body.append("<w:r><w:rPr>")
                    if (r.mono) body.append("<w:rFonts w:ascii=\"Courier New\" w:hAnsi=\"Courier New\"/>")
                    if (r.bold) body.append("<w:b/>"); if (r.italic) body.append("<w:i/>"); if (r.underline) body.append("<w:u w:val=\"single\"/>")
                    if (r.color != 0x111111 && r.color != 0) body.append("<w:color w:val=\"${"%06X".format(r.color and 0xFFFFFF)}\"/>")
                    val half = (r.size * 2).toInt().coerceIn(8, 400)
                    body.append("<w:sz w:val=\"$half\"/><w:szCs w:val=\"$half\"/></w:rPr>")
                    r.text.split('\n').forEachIndexed { i, part ->
                        if (i > 0) body.append("<w:br/>")
                        body.append("<w:t xml:space=\"preserve\">").append(xml(part)).append("</w:t>")
                    }
                    body.append("</w:r>")
                }
                body.append("</w:p>")
            }
            is DocxPicture -> {
                media.add(it.pic.jpeg); val n = media.size
                val cx = (it.pic.widthPt * 12700).toLong(); val cy = (it.pic.heightPt * 12700).toLong()
                body.append("<w:p><w:pPr>${if (it.pageBreakBefore) "<w:pageBreakBefore/>" else ""}<w:spacing w:after=\"0\"/><w:jc w:val=\"center\"/></w:pPr><w:r><w:drawing>")
                    .append("<wp:inline distT=\"0\" distB=\"0\" distL=\"0\" distR=\"0\"><wp:extent cx=\"$cx\" cy=\"$cy\"/><wp:docPr id=\"$n\" name=\"Picture $n\"/>")
                    .append("<a:graphic xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\"><a:graphicData uri=\"http://schemas.openxmlformats.org/drawingml/2006/picture\">")
                    .append("<pic:pic xmlns:pic=\"http://schemas.openxmlformats.org/drawingml/2006/picture\"><pic:nvPicPr><pic:cNvPr id=\"$n\" name=\"image$n.jpg\"/><pic:cNvPicPr/></pic:nvPicPr>")
                    .append("<pic:blipFill><a:blip r:embed=\"rImg$n\"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>")
                    .append("<pic:spPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"$cx\" cy=\"$cy\"/></a:xfrm><a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>")
                    .append("</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>")
            }
            is DocxTable -> {
                val cols = it.rows.maxOfOrNull { r -> r.size } ?: 0
                if (cols > 0) {
                    val wTw = ((pageWidthPt - 2 * marginPt) * 20 / cols).toInt()
                    body.append("<w:tbl><w:tblPr><w:tblW w:w=\"0\" w:type=\"auto\"/><w:tblBorders>")
                    for (b in listOf("top", "left", "bottom", "right", "insideH", "insideV")) body.append("<w:$b w:val=\"single\" w:sz=\"4\" w:space=\"0\" w:color=\"808080\"/>")
                    body.append("</w:tblBorders></w:tblPr><w:tblGrid>")
                    repeat(cols) { body.append("<w:gridCol w:w=\"$wTw\"/>") }
                    body.append("</w:tblGrid>")
                    for (row in it.rows) {
                        body.append("<w:tr>")
                        for (c in 0 until cols) body.append("<w:tc><w:tcPr><w:tcW w:w=\"$wTw\" w:type=\"dxa\"/></w:tcPr><w:p><w:r><w:t xml:space=\"preserve\">")
                            .append(xml(row.getOrNull(c).orEmpty())).append("</w:t></w:r></w:p></w:tc>")
                        body.append("</w:tr>")
                    }
                    body.append("</w:tbl><w:p/>")
                }
            }
        }
        val tw = { pt: Float -> (pt * 20).toInt() }
        val document = HEAD + "<w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\" xmlns:r=\"$REL\" " +
            "xmlns:wp=\"http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing\"><w:body>" + body +
            "<w:sectPr><w:pgSz w:w=\"${tw(pageWidthPt)}\" w:h=\"${tw(pageHeightPt)}\"${if (pageWidthPt > pageHeightPt) " w:orient=\"landscape\"" else ""}/>" +
            "<w:pgMar w:top=\"${tw(marginPt)}\" w:right=\"${tw(marginPt)}\" w:bottom=\"${tw(marginPt)}\" w:left=\"${tw(marginPt)}\" w:header=\"0\" w:footer=\"0\" w:gutter=\"0\"/></w:sectPr></w:body></w:document>"
        Zip(out).use { z ->
            z.put("[Content_Types].xml", HEAD + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Default Extension=\"jpg\" ContentType=\"image/jpeg\"/>" +
                "<Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>")
            z.put("_rels/.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\"><Relationship Id=\"rId1\" Type=\"$REL/officeDocument\" Target=\"word/document.xml\"/></Relationships>")
            z.put("word/_rels/document.xml.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\">" +
                media.indices.joinToString("") { "<Relationship Id=\"rImg${it + 1}\" Type=\"$REL/image\" Target=\"media/image${it + 1}.jpg\"/>" } + "</Relationships>")
            z.put("word/document.xml", document)
            media.forEachIndexed { i, b -> z.put("word/media/image${i + 1}.jpg", b) }
        }
    }

    private fun colName(i: Int): String { var n = i; val sb = StringBuilder(); do { sb.insert(0, 'A' + n % 26); n = n / 26 - 1 } while (n >= 0); return sb.toString() }
    private val NUMBER = Regex("^-?\\d{1,15}(\\.\\d{1,10})?$")

    /** One worksheet per entry. Cells that look like plain numbers are stored as numbers so they can be summed. */
    fun writeXlsx(sheets: List<Pair<String, List<List<String>>>>, out: File) {
        require(sheets.isNotEmpty()) { "Nothing to write" }
        val used = HashSet<String>()
        val names = sheets.mapIndexed { i, s ->
            var n = s.first.replace(Regex("[\\[\\]:*?/\\\\]"), " ").trim().take(31).ifEmpty { "Sheet${i + 1}" }
            while (!used.add(n.lowercase())) n = (n.take(27) + " " + (i + 1))
            n
        }
        Zip(out).use { z ->
            z.put("[Content_Types].xml", HEAD + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/>" +
                sheets.indices.joinToString("") { "<Override PartName=\"/xl/worksheets/sheet${it + 1}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>" } + "</Types>")
            z.put("_rels/.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\"><Relationship Id=\"rId1\" Type=\"$REL/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>")
            z.put("xl/workbook.xml", HEAD + "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"$REL\"><sheets>" +
                names.mapIndexed { i, n -> "<sheet name=\"${xml(n)}\" sheetId=\"${i + 1}\" r:id=\"rId${i + 1}\"/>" }.joinToString("") + "</sheets></workbook>")
            z.put("xl/_rels/workbook.xml.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\">" +
                sheets.indices.joinToString("") { "<Relationship Id=\"rId${it + 1}\" Type=\"$REL/worksheet\" Target=\"worksheets/sheet${it + 1}.xml\"/>" } + "</Relationships>")
            sheets.forEachIndexed { si, (_, rows) ->
                val sb = StringBuilder(HEAD).append("<worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>")
                rows.forEachIndexed { r, row ->
                    sb.append("<row r=\"${r + 1}\">")
                    row.forEachIndexed { c, v ->
                        if (v.isNotEmpty()) {
                            val ref = colName(c) + (r + 1)
                            val num = v.replace(",", "").takeIf { NUMBER.matches(it) && (v.count { ch -> ch == ',' } == 0 || Regex("^-?\\d{1,3}(,\\d{3})+(\\.\\d+)?$").matches(v)) }
                            if (num != null && !(num.length > 1 && num.startsWith("0") && !num.startsWith("0."))) sb.append("<c r=\"$ref\"><v>$num</v></c>")
                            else sb.append("<c r=\"$ref\" t=\"inlineStr\"><is><t xml:space=\"preserve\">").append(xml(v)).append("</t></is></c>")
                        }
                    }
                    sb.append("</row>")
                }
                sb.append("</sheetData></worksheet>")
                z.put("xl/worksheets/sheet${si + 1}.xml", sb.toString())
            }
        }
    }

    /** One slide per picture, each filling the slide. Slide size follows the first picture. */
    fun writePptx(slides: List<Picture>, out: File) {
        require(slides.isNotEmpty()) { "Nothing to write" }
        val emu = { pt: Float -> (pt * 12700).toLong() }
        val sw = emu(slides[0].widthPt); val sh = emu(slides[0].heightPt)
        val ns = "xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" xmlns:r=\"$REL\" xmlns:p=\"http://schemas.openxmlformats.org/presentationml/2006/main\""
        val emptyTree = "<p:spTree><p:nvGrpSpPr><p:cNvPr id=\"1\" name=\"\"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x=\"0\" y=\"0\"/><a:ext cx=\"0\" cy=\"0\"/><a:chOff x=\"0\" y=\"0\"/><a:chExt cx=\"0\" cy=\"0\"/></a:xfrm></p:grpSpPr>"
        Zip(out).use { z ->
            z.put("[Content_Types].xml", HEAD + "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">" +
                "<Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/>" +
                "<Default Extension=\"jpg\" ContentType=\"image/jpeg\"/>" +
                "<Override PartName=\"/ppt/presentation.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml\"/>" +
                "<Override PartName=\"/ppt/slideMasters/slideMaster1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml\"/>" +
                "<Override PartName=\"/ppt/slideLayouts/slideLayout1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml\"/>" +
                "<Override PartName=\"/ppt/theme/theme1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.theme+xml\"/>" +
                slides.indices.joinToString("") { "<Override PartName=\"/ppt/slides/slide${it + 1}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.presentationml.slide+xml\"/>" } + "</Types>")
            z.put("_rels/.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\"><Relationship Id=\"rId1\" Type=\"$REL/officeDocument\" Target=\"ppt/presentation.xml\"/></Relationships>")
            z.put("ppt/presentation.xml", HEAD + "<p:presentation $ns><p:sldMasterIdLst><p:sldMasterId id=\"2147483648\" r:id=\"rId1\"/></p:sldMasterIdLst><p:sldIdLst>" +
                slides.indices.joinToString("") { "<p:sldId id=\"${256 + it}\" r:id=\"rId${it + 3}\"/>" } +
                "</p:sldIdLst><p:sldSz cx=\"$sw\" cy=\"$sh\"/><p:notesSz cx=\"6858000\" cy=\"9144000\"/></p:presentation>")
            z.put("ppt/_rels/presentation.xml.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\"><Relationship Id=\"rId1\" Type=\"$REL/slideMaster\" Target=\"slideMasters/slideMaster1.xml\"/>" +
                "<Relationship Id=\"rId2\" Type=\"$REL/theme\" Target=\"theme/theme1.xml\"/>" +
                slides.indices.joinToString("") { "<Relationship Id=\"rId${it + 3}\" Type=\"$REL/slide\" Target=\"slides/slide${it + 1}.xml\"/>" } + "</Relationships>")
            z.put("ppt/slideMasters/slideMaster1.xml", HEAD + "<p:sldMaster $ns><p:cSld><p:bg><p:bgRef idx=\"1001\"><a:schemeClr val=\"bg1\"/></p:bgRef></p:bg>$emptyTree</p:spTree></p:cSld>" +
                "<p:clrMap bg1=\"lt1\" tx1=\"dk1\" bg2=\"lt2\" tx2=\"dk2\" accent1=\"accent1\" accent2=\"accent2\" accent3=\"accent3\" accent4=\"accent4\" accent5=\"accent5\" accent6=\"accent6\" hlink=\"hlink\" folHlink=\"folHlink\"/>" +
                "<p:sldLayoutIdLst><p:sldLayoutId id=\"2147483649\" r:id=\"rId1\"/></p:sldLayoutIdLst></p:sldMaster>")
            z.put("ppt/slideMasters/_rels/slideMaster1.xml.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\"><Relationship Id=\"rId1\" Type=\"$REL/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>" +
                "<Relationship Id=\"rId2\" Type=\"$REL/theme\" Target=\"../theme/theme1.xml\"/></Relationships>")
            z.put("ppt/slideLayouts/slideLayout1.xml", HEAD + "<p:sldLayout $ns type=\"blank\" preserve=\"1\"><p:cSld name=\"Blank\">$emptyTree</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>")
            z.put("ppt/slideLayouts/_rels/slideLayout1.xml.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\"><Relationship Id=\"rId1\" Type=\"$REL/slideMaster\" Target=\"../slideMasters/slideMaster1.xml\"/></Relationships>")
            z.put("ppt/theme/theme1.xml", THEME)
            slides.forEachIndexed { i, p ->
                // Fit the picture inside the slide, centred.
                val s = minOf(sw.toDouble() / emu(p.widthPt), sh.toDouble() / emu(p.heightPt))
                val cx = (emu(p.widthPt) * s).toLong(); val cy = (emu(p.heightPt) * s).toLong()
                z.put("ppt/slides/slide${i + 1}.xml", HEAD + "<p:sld $ns><p:cSld>$emptyTree<p:pic><p:nvPicPr><p:cNvPr id=\"2\" name=\"Page ${i + 1}\"/><p:cNvPicPr><a:picLocks noChangeAspect=\"1\"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>" +
                    "<p:blipFill><a:blip r:embed=\"rId2\"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x=\"${(sw - cx) / 2}\" y=\"${(sh - cy) / 2}\"/><a:ext cx=\"$cx\" cy=\"$cy\"/></a:xfrm>" +
                    "<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom></p:spPr></p:pic></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>")
                z.put("ppt/slides/_rels/slide${i + 1}.xml.rels", HEAD + "<Relationships xmlns=\"$PKG_REL\"><Relationship Id=\"rId1\" Type=\"$REL/slideLayout\" Target=\"../slideLayouts/slideLayout1.xml\"/>" +
                    "<Relationship Id=\"rId2\" Type=\"$REL/image\" Target=\"../media/image${i + 1}.jpg\"/></Relationships>")
                z.put("ppt/media/image${i + 1}.jpg", p.jpeg)
            }
        }
    }

    private val THEME: String by lazy {
        val fill = "<a:solidFill><a:schemeClr val=\"phClr\"/></a:solidFill>"
        val line = "<a:ln w=\"9525\" cap=\"flat\" cmpd=\"sng\" algn=\"ctr\">$fill<a:prstDash val=\"solid\"/></a:ln>"
        val fx = "<a:effectStyle><a:effectLst/></a:effectStyle>"
        fun c(n: String, v: String) = "<a:$n><a:srgbClr val=\"$v\"/></a:$n>"
        HEAD + "<a:theme xmlns:a=\"http://schemas.openxmlformats.org/drawingml/2006/main\" name=\"PDFMASTER\"><a:themeElements><a:clrScheme name=\"PDFMASTER\">" +
            "<a:dk1><a:sysClr val=\"windowText\" lastClr=\"000000\"/></a:dk1><a:lt1><a:sysClr val=\"window\" lastClr=\"FFFFFF\"/></a:lt1>" +
            c("dk2", "07111F") + c("lt2", "F5F7FB") + c("accent1", "5B5FEF") + c("accent2", "2563EB") + c("accent3", "22D3EE") + c("accent4", "8B5CF6") +
            c("accent5", "10B981") + c("accent6", "F59E0B") + c("hlink", "2563EB") + c("folHlink", "8B5CF6") + "</a:clrScheme>" +
            "<a:fontScheme name=\"PDFMASTER\"><a:majorFont><a:latin typeface=\"Calibri\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:majorFont>" +
            "<a:minorFont><a:latin typeface=\"Calibri\"/><a:ea typeface=\"\"/><a:cs typeface=\"\"/></a:minorFont></a:fontScheme>" +
            "<a:fmtScheme name=\"PDFMASTER\"><a:fillStyleLst>$fill$fill$fill</a:fillStyleLst><a:lnStyleLst>$line$line$line</a:lnStyleLst>" +
            "<a:effectStyleLst>$fx$fx$fx</a:effectStyleLst><a:bgFillStyleLst>$fill$fill$fill</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>"
    }
}
