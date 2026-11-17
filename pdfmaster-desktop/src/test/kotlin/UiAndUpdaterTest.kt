import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.ImageComposeScene
import androidx.compose.ui.unit.Density
import com.pdfmaster.desktop.*
import com.sun.net.httpserver.HttpServer
import org.jetbrains.skia.EncodedImageFormat
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.InetSocketAddress
import java.security.MessageDigest

@OptIn(ExperimentalComposeUiApi::class)
class UiAndUpdaterTest {
    private val out = File("build/screens").apply { mkdirs() }
    private fun photo(n: String): File = File(out, "$n.jpg").also { f -> javaClass.classLoader.getResourceAsStream("photos/$n.jpg")!!.use { i -> f.outputStream().use { i.copyTo(it) } } }

    private fun shot(name: String, w: Int = 1360, h: Int = 860, waitMs: Long = 0, content: @androidx.compose.runtime.Composable () -> Unit) {
        val scene = ImageComposeScene(w, h, Density(1f)) { content() }
        try {
            var t = 0L; val end = System.currentTimeMillis() + waitMs
            do { scene.render(t); t += 100_000_000L; Thread.sleep(100) } while (System.currentTimeMillis() < end)
            val img = scene.render(t); File(out, "$name.png").writeBytes(img.encodeToData(EncodedImageFormat.PNG)!!.bytes)
        } finally { scene.close() }
    }

    @Test fun screensRender() {
        val model = AppModel(); model.recent.clear(); model.recent.add(photo("photo1")); model.recent.add(photo("photo2"))
        shot("home") { AppRoot(model) {} }
        model.screen = Screen.Tools; shot("tools") { AppRoot(model) {} }
        model.screen = Screen.Tool("merge", listOf(photo("photo1"))); shot("tool") { AppRoot(model) {} }
        model.screen = Screen.About; shot("about") { AppRoot(model) {} }
        val m2 = AppModel(); m2.screen = Screen.Restore(photo("photo2")); shot("restore", waitMs = 9000) { AppRoot(m2) {} }
        val pdf = File(out, "report.pdf").also { f -> javaClass.classLoader.getResourceAsStream("fixtures/report.pdf")!!.use { i -> f.outputStream().use { i.copyTo(it) } } }
        val m3 = AppModel(); m3.screen = Screen.Viewer(pdf); shot("viewer", waitMs = 3000) { AppRoot(m3) {} }
        assertTrue(File(out, "restore.png").length() > 10_000); assertTrue(File(out, "viewer.png").length() > 10_000)
    }

    // ---------------- updater ----------------
    private val apk = ByteArray(200_000) { (it * 13 % 251).toByte() }
    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }

    @Test fun updater_parsesReleases_ignoresOtherApps_andComparesVersions() {
        fun rel(tag: String, assets: List<String>, draft: Boolean = false) = """{"tag_name":"$tag","draft":$draft,"prerelease":false,"body":"Notes $tag","assets":[${assets.joinToString(",") { """{"name":"$it","size":10,"browser_download_url":"http://x/$it"}""" }}]}"""
        val json = "[" + listOf(rel("pdfmaster-v9.9.9", listOf("PDFMASTER-9.9.9.apk")), rel("blazecam-v9.9.9", listOf("a.apk")), rel("pdfmaster-desktop-v0.3.0", listOf("PDFMASTER-Desktop-0.3.0.msi", "SHA256SUMS.txt"), draft = true),
            rel("pdfmaster-desktop-v0.2.0", listOf("PDFMASTER-Desktop-0.2.0.msi", "SHA256SUMS.txt")), rel("pdfmaster-desktop-v0.1.5", listOf("PDFMASTER-Desktop-0.1.5.msi"))).joinToString(",") + "]"
        val r = Updater.newest(json, "0.1.0")!!; assertEquals("0.2.0", r.version); assertEquals("PDFMASTER-Desktop-0.2.0.msi", r.name)
        assertNull(Updater.newest(json, "0.2.0")); assertTrue(Updater.compare("0.10.0", "0.9.9") > 0)
        assertEquals("a".repeat(64), Updater.checksumFor("${"A".repeat(64)}  PDFMASTER-Desktop-1.0.0.msi", "PDFMASTER-Desktop-1.0.0.msi"))
    }

    @Test fun updater_downloadsAndVerifies_rejectsTampering() {
        val server = HttpServer.create(InetSocketAddress("localhost", 0), 0); var sums = "${sha(apk)}  PDFMASTER-Desktop-0.2.0.msi\n"
        server.createContext("/PDFMASTER-Desktop-0.2.0.msi") { ex -> ex.sendResponseHeaders(200, apk.size.toLong()); ex.responseBody.use { it.write(apk) } }
        server.createContext("/SHA256SUMS.txt") { ex -> val b = sums.toByteArray(); ex.sendResponseHeaders(200, b.size.toLong()); ex.responseBody.use { it.write(b) } }
        server.start()
        try {
            val base = "http://localhost:${server.address.port}"
            val r = DesktopRelease("0.2.0", "", "PDFMASTER-Desktop-0.2.0.msi", "$base/PDFMASTER-Desktop-0.2.0.msi", apk.size.toLong(), "$base/SHA256SUMS.txt")
            val f = Updater.download(r) {}; assertArrayEquals(apk, f.readBytes()); f.delete()
            sums = "${sha(apk.copyOf(5))}  PDFMASTER-Desktop-0.2.0.msi\n"
            val e = runCatching { Updater.download(r) {} }.exceptionOrNull(); assertTrue(e?.message, e?.message?.contains("did not match its checksum") == true)
            assertFalse(File(System.getProperty("java.io.tmpdir"), "PDFMASTER-Desktop-0.2.0.msi").exists())
            sums = ""; assertTrue(runCatching { Updater.download(r) {} }.exceptionOrNull()?.message?.contains("checksum") == true)
        } finally { server.stop(0) }
    }
}
