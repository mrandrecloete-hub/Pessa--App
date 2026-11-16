package com.pdfmaster.app.data

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import com.pdfmaster.app.engine.PageRasterizer
import com.pdfmaster.app.engine.PasswordRequiredException
import com.pdfmaster.app.engine.PdfOps
import com.pdfmaster.app.engine.needsPassword
import com.pdfmaster.app.engine.pageCount
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.max
import kotlin.math.roundToInt

/** Draws PDF pages with Android's own PDF renderer. One page is open at a time, so calls are serialised. */
class AndroidRasterizer(file: File) : PageRasterizer {
    private val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    private val renderer = try { PdfRenderer(pfd) } catch (e: SecurityException) { pfd.close(); throw PasswordRequiredException() }
    override val pageCount: Int get() = renderer.pageCount

    /** Page size in points. */
    @Synchronized fun size(index: Int): Pair<Int, Int> = renderer.openPage(index).use { it.width to it.height }

    @Synchronized override fun render(index: Int, maxSide: Int): Bitmap = renderer.openPage(index).use { p ->
        val s = maxSide.toFloat() / max(p.width, p.height)
        val bmp = Bitmap.createBitmap(max(1, (p.width * s).roundToInt()), max(1, (p.height * s).roundToInt()), Bitmap.Config.ARGB_8888)
        bmp.eraseColor(Color.WHITE)
        p.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        bmp
    }
    @Synchronized override fun close() { runCatching { renderer.close() }; runCatching { pfd.close() } }
}

data class StorageInfo(val files: Int, val libraryBytes: Long, val tempBytes: Long, val freeBytes: Long)

/** The app's own document library. Imported files are copied in, so the user's originals are never modified. */
@Singleton
class Library @Inject constructor(@ApplicationContext private val context: Context, private val dao: DocDao) {
    private val root = File(context.filesDir, "library").apply { mkdirs() }
    val signaturesDir = File(context.filesDir, "signatures").apply { mkdirs() }
    private val temp = File(context.cacheDir, "work").apply { mkdirs() }
    private val shared = File(context.cacheDir, "shared").apply { mkdirs() }

    fun file(doc: Doc) = File(doc.path)

    /** A fresh empty working folder for one job. */
    fun workDir(): File = File(temp, UUID.randomUUID().toString()).apply { mkdirs() }

    private fun safeName(name: String): String = name.replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001F]"), "_").trim().trim('.').take(120).ifEmpty { "document" }

    private fun displayName(uri: Uri): String {
        var name: String? = null
        runCatching {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) name = c.getString(0) }
        }
        return safeName(name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "document")
    }

    private fun extFor(name: String, mime: String?): String {
        val e = name.substringAfterLast('.', "").lowercase()
        if (e.isNotEmpty() && e.length <= 5) return e
        return when (mime) {
            "application/pdf" -> "pdf"; "image/jpeg" -> "jpg"; "image/png" -> "png"; "image/webp" -> "webp"; "text/plain" -> "txt"; "text/html" -> "html"
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> "docx"
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> "xlsx"
            "application/vnd.openxmlformats-officedocument.presentationml.presentation" -> "pptx"
            "application/rtf", "text/rtf" -> "rtf"; else -> "bin"
        }
    }

    /** Copies a file the user picked into the library. */
    suspend fun import(uri: Uri, category: String = Category.IMPORTED): Doc = withContext(Dispatchers.IO) {
        var name = displayName(uri)
        val ext = extFor(name, context.contentResolver.getType(uri))
        if (!name.lowercase().endsWith(".$ext")) name = "$name.$ext"
        val id = UUID.randomUUID().toString()
        val f = File(File(root, id).apply { mkdirs() }, name)
        try {
            (context.contentResolver.openInputStream(uri) ?: throw IllegalArgumentException("The file could not be opened")).use { i -> f.outputStream().use { i.copyTo(it) } }
            register(id, f, category)
        } catch (e: Exception) { f.parentFile?.deleteRecursively(); throw e }
    }

    /** Moves a file produced by a tool into the library. */
    suspend fun adopt(produced: File, name: String, category: String): Doc = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val f = File(File(root, id).apply { mkdirs() }, safeName(name))
        if (!produced.renameTo(f)) { produced.copyTo(f, overwrite = true); produced.delete() }
        register(id, f, category)
    }

    private suspend fun register(id: String, f: File, category: String): Doc {
        val ext = f.extension.lowercase()
        var pages = 0; var locked = false
        if (ext == "pdf") {
            // A quick check that this really is a PDF and whether it needs a password.
            f.inputStream().use { s -> val head = ByteArray(1024); val n = s.read(head); require(n > 4 && String(head, 0, n, Charsets.ISO_8859_1).contains("%PDF-")) { "${f.name} is not a PDF file" } }
            locked = runCatching { needsPassword(f) }.getOrElse { throw IllegalArgumentException("${f.name} is damaged and could not be read. Try the Repair tool on another copy.") }
            if (!locked) pages = runCatching { pageCount(f) }.getOrDefault(0)
        }
        val doc = Doc(id, f.name, f.absolutePath, ext, f.length(), pages, category, locked = locked)
        dao.put(doc); return doc
    }

    suspend fun delete(doc: Doc) = withContext(Dispatchers.IO) {
        File(doc.path).parentFile?.takeIf { it.parentFile == root }?.deleteRecursively()
        dao.deleteBookmarks(doc.id); dao.delete(doc.id)
    }

    suspend fun rename(doc: Doc, newName: String): Doc = withContext(Dispatchers.IO) {
        var n = safeName(newName); if (!n.lowercase().endsWith(".${doc.ext}")) n = "$n.${doc.ext}"
        val from = File(doc.path); val to = File(from.parentFile, n)
        if (from != to) check(from.renameTo(to)) { "The file could not be renamed" }
        doc.copy(name = n, path = to.absolutePath).also { dao.update(it) }
    }

    suspend fun duplicate(doc: Doc): Doc = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val f = File(File(root, id).apply { mkdirs() }, doc.name.substringBeforeLast('.') + " copy." + doc.ext)
        File(doc.path).copyTo(f)
        register(id, f, doc.category)
    }

    /** Writes a library file to a place the user chose with the system file picker. */
    suspend fun exportTo(doc: Doc, target: Uri) = withContext(Dispatchers.IO) {
        (context.contentResolver.openOutputStream(target, "w") ?: throw IllegalStateException("The chosen place could not be written to")).use { o -> File(doc.path).inputStream().use { it.copyTo(o) } }
    }

    fun uriFor(doc: Doc): Uri = FileProvider.getUriForFile(context, context.packageName + ".files", File(doc.path))

    fun mime(ext: String): String = when (ext) {
        "pdf" -> "application/pdf"; "jpg", "jpeg" -> "image/jpeg"; "png" -> "image/png"; "tiff", "tif" -> "image/tiff"; "txt" -> "text/plain"; "csv" -> "text/csv"
        "html" -> "text/html"; "rtf" -> "application/rtf"
        "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        else -> "application/octet-stream"
    }

    /** Opens Android's share sheet for one or more documents. */
    suspend fun share(docs: List<Doc>) {
        if (docs.isEmpty()) return
        val uris = ArrayList(docs.map { uriFor(it) })
        val intent = if (uris.size == 1) Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris[0]).setType(mime(docs[0].ext))
        else Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris).setType(docs.map { mime(it.ext) }.distinct().singleOrNull() ?: "*/*")
        intent.clipData = ClipData.newUri(context.contentResolver, docs[0].name, uris[0]).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        context.startActivity(Intent.createChooser(intent, "Share").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        docs.forEach { dao.shared(it.id, System.currentTimeMillis()) }
    }

    /** Opens a non PDF file (Word, Excel, pictures) in another app on the phone. */
    fun openExternally(doc: Doc): Boolean = try {
        context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uriFor(doc), mime(doc.ext))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (e: Exception) { false }

    /**
     * A file Android's renderer can draw. Password protected PDFs are unlocked into the private
     * cache (never the library) and that copy is removed with the temporary files.
     */
    suspend fun renderable(doc: Doc, password: String?): File = withContext(Dispatchers.IO) {
        val f = File(doc.path)
        if (!needsPassword(f)) return@withContext f
        if (password == null) throw PasswordRequiredException()
        val out = File(temp, "unlocked-${doc.id}.pdf")
        if (!out.exists() || out.lastModified() < f.lastModified()) PdfOps.removePassword(f, password, out)
        out
    }

    private fun size(dir: File): Long = dir.walkBottomUp().filter { it.isFile }.sumOf { it.length() }

    suspend fun storage(): StorageInfo = withContext(Dispatchers.IO) {
        StorageInfo(root.listFiles()?.size ?: 0, size(root), size(temp) + size(shared), context.filesDir.usableSpace)
    }

    /** Removes working files. With [olderThanMs] only stale ones go, so running jobs are not disturbed. */
    suspend fun clearTemp(olderThanMs: Long = 0): Long = withContext(Dispatchers.IO) {
        var freed = 0L
        val cutoff = System.currentTimeMillis() - olderThanMs
        for (dir in listOf(temp, shared)) dir.listFiles()?.forEach { f ->
            if (olderThanMs == 0L || f.lastModified() < cutoff) { freed += if (f.isDirectory) size(f) else f.length(); f.deleteRecursively() }
        }
        freed
    }
}
