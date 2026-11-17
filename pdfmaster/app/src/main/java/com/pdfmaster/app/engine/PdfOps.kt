package com.pdfmaster.app.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import com.tom_roush.pdfbox.cos.COSBase
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.multipdf.PDFMergerUtility
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDDocumentInformation
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.PDResources
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.encryption.AccessPermission
import com.tom_roush.pdfbox.pdmodel.encryption.StandardProtectionPolicy
import com.tom_roush.pdfbox.pdmodel.graphics.form.PDFormXObject
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.PDImageXObject
import com.tom_roush.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.util.Matrix
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sin

/** Where a stamp such as a page number or header is placed on the page. */
enum class Anchor { TOP_LEFT, TOP_CENTER, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_CENTER, BOTTOM_RIGHT }

enum class CompressLevel(val maxImageSide: Int, val jpegQuality: Float) {
    LOW(2200, 0.85f), BALANCED(1500, 0.7f), HIGH(1000, 0.5f)
}

data class Permissions(
    val canPrint: Boolean = true,
    val canCopy: Boolean = true,
    val canModify: Boolean = true,
    val canAnnotate: Boolean = true,
    val canFillForms: Boolean = true
)

data class PdfInfo(
    val pages: Int,
    val encrypted: Boolean,
    val version: Float,
    val title: String?, val author: String?, val subject: String?, val keywords: String?,
    val creator: String?, val producer: String?, val created: Date?, val modified: Date?,
    val hasXmpMetadata: Boolean,
    val hasForm: Boolean,
    val custom: Map<String, String>
)

data class CompressResult(val before: Long, val after: Long, val imagesChanged: Int) {
    val savedPercent: Int get() = if (before <= 0) 0 else (((before - after) * 100.0) / before).roundToInt()
}

data class PageDiff(val page: Int, val removed: List<String>, val added: List<String>)
data class CompareResult(val pagesA: Int, val pagesB: Int, val diffs: List<PageDiff>) {
    val identicalText: Boolean get() = diffs.isEmpty() && pagesA == pagesB
}

/** Every operation reads its inputs and writes a NEW file. Originals are never changed. */
object PdfOps {

    fun merge(inputs: List<File>, out: File, passwords: Map<File, String> = emptyMap()) {
        require(inputs.size >= 2) { "Choose at least two PDF files to merge" }
        if (passwords.isEmpty() && inputs.none { needsPassword(it) }) {
            val m = PDFMergerUtility()
            inputs.forEach { m.addSource(it) }
            m.destinationFileName = out.absolutePath
            m.mergeDocuments(MemoryUsageSetting.setupMixed(32L * 1024 * 1024))
            return
        }
        // Protected inputs: open each with its password and append page by page.
        val docs = ArrayList<PDDocument>()
        try {
            PDDocument().use { dst ->
                val m = PDFMergerUtility()
                for (f in inputs) {
                    val d = openPdf(f, passwords[f]); docs.add(d)
                    d.isAllSecurityToBeRemoved = true
                    m.appendDocument(dst, d)
                }
                dst.save(out)
            }
        } finally { docs.forEach { runCatching { it.close() } } }
    }

    /** Writes the given pages (zero based, in this order, repeats allowed) into a new file. */
    fun extractPages(input: File, pages: List<Int>, out: File, password: String? = null) {
        openPdf(input, password).use { src ->
            src.isAllSecurityToBeRemoved = src.isEncrypted
            PDDocument().use { dst ->
                for (i in pages) {
                    require(i in 0 until src.numberOfPages) { "Page ${i + 1} does not exist" }
                    dst.importPage(src.getPage(i))
                }
                dst.documentInformation = src.documentInformation
                dst.save(out)
            }
        }
    }

    fun deletePages(input: File, remove: Collection<Int>, out: File, password: String? = null) {
        val total = pageCount(input, password)
        val keep = (0 until total).filter { it !in remove }
        require(keep.isNotEmpty()) { "A PDF must keep at least one page" }
        extractPages(input, keep, out, password)
    }

    /** Splits into files of [every] pages each. Returns the files written. */
    fun splitEvery(input: File, every: Int, outDir: File, baseName: String, password: String? = null, progress: Progress = Progress.NONE): List<File> {
        require(every >= 1) { "Pages per file must be 1 or more" }
        val total = pageCount(input, password)
        val ranges = (0 until total step every).map { (it until min(it + every, total)).toList() }
        return splitRanges(input, ranges, outDir, baseName, password, progress)
    }

    fun splitRanges(input: File, ranges: List<List<Int>>, outDir: File, baseName: String, password: String? = null, progress: Progress = Progress.NONE): List<File> {
        outDir.mkdirs()
        val outs = ArrayList<File>()
        ranges.forEachIndexed { n, r ->
            val label = if (r.size == 1) "page ${r.first() + 1}" else "pages ${r.first() + 1} to ${r.last() + 1}"
            val f = File(outDir, "$baseName ($label).pdf")
            extractPages(input, r, f, password)
            outs.add(f); progress.report(n + 1, ranges.size)
        }
        return outs
    }

    /** Rotates the chosen pages (or all when [pages] is null) clockwise by [degrees] (90, 180 or 270). */
    fun rotate(input: File, degrees: Int, pages: Collection<Int>?, out: File, password: String? = null) {
        require(degrees % 90 == 0) { "Rotation must be a multiple of 90" }
        edit(input, out, password) { doc ->
            for (i in 0 until doc.numberOfPages) if (pages == null || i in pages) {
                val p = doc.getPage(i)
                p.rotation = (((p.rotation + degrees) % 360) + 360) % 360
            }
        }
    }

    fun addWatermark(context: Context, input: File, text: String, out: File, opacity: Float = 0.18f, color: Int = 0x5B5FEF,
                     fontSize: Float = 0f, angleDeg: Float = 45f, password: String? = null) {
        require(text.isNotBlank()) { "Type the watermark text" }
        edit(input, out, password) { doc ->
            val fonts = Fonts(context, doc)
            val t = fonts.clean(text)
            for (page in doc.pages) {
                val (w, h) = viewSize(page)
                val size = if (fontSize > 0) fontSize else min(w, h) * 1.1f / max(4, t.length) * 1.6f
                val tw = fonts.width(fonts.bold, t, size)
                overlayStream(doc, page).use { cs ->
                    val gs = PDExtendedGraphicsState(); gs.nonStrokingAlphaConstant = opacity
                    cs.setGraphicsStateParameters(gs)
                    cs.setNonStrokingColor(rgb(color))
                    cs.beginText()
                    cs.setFont(fonts.bold, size)
                    val a = Math.toRadians(angleDeg.toDouble())
                    val cx = w / 2 - (tw / 2 * cos(a)).toFloat() + (size * 0.35 * sin(a)).toFloat()
                    val cy = h / 2 - (tw / 2 * sin(a)).toFloat() - (size * 0.35 * cos(a)).toFloat()
                    cs.setTextMatrix(Matrix.getRotateInstance(a, cx, cy))
                    cs.showText(t)
                    cs.endText()
                }
            }
        }
    }

    /**
     * Stamps a line of text on every page. In [template], {n} is the page number, {total} the page count
     * and {date} today's date. Used for page numbers, headers and footers.
     */
    fun stampText(context: Context, input: File, template: String, anchor: Anchor, out: File, fontSize: Float = 10f,
                  color: Int = 0x333333, margin: Float = 28f, startAt: Int = 1, skipFirst: Boolean = false, password: String? = null) {
        edit(input, out, password) { doc ->
            val fonts = Fonts(context, doc)
            val total = doc.numberOfPages
            val date = SimpleDateFormat("d MMMM yyyy", Locale.getDefault()).format(Date())
            for (i in 0 until total) {
                if (skipFirst && i == 0) continue
                val page = doc.getPage(i)
                val (w, h) = viewSize(page)
                val t = fonts.clean(template.replace("{n}", (i + startAt).toString())
                    .replace("{total}", (total + startAt - 1).toString()).replace("{date}", date))
                val tw = fonts.width(fonts.regular, t, fontSize)
                val x = when (anchor) {
                    Anchor.TOP_LEFT, Anchor.BOTTOM_LEFT -> margin
                    Anchor.TOP_CENTER, Anchor.BOTTOM_CENTER -> (w - tw) / 2
                    else -> w - margin - tw
                }
                val y = if (anchor.name.startsWith("TOP")) h - margin - fontSize * 0.8f else margin
                overlayStream(doc, page).use { cs ->
                    cs.setNonStrokingColor(rgb(color))
                    cs.beginText(); cs.setFont(fonts.regular, fontSize)
                    cs.newLineAtOffset(x, y); cs.showText(t); cs.endText()
                }
            }
        }
    }

    /** Protects a PDF with AES encryption, then reopens the result to prove the password is really required. */
    fun encrypt(input: File, userPassword: String, ownerPassword: String, perms: Permissions, out: File, currentPassword: String? = null) {
        require(userPassword.isNotEmpty()) { "Type a password" }
        openPdf(input, currentPassword).use { doc ->
            doc.isAllSecurityToBeRemoved = false
            val ap = AccessPermission()
            ap.setCanPrint(perms.canPrint); ap.setCanPrintDegraded(perms.canPrint)
            ap.setCanExtractContent(perms.canCopy); ap.setCanExtractForAccessibility(true)
            ap.setCanModify(perms.canModify); ap.setCanAssembleDocument(perms.canModify)
            ap.setCanModifyAnnotations(perms.canAnnotate); ap.setCanFillInForm(perms.canFillForms)
            val policy = StandardProtectionPolicy(ownerPassword.ifEmpty { userPassword + "-owner" }, userPassword, ap)
            policy.encryptionKeyLength = 256
            doc.protect(policy)
            doc.save(out)
        }
        // Verification: it must refuse to open without the password and open with it.
        val locked = try { PDDocument.load(out).use { false } } catch (e: Exception) { true }
        val opens = try { openPdf(out, userPassword).use { it.isEncrypted } } catch (e: Exception) { false }
        if (!locked || !opens) { out.delete(); throw IllegalStateException("Encryption could not be verified, so no file was saved") }
    }

    fun removePassword(input: File, password: String, out: File) {
        openPdf(input, password).use { doc ->
            doc.isAllSecurityToBeRemoved = true
            doc.save(out)
        }
        check(!needsPassword(out)) { "The password could not be removed" }
    }

    fun info(input: File, password: String? = null): PdfInfo = openPdf(input, password).use { doc ->
        val i = doc.documentInformation
        val std = setOf("Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "Trapped")
        PdfInfo(
            doc.numberOfPages, doc.isEncrypted, doc.version, i.title, i.author, i.subject, i.keywords, i.creator, i.producer,
            runCatching { i.creationDate?.time }.getOrNull(), runCatching { i.modificationDate?.time }.getOrNull(),
            doc.documentCatalog.metadata != null, doc.documentCatalog.acroForm?.fields?.isNotEmpty() == true,
            i.metadataKeys.filter { it !in std }.associateWith { i.getCustomMetadataValue(it) ?: "" }
        )
    }

    /** Removes the information dictionary and the XMP metadata packet. */
    fun stripMetadata(input: File, out: File, password: String? = null) {
        edit(input, out, password) { doc ->
            doc.documentInformation = PDDocumentInformation()
            doc.documentCatalog.metadata = null
        }
    }

    fun setMetadata(input: File, out: File, title: String?, author: String?, subject: String?, keywords: String?, password: String? = null) {
        edit(input, out, password) { doc ->
            val i = doc.documentInformation
            i.title = title; i.author = author; i.subject = subject; i.keywords = keywords
            i.modificationDate = Calendar.getInstance()
        }
    }

    fun pageTexts(input: File, password: String? = null, progress: Progress = Progress.NONE): List<String> = openPdf(input, password).use { doc ->
        val st = PDFTextStripper()
        (1..doc.numberOfPages).map { p ->
            st.startPage = p; st.endPage = p
            progress.report(p, doc.numberOfPages)
            runCatching { st.getText(doc) }.getOrDefault("")
        }
    }

    /**
     * Makes the file smaller by resampling and re-encoding large pictures. Text and vector drawing are untouched.
     * If the result is not smaller, the original bytes are kept as the output.
     */
    fun compress(input: File, out: File, maxImageSide: Int, jpegQuality: Float, removeMetadata: Boolean = false,
                 password: String? = null, progress: Progress = Progress.NONE): CompressResult {
        var changed = 0
        openPdf(input, password).use { doc ->
            doc.isAllSecurityToBeRemoved = doc.isEncrypted
            val seen = HashSet<COSBase>()
            val total = doc.numberOfPages
            for ((n, page) in doc.pages.withIndex()) {
                page.resources?.let { changed += shrinkImages(doc, it, seen, maxImageSide, jpegQuality) }
                progress.report(n + 1, total)
            }
            if (removeMetadata) { doc.documentInformation = PDDocumentInformation(); doc.documentCatalog.metadata = null }
            doc.save(out)
        }
        if (out.length() >= input.length() && password == null) { input.copyTo(out, overwrite = true); changed = 0 }
        return CompressResult(input.length(), out.length(), changed)
    }

    private fun shrinkImages(doc: PDDocument, res: PDResources, seen: MutableSet<COSBase>, maxSide: Int, q: Float): Int {
        var changed = 0
        for (name in res.xObjectNames.toList()) {
            val x = try { res.getXObject(name) } catch (e: Exception) { null } ?: continue
            if (!seen.add(x.cosObject)) continue
            when (x) {
                is PDFormXObject -> x.resources?.let { changed += shrinkImages(doc, it, seen, maxSide, q) }
                is PDImageXObject -> {
                    try {
                        val dict = x.cosObject
                        // Pictures with transparency or masks are left alone so nothing changes visually.
                        if (dict.containsKey(COSName.SMASK) || dict.containsKey(COSName.MASK) || x.isStencil) continue
                        val oldSize = dict.getLong(COSName.LENGTH, 0L)
                        if (oldSize < 20_000) continue
                        val bmp = Pdfx.imageOf(x) ?: continue
                        val side = max(bmp.width, bmp.height)
                        val scaled = if (side > maxSide) {
                            val s = maxSide.toFloat() / side
                            Bitmap.createScaledBitmap(bmp, max(1, (bmp.width * s).roundToInt()), max(1, (bmp.height * s).roundToInt()), true)
                        } else bmp
                        val flat = Bitmap.createBitmap(scaled.width, scaled.height, Bitmap.Config.ARGB_8888)
                        Canvas(flat).apply { drawColor(Color.WHITE); drawBitmap(scaled, 0f, 0f, null) }
                        val neu = Pdfx.jpeg(doc, flat, q)
                        if (neu.cosObject.getLong(COSName.LENGTH, Long.MAX_VALUE) < oldSize * 0.9) { res.put(name, neu); changed++ }
                        if (scaled !== bmp) scaled.recycle()
                        flat.recycle(); bmp.recycle()
                    } catch (e: Throwable) { /* an image we cannot decode stays as it is */ }
                }
            }
        }
        return changed
    }

    /** Saves every embedded picture as a JPG or PNG file. */
    fun extractImages(input: File, outDir: File, baseName: String, password: String? = null, progress: Progress = Progress.NONE): List<File> {
        outDir.mkdirs()
        val outs = ArrayList<File>()
        openPdf(input, password).use { doc ->
            val seen = HashSet<COSBase>()
            for ((n, page) in doc.pages.withIndex()) {
                val res = page.resources ?: continue
                for (name in res.xObjectNames) {
                    val x = runCatching { res.getXObject(name) }.getOrNull() as? PDImageXObject ?: continue
                    if (!seen.add(x.cosObject)) continue
                    val bmp = runCatching { Pdfx.imageOf(x) }.getOrNull() ?: continue
                    val png = bmp.hasAlpha()
                    val f = File(outDir, "$baseName image ${outs.size + 1}.${if (png) "png" else "jpg"}")
                    FileOutputStream(f).use { bmp.compress(if (png) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, 92, it) }
                    bmp.recycle(); outs.add(f)
                }
                progress.report(n + 1, doc.numberOfPages)
            }
        }
        return outs
    }

    /** Builds a PDF with one picture per page. JPG files are embedded as they are, without quality loss. */
    fun imagesToPdf(images: List<File>, out: File, fitA4: Boolean = false, progress: Progress = Progress.NONE) {
        require(images.isNotEmpty()) { "Choose at least one picture" }
        PDDocument().use { doc ->
            images.forEachIndexed { n, f ->
                val opts = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                android.graphics.BitmapFactory.decodeFile(f.absolutePath, opts)
                val isJpeg = opts.outMimeType == "image/jpeg"
                val img = if (isJpeg) f.inputStream().use { JPEGFactory.createFromStream(doc, it) } else {
                    val bmp = android.graphics.BitmapFactory.decodeFile(f.absolutePath)
                        ?: throw IllegalArgumentException("${f.name} is not a picture this app can read")
                    (if (bmp.hasAlpha()) Pdfx.lossless(doc, bmp) else Pdfx.jpeg(doc, bmp, 0.9f)).also { bmp.recycle() }
                }
                val iw = img.width.toFloat(); val ih = img.height.toFloat()
                val page: PDPage
                if (fitA4) {
                    val box = if (iw > ih) PDRectangle(PDRectangle.A4.height, PDRectangle.A4.width) else PDRectangle.A4
                    page = PDPage(box)
                    val s = min((box.width - 36) / iw, (box.height - 36) / ih)
                    PDPageContentStream(doc, page).use { it.drawImage(img, (box.width - iw * s) / 2, (box.height - ih * s) / 2, iw * s, ih * s) }
                } else {
                    // 150 pixels per inch gives a natural page size for photos and scans.
                    val s = 72f / 150f
                    page = PDPage(PDRectangle(iw * s, ih * s))
                    PDPageContentStream(doc, page).use { it.drawImage(img, 0f, 0f, iw * s, ih * s) }
                }
                doc.addPage(page)
                progress.report(n + 1, images.size)
            }
            doc.save(out)
        }
    }

    /** Compares the text of two PDFs page by page. Layout and pictures are not compared. */
    fun compare(a: File, b: File, passwordA: String? = null, passwordB: String? = null): CompareResult {
        val ta = pageTexts(a, passwordA); val tb = pageTexts(b, passwordB)
        val diffs = ArrayList<PageDiff>()
        for (i in 0 until max(ta.size, tb.size)) {
            val la = ta.getOrNull(i).orEmpty().lines().map { it.trim() }.filter { it.isNotEmpty() }
            val lb = tb.getOrNull(i).orEmpty().lines().map { it.trim() }.filter { it.isNotEmpty() }
            if (la == lb) continue
            val ca = la.groupingBy { it }.eachCount().toMutableMap()
            val added = ArrayList<String>()
            for (l in lb) { val c = ca[l] ?: 0; if (c > 0) ca[l] = c - 1 else added.add(l) }
            val cb = lb.groupingBy { it }.eachCount().toMutableMap()
            val removed = ArrayList<String>()
            for (l in la) { val c = cb[l] ?: 0; if (c > 0) cb[l] = c - 1 else removed.add(l) }
            diffs.add(PageDiff(i + 1, removed, added))
        }
        return CompareResult(ta.size, tb.size, diffs)
    }

    /** Reads a damaged file with PDFBox's tolerant parser and writes a clean copy. Works only when the pages can still be found. */
    fun repair(input: File, out: File, password: String? = null): Int = openPdf(input, password).use { doc ->
        check(doc.numberOfPages > 0) { "No pages could be recovered from this file" }
        doc.isAllSecurityToBeRemoved = doc.isEncrypted
        doc.save(out); doc.numberOfPages
    }

    /**
     * Permanent redaction. Every page that has a redaction box is turned into a picture with the boxes
     * burned in, so the text and pictures under the boxes no longer exist in the file.
     * [boxes] are rectangles in displayed page points (origin top left): page index to list of [left, top, right, bottom].
     */
    fun redact(input: File, boxes: Map<Int, List<FloatArray>>, raster: PageRasterizer, out: File, password: String? = null,
               dpi: Int = 200, progress: Progress = Progress.NONE) {
        require(boxes.values.any { it.isNotEmpty() }) { "Mark at least one area to redact" }
        openPdf(input, password).use { doc ->
            doc.isAllSecurityToBeRemoved = doc.isEncrypted
            val targets = boxes.filterValues { it.isNotEmpty() }.keys.sorted()
            targets.forEachIndexed { n, index ->
                val old = doc.getPage(index)
                val (w, h) = viewSize(old)
                val side = (max(w, h) / 72f * dpi).roundToInt().coerceIn(600, 4000)
                val src = raster.render(index, side)
                val bmp = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
                val canvas = Canvas(bmp)
                canvas.drawColor(Color.WHITE); canvas.drawBitmap(src, 0f, 0f, null)
                val sx = bmp.width / w; val sy = bmp.height / h
                val paint = Paint().apply { color = Color.BLACK; style = Paint.Style.FILL }
                for (r in boxes.getValue(index)) canvas.drawRect(r[0] * sx, r[1] * sy, r[2] * sx, r[3] * sy, paint)
                val page = PDPage(PDRectangle(w, h))
                val img = Pdfx.jpeg(doc, bmp, 0.85f)
                PDPageContentStream(doc, page).use { it.drawImage(img, 0f, 0f, w, h) }
                doc.pages.insertAfter(page, old)
                doc.removePage(old)
                src.recycle(); bmp.recycle()
                progress.report(n + 1, targets.size)
            }
            doc.save(out)
        }
    }

    /** Puts pages in a new order. [order] holds the old zero based index for each new position; repeats duplicate a page. */
    fun reorder(input: File, order: List<Int>, out: File, password: String? = null) = extractPages(input, order, out, password)

    private inline fun edit(input: File, out: File, password: String?, block: (PDDocument) -> Unit) {
        openPdf(input, password).use { doc ->
            if (doc.isEncrypted) doc.isAllSecurityToBeRemoved = true
            block(doc)
            doc.save(out)
        }
    }
}

fun Bitmap.toJpegBytes(quality: Int = 85): ByteArray = ByteArrayOutputStream().also { compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
