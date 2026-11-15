package com.pdfmaster.app

import com.pdfmaster.app.engine.*
import com.tom_roush.pdfbox.pdmodel.PDDocument
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.util.zip.ZipFile

@RunWith(RobolectricTestRunner::class)
class ConvertTest {
    @Before fun setUp() = TestDocs.init()

    private fun fixture(name: String): File {
        val f = TestDocs.out("fx-$name")
        javaClass.classLoader!!.getResourceAsStream("fixtures/$name")!!.use { i -> f.outputStream().use { i.copyTo(it) } }
        return f
    }
    /** Converted files are also copied here so tools/verify_outputs.py can open them with other software. */
    private val keep = File("build/converted").apply { mkdirs() }
    private fun kept(name: String) = File(keep, name).also { it.delete() }
    private fun allText(f: File) = PdfOps.pageTexts(f).joinToString("\n")
    private fun zipText(f: File, entry: String) = ZipFile(f).use { z -> z.getInputStream(z.getEntry(entry)).readBytes().toString(Charsets.UTF_8) }

    // ---------------- Office and text files to PDF ----------------

    @Test fun docx_toPdf_keepsTextTablePictureAndPageBreak() {
        val out = kept("report-from-docx.pdf")
        val notes = DocImport.toPdf(TestDocs.context, fixture("report.docx"), out)
        assertTrue(notes.isNotEmpty())
        val pages = PdfOps.pageTexts(out)
        assertTrue("page break kept", pages.size >= 2)
        val t = pages.joinToString(" ").replace(Regex("\\s+"), " ")
        for (s in listOf("Quarterly Sales Report", "Summary", "18 percent", "mainly in Windhoek", "\u2022 First bullet point", "Oshakati", "N$ 152,500.50", "Ünïcödé čšž Ελληνικά Кириллица"))
            assertTrue("missing: $s", t.contains(s))
        assertTrue(pages[0].contains("Quarterly Sales Report")); assertFalse(pages[0].contains("Appendix")); assertTrue(pages[1].contains("Appendix"))
        assertEquals("the picture is embedded", 1, PdfOps.extractImages(out, File(TestDocs.dir, "dimg"), "d").size)
        // Reading the blocks directly: bold run and centred paragraph are recognised.
        val d = DocImport.read(fixture("report.docx"))
        val paras = d.blocks.filterIsInstance<Para>()
        assertTrue(paras.any { p -> p.runs.any { it.text == "18 percent" && it.bold } })
        assertTrue(paras.any { p -> p.runs.any { it.text == "mainly in Windhoek" && it.italic } })
        assertTrue(paras.any { it.plain == "Centred closing remark" && it.align == Align.CENTER })
        assertEquals(2, paras.count { it.bullet != null })
        assertEquals(listOf("Branch", "Units", "Revenue"), d.blocks.filterIsInstance<TableBlock>().single().rows[0])
    }

    @Test fun xlsx_toPdf_keepsValuesDatesAndSheets() {
        val d = DocImport.read(fixture("stock.xlsx"))
        val tables = d.blocks.filterIsInstance<TableBlock>()
        assertEquals(2, tables.size)
        assertEquals(listOf("Maize meal 10kg", "30", "120.5", "2026-03-14"), tables[0].rows[1])
        assertEquals("TRUE", tables[1].rows.last()[0])
        val out = kept("stock-from-xlsx.pdf"); DocImport.toPdf(TestDocs.context, fixture("stock.xlsx"), out)
        val t = allText(out)
        for (s in listOf("Stock", "Notes", "Cooking oil 2L", "75.25", "2026-04-02", "Checked by", "Maria")) assertTrue("missing: $s", t.contains(s))
        assertEquals(2, pageCount(out))
    }

    @Test fun pptx_toPdf_oneSlidePerPage() {
        val out = kept("deck-from-pptx.pdf"); DocImport.toPdf(TestDocs.context, fixture("deck.pptx"), out)
        val pages = PdfOps.pageTexts(out)
        assertEquals(3, pages.size)
        assertTrue(pages[0].contains("Pitch Deck")); assertTrue(pages[0].contains("Investor update 2026"))
        assertTrue(pages[1].contains("Revenue up 18 percent")); assertTrue(pages[1].contains("Two new branches")); assertTrue(pages[2].contains("Chart"))
        assertEquals(1, PdfOps.extractImages(out, File(TestDocs.dir, "pimg"), "p").size)
        PDDocument.load(out).use { assertTrue("slide shaped page", it.getPage(0).mediaBox.width > it.getPage(0).mediaBox.height) }
    }

    @Test fun html_rtf_txt_toPdf() {
        val h = kept("page-from-html.pdf"); DocImport.toPdf(TestDocs.context, fixture("page.html"), h)
        val ht = allText(h)
        for (s in listOf("Web Page Title", "First bold and italic & an entity", "€", "Apple", "1. One", "2. Two", "Anna", "31", "Centred line")) assertTrue("missing: $s", ht.replace("\n", " ").contains(s))
        assertFalse("script and style are not text", ht.contains("not text") || ht.contains("color:red"))

        val blocks = Rtf.parse(fixture("letter.rtf").readText(Charsets.ISO_8859_1))
        val ps = blocks.filterIsInstance<Para>()
        assertEquals("Dear Maria,", ps[0].plain); assertTrue(ps[0].runs.any { it.text == "Maria" && it.bold })
        assertEquals("Thank you for your order of 3 café tables — delivered today.", ps[1].plain)
        assertTrue(ps[1].runs.any { it.text == "today" && it.underline }); assertTrue(blocks.any { it is PageBreak })
        assertFalse(ps.any { it.plain.contains("Hidden title") || it.plain.contains("Arial") })
        val r = kept("letter-from-rtf.pdf"); DocImport.toPdf(TestDocs.context, fixture("letter.rtf"), r)
        assertEquals(2, pageCount(r)); assertTrue(PdfOps.pageTexts(r)[1].contains("Second page heading"))

        val txt = TestDocs.out("notes.txt"); txt.writeText((1..120).joinToString("\n") { "Line number $it of the plain text file" })
        val p = kept("notes-from-txt.pdf"); DocImport.toPdf(TestDocs.context, txt, p)
        assertTrue(pageCount(p) >= 2); assertTrue(allText(p).contains("Line number 120 of the plain text file"))

        assertThrows(IllegalArgumentException::class.java) { DocImport.read(txt, "doc") }
    }

    // ---------------- PDF to other formats (PDF fixture made by reportlab) ----------------

    @Test fun pdf_toDocx_editableTextAndTable() {
        val out = kept("report.docx"); val r = PdfExport.toDocx(fixture("report.pdf"), out)
        assertTrue(r.notes.isNotEmpty())
        val x = zipText(out, "word/document.xml")
        assertTrue(x.contains("Annual Report 2026")); assertTrue(x.contains("<w:tbl>")); assertTrue(x.contains("<w:pageBreakBefore/>"))
        // Reading it back with our own Word reader gives the same content.
        val back = DocImport.read(out, "docx")
        val t = back.blocks.filterIsInstance<Para>().joinToString("\n") { it.plain }
        assertTrue(t.contains("The company opened two branches and increased revenue to N$ 4,250,000.75 by 31 December 2026. This paragraph is long enough to wrap over more than one line"))
        assertTrue(t.contains("Second page"))
        val table = back.blocks.filterIsInstance<TableBlock>().first().rows
        assertEquals(listOf("Branch", "Units", "Revenue"), table[0]); assertEquals(listOf("Walvis Bay", "640", "98,310.00"), table[3])
        assertTrue("title is large", back.blocks.filterIsInstance<Para>().first { it.plain == "Annual Report 2026" }.runs[0].size >= 16f)
    }

    @Test fun pdf_toXlsx_andCsv_putTableInColumns() {
        val x = kept("table.xlsx"); PdfExport.toXlsx(TestDocs.table(), x)
        val rows = DocImport.read(x, "xlsx").blocks.filterIsInstance<TableBlock>().single().rows
        assertEquals(listOf("Item", "Qty", "Price", "Total"), rows[0])
        assertEquals(listOf("Maize meal 10kg", "3", "120", "360"), rows[1]) // numbers are stored as numbers
        assertTrue(zipText(x, "xl/worksheets/sheet1.xml").contains("<v>75.50</v>"))
        val c = kept("table.csv"); PdfExport.toCsv(TestDocs.table(), c)
        assertTrue(c.readText().contains("Sugar 2.5kg,10,48.25,482.50"))
        val x2 = kept("report.xlsx"); PdfExport.toXlsx(fixture("report.pdf"), x2)
        val r2 = DocImport.read(x2, "xlsx").blocks.filterIsInstance<TableBlock>()
        assertEquals(2, r2.size); assertTrue(r2[0].rows.any { it.containsAll(listOf("Oshakati", "800")) })
    }

    @Test fun pdf_toHtml_rtf_txt() {
        val src = fixture("report.pdf")
        val h = kept("report.html"); PdfExport.toHtml(src, h); val ht = h.readText()
        assertTrue(ht.contains("<h1>Annual Report 2026</h1>")); assertTrue(ht.contains("<td>Windhoek</td>")); assertTrue(ht.contains("id=\"page2\""))
        val r = kept("report.rtf"); PdfExport.toRtf(src, r)
        val back = Rtf.parse(r.readText(Charsets.ISO_8859_1)).filterIsInstance<Para>().joinToString("\n") { it.plain }
        assertTrue(back.contains("Annual Report 2026")); assertTrue(back.contains("info@example.com"))
        val t = kept("report.txt"); PdfExport.toText(src, t)
        assertTrue(t.readText().contains("Signed by the directors on 15 January 2027"))
    }

    @Test fun pdf_toImages_tiff_pptx_docxExact() {
        val src = fixture("report.pdf")
        PdfBoxRasterizer(src).use { ras ->
            val imgs = PdfExport.toImages(src, ras, File(TestDocs.dir, "pages"), "report", png = true, dpi = 72).files
            assertEquals(2, imgs.size)
            val b = android.graphics.BitmapFactory.decodeFile(imgs[0].absolutePath); assertTrue(kotlin.math.abs(b.width - 595) <= 2 && kotlin.math.abs(b.height - 842) <= 2)
            val jpg = PdfExport.toImages(src, ras, File(TestDocs.dir, "pagesj"), "report", png = false, dpi = 72, pages = listOf(1)).files
            assertEquals(1, jpg.size); assertTrue(jpg[0].name.endsWith("page 2.jpg"))
            val tif = kept("report.tiff"); PdfExport.toTiff(src, ras, tif, dpi = 72)
            val head = tif.readBytes().copyOf(4); assertArrayEquals(byteArrayOf(0x49, 0x49, 42, 0), head)
            val pp = kept("report.pptx"); PdfExport.toPptx(src, ras, pp)
            ZipFile(pp).use { z -> assertNotNull(z.getEntry("ppt/slides/slide2.xml")); assertNotNull(z.getEntry("ppt/media/image2.jpg")); assertNull(z.getEntry("ppt/slides/slide3.xml")) }
            val back = DocImport.read(pp, "pptx"); assertEquals(2, back.blocks.count { it is ImageBlock })
            val dx = kept("report-exact.docx"); PdfExport.toDocxExact(src, ras, dx)
            assertEquals(2, DocImport.read(dx, "docx").blocks.count { it is ImageBlock })
        }
    }

    @Test fun packBits_roundTrips() {
        val src = ByteArray(1000) { if (it < 300) 7 else if (it < 600) (it % 251).toByte() else if (it % 2 == 0) 1 else 1 }
        val out = java.io.ByteArrayOutputStream(); PdfExport.packBits(src, out)
        val p = out.toByteArray(); val dec = java.io.ByteArrayOutputStream(); var i = 0
        while (i < p.size) { val n = p[i].toInt(); i++; if (n >= 0) { dec.write(p, i, n + 1); i += n + 1 } else if (n != -128) { repeat(1 - n) { dec.write(p[i].toInt()) }; i++ } }
        assertArrayEquals(src, dec.toByteArray()); assertTrue(p.size < src.size)
    }
}
