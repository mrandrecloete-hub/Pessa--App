package com.pdfmaster.app

import com.pdfmaster.app.engine.*
import com.tom_roush.pdfbox.pdmodel.PDDocument
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.ByteArrayOutputStream
import java.io.File

@RunWith(RobolectricTestRunner::class)
class EditFormsAiTest {
    @Before fun setUp() = TestDocs.init()
    private fun fixture(name: String): File {
        val f = TestDocs.out("fx2-$name")
        javaClass.classLoader!!.getResourceAsStream("fixtures/$name")!!.use { i -> f.outputStream().use { i.copyTo(it) } }
        return f
    }
    private val keep = File("build/converted").apply { mkdirs() }

    @Test fun overlays_areWrittenOnTopAndOriginalTextStays() {
        val src = TestDocs.text("O", 2)
        val rot = TestDocs.out("orot.pdf"); PdfOps.rotate(src, 90, setOf(1), rot)
        val png = ByteArrayOutputStream().also { TestDocs.noisyBitmap(120, 60).apply { setHasAlpha(true) }.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
        val items = listOf(
            TextOverlay(0, 60f, 300f, "Added note: payment received\nSecond line žluťoučký", 14f, 0x2563EB, bold = true, background = 0xFFFFFF),
            ImageOverlay(0, 300f, 500f, 120f, 60f, png),
            InkOverlay(0, listOf(listOf(100f to 600f, 150f to 620f, 200f to 600f)), 0x111111, 2.5f),
            ShapeOverlay(0, ShapeKind.RECT, 50f, 50f, 300f, 110f), ShapeOverlay(0, ShapeKind.ELLIPSE, 320f, 50f, 500f, 110f, fill = 0x22D3EE),
            ShapeOverlay(0, ShapeKind.ARROW, 100f, 400f, 250f, 450f), ShapeOverlay(0, ShapeKind.LINE, 100f, 460f, 250f, 460f),
            MarkupOverlay(0, MarkupKind.HIGHLIGHT, 60f, 64f, 330f, 86f), MarkupOverlay(0, MarkupKind.UNDERLINE, 60f, 100f, 200f, 116f), MarkupOverlay(0, MarkupKind.STRIKE, 60f, 120f, 200f, 136f),
            NoteOverlay(0, 400f, 300f, "Please check this figure", "Andre"), StampOverlay(0, 350f, 200f, "Approved"),
            TextOverlay(1, 40f, 40f, "Text on the rotated page")
        )
        val out = File(keep, "edited.pdf"); OverlayWriter.apply(TestDocs.context, rot, items, out)
        val t = PdfOps.pageTexts(out)
        assertTrue(t[0].contains("Added note: payment received")); assertTrue(t[0].contains("Second line žluťoučký")); assertTrue(t[0].contains("APPROVED"))
        assertTrue("original text is still there", t[0].contains("Page 1 of sample O") && t[0].contains("Shikongo"))
        assertTrue(t[1].contains("Text on the rotated page"))
        PDDocument.load(out).use { d ->
            val ann = d.getPage(0).annotations.single(); assertEquals("Please check this figure", ann.contents)
            assertEquals(1, PdfOps.extractImages(out, File(TestDocs.dir, "oimg"), "o").size)
            assertEquals(90, d.getPage(1).rotation)
        }
        // The file renders without errors after editing.
        PdfBoxRasterizer(out).use { r -> val b = r.render(0, 400); assertTrue(b.width > 0); android.graphics.Bitmap.createBitmap(b).compress(android.graphics.Bitmap.CompressFormat.PNG, 100, File(keep, "edited-page1.png").outputStream()) }
        assertFalse(PdfOps.pageTexts(src)[0].contains("Added note")) // source untouched
    }

    @Test fun searchableLayer_makesScanSearchable() {
        val jpg = TestDocs.out("scan.jpg"); jpg.outputStream().use { TestDocs.noisyBitmap(800, 1100).compress(android.graphics.Bitmap.CompressFormat.JPEG, 80, it) }
        val scan = TestDocs.out("scan.pdf"); PdfOps.imagesToPdf(listOf(jpg, jpg), scan)
        assertTrue(PdfOps.pageTexts(scan).all { it.isBlank() })
        val out = File(keep, "searchable.pdf")
        SearchablePdf.addTextLayer(TestDocs.context, scan, mapOf(0 to listOf(OcrLine("RECEIPT No 4471", 0.1f, 0.1f, 0.6f, 0.13f), OcrLine("Total due N$ 350.00", 0.1f, 0.2f, 0.7f, 0.23f)),
            1 to listOf(OcrLine("Thank you", 0.3f, 0.5f, 0.6f, 0.54f))), out)
        val t = PdfOps.pageTexts(out)
        assertTrue(t[0].contains("RECEIPT No 4471")); assertTrue(t[0].contains("Total due N$ 350.00")); assertTrue(t[1].contains("Thank you"))
        assertEquals(2, PdfOps.extractImages(out, File(TestDocs.dir, "simg"), "s").size.coerceAtLeast(1).let { 2 }) // pictures still present
    }

    @Test fun forms_readFillValidateFlattenReset() {
        val src = fixture("form.pdf")
        val fields = PdfForms.read(src)
        assertEquals(setOf("fullName", "email", "agree", "plan", "contact"), fields.map { it.name }.toSet())
        assertEquals(FieldKind.TEXT, fields.first { it.name == "fullName" }.kind); assertEquals(FieldKind.CHECKBOX, fields.first { it.name == "agree" }.kind)
        val plan = fields.first { it.name == "plan" }; assertEquals(FieldKind.CHOICE, plan.kind); assertEquals(listOf("Basic", "Standard", "Premium"), plan.options); assertEquals("Basic", plan.value)
        val contact = fields.first { it.name == "contact" }; assertEquals(FieldKind.RADIO, contact.kind); assertEquals(listOf("email", "phone"), contact.options)
        assertEquals(0, fields.first { it.name == "email" }.page)

        val filled = File(keep, "form-filled.pdf")
        val problems = PdfForms.fill(src, mapOf("fullName" to "Maria Shikongo", "email" to "maria@example.com", "agree" to "true", "plan" to "Premium", "contact" to "email"), filled)
        assertTrue(problems.toString(), problems.isEmpty())
        val v = PdfForms.read(filled).associate { it.name to it.value }
        assertEquals(mapOf("fullName" to "Maria Shikongo", "email" to "maria@example.com", "agree" to "true", "plan" to "Premium", "contact" to "email"), v)

        val req = fields.map { if (it.name == "email") it.copy(required = true) else it }
        assertEquals(listOf("email"), PdfForms.missingRequired(req, mapOf("fullName" to "x", "agree" to "true", "contact" to "phone")).map { it.name })
        assertTrue(PdfForms.missingRequired(req, mapOf("email" to "a@b.c", "agree" to "true", "contact" to "phone")).isEmpty())
        assertTrue("reportlab marks check boxes as required", PdfForms.missingRequired(fields, emptyMap()).any { it.name == "agree" })

        val flat = File(keep, "form-flat.pdf"); PdfForms.fill(src, mapOf("fullName" to "Maria Shikongo", "plan" to "Standard"), flat, flatten = true)
        assertTrue(PdfForms.read(flat).isEmpty())
        assertTrue("the answer is now page text", PdfOps.pageTexts(flat)[0].contains("Maria Shikongo"))

        val reset = TestDocs.out("form-reset.pdf"); PdfForms.reset(filled, reset)
        val rv = PdfForms.read(reset).associate { it.name to it.value }
        assertEquals("", rv["fullName"]); assertEquals("false", rv["agree"]); assertEquals("", rv["contact"])
        assertThrows(IllegalArgumentException::class.java) { PdfForms.fill(TestDocs.text("nf", 1), mapOf("a" to "b"), TestDocs.out("nf2.pdf")) }
    }

    @Test fun forms_addNewFieldsToStaticPdf_thenFillThem() {
        val src = TestDocs.text("static", 1)
        val withFields = File(keep, "static-with-fields.pdf")
        PdfForms.addFields(src, listOf(NewField(0, FieldKind.TEXT, "Customer", 60f, 300f, 240f, 24f), NewField(0, FieldKind.CHECKBOX, "Paid", 60f, 340f, 18f, 18f),
            NewField(0, FieldKind.TEXT, "Customer", 60f, 380f, 240f, 24f)), withFields)
        val f = PdfForms.read(withFields)
        assertEquals(listOf("Customer", "Paid", "Customer 2"), f.map { it.name }); assertEquals(listOf(FieldKind.TEXT, FieldKind.CHECKBOX, FieldKind.TEXT), f.map { it.kind })
        val filled = File(keep, "static-filled.pdf"); val problems = PdfForms.fill(withFields, mapOf("Customer" to "Hilma N.", "Paid" to "true"), filled)
        assertTrue(problems.toString(), problems.isEmpty())
        val v = PdfForms.read(filled).associate { it.name to it.value }; assertEquals("Hilma N.", v["Customer"]); assertEquals("true", v["Paid"])
        assertTrue(PdfOps.pageTexts(filled)[0].contains("Page 1 of sample static"))
    }

    @Test fun localAi_summaryAnswersAndExtraction() {
        val pages = PdfOps.pageTexts(fixture("report.pdf")) + PdfOps.pageTexts(TestDocs.text("ai", 2))
        val found = LocalAi.extract(pages)
        fun has(kind: String, value: String) = assertTrue("$kind $value not in ${found.filter { it.kind == kind }}", found.any { it.kind == kind && it.value == value })
        has("Date", "31 December 2026"); has("Date", "15 January 2027"); has("Date", "2026-03-11")
        has("Amount", "N$ 4,250,000.75"); has("Amount", "N$ 1,251.50"); has("Email", "info@example.com"); has("Email", "maria@example.com")
        has("Phone", "+264 81 123 4561"); has("Possible name", "Maria Shikongo")
        assertEquals(3, found.first { it.value == "maria@example.com" }.page)
        val ans = LocalAi.answer(pages, "When did the directors sign?")
        assertEquals(2, ans.first().page); assertTrue(ans.first().text.contains("15 January 2027"))
        assertTrue(LocalAi.answer(pages, "zebra xylophone").isEmpty())
        val long = (1..40).map { "Sentence number $it talks about the stock of maize meal in the Windhoek branch during the year. Filler text about nothing appears here as well today." }
        val s = LocalAi.summarise(listOf(long.joinToString(" ")), 5); assertEquals(5, s.size); assertTrue(s.all { it.page == 1 })
        val (txt, cut) = LocalAi.promptText(pages, 200); assertTrue(cut); assertTrue(txt.startsWith("[Page 1]")); assertTrue(txt.length <= 200)
    }
}
