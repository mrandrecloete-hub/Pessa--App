package com.pdfmaster.app

import com.pdfmaster.app.engine.*
import com.tom_roush.pdfbox.pdmodel.PDDocument
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

@RunWith(RobolectricTestRunner::class)
class PdfOpsTest {
    @Before fun setUp() = TestDocs.init()

    private fun texts(f: File, pw: String? = null) = PdfOps.pageTexts(f, pw)

    @Test fun parsePages_readsListsAndRanges() {
        assertEquals(listOf(0, 1, 2, 4, 7, 8, 9), parsePages("1-3, 5, 8-", 10))
        assertThrows(IllegalArgumentException::class.java) { parsePages("0", 5) }
        assertThrows(IllegalArgumentException::class.java) { parsePages("4-9", 5) }
        assertThrows(IllegalArgumentException::class.java) { parsePages("abc", 5) }
    }

    @Test fun merge_keepsAllPagesInOrder() {
        val a = TestDocs.text("A", 3); val b = TestDocs.text("B", 2)
        val out = TestDocs.out("merged.pdf")
        PdfOps.merge(listOf(a, b), out)
        val t = texts(out)
        assertEquals(5, t.size)
        assertTrue(t[0].contains("Page 1 of sample A")); assertTrue(t[2].contains("Page 3 of sample A"))
        assertTrue(t[3].contains("Page 1 of sample B")); assertTrue(t[4].contains("Page 2 of sample B"))
    }

    @Test fun split_extract_delete_reorder() {
        val a = TestDocs.text("S", 5)
        val parts = PdfOps.splitEvery(a, 2, File(TestDocs.dir, "split"), "S")
        assertEquals(listOf(2, 2, 1), parts.map { pageCount(it) })
        assertTrue(texts(parts[2])[0].contains("Page 5 of sample S"))

        val ex = TestDocs.out("ex.pdf"); PdfOps.extractPages(a, listOf(4, 0), ex)
        assertEquals(listOf("Page 5", "Page 1"), texts(ex).map { Regex("Page \\d").find(it)!!.value })

        val del = TestDocs.out("del.pdf"); PdfOps.deletePages(a, setOf(1, 2), del)
        assertEquals(listOf("Page 1", "Page 4", "Page 5"), texts(del).map { Regex("Page \\d").find(it)!!.value })
        assertThrows(IllegalArgumentException::class.java) { PdfOps.deletePages(a, (0..4).toSet(), TestDocs.out("none.pdf")) }

        val re = TestDocs.out("re.pdf"); PdfOps.reorder(a, listOf(2, 2, 0), re)
        assertEquals(listOf("Page 3", "Page 3", "Page 1"), texts(re).map { Regex("Page \\d").find(it)!!.value })
        assertEquals(5, pageCount(a)) // original untouched
    }

    @Test fun rotate_changesOnlyChosenPages() {
        val a = TestDocs.text("R", 3); val out = TestDocs.out("rot.pdf")
        PdfOps.rotate(a, 90, setOf(0, 2), out)
        PDDocument.load(out).use { d -> assertEquals(listOf(90, 0, 90), d.pages.map { it.rotation }) }
        val out2 = TestDocs.out("rot2.pdf"); PdfOps.rotate(out, 270, null, out2)
        PDDocument.load(out2).use { d -> assertEquals(listOf(0, 270, 0), d.pages.map { it.rotation }) }
    }

    @Test fun watermark_and_pageNumbers_addRealText_onRotatedPagesToo() {
        val a = TestDocs.text("W", 3); val rot = TestDocs.out("wrot.pdf"); PdfOps.rotate(a, 90, setOf(1), rot)
        val wm = TestDocs.out("wm.pdf"); PdfOps.addWatermark(TestDocs.context, rot, "CONFIDENTIAL", wm)
        // Diagonal text is read back in pieces by the text reader, so compare without white space.
        texts(wm).forEachIndexed { i, x -> assertTrue("page ${i + 1}: " + x.replace("\n", "|"), x.replace(Regex("\\s"), "").contains("CONFIDENTIAL")) }
        val pn = TestDocs.out("pn.pdf"); PdfOps.stampText(TestDocs.context, wm, "Page {n} of {total}", Anchor.BOTTOM_CENTER, pn)
        val t = texts(pn)
        assertTrue(t[0].contains("Page 1 of 3")); assertTrue(t[2].contains("Page 3 of 3"))
        val hd = TestDocs.out("hd.pdf"); PdfOps.stampText(TestDocs.context, pn, "Čompany Ünïcode header", Anchor.TOP_LEFT, hd, skipFirst = true)
        assertFalse(texts(hd)[0].contains("header")); assertTrue(texts(hd)[1].contains("Čompany Ünïcode header"))
    }

    @Test fun encrypt_isVerified_andPasswordCanBeRemoved() {
        val a = TestDocs.text("E", 2); val enc = TestDocs.out("enc.pdf")
        PdfOps.encrypt(a, "s3cret", "", Permissions(canPrint = false, canCopy = false), enc)
        assertTrue(needsPassword(enc))
        assertThrows(PasswordRequiredException::class.java) { openPdf(enc, "wrong").close() }
        openPdf(enc, "s3cret").use { d ->
            assertTrue(d.isEncrypted); assertFalse(d.currentAccessPermission.canPrint()); assertFalse(d.currentAccessPermission.canExtractContent())
        }
        assertTrue(texts(enc, "s3cret")[1].contains("Page 2 of sample E"))
        // The plain text must not be readable in the raw file.
        assertFalse(enc.readBytes().toString(Charsets.ISO_8859_1).contains("Shikongo"))
        val dec = TestDocs.out("dec.pdf"); PdfOps.removePassword(enc, "s3cret", dec)
        assertFalse(needsPassword(dec)); assertEquals(2, pageCount(dec))
        // Operations on protected files work when the password is given.
        val m = TestDocs.out("mergeenc.pdf"); PdfOps.merge(listOf(enc, a), m, mapOf(enc to "s3cret"))
        assertEquals(4, pageCount(m)); assertFalse(needsPassword(m))
    }

    @Test fun metadata_readStripSet() {
        val a = TestDocs.text("M", 1)
        val i = PdfOps.info(a); assertEquals("Sample M", i.title); assertEquals("Test Author", i.author); assertEquals(1, i.pages)
        val s = TestDocs.out("strip.pdf"); PdfOps.stripMetadata(a, s)
        val j = PdfOps.info(s); assertNull(j.title); assertNull(j.author); assertFalse(j.hasXmpMetadata)
        assertFalse(s.readBytes().toString(Charsets.ISO_8859_1).contains("Test Author"))
        val n = TestDocs.out("setmeta.pdf"); PdfOps.setMetadata(s, n, "New title", "Andre", null, "a, b")
        assertEquals("New title", PdfOps.info(n).title); assertEquals("a, b", PdfOps.info(n).keywords)
    }

    @Test fun compress_shrinksPictures_keepsText() {
        val a = TestDocs.withImage(); val out = TestDocs.out("small.pdf")
        val r = PdfOps.compress(a, out, CompressLevel.BALANCED.maxImageSide, CompressLevel.BALANCED.jpegQuality)
        println("compress: ${r.before} -> ${r.after} (${r.savedPercent}%)")
        assertEquals(1, r.imagesChanged); assertTrue(r.after < r.before / 2)
        assertTrue(texts(out)[0].contains("Caption under the picture"))
        // A text only file cannot shrink, so the output equals the input and is still valid.
        val t = TestDocs.text("C", 2); val o2 = TestDocs.out("small2.pdf")
        val r2 = PdfOps.compress(t, o2, 1000, 0.5f)
        assertTrue(r2.after <= r2.before); assertEquals(2, pageCount(o2))
    }

    @Test fun images_extractAndBuildPdf() {
        val a = TestDocs.withImage()
        val imgs = PdfOps.extractImages(a, File(TestDocs.dir, "imgs"), "image")
        assertEquals(1, imgs.size); assertTrue(imgs[0].length() > 10_000)
        val png = File(TestDocs.dir, "p.png").also { f -> f.outputStream().use { TestDocs.noisyBitmap(300, 200).compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) } }
        val out = TestDocs.out("fromimages.pdf"); PdfOps.imagesToPdf(listOf(imgs[0], png), out)
        assertEquals(2, pageCount(out))
        val a4 = TestDocs.out("fromimagesA4.pdf"); PdfOps.imagesToPdf(listOf(png), a4, fitA4 = true)
        PDDocument.load(a4).use { assertEquals(842f, it.getPage(0).mediaBox.width, 1f) } // landscape picture gives landscape A4
    }

    @Test fun compare_findsChangedLines() {
        val a = TestDocs.text("K", 2); val b = TestDocs.text("K", 2, extra = "A new clause was added here", fileName = "K-changed")
        assertTrue(PdfOps.compare(a, a).identicalText)
        val r = PdfOps.compare(a, b)
        assertEquals(2, r.diffs.size); assertEquals(listOf("A new clause was added here"), r.diffs[0].added); assertTrue(r.diffs[0].removed.isEmpty())
    }

    @Test fun redact_removesUnderlyingText() {
        val a = TestDocs.text("X", 2); val out = TestDocs.out("redacted.pdf")
        PdfBoxRasterizer(a).use { r ->
            // Cover the whole upper part of page 1 where the text is.
            PdfOps.redact(a, mapOf(0 to listOf(floatArrayOf(0f, 0f, 595f, 300f))), r, out)
        }
        val t = texts(out)
        assertEquals(2, t.size)
        assertFalse(t[0].contains("Shikongo")); assertFalse(t[0].contains("INV-001")); assertTrue(t[0].isBlank())
        assertTrue(t[1].contains("Shikongo")) // page 2 was not redacted and is still real text
        assertFalse(out.readBytes().toString(Charsets.ISO_8859_1).contains("INV-001"))
    }

    @Test fun repair_rewritesTruncatedFile() {
        val a = TestDocs.text("B", 3)
        val bytes = a.readBytes()
        val broken = TestDocs.out("broken.pdf"); broken.writeBytes(bytes.copyOf(bytes.size - 40)) // cut off the trailer
        val fixed = TestDocs.out("fixed.pdf")
        assertEquals(3, PdfOps.repair(broken, fixed)); assertTrue(texts(fixed)[2].contains("Page 3"))
    }
}
