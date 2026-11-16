package com.pdfmaster.desktop

import androidx.compose.runtime.*
import java.awt.Desktop
import java.awt.FileDialog
import java.awt.Frame
import java.io.File
import java.util.Properties

sealed interface Screen {
    data object Home : Screen
    data object Tools : Screen
    data object About : Screen
    data class Viewer(val file: File) : Screen
    data class Tool(val id: String, val files: List<File>) : Screen
    data class Restore(val file: File) : Screen
}

/** Everything the app remembers between runs lives in the user's own folder (~/.pdfmaster). */
class AppModel {
    private val dir = File(System.getProperty("user.home"), ".pdfmaster").apply { mkdirs() }
    private val settingsFile = File(dir, "settings.properties")
    private val recentFile = File(dir, "recent.txt")
    var screen by mutableStateOf<Screen>(Screen.Home)
    val recent = mutableStateListOf<File>()
    var dark by mutableStateOf(true)
    var autoUpdate by mutableStateOf(true)
    var lastCheck = 0L
    var toast by mutableStateOf<String?>(null)
    var outputDir: File? = null

    init {
        runCatching { Properties().apply { settingsFile.inputStream().use { load(it) } }.let { p -> dark = p.getProperty("dark", "true") == "true"; autoUpdate = p.getProperty("autoUpdate", "true") == "true"; lastCheck = p.getProperty("lastCheck", "0").toLong(); outputDir = p.getProperty("outputDir")?.takeIf { it.isNotBlank() }?.let(::File) } }
        runCatching { recentFile.readLines().map(::File).filter { it.exists() }.take(12).forEach { recent.add(it) } }
    }

    fun saveSettings() { runCatching { Properties().apply { setProperty("dark", dark.toString()); setProperty("autoUpdate", autoUpdate.toString()); setProperty("lastCheck", lastCheck.toString()); setProperty("outputDir", outputDir?.absolutePath ?: "") }.store(settingsFile.outputStream(), "PDFMASTER settings") } }

    fun open(f: File) {
        recent.remove(f); recent.add(0, f); while (recent.size > 12) recent.removeLast()
        runCatching { recentFile.writeText(recent.joinToString("\n") { it.absolutePath }) }
        screen = if (f.extension.lowercase() == "pdf") Screen.Viewer(f) else Screen.Restore(f)
    }
}

object Files {
    val PDF = listOf(".pdf"); val IMAGES = listOf(".jpg", ".jpeg", ".png", ".webp", ".bmp")
    val OFFICE = listOf(".docx", ".xlsx", ".pptx", ".html", ".htm", ".rtf", ".txt", ".csv")

    fun pick(title: String, exts: List<String>? = null, multi: Boolean = false): List<File> {
        val d = FileDialog(null as Frame?, title, FileDialog.LOAD); d.isMultipleMode = multi
        if (exts != null) d.setFilenameFilter { _, n -> exts.any { n.lowercase().endsWith(it) } }
        d.isVisible = true; return d.files?.toList().orEmpty()
    }
    fun save(title: String, name: String): File? { val d = FileDialog(null as Frame?, title, FileDialog.SAVE); d.file = name; d.isVisible = true; return d.file?.let { File(d.directory, it) } }
    fun open(f: File) { runCatching { Desktop.getDesktop().open(f) } }
    fun showInFolder(f: File) { runCatching { if (System.getProperty("os.name").lowercase().contains("win")) ProcessBuilder("explorer.exe", "/select,", f.absolutePath).start() else Desktop.getDesktop().open(f.parentFile) } }
    fun human(b: Long): String = when { b >= 1L shl 30 -> "%.2f GB".format(b / (1L shl 30).toDouble()); b >= 1L shl 20 -> "%.1f MB".format(b / (1L shl 20).toDouble()); b >= 1024 -> "%.0f KB".format(b / 1024.0); else -> "$b bytes" }
    /** A file name in [dir] that does not exist yet ("name.pdf", then "name (2).pdf"). */
    fun unique(dir: File, name: String): File { dir.mkdirs(); var f = File(dir, name); var n = 2; val base = name.substringBeforeLast('.'); val ext = name.substringAfterLast('.', ""); while (f.exists()) { f = File(dir, "$base ($n)" + if (ext.isNotEmpty()) ".$ext" else ""); n++ }; return f }
}
