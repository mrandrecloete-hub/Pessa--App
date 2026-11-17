package com.pdfmaster.app.tools

import android.content.Context
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.ui.graphics.vector.ImageVector
import com.pdfmaster.app.data.AndroidRasterizer
import com.pdfmaster.app.data.Category
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.JobRunner
import com.pdfmaster.app.data.Library
import com.pdfmaster.app.data.Settings
import com.pdfmaster.app.engine.*
import java.io.File

enum class InputKind { ONE_PDF, MANY_PDF, TWO_PDF, IMAGES, OFFICE, PDF_OR_IMAGE }

sealed interface Opt { val key: String; val label: String }
data class ChoiceOpt(override val key: String, override val label: String, val choices: List<Pair<String, String>>, val default: String) : Opt
data class TextOpt(override val key: String, override val label: String, val default: String = "", val hint: String = "", val password: Boolean = false,
                   val number: Boolean = false, val showIf: Pair<String, String>? = null) : Opt
data class ToggleOpt(override val key: String, override val label: String, val default: Boolean = false) : Opt

class Produced(val file: File, val name: String, val category: String = Category.CONVERTED)
class ToolOutput(val files: List<Produced>, val notes: List<String> = emptyList(), val report: String? = null)

/** What a tool can use while it runs. */
class ToolEnv(val context: Context, val library: Library, val job: JobRunner.Ctx, val passwords: Map<String, String>, val settings: Settings) {
    val work: File = library.workDir()
    fun file(d: Doc) = library.file(d)
    fun pw(d: Doc): String? = passwords[d.id]
    /** Fails with a password request before any work starts when a protected file has no password yet. */
    fun need(d: Doc) { if (d.isPdf && pw(d) == null && needsPassword(file(d))) throw PasswordRequiredException(d.id) }
    suspend fun raster(d: Doc): PageRasterizer = ToolHooks.rasterizer(library.renderable(d, pw(d)))
    fun out(name: String) = File(work, name)
    val Doc.base: String get() = name.substringBeforeLast('.')
}

/** Lets tests replace the PDF renderer of the phone, which does not exist in a simulated Android. */
object ToolHooks { @Volatile var rasterizer: (File) -> PageRasterizer = { AndroidRasterizer(it) } }

class ToolSpec(
    val id: String, val title: String, val blurb: String, val icon: ImageVector, val group: String, val input: InputKind,
    val opts: List<Opt> = emptyList(),
    /** Route of a dedicated screen (editor, form filler, page organiser) instead of the standard options and run flow. */
    val screen: String? = null,
    /** True when several files can be chosen and each is processed on its own (batch). */
    val batch: Boolean = false,
    val run: suspend ToolEnv.(List<Doc>, Map<String, String>) -> ToolOutput = { _, _ -> ToolOutput(emptyList()) }
)

object Groups { const val EDIT = "Edit and sign"; const val ORGANISE = "Organise"; const val FROM = "Convert from PDF"; const val TO = "Convert to PDF"; const val SECURE = "Protect"; const val SCAN = "Scan and OCR" }

private val ANCHORS = listOf("BOTTOM_CENTER" to "Bottom centre", "BOTTOM_RIGHT" to "Bottom right", "BOTTOM_LEFT" to "Bottom left", "TOP_CENTER" to "Top centre", "TOP_RIGHT" to "Top right", "TOP_LEFT" to "Top left")
private val DPI = ChoiceOpt("dpi", "Picture quality", listOf("96" to "Screen (96 dpi)", "150" to "Good (150 dpi)", "220" to "High (220 dpi)", "300" to "Print (300 dpi)"), "150")

private fun fromPdf(id: String, title: String, blurb: String, icon: ImageVector, ext: String, opts: List<Opt> = emptyList(),
                    convert: suspend ToolEnv.(Doc, File, Map<String, String>) -> ExportResult) =
    ToolSpec(id, title, blurb, icon, Groups.FROM, InputKind.ONE_PDF, opts, batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val r = convert(d, out("${d.base}.$ext"), o)
        ToolOutput(r.files.map { Produced(it, it.name) }, r.notes)
    }

val TOOLS: List<ToolSpec> = listOf(
    // ---------- Edit and sign (dedicated screens) ----------
    ToolSpec("edit", "Edit PDF", "Add text, pictures, drawings, shapes, highlights, notes and stamps", Icons.Outlined.Edit, Groups.EDIT, InputKind.ONE_PDF, screen = "editor"),
    ToolSpec("sign", "Sign PDF", "Place your signature, initials and the date", Icons.Outlined.Draw, Groups.EDIT, InputKind.ONE_PDF, screen = "editor?start=sign"),
    ToolSpec("form", "Fill form", "Fill in, check and save PDF form fields", Icons.Outlined.Assignment, Groups.EDIT, InputKind.ONE_PDF, screen = "form"),
    ToolSpec("redact", "Redact", "Permanently remove text and pictures under the areas you mark", Icons.Outlined.HideSource, Groups.SECURE, InputKind.ONE_PDF, screen = "editor?start=redact"),

    // ---------- Organise ----------
    ToolSpec("organise", "Organise pages", "Reorder, rotate, duplicate and delete pages with thumbnails", Icons.Outlined.GridView, Groups.ORGANISE, InputKind.ONE_PDF, screen = "pages"),
    ToolSpec("merge", "Merge PDF", "Join several PDFs into one, in the order you choose", Icons.Outlined.CallMerge, Groups.ORGANISE, InputKind.MANY_PDF) { docs, _ ->
        docs.forEach { need(it) }
        val f = out("${docs[0].base} (merged).pdf")
        PdfOps.merge(docs.map { file(it) }, f, docs.mapNotNull { d -> pw(d)?.let { file(d) to it } }.toMap())
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("split", "Split PDF", "Cut a PDF into several files", Icons.Outlined.CallSplit, Groups.ORGANISE, InputKind.ONE_PDF, listOf(
        ChoiceOpt("mode", "How to split", listOf("each" to "Every page as its own file", "every" to "Every N pages", "ranges" to "Page ranges I type"), "each"),
        TextOpt("n", "Pages per file", "2", number = true, showIf = "mode" to "every"),
        TextOpt("ranges", "Ranges, one file each", "", "Example: 1-3, 4-6, 9", showIf = "mode" to "ranges"))) { docs, o ->
        val d = docs[0]; need(d)
        val dir = File(work, "parts")
        val files = when (o["mode"]) {
            "ranges" -> { val total = pageCount(file(d), pw(d))
                PdfOps.splitRanges(file(d), o["ranges"].orEmpty().split(',', ';').filter { it.isNotBlank() }.map { parsePages(it, total) }.also { require(it.isNotEmpty()) { "Type at least one page range" } }, dir, d.base, pw(d), job.progress) }
            "every" -> PdfOps.splitEvery(file(d), o["n"]?.toIntOrNull() ?: throw IllegalArgumentException("Type how many pages each file should have"), dir, d.base, pw(d), job.progress)
            else -> PdfOps.splitEvery(file(d), 1, dir, d.base, pw(d), job.progress)
        }
        ToolOutput(files.map { Produced(it, it.name, Category.EDITED) })
    },
    ToolSpec("extract", "Extract pages", "Save chosen pages as a new PDF", Icons.Outlined.ContentCut, Groups.ORGANISE, InputKind.ONE_PDF,
        listOf(TextOpt("pages", "Pages to keep", "", "Example: 1-3, 5, 8-"))) { docs, o ->
        val d = docs[0]; need(d)
        val f = out("${d.base} (pages ${o["pages"].orEmpty().trim().take(30)}).pdf")
        PdfOps.extractPages(file(d), parsePages(o["pages"].orEmpty(), pageCount(file(d), pw(d))), f, pw(d))
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("delete", "Delete pages", "Remove pages you do not need", Icons.Outlined.DeleteSweep, Groups.ORGANISE, InputKind.ONE_PDF,
        listOf(TextOpt("pages", "Pages to delete", "", "Example: 2, 5-7"))) { docs, o ->
        val d = docs[0]; need(d)
        val f = out("${d.base} (pages removed).pdf")
        PdfOps.deletePages(file(d), parsePages(o["pages"].orEmpty(), pageCount(file(d), pw(d))).toSet(), f, pw(d))
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("rotate", "Rotate pages", "Turn all or some pages", Icons.Outlined.RotateRight, Groups.ORGANISE, InputKind.ONE_PDF, listOf(
        ChoiceOpt("deg", "Turn", listOf("90" to "Right (90°)", "270" to "Left (90°)", "180" to "Upside down (180°)"), "90"),
        TextOpt("pages", "Pages (empty for all)", "", "Example: 1, 3-5")), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val f = out("${d.base} (rotated).pdf")
        PdfOps.rotate(file(d), o["deg"]!!.toInt(), o["pages"]?.takeIf { it.isNotBlank() }?.let { parsePages(it, pageCount(file(d), pw(d))).toSet() }, f, pw(d))
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("compress", "Compress PDF", "Make the file smaller by shrinking its pictures", Icons.Outlined.Compress, Groups.ORGANISE, InputKind.ONE_PDF, listOf(
        ChoiceOpt("level", "Compression", listOf("LOW" to "Low (best quality)", "BALANCED" to "Balanced", "HIGH" to "High (smallest file)", "CUSTOM" to "Custom"), "BALANCED"),
        TextOpt("side", "Longest picture side in pixels", "1200", number = true, showIf = "level" to "CUSTOM"),
        TextOpt("quality", "JPEG quality 10 to 95", "60", number = true, showIf = "level" to "CUSTOM"),
        ToggleOpt("meta", "Also remove metadata (title, author)", false)), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val f = out("${d.base} (compressed).pdf")
        val (side, q) = if (o["level"] == "CUSTOM") (o["side"]?.toIntOrNull() ?: 1200).coerceIn(200, 6000) to ((o["quality"]?.toIntOrNull() ?: 60).coerceIn(10, 95) / 100f)
        else CompressLevel.valueOf(o["level"]!!).let { it.maxImageSide to it.jpegQuality }
        val r = PdfOps.compress(file(d), f, side, q, o["meta"] == "true", pw(d), job.progress)
        val report = "Before: ${human(r.before)}\nAfter: ${human(r.after)}\nSaved: ${r.savedPercent} percent\nPictures re-compressed: ${r.imagesChanged}"
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)), listOfNotNull(
            "This file could not be made smaller. It has no large pictures to shrink, so the copy is the same size as the original.".takeIf { r.savedPercent <= 0 },
            "Your original file is kept unchanged."), report)
    },
    ToolSpec("watermark", "Watermark", "Stamp text across every page", Icons.Outlined.WaterDrop, Groups.ORGANISE, InputKind.ONE_PDF, listOf(
        TextOpt("text", "Watermark text", "CONFIDENTIAL"),
        ChoiceOpt("opacity", "Strength", listOf("0.1" to "Faint", "0.18" to "Normal", "0.35" to "Strong"), "0.18"),
        ChoiceOpt("angle", "Direction", listOf("45" to "Diagonal", "0" to "Straight"), "45"),
        ChoiceOpt("color", "Colour", listOf("5B5FEF" to "Indigo", "808080" to "Grey", "DC2626" to "Red", "111111" to "Black"), "5B5FEF")), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val f = out("${d.base} (watermark).pdf")
        PdfOps.addWatermark(context, file(d), o["text"].orEmpty(), f, o["opacity"]!!.toFloat(), o["color"]!!.toInt(16), 0f, o["angle"]!!.toFloat(), pw(d))
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("numbers", "Page numbers", "Number the pages", Icons.Outlined.FormatListNumbered, Groups.ORGANISE, InputKind.ONE_PDF, listOf(
        ChoiceOpt("style", "Style", listOf("{n}" to "1", "Page {n}" to "Page 1", "{n} / {total}" to "1 / 12", "Page {n} of {total}" to "Page 1 of 12"), "Page {n} of {total}"),
        ChoiceOpt("anchor", "Position", ANCHORS, "BOTTOM_CENTER"), TextOpt("start", "First number", "1", number = true),
        ToggleOpt("skip", "No number on the first page", false)), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val f = out("${d.base} (numbered).pdf")
        PdfOps.stampText(context, file(d), o["style"]!!, Anchor.valueOf(o["anchor"]!!), f, startAt = o["start"]?.toIntOrNull() ?: 1, skipFirst = o["skip"] == "true", password = pw(d))
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("header", "Header and footer", "Add a line of text at the top or bottom of every page", Icons.Outlined.VerticalAlignTop, Groups.ORGANISE, InputKind.ONE_PDF, listOf(
        TextOpt("header", "Header text", "", "Use {date}, {n} and {total} if you like"), ChoiceOpt("hpos", "Header position", ANCHORS.filter { it.first.startsWith("TOP") }, "TOP_LEFT"),
        TextOpt("footer", "Footer text", ""), ChoiceOpt("fpos", "Footer position", ANCHORS.filter { it.first.startsWith("BOTTOM") }, "BOTTOM_LEFT"),
        ToggleOpt("skip", "Leave the first page clean", false)), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val h = o["header"].orEmpty().trim(); val ft = o["footer"].orEmpty().trim()
        require(h.isNotEmpty() || ft.isNotEmpty()) { "Type a header or a footer" }
        val f = out("${d.base} (header footer).pdf")
        var src = file(d); var pass = pw(d)
        if (h.isNotEmpty()) { val mid = if (ft.isEmpty()) f else out("mid.pdf"); PdfOps.stampText(context, src, h, Anchor.valueOf(o["hpos"]!!), mid, skipFirst = o["skip"] == "true", password = pass); src = mid; pass = null }
        if (ft.isNotEmpty()) PdfOps.stampText(context, src, ft, Anchor.valueOf(o["fpos"]!!), f, skipFirst = o["skip"] == "true", password = pass)
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("compare", "Compare PDFs", "See which text was added or removed between two versions", Icons.Outlined.Compare, Groups.ORGANISE, InputKind.TWO_PDF) { docs, _ ->
        docs.forEach { need(it) }
        val r = PdfOps.compare(file(docs[0]), file(docs[1]), pw(docs[0]), pw(docs[1]))
        val sb = StringBuilder("A: ${docs[0].name} (${r.pagesA} pages)\nB: ${docs[1].name} (${r.pagesB} pages)\n\n")
        if (r.identicalText) sb.append("The text of both documents is the same.")
        else { sb.append("${r.diffs.size} page(s) have different text.\n"); for (d in r.diffs) { sb.append("\nPage ${d.page}\n"); d.removed.forEach { sb.append("  − only in A: $it\n") }; d.added.forEach { sb.append("  + only in B: $it\n") } } }
        val f = out("Comparison of ${docs[0].base} and ${docs[1].base}.txt"); f.writeText(sb.toString())
        ToolOutput(listOf(Produced(f, f.name)), listOf("Only text is compared. Changes to pictures, layout or fonts are not detected."), sb.toString())
    },
    ToolSpec("images", "Extract pictures", "Save every picture inside the PDF", Icons.Outlined.PhotoLibrary, Groups.ORGANISE, InputKind.ONE_PDF) { docs, _ ->
        val d = docs[0]; need(d)
        val files = PdfOps.extractImages(file(d), File(work, "img"), d.base, pw(d), job.progress)
        require(files.isNotEmpty()) { "This PDF has no embedded pictures" }
        ToolOutput(files.map { Produced(it, it.name) })
    },
    ToolSpec("repair", "Repair PDF", "Try to rebuild a damaged PDF", Icons.Outlined.Healing, Groups.ORGANISE, InputKind.ONE_PDF) { docs, _ ->
        val d = docs[0]
        val f = out("${d.base} (repaired).pdf")
        val n = try { PdfOps.repair(file(d), f, pw(d)) } catch (e: PasswordRequiredException) { throw PasswordRequiredException(d.id) } catch (e: Exception) { throw IllegalStateException("This file is too damaged to rebuild: ${e.message ?: "its pages could not be found"}") }
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)), listOf("Rebuilt with $n page(s). Check the pages: content that was lost in the damaged file cannot be recovered."))
    },

    // ---------- Convert from PDF ----------
    fromPdf("to_docx", "PDF to Word", "Editable DOCX with text, headings and tables", Icons.Outlined.Description, "docx",
        listOf(ChoiceOpt("mode", "Result", listOf("edit" to "Editable text (layout is rebuilt)", "exact" to "Exact look (pages as pictures)"), "edit"))) { d, f, o ->
        if (o["mode"] == "exact") raster(d).use { PdfExport.toDocxExact(file(d), it, f, pw(d), job.progress) } else PdfExport.toDocx(file(d), f, pw(d), job.progress)
    },
    fromPdf("to_xlsx", "PDF to Excel", "Tables and text into an XLSX workbook", Icons.Outlined.GridOn, "xlsx") { d, f, _ -> PdfExport.toXlsx(file(d), f, pw(d), job.progress) },
    fromPdf("to_pptx", "PDF to PowerPoint", "One slide per page", Icons.Outlined.Slideshow, "pptx") { d, f, _ -> raster(d).use { PdfExport.toPptx(file(d), it, f, pw(d), job.progress) } },
    fromPdf("to_txt", "PDF to text", "All the text as a TXT file", Icons.Outlined.Notes, "txt") { d, f, _ -> PdfExport.toText(file(d), f, pw(d), job.progress) },
    fromPdf("to_csv", "PDF to CSV", "Table rows for spreadsheets and databases", Icons.Outlined.TableRows, "csv") { d, f, _ -> PdfExport.toCsv(file(d), f, pw(d), job.progress) },
    fromPdf("to_html", "PDF to HTML", "A web page with the text and tables", Icons.Outlined.Language, "html") { d, f, _ -> PdfExport.toHtml(file(d), f, pw(d), job.progress) },
    fromPdf("to_rtf", "PDF to RTF", "Rich text that most word processors open", Icons.Outlined.TextSnippet, "rtf") { d, f, _ -> PdfExport.toRtf(file(d), f, pw(d), job.progress) },
    ToolSpec("to_img", "PDF to pictures", "Every page as a JPG or PNG", Icons.Outlined.Image, Groups.FROM, InputKind.ONE_PDF, listOf(
        ChoiceOpt("fmt", "Format", listOf("jpg" to "JPG (smaller)", "png" to "PNG (sharper)"), "jpg"), DPI, TextOpt("pages", "Pages (empty for all)", "", "Example: 1-3")), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val pages = o["pages"]?.takeIf { it.isNotBlank() }?.let { parsePages(it, pageCount(file(d), pw(d))) }
        val r = raster(d).use { PdfExport.toImages(file(d), it, File(work, "pages"), d.base, o["fmt"] == "png", o["dpi"]!!.toInt(), pages, pw(d), job.progress) }
        ToolOutput(r.files.map { Produced(it, it.name) })
    },
    fromPdf("to_tiff", "PDF to TIFF", "One multi page TIFF file", Icons.Outlined.BurstMode, "tiff", listOf(DPI)) { d, f, o -> raster(d).use { PdfExport.toTiff(file(d), it, f, o["dpi"]!!.toInt(), pw(d), job.progress) } },

    // ---------- Convert to PDF ----------
    ToolSpec("img_pdf", "Pictures to PDF", "JPG, PNG or WebP pictures into one PDF", Icons.Outlined.AddPhotoAlternate, Groups.TO, InputKind.IMAGES,
        listOf(ChoiceOpt("fit", "Page size", listOf("photo" to "Same shape as each picture", "a4" to "A4 with margins"), "photo"))) { docs, o ->
        val f = out("${docs[0].base}.pdf")
        PdfOps.imagesToPdf(docs.map { file(it) }, f, o["fit"] == "a4", job.progress)
        ToolOutput(listOf(Produced(f, f.name)))
    },
    ToolSpec("office_pdf", "File to PDF", "Word, Excel, PowerPoint, HTML, RTF and text files", Icons.Outlined.PictureAsPdf, Groups.TO, InputKind.OFFICE, batch = true) { docs, _ ->
        val d = docs[0]
        val f = out("${d.base}.pdf")
        ToolOutput(listOf(Produced(f, f.name)), DocImport.toPdf(context, file(d), f, d.ext, job.progress))
    },

    // ---------- Protect ----------
    ToolSpec("protect", "Protect with password", "AES 256 encryption, checked before the file is saved", Icons.Outlined.Lock, Groups.SECURE, InputKind.ONE_PDF, listOf(
        TextOpt("pw", "Password to open", "", password = true), TextOpt("pw2", "Type it again", "", password = true),
        ToggleOpt("print", "Allow printing", true), ToggleOpt("copy", "Allow copying text", true), ToggleOpt("modify", "Allow changes", false)), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        require(o["pw"].orEmpty().length >= 4) { "Use a password of at least 4 characters" }
        require(o["pw"] == o["pw2"]) { "The two passwords are not the same" }
        val f = out("${d.base} (protected).pdf")
        PdfOps.encrypt(file(d), o["pw"]!!, "", Permissions(o["print"] == "true", o["copy"] == "true", o["modify"] == "true", o["modify"] == "true", true), f, pw(d))
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)), listOf("Encryption was verified: the new file does not open without the password. Keep the password safe, it cannot be recovered.",
            "The permission switches (printing, copying) are requests to PDF readers. Well behaved readers honour them, but they are not a strong lock like the password."))
    },
    ToolSpec("unlock", "Remove password", "Save a copy without the password (you must know it)", Icons.Outlined.LockOpen, Groups.SECURE, InputKind.ONE_PDF) { docs, _ ->
        val d = docs[0]
        val p = pw(d) ?: if (needsPassword(file(d))) throw PasswordRequiredException(d.id) else throw IllegalArgumentException("This PDF has no password to remove")
        val f = out("${d.base} (unlocked).pdf")
        PdfOps.removePassword(file(d), p, f)
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)))
    },
    ToolSpec("meta", "Metadata", "See or remove hidden details such as author and software", Icons.Outlined.Info, Groups.SECURE, InputKind.ONE_PDF, listOf(
        ChoiceOpt("act", "Action", listOf("view" to "Only show the details", "strip" to "Remove all metadata", "set" to "Set title and author"), "view"),
        TextOpt("title", "Title", "", showIf = "act" to "set"), TextOpt("author", "Author", "", showIf = "act" to "set"))) { docs, o ->
        val d = docs[0]; need(d)
        val i = PdfOps.info(file(d), pw(d))
        val fmt = java.text.SimpleDateFormat("d MMM yyyy HH:mm", java.util.Locale.getDefault())
        val rep = listOf("Pages" to i.pages.toString(), "PDF version" to i.version.toString(), "Password protected" to if (i.encrypted) "Yes" else "No", "Form fields" to if (i.hasForm) "Yes" else "No",
            "Title" to i.title, "Author" to i.author, "Subject" to i.subject, "Keywords" to i.keywords, "Created with" to i.creator, "PDF producer" to i.producer,
            "Created" to i.created?.let { fmt.format(it) }, "Changed" to i.modified?.let { fmt.format(it) }, "Extra XMP metadata" to if (i.hasXmpMetadata) "Present" else "None")
            .plus(i.custom.map { it.key to it.value }).joinToString("\n") { "${it.first}: ${it.second?.takeIf { v -> v.isNotBlank() } ?: "(none)"}" }
        when (o["act"]) {
            "strip" -> { val f = out("${d.base} (no metadata).pdf"); PdfOps.stripMetadata(file(d), f, pw(d))
                val after = PdfOps.info(f); check(after.title == null && after.author == null && !after.hasXmpMetadata) { "The metadata could not be removed" }
                ToolOutput(listOf(Produced(f, f.name, Category.EDITED)), listOf("Verified: the new copy has no title, author, software details or XMP metadata."), "Details that were removed:\n\n$rep") }
            "set" -> { val f = out("${d.base} (details).pdf"); PdfOps.setMetadata(file(d), f, o["title"]?.takeIf { it.isNotBlank() }, o["author"]?.takeIf { it.isNotBlank() }, i.subject, i.keywords, pw(d))
                ToolOutput(listOf(Produced(f, f.name, Category.EDITED))) }
            else -> ToolOutput(emptyList(), report = rep)
        }
    },

    // ---------- Scan and OCR ----------
    ToolSpec("restore", "Professional Document Restoration", "Turn photos and scans into clean, professional documents. Compare before and after", Icons.Outlined.PhotoFilter, Groups.SCAN, InputKind.PDF_OR_IMAGE, screen = "restore"),
    ToolSpec("scan", "Scan document", "Use the camera: edges, cropping and clean up are automatic", Icons.Outlined.DocumentScanner, Groups.SCAN, InputKind.ONE_PDF, screen = "scan"),
    ToolSpec("polish", "Clean up scan", "Make scanned pages look like freshly created documents: even white paper, sharp text, A4", Icons.Outlined.AutoFixHigh, Groups.SCAN, InputKind.ONE_PDF, listOf(
        ChoiceOpt("style", "Look", listOf("clean" to "Clean (sharp page picture)", "typed" to "Rebuilt (text retyped from the scan)"), "clean"),
        ChoiceOpt("colour", "Colour", listOf("colour" to "Colour", "grey" to "Greyscale", "bw" to "Black and white"), "colour"),
        ToggleOpt("a4", "Fit to a standard A4 page", true)), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val typed = o["style"] == "typed"
        val mode = when (o["colour"]) { "bw" -> ScanClean.Mode.BW; "grey" -> ScanClean.Mode.GREY; else -> ScanClean.Mode.COLOUR }
        val f = out("${d.base} (clean).pdf")
        var retyped = 0; var skipped = 0
        raster(d).use { r ->
            ScanPdfWriter(context, mode, typed, o["a4"] != "false").use { w ->
                for (i in 0 until r.pageCount) {
                    job.progress.report(i, r.pageCount)
                    val shot = r.render(i, 2600)
                    val cleaned = try { ScanClean.clean(shot, mode, 2600) } finally { shot.recycle() }
                    try {
                        val lines = if (typed || settings.ocrAfterScan) try { Ocr.lines(cleaned) } catch (e: Exception) { if (typed) throw IllegalStateException("Text recognition is not available on this phone, so the text cannot be rebuilt. Use the Clean look instead.") else emptyList() } else emptyList()
                        w.add(ScanPage(cleaned, lines))
                    } finally { cleaned.recycle() }
                }
                retyped = w.retypedLines; skipped = w.skippedLines
                w.save(f, d.base)
            }
        }
        ToolOutput(listOf(Produced(f, f.name, Category.EDITED)), listOfNotNull(
            "Each page was straightened onto an even white background with shadows and tint removed, and the text sharpened. Your original scan is kept.",
            if (typed) "Rebuilt $retyped line(s) of text as sharp typed text${if (skipped > 0) ". $skipped line(s) were too unclear to retype safely and were left as they are" else ""}. Check names, numbers and amounts against the original: text recognition can misread. Logos, signatures, stamps and handwriting stay as pictures." else null))
    },
    ToolSpec("ocr", "Make searchable (OCR)", "Recognise the text in scans so you can search and copy it", Icons.Outlined.ManageSearch, Groups.SCAN, InputKind.ONE_PDF,
        listOf(ToggleOpt("skip", "Skip pages that already have text", true), ToggleOpt("txt", "Also save the recognised text as a TXT file", false)), batch = true) { docs, o ->
        val d = docs[0]; need(d)
        val existing = if (o["skip"] == "true") PdfOps.pageTexts(file(d), pw(d)) else emptyList()
        val lines = HashMap<Int, List<OcrLine>>(); val text = StringBuilder()
        raster(d).use { r ->
            for (i in 0 until r.pageCount) {
                job.progress.report(i, r.pageCount)
                if (existing.getOrNull(i)?.isNotBlank() == true) { text.append(existing[i].trim()).append("\n\n"); continue }
                val bmp = r.render(i, 2200)
                val l = try { Ocr.lines(bmp) } finally { bmp.recycle() }
                lines[i] = l; text.append(l.joinToString("\n") { it.text }).append("\n\n")
            }
        }
        val found = lines.values.sumOf { it.size }
        val outs = ArrayList<Produced>()
        if (found > 0) { val f = out("${d.base} (searchable).pdf"); SearchablePdf.addTextLayer(context, file(d), lines, f, pw(d)); outs.add(Produced(f, f.name, Category.EDITED)) }
        if (o["txt"] == "true" && text.isNotBlank()) { val t = out("${d.base} (text).txt"); t.writeText(text.toString().trim()); outs.add(Produced(t, t.name)) }
        ToolOutput(outs, listOfNotNull(
            if (found == 0) (if (existing.any { it.isNotBlank() }) "Every page already has text, so nothing needed recognising." else "No text could be recognised on these pages.") else "Recognised $found line(s) of text on ${lines.count { it.value.isNotEmpty() }} page(s). The page pictures are unchanged; an invisible text layer was added.",
            "Recognition works for Latin script languages (English, Afrikaans, German, Oshiwambo, Portuguese and similar). Handwriting and very small print can be misread, so check important figures."),
            text.toString().trim().takeIf { it.isNotEmpty() }?.take(20000))
    },
    ToolSpec("text", "Extract text", "Copy or save all the text of a PDF", Icons.Outlined.TextFields, Groups.SCAN, InputKind.ONE_PDF) { docs, _ ->
        val d = docs[0]; need(d)
        val t = PdfOps.pageTexts(file(d), pw(d), job.progress)
        require(t.any { it.isNotBlank() }) { "No text was found. If this is a scan, use Make searchable (OCR) first." }
        ToolOutput(emptyList(), report = t.mapIndexed { i, s -> "Page ${i + 1}\n${s.trim()}" }.joinToString("\n\n"))
    }
)

fun tool(id: String): ToolSpec = TOOLS.first { it.id == id }

fun human(bytes: Long): String = when {
    bytes >= 1L shl 30 -> "%.2f GB".format(bytes / (1L shl 30).toDouble())
    bytes >= 1L shl 20 -> "%.1f MB".format(bytes / (1L shl 20).toDouble())
    bytes >= 1024 -> "%.0f KB".format(bytes / 1024.0)
    else -> "$bytes bytes"
}

val IMAGE_EXTS = setOf("jpg", "jpeg", "png", "webp", "bmp")
val OFFICE_EXTS = setOf("docx", "xlsx", "pptx", "html", "htm", "rtf", "txt", "csv", "md")
fun ToolSpec.accepts(d: Doc): Boolean = when (input) {
    InputKind.ONE_PDF, InputKind.MANY_PDF, InputKind.TWO_PDF -> d.isPdf
    InputKind.PDF_OR_IMAGE -> d.isPdf || d.ext in IMAGE_EXTS
    InputKind.IMAGES -> d.ext in IMAGE_EXTS
    InputKind.OFFICE -> d.ext in OFFICE_EXTS
}
