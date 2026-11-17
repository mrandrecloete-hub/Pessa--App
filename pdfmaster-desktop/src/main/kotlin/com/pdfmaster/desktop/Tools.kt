package com.pdfmaster.desktop

import android.content.Context
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pdfmaster.app.engine.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

sealed interface Opt { val key: String; val label: String }
data class Choice(override val key: String, override val label: String, val choices: List<Pair<String, String>>, val default: String) : Opt
data class TextOpt(override val key: String, override val label: String, val default: String = "", val hint: String = "", val password: Boolean = false) : Opt
data class Toggle(override val key: String, override val label: String, val default: Boolean = false) : Opt

enum class In { PDF, PDFS, PDF2, IMAGES, OFFICE }

class ToolRun(val ctx: Context, val outDir: File, val passwords: Map<File, String>, val progress: Progress, val notes: MutableList<String>) {
    fun out(name: String) = Files.unique(outDir, name)
    fun pw(f: File) = passwords[f]
    /** Stops with a password request before any work starts. */
    fun need(f: File) { if (f.extension.equals("pdf", true) && pw(f) == null && needsPassword(f)) throw PasswordNeeded(f) }
}
class PasswordNeeded(val file: File) : Exception("Password needed")

class Tool(val id: String, val title: String, val blurb: String, val icon: ImageVector, val group: String, val input: In, val opts: List<Opt> = emptyList(),
           val run: suspend ToolRun.(List<File>, Map<String, String>) -> List<File>)

private fun base(f: File) = f.nameWithoutExtension
private val DPI = Choice("dpi", "Picture quality", listOf("96" to "Screen (96 dpi)", "150" to "Good (150 dpi)", "220" to "High (220 dpi)", "300" to "Print (300 dpi)"), "150")
private fun export(id: String, title: String, blurb: String, icon: ImageVector, ext: String, f: suspend ToolRun.(File, File) -> ExportResult) =
    Tool(id, title, blurb, icon, "Convert from PDF", In.PDF) { files, _ -> val d = files[0]; need(d); val r = f(d, out("${base(d)}.$ext")); notes.addAll(r.notes); r.files }

val TOOLS: List<Tool> = listOf(
    Tool("merge", "Merge PDF", "Join several PDFs into one, in the order you choose", Icons.Outlined.CallMerge, "Organise", In.PDFS) { files, _ ->
        files.forEach { need(it) }; val o = out("${base(files[0])} (merged).pdf"); PdfOps.merge(files, o, files.mapNotNull { f -> pw(f)?.let { f to it } }.toMap()); listOf(o) },
    Tool("split", "Split PDF", "Cut a PDF into several files", Icons.Outlined.CallSplit, "Organise", In.PDF, listOf(
        Choice("mode", "How to split", listOf("each" to "Every page as its own file", "every" to "Every N pages", "ranges" to "Page ranges I type"), "each"),
        TextOpt("n", "Pages per file (for Every N)", "2"), TextOpt("ranges", "Ranges, one file each (for ranges)", "", "Example: 1-3, 4-6, 9"))) { files, o ->
        val d = files[0]; need(d); val dir = File(outDir, "${base(d)} (split)")
        when (o["mode"]) {
            "ranges" -> { val total = pageCount(d, pw(d)); PdfOps.splitRanges(d, o["ranges"].orEmpty().split(',', ';').filter { it.isNotBlank() }.map { parsePages(it, total) }.also { require(it.isNotEmpty()) { "Type at least one page range" } }, dir, base(d), pw(d), progress) }
            "every" -> PdfOps.splitEvery(d, o["n"]?.trim()?.toIntOrNull() ?: throw IllegalArgumentException("Type how many pages each file should have"), dir, base(d), pw(d), progress)
            else -> PdfOps.splitEvery(d, 1, dir, base(d), pw(d), progress)
        } },
    Tool("extract", "Extract pages", "Save chosen pages as a new PDF", Icons.Outlined.ContentCut, "Organise", In.PDF, listOf(TextOpt("pages", "Pages to keep", "", "Example: 1-3, 5, 8-"))) { files, o ->
        val d = files[0]; need(d); val f = out("${base(d)} (pages ${o["pages"].orEmpty().trim().take(30)}).pdf"); PdfOps.extractPages(d, parsePages(o["pages"].orEmpty(), pageCount(d, pw(d))), f, pw(d)); listOf(f) },
    Tool("delete", "Delete pages", "Remove pages you do not need", Icons.Outlined.DeleteSweep, "Organise", In.PDF, listOf(TextOpt("pages", "Pages to delete", "", "Example: 2, 5-7"))) { files, o ->
        val d = files[0]; need(d); val f = out("${base(d)} (pages removed).pdf"); PdfOps.deletePages(d, parsePages(o["pages"].orEmpty(), pageCount(d, pw(d))).toSet(), f, pw(d)); listOf(f) },
    Tool("rotate", "Rotate pages", "Turn all or some pages", Icons.Outlined.RotateRight, "Organise", In.PDF, listOf(
        Choice("deg", "Turn", listOf("90" to "Right (90°)", "270" to "Left (90°)", "180" to "Upside down"), "90"), TextOpt("pages", "Pages (empty for all)", "", "Example: 1, 3-5"))) { files, o ->
        val d = files[0]; need(d); val f = out("${base(d)} (rotated).pdf"); PdfOps.rotate(d, o["deg"]!!.toInt(), o["pages"]?.takeIf { it.isNotBlank() }?.let { parsePages(it, pageCount(d, pw(d))).toSet() }, f, pw(d)); listOf(f) },
    Tool("compress", "Compress PDF", "Make the file smaller by shrinking its pictures", Icons.Outlined.Compress, "Organise", In.PDF, listOf(
        Choice("level", "Compression", listOf("LOW" to "Low (best quality)", "BALANCED" to "Balanced", "HIGH" to "High (smallest file)"), "BALANCED"), Toggle("meta", "Also remove metadata (title, author)", false))) { files, o ->
        val d = files[0]; need(d); val f = out("${base(d)} (compressed).pdf"); val lv = CompressLevel.valueOf(o["level"]!!)
        val r = PdfOps.compress(d, f, lv.maxImageSide, lv.jpegQuality, o["meta"] == "true", pw(d), progress)
        notes.add("Before ${Files.human(r.before)}, after ${Files.human(r.after)}: ${r.savedPercent} percent smaller. Your original is unchanged." + if (r.savedPercent <= 0) " This file has no large pictures to shrink." else ""); listOf(f) },
    Tool("watermark", "Watermark", "Stamp text across every page", Icons.Outlined.WaterDrop, "Organise", In.PDF, listOf(TextOpt("text", "Watermark text", "CONFIDENTIAL"),
        Choice("opacity", "Strength", listOf("0.1" to "Faint", "0.18" to "Normal", "0.35" to "Strong"), "0.18"), Choice("angle", "Direction", listOf("45" to "Diagonal", "0" to "Straight"), "45"))) { files, o ->
        val d = files[0]; need(d); val f = out("${base(d)} (watermark).pdf"); PdfOps.addWatermark(ctx, d, o["text"].orEmpty(), f, o["opacity"]!!.toFloat(), 0x5B5FEF, 0f, o["angle"]!!.toFloat(), pw(d)); listOf(f) },
    Tool("numbers", "Page numbers", "Number the pages", Icons.Outlined.FormatListNumbered, "Organise", In.PDF, listOf(
        Choice("style", "Style", listOf("{n}" to "1", "Page {n}" to "Page 1", "{n} / {total}" to "1 / 12", "Page {n} of {total}" to "Page 1 of 12"), "Page {n} of {total}"),
        Choice("anchor", "Position", listOf("BOTTOM_CENTER" to "Bottom centre", "BOTTOM_RIGHT" to "Bottom right", "BOTTOM_LEFT" to "Bottom left", "TOP_CENTER" to "Top centre", "TOP_RIGHT" to "Top right"), "BOTTOM_CENTER"))) { files, o ->
        val d = files[0]; need(d); val f = out("${base(d)} (numbered).pdf"); PdfOps.stampText(ctx, d, o["style"]!!, Anchor.valueOf(o["anchor"]!!), f, password = pw(d)); listOf(f) },
    Tool("images", "Extract pictures", "Save every picture inside the PDF", Icons.Outlined.PhotoLibrary, "Organise", In.PDF) { files, _ ->
        val d = files[0]; need(d); PdfOps.extractImages(d, File(outDir, "${base(d)} (pictures)"), base(d), pw(d), progress).also { require(it.isNotEmpty()) { "This PDF has no embedded pictures" } } },
    Tool("repair", "Repair PDF", "Try to rebuild a damaged PDF", Icons.Outlined.Healing, "Organise", In.PDF) { files, _ ->
        val d = files[0]; val f = out("${base(d)} (repaired).pdf"); val n = PdfOps.repair(d, f, pw(d)); notes.add("Rebuilt with $n page(s). Content that was lost in the damaged file cannot be recovered."); listOf(f) },

    export("to_docx", "PDF to Word", "Editable DOCX with text, headings and tables", Icons.Outlined.Description, "docx") { d, f -> PdfExport.toDocx(d, f, pw(d), progress) },
    export("to_xlsx", "PDF to Excel", "Tables and text into an XLSX workbook", Icons.Outlined.GridOn, "xlsx") { d, f -> PdfExport.toXlsx(d, f, pw(d), progress) },
    export("to_pptx", "PDF to PowerPoint", "One slide per page (pictures of the pages)", Icons.Outlined.Slideshow, "pptx") { d, f -> PdfBoxRasterizer(d, pw(d)).use { PdfExport.toPptx(d, it, f, pw(d), progress) } },
    export("to_txt", "PDF to text", "All the text as a TXT file", Icons.Outlined.Notes, "txt") { d, f -> PdfExport.toText(d, f, pw(d), progress) },
    export("to_csv", "PDF to CSV", "Table rows for spreadsheets", Icons.Outlined.TableRows, "csv") { d, f -> PdfExport.toCsv(d, f, pw(d), progress) },
    export("to_html", "PDF to HTML", "A web page with the text and tables", Icons.Outlined.Language, "html") { d, f -> PdfExport.toHtml(d, f, pw(d), progress) },
    export("to_rtf", "PDF to RTF", "Rich text that most word processors open", Icons.Outlined.TextSnippet, "rtf") { d, f -> PdfExport.toRtf(d, f, pw(d), progress) },
    export("to_tiff", "PDF to TIFF", "One multi page TIFF file", Icons.Outlined.BurstMode, "tiff") { d, f -> PdfBoxRasterizer(d, pw(d)).use { PdfExport.toTiff(d, it, f, 150, pw(d), progress) } },
    Tool("to_img", "PDF to pictures", "Every page as a JPG or PNG", Icons.Outlined.Image, "Convert from PDF", In.PDF, listOf(Choice("fmt", "Format", listOf("jpg" to "JPG (smaller)", "png" to "PNG (sharper)"), "jpg"), DPI)) { files, o ->
        val d = files[0]; need(d); PdfBoxRasterizer(d, pw(d)).use { PdfExport.toImages(d, it, File(outDir, "${base(d)} (pages)"), base(d), o["fmt"] == "png", o["dpi"]!!.toInt(), null, pw(d), progress) }.files },

    Tool("img_pdf", "Pictures to PDF", "JPG, PNG or WebP pictures into one PDF", Icons.Outlined.AddPhotoAlternate, "Convert to PDF", In.IMAGES, listOf(Choice("fit", "Page size", listOf("photo" to "Same shape as each picture", "a4" to "A4 with margins"), "photo"))) { files, o ->
        val f = out("${base(files[0])}.pdf"); PdfOps.imagesToPdf(files, f, o["fit"] == "a4", progress); listOf(f) },
    Tool("office_pdf", "File to PDF", "Word, Excel, PowerPoint, HTML, RTF and text files", Icons.Outlined.PictureAsPdf, "Convert to PDF", In.OFFICE) { files, _ ->
        files.map { d -> val f = out("${base(d)}.pdf"); notes.addAll(DocImport.toPdf(ctx, d, f, d.extension, progress)); f } },

    Tool("protect", "Protect with password", "AES 256 encryption, checked before the file is saved", Icons.Outlined.Lock, "Protect", In.PDF, listOf(
        TextOpt("pw", "Password to open", password = true), TextOpt("pw2", "Type it again", password = true), Toggle("print", "Allow printing", true), Toggle("copy", "Allow copying text", true))) { files, o ->
        val d = files[0]; need(d); require(o["pw"].orEmpty().length >= 4) { "Use a password of at least 4 characters" }; require(o["pw"] == o["pw2"]) { "The two passwords are not the same" }
        val f = out("${base(d)} (protected).pdf"); PdfOps.encrypt(d, o["pw"]!!, "", Permissions(o["print"] == "true", o["copy"] == "true", false, false, true), f, pw(d))
        notes.add("Encryption was verified: the new file does not open without the password. Keep the password safe, it cannot be recovered."); listOf(f) },
    Tool("unlock", "Remove password", "Save a copy without the password (you must know it)", Icons.Outlined.LockOpen, "Protect", In.PDF) { files, _ ->
        val d = files[0]; val p = pw(d) ?: if (needsPassword(d)) throw PasswordNeeded(d) else throw IllegalArgumentException("This PDF has no password to remove"); val f = out("${base(d)} (unlocked).pdf"); PdfOps.removePassword(d, p, f); listOf(f) },
    Tool("meta", "Remove metadata", "Delete author, title and software details from a copy", Icons.Outlined.Info, "Protect", In.PDF) { files, _ ->
        val d = files[0]; need(d); val i = PdfOps.info(d, pw(d)); val f = out("${base(d)} (no metadata).pdf"); PdfOps.stripMetadata(d, f, pw(d)); val a = PdfOps.info(f)
        check(a.title == null && a.author == null && !a.hasXmpMetadata) { "The metadata could not be removed" }; notes.add("Removed: title ${i.title ?: "(none)"}, author ${i.author ?: "(none)"}, created with ${i.creator ?: "(none)"}. Verified in the new copy."); listOf(f) }
)

val GROUPS = listOf("Organise", "Convert from PDF", "Convert to PDF", "Protect")

@Composable
fun ToolsScreen(model: AppModel) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item { Text("Tools", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold) }
        item {
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Brand.Accent).clickable { Files.pick("Choose a PDF or a photo of a document", Files.PDF + Files.IMAGES).firstOrNull()?.let { model.open(it).also { _ -> model.screen = Screen.Restore(it) } } }.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.PhotoFilter, null, tint = Color.White, modifier = Modifier.size(44.dp))
                Column(Modifier.padding(start = 16.dp).weight(1f)) {
                    Text("NEW", color = Brand.Cyan, fontSize = 11.sp, fontWeight = FontWeight.Black, letterSpacing = 1.5.sp)
                    Text("Professional Document Restoration", color = Color.White, style = MaterialTheme.typography.titleLarge)
                    Text("Photos and scans become clean, even, professional pages. Compare before and after.", color = Color.White.copy(alpha = 0.85f))
                }
                Icon(Icons.Outlined.ChevronRight, null, tint = Color.White)
            }
        }
        for (g in GROUPS) {
            item { Text(g, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 12.dp)) }
            items(TOOLS.filter { it.group == g }.chunked(3)) { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    row.forEach { t -> ToolCard(t, Modifier.weight(1f)) { model.screen = Screen.Tool(t.id, emptyList()) } }
                    repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
}

@Composable
fun ToolCard(t: Tool, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Surface(modifier.clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick), shape = RoundedCornerShape(16.dp), color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(16.dp).heightIn(min = 92.dp)) {
            Icon(t.icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(28.dp))
            Text(t.title, Modifier.padding(top = 8.dp), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(t.blurb, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ToolScreen(model: AppModel, id: String, initial: List<File>) {
    val tool = remember(id) { TOOLS.first { it.id == id } }
    val files = remember { mutableStateListOf<File>().apply { addAll(initial) } }
    val values = remember { mutableStateMapOf<String, String>().apply { tool.opts.forEach { o -> put(o.key, when (o) { is Choice -> o.default; is TextOpt -> o.default; is Toggle -> o.default.toString() }) } } }
    val passwords = remember { mutableStateMapOf<File, String>() }
    var running by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0f) }
    var results by remember { mutableStateOf<List<File>?>(null) }
    var notes by remember { mutableStateOf<List<String>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var askPw by remember { mutableStateOf<PasswordNeeded?>(null) }
    var wrongPw by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val exts = when (tool.input) { In.IMAGES -> Files.IMAGES; In.OFFICE -> Files.OFFICE; else -> Files.PDF }
    val multi = tool.input == In.PDFS || tool.input == In.IMAGES || tool.input == In.OFFICE
    val ready = files.isNotEmpty() && (tool.input != In.PDFS || files.size >= 2)

    fun run() {
        running = true; error = null; results = null; progress = 0f
        scope.launch {
            val n = ArrayList<String>()
            try {
                val outDir = model.outputDir ?: files[0].parentFile
                val out = withContext(Dispatchers.IO) { tool.run(ToolRun(Context(), outDir, passwords.toMap(), Progress { d, t -> progress = if (t > 0) d.toFloat() / t else 0f }, n), files.toList(), values.toMap()) }
                results = out; notes = n
            } catch (e: PasswordNeeded) { wrongPw = passwords.containsKey(e.file); askPw = e
            } catch (e: PasswordRequiredException) { askPw = PasswordNeeded(files.firstOrNull { it.extension.equals("pdf", true) && needsPassword(it) } ?: files[0]); wrongPw = true
            } catch (e: Throwable) { error = e.message ?: e.javaClass.simpleName }
            running = false
        }
    }

    Row(Modifier.fillMaxSize()) {
        Column(Modifier.weight(1f).fillMaxHeight().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { model.screen = Screen.Tools }) { Icon(Icons.Outlined.ArrowBack, "Back") }
                Icon(tool.icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(32.dp)); Spacer(Modifier.width(12.dp))
                Column { Text(tool.title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold); Text(tool.blurb, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
                Column(Modifier.padding(16.dp)) {
                    Text(when (tool.input) { In.PDFS -> "PDFs to join, in order"; In.IMAGES -> "Pictures, in page order"; In.OFFICE -> "Files to convert"; else -> "File" }, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    files.forEachIndexed { i, f ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Outlined.InsertDriveFile, null, tint = MaterialTheme.colorScheme.primary); Column(Modifier.weight(1f).padding(horizontal = 10.dp)) { Text(f.name, maxLines = 1); Text(Files.human(f.length()), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            if (multi) { IconButton({ if (i > 0) { files.removeAt(i); files.add(i - 1, f) } }, enabled = i > 0) { Icon(Icons.Outlined.ArrowUpward, "Up") }; IconButton({ if (i < files.size - 1) { files.removeAt(i); files.add(i + 1, f) } }, enabled = i < files.size - 1) { Icon(Icons.Outlined.ArrowDownward, "Down") } }
                            IconButton({ files.remove(f) }) { Icon(Icons.Outlined.Close, "Remove") }
                        }
                    }
                    OutlinedButton({ val p = Files.pick("Choose files", exts, multi); if (multi) files.addAll(p.filter { it !in files }) else if (p.isNotEmpty()) { files.clear(); files.add(p[0]) } }, Modifier.padding(top = 8.dp)) { Icon(Icons.Outlined.Add, null); Text("  " + if (files.isEmpty()) "Choose file" else if (multi) "Add more" else "Choose another") }
                }
            }
            if (tool.opts.isNotEmpty()) Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    tool.opts.forEach { o -> when (o) {
                        is Choice -> Column { Text(o.label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant); FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { o.choices.forEach { (k, l) -> FilterChip(values[o.key] == k, { values[o.key] = k }, label = { Text(l) }) } } }
                        is TextOpt -> OutlinedTextField(values[o.key].orEmpty(), { values[o.key] = it }, label = { Text(o.label) }, placeholder = if (o.hint.isNotEmpty()) ({ Text(o.hint) }) else null, singleLine = true, visualTransformation = if (o.password) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None, modifier = Modifier.fillMaxWidth())
                        is Toggle -> Row(verticalAlignment = Alignment.CenterVertically) { Text(o.label, Modifier.weight(1f)); Switch(values[o.key] == "true", { values[o.key] = it.toString() }) }
                    } }
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button({ run() }, enabled = ready && !running, modifier = Modifier.height(48.dp)) { Icon(Icons.Outlined.PlayArrow, null); Text("  Start") }
                Text("Saved next to the original" + (model.outputDir?.let { " (folder: ${it.name})" } ?: "") + ". Your original is never changed.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (running) { if (progress > 0f) LinearProgressIndicator(progress = { progress }, Modifier.fillMaxWidth()) else LinearProgressIndicator(Modifier.fillMaxWidth()) }
            error?.let { Surface(color = MaterialTheme.colorScheme.error.copy(alpha = 0.15f), shape = RoundedCornerShape(12.dp)) { Row(Modifier.padding(14.dp)) { Icon(Icons.Outlined.ErrorOutline, null, tint = MaterialTheme.colorScheme.error); Text("  $it  No file was saved and your original is unchanged.") } } }
            results?.let { r -> Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainer)) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Outlined.CheckCircle, null, tint = Color(0xFF22C55E)); Text("  Done: ${r.size} file${if (r.size == 1) "" else "s"} saved", fontWeight = FontWeight.SemiBold) }
                    r.take(30).forEach { f -> Row(verticalAlignment = Alignment.CenterVertically) { Text(f.name, Modifier.weight(1f), maxLines = 1); TextButton({ Files.open(f) }) { Text("Open") }; TextButton({ Files.showInFolder(f) }) { Text("Show in folder") } } }
                    notes.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                }
            } }
        }
    }
    askPw?.let { need ->
        var pw by remember(need) { mutableStateOf("") }
        AlertDialog({ askPw = null }, icon = { Icon(Icons.Outlined.Lock, null) }, title = { Text("Password needed") }, text = { Column { Text(if (wrongPw) "That password did not open ${need.file.name}. Try again." else "${need.file.name} is protected. Type its password."); Spacer(Modifier.height(10.dp))
            OutlinedTextField(pw, { pw = it }, singleLine = true, label = { Text("Password") }, visualTransformation = PasswordVisualTransformation(), isError = wrongPw) } },
            confirmButton = { TextButton({ passwords[need.file] = pw; askPw = null; run() }, enabled = pw.isNotEmpty()) { Text("Continue") } }, dismissButton = { TextButton({ askPw = null }) { Text("Cancel") } })
    }
}
