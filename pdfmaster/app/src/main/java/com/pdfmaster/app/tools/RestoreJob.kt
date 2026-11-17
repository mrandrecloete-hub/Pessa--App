package com.pdfmaster.app.tools

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import com.pdfmaster.app.data.AndroidRasterizer
import com.pdfmaster.app.data.Category
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.JobRunner
import com.pdfmaster.app.data.Library
import com.pdfmaster.app.engine.OcrLine
import com.pdfmaster.app.engine.Restore
import com.pdfmaster.app.engine.ScanClean
import com.pdfmaster.app.engine.ScanPage
import com.pdfmaster.app.engine.ScanPdfWriter
import com.pdfmaster.app.ui.RunResult
import java.io.File

/** Pages of a PDF or a photo, rendered on demand at the size asked for. */
interface PageSource : AutoCloseable {
    val count: Int
    fun render(index: Int, maxSide: Int): Bitmap
}

class PdfPageSource(private val r: AndroidRasterizer) : PageSource {
    override val count get() = r.pageCount
    override fun render(index: Int, maxSide: Int) = r.render(index, maxSide)
    override fun close() = r.close()
}

/** A photo, turned upright using its EXIF orientation (phones store most photos sideways). */
class ImagePageSource(private val file: File) : PageSource {
    override val count get() = 1
    override fun render(index: Int, maxSide: Int): Bitmap {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }; BitmapFactory.decodeFile(file.absolutePath, o)
        require(o.outWidth > 0) { "This picture could not be read" }
        var s = 1; while (maxOf(o.outWidth, o.outHeight) / (s * 2) >= maxSide) s *= 2
        var b = BitmapFactory.decodeFile(file.absolutePath, BitmapFactory.Options().apply { inSampleSize = s }) ?: throw IllegalArgumentException("This picture could not be read")
        val deg = when (runCatching { ExifInterface(file.absolutePath).getAttributeInt(ExifInterface.TAG_ORIENTATION, 1) }.getOrDefault(1)) { 6 -> 90f; 3 -> 180f; 8 -> 270f; else -> 0f }
        if (deg != 0f) b = Bitmap.createBitmap(b, 0, 0, b.width, b.height, Matrix().apply { postRotate(deg) }, true)
        val side = maxOf(b.width, b.height)
        if (side > maxSide) b = Bitmap.createScaledBitmap(b, (b.width * maxSide.toFloat() / side).toInt(), (b.height * maxSide.toFloat() / side).toInt(), true)
        return b
    }
    override fun close() {}
}

class RestoreOptions(val params: Restore.Params, val keepOriginal: Set<Int>, val rotations: Map<Int, Int>, val ocr: Boolean, val maxSide: Int)

object RestoreJob {
    /**
     * Restores every page at full quality and writes a new PDF. Pages marked "keep original" are embedded untouched.
     * The source document in the library is never changed. Returns the saved document and plain notes for the user.
     */
    suspend fun run(ctx: JobRunner.Ctx, context: Context, library: Library, doc: Doc, source: PageSource, o: RestoreOptions): RunResult {
        val work = library.workDir()
        try {
            val notes = ArrayList<String>(); val failures = ArrayList<String>()
            var unclear = 0; var lines = 0; var ocrOk = o.ocr
            val f = File(work, "restored.pdf")
            ScanPdfWriter(context, ScanClean.Mode.COLOUR, typed = false, a4 = true).use { w ->
                for (i in 0 until source.count) {
                    ctx.progress.report(i, source.count)
                    val orig = source.render(i, o.maxSide)
                    val n = i + 1
                    var page = orig; var mode = ScanClean.Mode.COLOUR
                    if (i in o.keepOriginal) notes.add("Page $n: kept exactly as the original, as you asked.")
                    else {
                        val det = Restore.detect(orig)
                        val r = Restore.process(orig, det, o.params.copy(rotate = o.rotations[i] ?: 0), o.maxSide, withGeometry = false)
                        page = r.enhanced; if (r.report.chosen == Restore.Mode.BW) mode = ScanClean.Mode.BW
                        r.report.warnings.forEach { notes.add("Page $n: $it") }
                        if (o.params.mode == Restore.Mode.AUTO) r.report.notes.firstOrNull { it.startsWith("Auto:") }?.let { notes.add("Page $n: $it") }
                        orig.recycle()
                    }
                    var found: List<OcrLine> = emptyList()
                    if (ocrOk) try { found = Ocr.lines(page) } catch (e: Exception) { ocrOk = false; notes.add("Text recognition was not available on this phone, so the PDF was saved without searchable text.") }
                    lines += found.size; unclear += found.count { it.confidence < 0.6f }
                    w.add(ScanPage(page, found), mode); page.recycle()
                }
                w.save(f, doc.name.substringBeforeLast('.'))
            }
            if (ocrOk) notes.add("Searchable text was added from $lines recognised lines. The text is invisible: it sits behind the page picture and was never typed over it." +
                if (unclear > 0) " $unclear line(s) were unclear. They are in the picture as photographed, and the text layer may be wrong or missing for them, so please check important words and numbers." else "")
            notes.add(0, "Your original is unchanged and still in Documents. Only light, colour and the page outline were adjusted: no text, number, signature or stamp was retyped, drawn or replaced.")
            val out = library.adopt(f, "${doc.name.substringBeforeLast('.')} (restored).pdf", Category.EDITED)
            return RunResult(listOf(out), notes, failures = failures)
        } finally { work.deleteRecursively() }
    }
}
