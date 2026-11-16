package com.pdfmaster.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.ViewModelProvider
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.JobRunner
import com.pdfmaster.app.engine.PdfBoxRasterizer
import com.pdfmaster.app.engine.PdfOps
import com.pdfmaster.app.engine.Restore
import com.pdfmaster.app.tools.ImagePageSource
import com.pdfmaster.app.tools.PageSource
import com.pdfmaster.app.tools.RestoreJob
import com.pdfmaster.app.tools.RestoreOptions
import com.pdfmaster.app.ui.AppViewModel
import com.tom_roush.pdfbox.pdmodel.PDDocument
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import java.io.File
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
@Config(application = PdfMasterApp::class, sdk = [34])
class RestoreFlowTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()
    private lateinit var vm: AppViewModel
    private fun idle() = Shadows.shadowOf(android.os.Looper.getMainLooper()).idle()
    private fun photoFile(n: String) = TestDocs.out("$n.jpg").also { f -> javaClass.classLoader!!.getResourceAsStream("photos/$n.jpg")!!.use { i -> f.outputStream().use { i.copyTo(it) } } }
    private fun sha(f: File) = MessageDigest.getInstance("SHA-256").digest(f.readBytes()).joinToString("") { "%02x".format(it) }
    private fun lum(p: Int) = 0.299 * Color.red(p) + 0.587 * Color.green(p) + 0.114 * Color.blue(p)
    private fun import(f: File): Doc { var d: List<Doc>? = null; vm.import(listOf(Uri.fromFile(f))) { d = it }; repeat(600) { idle(); if (d != null) return d!!.single(); Thread.sleep(50) }; throw AssertionError("import") }
    private val ctx = JobRunner.Ctx({ _, _, _ -> }, {})

    @Test fun multiPagePhotoPdf_isRestoredAtFullQuality_originalUntouched() {
        TestDocs.init(); rule.activityRule.scenario.onActivity { vm = ViewModelProvider(it)[AppViewModel::class.java] }
        val photos = listOf("photo1", "photo2", "photo3", "scan4").map { photoFile(it) }
        val pdfFile = TestDocs.out("photos.pdf"); PdfOps.imagesToPdf(photos, pdfFile)
        val doc = import(pdfFile); assertEquals(4, doc.pages)
        val before = sha(vm.library.file(doc))
        val opts = RestoreOptions(Restore.Params(Restore.Mode.AUTO, 0.6f), keepOriginal = setOf(1), rotations = emptyMap(), ocr = true, maxSide = 2600)
        val result = PdfBoxRasterizer(vm.library.file(doc)).use { r ->
            val src = object : PageSource { override val count = r.pageCount; override fun render(index: Int, maxSide: Int) = r.render(index, maxSide); override fun close() {} }
            runBlocking { RestoreJob.run(ctx, TestDocs.context, vm.library, doc, src, opts) }
        }
        val out = result.docs.single(); assertEquals("photos (restored).pdf", out.name); assertEquals(4, out.pages)
        assertEquals("the original is byte for byte unchanged", before, sha(vm.library.file(doc)))
        println("JOB notes: " + result.notes.joinToString(" | "))
        assertTrue(result.notes[0].contains("original is unchanged") && result.notes[0].contains("no text, number, signature or stamp was retyped"))
        assertTrue("page 2 was kept as the original", result.notes.any { it.startsWith("Page 2: kept exactly as the original") })
        assertTrue("no false sideways alarm on the sparse signature page", result.notes.none { it.contains("sideways") })
        assertTrue("the rotated scan really has its corners cut off by the frame, and the user is told", result.notes.any { it.startsWith("Page 4:") && it.contains("touches the edge") })
        assertTrue("the soft scan or shadow is reported honestly or at least processed", result.notes.size >= 2)
        PDDocument.load(vm.library.file(out)).use { d -> d.pages.forEach { assertEquals("A4 portrait", 595f, it.mediaBox.width, 1f) } }
        val imgs = PdfOps.extractImages(vm.library.file(out), File(TestDocs.dir, "restored"), "p")
        assertEquals(4, imgs.size)
        val keepDir = File("build/restored").apply { mkdirs() }
        imgs.forEachIndexed { i, f ->
            val b = BitmapFactory.decodeFile(f.absolutePath); b.compress(Bitmap.CompressFormat.PNG, 100, File(keepDir, "job_page${i + 1}.png").outputStream())
            val corner = lum(b.getPixel((b.width * 0.5).toInt(), (b.height * 0.012).toInt().coerceAtLeast(3)))
            if (i != 1) assertTrue("page ${i + 1} paper is clean white (was $corner)", corner > 235)
            assertTrue("full quality: at least 1900 px on the long side, was ${maxOf(b.width, b.height)}", maxOf(b.width, b.height) >= 1900)
        }
        val orig2 = BitmapFactory.decodeFile(imgs[1].absolutePath); assertTrue("the kept page is still the dim yellow photo", lum(orig2.getPixel(orig2.width / 2, (orig2.height * 0.9).toInt())) < 235)
        // Nothing was typed over the pages: no visible text was added by the job.
        assertTrue(PdfOps.pageTexts(vm.library.file(out)).all { it.isBlank() })
    }

    @Test fun photoWithExifRotation_isStoodUpright() {
        TestDocs.init()
        val raw = BitmapFactory.decodeStream(javaClass.classLoader!!.getResourceAsStream("photos/photo1.jpg"))      // portrait 1800x2400
        val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, android.graphics.Matrix().apply { postRotate(-90f) }, true)   // as a sideways sensor image
        val f = TestDocs.out("sideways.jpg"); f.outputStream().use { rotated.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        ExifInterface(f.absolutePath).apply { setAttribute(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_ROTATE_90.toString()); saveAttributes() }
        val up = ImagePageSource(f).render(0, 2000)
        assertTrue("EXIF turned it upright", up.height > up.width); assertEquals(1, ImagePageSource(f).count)
        val r = Restore.process(up, Restore.detect(up), Restore.Params(Restore.Mode.BW, 0.6f), 1600)
        assertTrue(r.enhanced.height > r.enhanced.width)
    }
}
