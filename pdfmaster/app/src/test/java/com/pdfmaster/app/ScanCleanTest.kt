package com.pdfmaster.app

import android.graphics.Bitmap
import android.graphics.Color
import com.pdfmaster.app.engine.*
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import kotlin.math.hypot

@RunWith(RobolectricTestRunner::class)
class ScanCleanTest {
    @Before fun setUp() = TestDocs.init()

    /** A badly lit photo of a page: yellowish paper, strong shading from left to right, dark corner, grey text lines and a red logo. */
    private fun badScan(w: Int = 700, h: Int = 990): Bitmap {
        val px = IntArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            val shade = 1.0f - 0.38f * x / w - 0.25f * (1f - (hypot((x - w).toDouble(), y.toDouble()) / hypot(w.toDouble(), h.toDouble())).toFloat()).coerceIn(0f, 1f) * 0f
            val corner = (1f - 0.35f * (1f - (hypot(x.toDouble(), (h - y).toDouble()) / 250.0).toFloat().coerceIn(0f, 1f)))
            val k = shade * corner
            var r = 250f; var g = 243f; var b = 218f
            val inText = (y in 120..900) && (y % 30 in 8..16) && x in 70..(w - 70) && (x / 9) % 7 != 6
            val logo = x in 70..190 && y in 40..95
            if (inText) { r = 55f; g = 55f; b = 65f }
            if (logo) { r = 215f; g = 40f; b = 40f }
            val n = ((x * 31 + y * 17) % 7 - 3)
            px[y * w + x] = Color.rgb(((r * k) + n).toInt().coerceIn(0, 255), ((g * k) + n).toInt().coerceIn(0, 255), ((b * k) + n).toInt().coerceIn(0, 255))
        }
        return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }
    private fun lum(p: Int) = (0.299 * Color.red(p) + 0.587 * Color.green(p) + 0.114 * Color.blue(p)).toInt()

    @Test fun colour_whitensUnevenPaper_keepsTextDark_keepsLogoRed() {
        val src = badScan()
        assertTrue("the source paper really is dim and uneven", lum(src.getPixel(640, 500)) < 170 && Color.blue(src.getPixel(60, 960)) < 215)
        val c = ScanClean.clean(src, ScanClean.Mode.COLOUR)
        val paper = listOf(10 to 500, 640 to 500, 660 to 1000.coerceAtMost(985), 20 to 5, 400 to 940, 350 to 100).map { (x, y) -> c.getPixel(x, y) }
        paper.forEach { p -> assertTrue("paper should be white, was ${Integer.toHexString(p)}", Color.red(p) >= 245 && Color.green(p) >= 245 && Color.blue(p) >= 245) }
        val text = c.getPixel(300, 130 + 4)           // inside a text line
        assertTrue("text should be dark, was ${lum(text)}", lum(text) < 90)
        val logo = c.getPixel(120, 65)
        assertTrue("logo should stay red", Color.red(logo) > 170 && Color.green(logo) < 110)
    }

    @Test fun bw_givesOnlyBlackAndWhite_andGreyIsNeutral() {
        val src = badScan()
        val bw = ScanClean.clean(src, ScanClean.Mode.BW)
        val px = IntArray(bw.width * bw.height); bw.getPixels(px, 0, bw.width, 0, 0, bw.width, bw.height)
        val extreme = px.count { val l = lum(it); l <= 12 || l >= 243 }.toDouble() / px.size
        assertTrue("almost every pixel is pure black or white: $extreme", extreme > 0.995)
        assertTrue("paper white", px.count { lum(it) >= 243 } > px.size * 0.6)
        assertTrue("text black", lum(bw.getPixel(300, 134)) <= 12)
        assertTrue("logo became black text colour", lum(bw.getPixel(120, 65)) <= 12)
        val g = ScanClean.clean(src, ScanClean.Mode.GREY).getPixel(500, 300)
        assertTrue(Color.red(g) == Color.green(g) && Color.green(g) == Color.blue(g)); assertTrue(Color.red(g) >= 245)
    }

    @Test fun largeImagesAreScaledDown() {
        val c = ScanClean.clean(badScan(1400, 1980), ScanClean.Mode.GREY, maxSide = 1000)
        assertEquals(1000, maxOf(c.width, c.height)); assertTrue(kotlin.math.abs(c.width - 707) <= 2)
    }

    @Test fun cleanPage_inA4_withOptionalRetypedText() {
        val clean = ScanClean.clean(badScan(), ScanClean.Mode.BW)
        val lines = listOf(OcrLine("Invoice number INV-0042 for Maria Shikongo", 0.10f, 0.126f, 0.86f, 0.146f, 0.97f),
            OcrLine("N$ 1,250.50 due 15 March 2027", 0.10f, 0.156f, 0.62f, 0.176f, 0.95f), OcrLine("smudged hand written note", 0.10f, 0.216f, 0.60f, 0.236f, 0.31f))
        val out = File(TestDocs.dir, "scan-typed.pdf")
        ScanPdfWriter(TestDocs.context, ScanClean.Mode.BW, typed = true).use { w -> w.add(ScanPage(clean, lines)); w.add(ScanPage(clean, emptyList())); assertEquals(2, w.retypedLines); assertEquals(1, w.skippedLines); w.save(out, "Test scan") }
        val t = PdfOps.pageTexts(out)
        assertEquals(2, t.size)
        assertTrue(t[0].contains("Invoice number INV-0042 for Maria Shikongo")); assertTrue(t[0].contains("N$ 1,250.50 due 15 March 2027"))
        assertFalse("an unsure line is not retyped", t[0].contains("smudged")); assertTrue(t[1].isBlank())
        com.tom_roush.pdfbox.pdmodel.PDDocument.load(out).use { d -> assertEquals(595f, d.getPage(0).mediaBox.width, 1f); assertEquals(842f, d.getPage(0).mediaBox.height, 1f); assertEquals("Test scan", d.documentInformation.title) }
        // The old pixels under a retyped line are now blank paper in the page picture.
        val pic = PdfOps.extractImages(out, File(TestDocs.dir, "st"), "s")[0]
        val b = android.graphics.BitmapFactory.decodeFile(pic.absolutePath)
        assertTrue(lum(b.getPixel((0.4f * b.width).toInt(), (0.136f * b.height).toInt())) >= 240)     // retyped line: painted out
                // Without retyping, the same recognised text is only an invisible search layer and the picture is untouched.
        val inv = File(TestDocs.dir, "scan-invisible.pdf")
        ScanPdfWriter(TestDocs.context, ScanClean.Mode.BW, typed = false).use { w -> w.add(ScanPage(clean, lines)); assertEquals(0, w.retypedLines); w.save(inv) }
        assertTrue(PdfOps.pageTexts(inv)[0].contains("Invoice number INV-0042"))
        val keep = File("build/converted").apply { mkdirs() }
        PdfBoxRasterizer(out).use { r -> r.render(0, 900).compress(Bitmap.CompressFormat.PNG, 100, File(keep, "scan-typed.png").outputStream()) }
        File(keep, "scan-source.png").outputStream().use { badScan().compress(Bitmap.CompressFormat.PNG, 100, it) }
        File(keep, "scan-clean.png").outputStream().use { ScanClean.clean(badScan(), ScanClean.Mode.COLOUR).compress(Bitmap.CompressFormat.PNG, 100, it) }
    }
}
