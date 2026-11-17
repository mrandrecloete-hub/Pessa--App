import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.pdfmaster.app.engine.*
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.awt.image.BufferedImage
import java.io.File
import java.util.zip.ZipFile
import kotlin.math.hypot

/** The shared document engine running on the desktop (Windows, macOS, Linux) with real PDFBox and OpenCV. */
class EngineDesktopTest {
    private val ctx = Context()
    private val dir = File(System.getProperty("java.io.tmpdir"), "pdfmaster-desktop-tests-${System.nanoTime()}").apply { mkdirs() }
    private val keep = File("build/outputs").apply { mkdirs() }
    private fun fixture(path: String): File = File(dir, path.replace('/', '_')).also { f -> javaClass.classLoader.getResourceAsStream(path)!!.use { i -> f.outputStream().use { i.copyTo(it) } } }

    private fun textPdf(name: String, pages: Int): File {
        val f = File(dir, "$name.pdf")
        PDDocument().use { doc ->
            for (i in 1..pages) { val p = PDPage(if (i == 2) PDRectangle(PDRectangle.LETTER.height, PDRectangle.LETTER.width) else PDRectangle.A4); doc.addPage(p)
                PDPageContentStream(doc, p).use { cs -> cs.beginText(); cs.setFont(PDType1Font.HELVETICA_BOLD, 20f); cs.newLineAtOffset(60f, 700f); cs.showText("Page $i of sample $name"); cs.endText()
                    cs.beginText(); cs.setFont(PDType1Font.HELVETICA, 12f); cs.newLineAtOffset(60f, 660f); cs.showText("Invoice INV-00$i for Maria Shikongo, N$ 1,25$i.50"); cs.endText() } }
            doc.documentInformation.author = "Test Author"; doc.save(f)
        }
        return f
    }
    private fun out(n: String) = File(dir, n).also { it.delete() }
    private fun texts(f: File, pw: String? = null) = PdfOps.pageTexts(f, pw)

    @Test fun pdfTools_mergeSplitRotateEncrypt() {
        val a = textPdf("A", 3); val b = textPdf("B", 2)
        val m = out("m.pdf"); PdfOps.merge(listOf(a, b), m); val t = texts(m)
        assertEquals(5, t.size); assertTrue(t[0].contains("Page 1 of sample A")); assertTrue(t[4].contains("Page 2 of sample B"))
        val parts = PdfOps.splitEvery(m, 2, File(dir, "split"), "M"); assertEquals(listOf(2, 2, 1), parts.map { pageCount(it) })
        val ex = out("ex.pdf"); PdfOps.extractPages(m, listOf(4, 0), ex); assertTrue(texts(ex)[0].contains("sample B")); assertEquals(2, pageCount(ex))
        val rot = out("rot.pdf"); PdfOps.rotate(a, 90, setOf(0), rot); PDDocument.load(rot).use { assertEquals(listOf(90, 0, 0), it.pages.map { p -> p.rotation }) }
        val enc = out("enc.pdf"); PdfOps.encrypt(a, "s3cret", "", Permissions(canPrint = false), enc)
        assertTrue(needsPassword(enc)); assertThrows(PasswordRequiredException::class.java) { openPdf(enc, "wrong").close() }
        assertTrue(texts(enc, "s3cret")[1].contains("Page 2")); val dec = out("dec.pdf"); PdfOps.removePassword(enc, "s3cret", dec); assertFalse(needsPassword(dec))
        val wm = out("wm.pdf"); PdfOps.addWatermark(ctx, a, "CONFIDENTIAL", wm); assertTrue(texts(wm).all { it.replace(Regex("\\s"), "").contains("CONFIDENTIAL") })
        val pn = out("pn.pdf"); PdfOps.stampText(ctx, a, "Page {n} of {total}", Anchor.BOTTOM_CENTER, pn); assertTrue(texts(pn)[2].contains("Page 3 of 3"))
        val st = out("strip.pdf"); PdfOps.stripMetadata(a, st); assertNull(PdfOps.info(st).author)
    }

    @Test fun compress_andImages() {
        val rnd = java.util.Random(7); val bi = BufferedImage(2400, 3200, BufferedImage.TYPE_INT_RGB)
        for (y in 0 until 3200) for (x in 0 until 2400) bi.setRGB(x, y, (rnd.nextInt(256) shl 16) or (rnd.nextInt(256) shl 8) or (((x / 40 + y / 40) * 37) and 255))
        val f = out("img.pdf"); PDDocument().use { d -> val p = PDPage(PDRectangle.A4); d.addPage(p); val im = LosslessFactory.createFromImage(d, bi)
            PDPageContentStream(d, p).use { cs -> cs.drawImage(im, 40f, 100f, 500f, 667f); cs.beginText(); cs.setFont(PDType1Font.HELVETICA, 14f); cs.newLineAtOffset(60f, 60f); cs.showText("Caption under the picture"); cs.endText() }; d.save(f) }
        val c = out("small.pdf"); val r = PdfOps.compress(f, c, 1500, 0.6f)
        println("DESKTOP compress ${r.before} -> ${r.after} (${r.savedPercent}%)")
        assertEquals(1, r.imagesChanged); assertTrue(r.after < r.before / 2); assertTrue(texts(c)[0].contains("Caption under the picture"))
        val imgs = PdfOps.extractImages(f, File(dir, "imgs"), "x"); assertEquals(1, imgs.size)
        val back = out("back.pdf"); PdfOps.imagesToPdf(imgs, back); assertEquals(1, pageCount(back))
    }

    @Test fun officeFilesToPdf_andBack() {
        val docx = DocImport.read(fixture("fixtures/report.docx")); assertTrue(docx.blocks.filterIsInstance<TableBlock>().isNotEmpty())
        for ((name, ext, must) in listOf(Triple("fixtures/report.docx", "docx", "Quarterly Sales Report"), Triple("fixtures/stock.xlsx", "xlsx", "Cooking oil 2L"), Triple("fixtures/deck.pptx", "pptx", "Pitch Deck"),
            Triple("fixtures/page.html", "html", "Web Page Title"), Triple("fixtures/letter.rtf", "rtf", "Second page heading"))) {
            val o = out("$ext.pdf"); DocImport.toPdf(ctx, fixture(name), o, ext); assertTrue("$ext: $must", texts(o).joinToString(" ").replace(Regex("\\s+"), " ").contains(must))
        }
        val src = fixture("fixtures/report.pdf")
        val w = out("r.docx"); PdfExport.toDocx(src, w); assertTrue(ZipFile(w).use { z -> z.getInputStream(z.getEntry("word/document.xml")).readBytes().toString(Charsets.UTF_8).contains("Annual Report 2026") })
        val back = DocImport.read(w, "docx").blocks.filterIsInstance<TableBlock>().first().rows; assertEquals(listOf("Branch", "Units", "Revenue"), back[0])
        val x = out("r.xlsx"); PdfExport.toXlsx(src, x); assertTrue(DocImport.read(x, "xlsx").blocks.filterIsInstance<TableBlock>().isNotEmpty())
        PdfBoxRasterizer(src).use { r ->
            val pngs = PdfExport.toImages(src, r, File(dir, "pages"), "r", png = true, dpi = 72).files; assertEquals(2, pngs.size)
            val b = BitmapFactory.decodeFile(pngs[0].absolutePath)!!; assertTrue(Math.abs(b.width - 595) <= 2)
            val tif = out("r.tiff"); PdfExport.toTiff(src, r, tif, dpi = 72); assertArrayEquals(byteArrayOf(0x49, 0x49, 42, 0), tif.readBytes().copyOf(4))
            val pp = out("r.pptx"); PdfExport.toPptx(src, r, pp); assertEquals(2, DocImport.read(pp, "pptx").blocks.count { it is ImageBlock })
        }
    }

    @Test fun forms_readAndFill() {
        val f = fixture("fixtures/form.pdf"); assertEquals(setOf("fullName", "email", "agree", "plan", "contact"), PdfForms.read(f).map { it.name }.toSet())
        val o = out("filled.pdf"); val problems = PdfForms.fill(f, mapOf("fullName" to "Maria Shikongo", "agree" to "true", "plan" to "Premium"), o)
        assertTrue(problems.toString(), problems.isEmpty()); val v = PdfForms.read(o).associate { it.name to it.value }; assertEquals("Maria Shikongo", v["fullName"]); assertEquals("true", v["agree"]); assertEquals("Premium", v["plan"])
    }

    // ---------------- Professional Document Restoration on the desktop (OpenCV desktop build) ----------------
    private fun photo(n: String): Bitmap = javaClass.classLoader.getResourceAsStream("photos/$n.jpg")!!.use { BitmapFactory.decodeStream(it)!! }
    private fun lum(p: Int) = 0.299 * Color.red(p) + 0.587 * Color.green(p) + 0.114 * Color.blue(p)
    private fun paperOf(b: Bitmap): Double { val v = ArrayList<Double>(); for ((fx, fy) in listOf(0.04 to 0.04, 0.5 to 0.03, 0.96 to 0.05, 0.04 to 0.5, 0.96 to 0.5, 0.05 to 0.96, 0.5 to 0.97)) v.add(lum(b.getPixel((fx * b.width).toInt().coerceIn(5, b.width - 6), (fy * b.height).toInt().coerceIn(5, b.height - 6)))); return v.average() }

    @Test fun restoration_findsPage_cleansPaper_keepsInk() {
        val corners = JSONObject(javaClass.classLoader.getResourceAsStream("photos/corners.json")!!.readBytes().toString(Charsets.UTF_8))
        for (n in listOf("photo1", "photo2", "photo3")) {
            val src = photo(n); val d = Restore.detect(src); assertTrue("$n found", d.found)
            val t = corners.getJSONArray(n); var worst = 0.0
            for (i in 0..3) worst = maxOf(worst, hypot(d.quad[2 * i] - t.getJSONArray(i).getDouble(0), d.quad[2 * i + 1] - t.getJSONArray(i).getDouble(1)))
            assertTrue("$n corners within 3 percent (${worst * 100})", worst < 0.03)
            for (mode in listOf(Restore.Mode.AUTO, Restore.Mode.CLEAN, Restore.Mode.BW, Restore.Mode.SIGNATURE)) {
                val r = Restore.process(src, d, Restore.Params(mode, 0.6f), 1800)
                File(keep, "${n}_${mode.name}.png").let { f -> r.enhanced.compress(Bitmap.CompressFormat.PNG, 100, f.outputStream()) }
                assertTrue("$n $mode paper clean (${paperOf(r.enhanced)})", paperOf(r.enhanced) >= if (mode == Restore.Mode.SIGNATURE) 238.0 else 248.0)
                var dark = 0; val w = r.enhanced.width; val h = r.enhanced.height; val px = IntArray(w * h); r.enhanced.getPixels(px, 0, w, 0, 0, w, h); for (p in px) if (lum(p) < 110) dark++
                assertTrue("$n $mode text kept", dark > w * h * 0.0015)
            }
        }
        // Stamp kept in colour.
        val src = photo("photo1"); val r = Restore.process(src, Restore.detect(src), Restore.Params(Restore.Mode.CLEAN, 0.6f), 1800)
        fun red(p: Int) = Color.red(p) - Color.green(p) > 70 && Color.red(p) > 120
        fun count(b: Bitmap): Int { val px = IntArray(b.width * b.height); b.getPixels(px, 0, b.width, 0, 0, b.width, b.height); return px.count { red(it) } }
        val before = count(r.geometry!!); val after = count(r.enhanced); assertTrue("stamp kept ($after of $before)", before > 800 && after > before * 0.6)
    }

    @Test fun restoration_savesMultiPageSearchablePdf_atFullQuality() {
        val pages = listOf("photo1", "photo2", "photo3").map { photo(it) }
        val f = out("restored.pdf")
        ScanPdfWriter(ctx, ScanClean.Mode.COLOUR, typed = false, a4 = true).use { w ->
            for (p in pages) { val r = Restore.process(p, Restore.detect(p), Restore.Params(Restore.Mode.AUTO, 0.6f), 3000, withGeometry = false)
                w.add(ScanPage(r.enhanced, listOf(OcrLine("Quotation 2026/0417 for Mr Johannes Shikongo", 0.1f, 0.05f, 0.8f, 0.07f, 0.95f))), if (r.report.chosen == Restore.Mode.BW) ScanClean.Mode.BW else ScanClean.Mode.COLOUR) }
            w.save(f, "Restored")
        }
        assertEquals(3, pageCount(f)); PDDocument.load(f).use { d -> d.pages.forEach { assertEquals(595f, it.mediaBox.width, 1f) } }
        assertTrue(texts(f).all { it.contains("Quotation 2026/0417") })                         // invisible search layer
        val img = PdfOps.extractImages(f, File(dir, "ri"), "r")[0]; val b = BitmapFactory.decodeFile(img.absolutePath)!!
        assertTrue("full detail of the photo: at least 1700 px, was ${maxOf(b.width, b.height)}", maxOf(b.width, b.height) >= 1700); assertTrue(lum(b.getPixel(b.width / 2, 8)) > 235)
    }
}
