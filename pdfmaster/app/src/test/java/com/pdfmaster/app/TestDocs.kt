package com.pdfmaster.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import androidx.test.core.app.ApplicationProvider
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.font.PDType1Font
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import java.io.File

/** Builds real sample PDFs for the tests: several pages, different page sizes, text, a table and a large picture. */
object TestDocs {
    val context: Context get() = ApplicationProvider.getApplicationContext()
    val dir: File by lazy { File(System.getProperty("java.io.tmpdir"), "pdfmaster-tests-${System.nanoTime()}").apply { mkdirs() } }

    fun init() = PDFBoxResourceLoader.init(context)

    fun out(name: String) = File(dir, name).also { it.delete() }

    /** [pages] pages, each with the line "Page N of sample NAME" and some body text. Page 2 is landscape Letter. */
    fun text(name: String, pages: Int = 3, extra: String = "", fileName: String = name): File {
        val f = out("$fileName.pdf")
        PDDocument().use { doc ->
            for (i in 1..pages) {
                val box = if (i == 2) PDRectangle(PDRectangle.LETTER.height, PDRectangle.LETTER.width) else PDRectangle.A4
                val page = PDPage(box); doc.addPage(page)
                PDPageContentStream(doc, page).use { cs ->
                    cs.beginText(); cs.setFont(PDType1Font.HELVETICA_BOLD, 20f)
                    cs.newLineAtOffset(60f, box.height - 80f); cs.showText("Page $i of sample $name"); cs.endText()
                    cs.beginText(); cs.setFont(PDType1Font.HELVETICA, 12f); cs.setLeading(16f)
                    cs.newLineAtOffset(60f, box.height - 120f)
                    cs.showText("Invoice number INV-00$i dated 2026-03-1$i for N$ 1,25$i.50"); cs.newLine()
                    cs.showText("Contact Maria Shikongo at maria@example.com or +264 81 123 456$i"); cs.newLine()
                    if (extra.isNotEmpty()) { cs.showText(extra); cs.newLine() }
                    cs.endText()
                }
            }
            doc.documentInformation.title = "Sample $name"
            doc.documentInformation.author = "Test Author"
            doc.save(f)
        }
        return f
    }

    /** One page with a 4 column table drawn as separate text runs. */
    fun table(name: String = "table"): File {
        val f = out("$name.pdf")
        val rows = listOf(listOf("Item", "Qty", "Price", "Total"), listOf("Maize meal 10kg", "3", "120.00", "360.00"),
            listOf("Cooking oil 2L", "2", "75.50", "151.00"), listOf("Sugar 2.5kg", "10", "48.25", "482.50"))
        PDDocument().use { doc ->
            val page = PDPage(PDRectangle.A4); doc.addPage(page)
            PDPageContentStream(doc, page).use { cs ->
                var y = 760f
                for (r in rows) {
                    val xs = floatArrayOf(60f, 250f, 340f, 440f)
                    r.forEachIndexed { c, t ->
                        cs.beginText(); cs.setFont(PDType1Font.HELVETICA, 11f); cs.newLineAtOffset(xs[c], y); cs.showText(t); cs.endText()
                    }
                    y -= 22f
                }
            }
            doc.save(f)
        }
        return f
    }

    fun noisyBitmap(w: Int, h: Int): Bitmap {
        val b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        b.setHasAlpha(false)
        val c = Canvas(b); c.drawColor(Color.WHITE)
        val p = Paint()
        val r = java.util.Random(7)
        repeat(4000) {
            p.color = Color.rgb(r.nextInt(256), r.nextInt(256), r.nextInt(256))
            c.drawCircle(r.nextInt(w).toFloat(), r.nextInt(h).toFloat(), 4f + r.nextInt(30), p)
        }
        return b
    }

    /** A PDF holding a large lossless picture, like a phone scan, so compression has something to shrink. */
    fun withImage(name: String = "image"): File {
        val f = out("$name.pdf")
        PDDocument().use { doc ->
            val page = PDPage(PDRectangle.A4); doc.addPage(page)
            val img = LosslessFactory.createFromImage(doc, noisyBitmap(2400, 3200))
            PDPageContentStream(doc, page).use { cs ->
                cs.drawImage(img, 40f, 150f, 500f, 667f)
                cs.beginText(); cs.setFont(PDType1Font.HELVETICA, 14f); cs.newLineAtOffset(60f, 60f); cs.showText("Caption under the picture"); cs.endText()
            }
            doc.save(f)
        }
        return f
    }
}
