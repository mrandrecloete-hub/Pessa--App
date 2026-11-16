package com.pdfmaster.desktop

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.io.File
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest

class DesktopRelease(val version: String, val notes: String, val name: String, val url: String, val size: Long, val sumsUrl: String?)

/**
 * Updates from the public GitHub releases (tags pdfmaster-desktop-vX.Y.Z). The installer is downloaded, its SHA-256 is
 * checked against SHA256SUMS.txt, and then Windows Installer upgrades the installed app in place. Nothing about the user or
 * their documents is sent: only the public release list is requested.
 */
object Updater {
    const val TAG = "pdfmaster-desktop-v"
    const val API = "https://api.github.com/repos/mrandrecloete-hub/Pessa--App/releases?per_page=100"
    const val PAGE = "https://github.com/mrandrecloete-hub/Pessa--App/releases"
    val current: String = System.getProperty("jpackage.app-version") ?: Updater::class.java.classLoader.getResourceAsStream("version.txt")?.readBytes()?.toString(Charsets.UTF_8)?.trim() ?: "0.0.0"
    private val http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.ALWAYS).connectTimeout(java.time.Duration.ofSeconds(15)).build()

    fun parse(v: String): IntArray? { val p = v.removePrefix(TAG).removePrefix("v").trim().split('.'); if (p.size !in 1..3) return null; val n = p.map { it.toIntOrNull()?.takeIf { x -> x in 0..999 } ?: return null }; return IntArray(3) { n.getOrElse(it) { 0 } } }
    fun compare(a: String, b: String): Int { val x = parse(a) ?: return -1; val y = parse(b) ?: return 1; for (i in 0..2) if (x[i] != y[i]) return x[i].compareTo(y[i]); return 0 }

    /** Newest published release newer than [current] that has its installer attached. */
    fun newest(json: String, current: String = this.current): DesktopRelease? {
        val arr = JSONArray(json); var best: DesktopRelease? = null
        for (i in 0 until arr.length()) { val r = arr.getJSONObject(i); if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue
            val tag = r.optString("tag_name"); if (!tag.startsWith(TAG)) continue; val v = tag.removePrefix(TAG); if (parse(v) == null || compare(v, current) <= 0) continue
            val assets = r.optJSONArray("assets") ?: continue; val l = (0 until assets.length()).map { assets.getJSONObject(it) }
            val msi = l.firstOrNull { it.optString("name") == "PDFMASTER-Desktop-$v.msi" } ?: continue
            val d = DesktopRelease(v, r.optString("body").take(3000), msi.optString("name"), msi.optString("browser_download_url"), msi.optLong("size"), l.firstOrNull { it.optString("name") == "SHA256SUMS.txt" }?.optString("browser_download_url"))
            if (best == null || compare(d.version, best.version) > 0) best = d }
        return best
    }
    fun checksumFor(sums: String, name: String): String? = sums.lineSequence().map { it.trim().split(Regex("\\s+"), 2) }.firstOrNull { it.size == 2 && it[1].removePrefix("*") == name && it[0].matches(Regex("[0-9a-fA-F]{64}")) }?.get(0)?.lowercase()

    private fun get(url: String): HttpResponse<java.io.InputStream> = http.send(HttpRequest.newBuilder(URI(url)).header("User-Agent", "PDFMASTER-Desktop/$current").header("Accept", "application/vnd.github+json").build(), HttpResponse.BodyHandlers.ofInputStream())

    fun check(): DesktopRelease? { val r = get(API); check(r.statusCode() == 200) { if (r.statusCode() == 403 || r.statusCode() == 429) "GitHub is limiting requests right now. Try again in an hour." else "GitHub answered ${r.statusCode()}." }
        return newest(r.body().readBytes().toString(Charsets.UTF_8)) }

    /** Downloads and verifies the installer, returning the file. */
    fun download(d: DesktopRelease, progress: (Float) -> Unit): File {
        val sums = d.sumsUrl ?: throw IllegalStateException("This release has no checksum file, so it was not installed.")
        val expected = checksumFor(get(sums).body().readBytes().toString(Charsets.UTF_8), d.name) ?: throw IllegalStateException("The checksum for ${d.name} is missing, so it was not installed.")
        val out = File(System.getProperty("java.io.tmpdir"), d.name); val md = MessageDigest.getInstance("SHA-256"); val r = get(d.url); check(r.statusCode() == 200) { "GitHub answered ${r.statusCode()} for the download." }
        r.body().use { i -> out.outputStream().use { o -> val buf = ByteArray(1 shl 16); var done = 0L; while (true) { val n = i.read(buf); if (n < 0) break; o.write(buf, 0, n); md.update(buf, 0, n); done += n; if (d.size > 0) progress(done.toFloat() / d.size) } } }
        if (md.digest().joinToString("") { "%02x".format(it) } != expected) { out.delete(); throw IllegalStateException("The download did not match its checksum, so it was not installed. Try again.") }
        return out
    }

    /** Starts Windows Installer to upgrade the app. The caller then closes the app so its files can be replaced. */
    fun install(msi: File): Boolean {
        if (!System.getProperty("os.name").lowercase().contains("win")) { Files.open(File(msi.parentFile, "")); return false }
        ProcessBuilder("msiexec", "/i", msi.absolutePath, "/passive", "/norestart").start(); return true
    }
}

@Composable
fun UpdateBar(model: AppModel, exit: () -> Unit) {
    var release by remember { mutableStateOf<DesktopRelease?>(null) }
    var working by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(0f) }
    var failure by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    LaunchedEffect(model.autoUpdate) { if (model.autoUpdate && System.currentTimeMillis() - model.lastCheck > 3_600_000L) { model.lastCheck = System.currentTimeMillis(); model.saveSettings(); release = withContext(Dispatchers.IO) { runCatching { Updater.check() }.getOrNull() } } }
    release?.let { r -> Surface(color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (working) "Downloading PDFMASTER ${r.version}... ${(progress * 100).toInt()}%" else "PDFMASTER ${r.version} is available (you have ${Updater.current}).", Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer)
            failure?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(end = 12.dp)) }
            if (!working) { Button({ working = true; failure = null; scope.launch { try { val f = withContext(Dispatchers.IO) { Updater.download(r) { progress = it } }; if (withContext(Dispatchers.IO) { Updater.install(f) }) exit() else working = false } catch (e: Throwable) { failure = e.message; working = false } } }) { Text("Update now") }
                TextButton({ release = null }) { Text("Later") } } else LinearProgressIndicator(progress = { progress }, Modifier.width(160.dp))
        } } }
}
