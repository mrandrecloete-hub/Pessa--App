package com.pdfmaster.app

import com.pdfmaster.app.update.*
import java.net.ServerSocket
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.net.InetSocketAddress
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
class UpdaterTest {
    /** A minimal local web server: answers GET requests by path from [routes]. */
    private class MiniServer(val routes: () -> Map<String, ByteArray>) {
        val socket = ServerSocket(0, 20, java.net.InetAddress.getByName("localhost")); val port get() = socket.localPort
        private val t = Thread {
            while (!socket.isClosed) try {
                val c = socket.accept()
                Thread { c.use { sk ->
                    val path = sk.getInputStream().bufferedReader().readLine().split(" ")[1].substringBefore('?')
                    val body = routes()[path]
                    val out = sk.getOutputStream()
                    if (body == null) out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray())
                    else { out.write("HTTP/1.1 200 OK\r\nContent-Length: ${body.size}\r\nConnection: close\r\n\r\n".toByteArray()); out.write(body) }
                    out.flush()
                } }.start()
            } catch (e: Exception) { }
        }.apply { isDaemon = true; start() }
        fun stop() = socket.close()
    }
    private lateinit var server: MiniServer
    private val apk = ByteArray(300_000) { (it * 31 % 251).toByte() }
    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).joinToString("") { "%02x".format(it) }
    private var sums = ""
    private var releases = ""
    private val base get() = "http://localhost:${server.port}"

    private fun release(tag: String, assets: List<String>, draft: Boolean = false, pre: Boolean = false) =
        """{"tag_name":"$tag","draft":$draft,"prerelease":$pre,"body":"Notes for $tag","html_url":"https://github.com/x/y/releases/$tag","assets":[${assets.joinToString(",") { """{"name":"$it","size":${apk.size},"browser_download_url":"$base/dl/$it"}""" }}]}"""

    @Before fun setUp() {
        server = MiniServer { mapOf("/releases" to releases.toByteArray(), "/dl/PDFMASTER-0.5.0.apk" to apk, "/dl/SHA256SUMS.txt" to sums.toByteArray()) }
        TestDocs.context.getSharedPreferences("updates", 0).edit().clear().apply(); java.io.File(TestDocs.context.filesDir, "updates").deleteRecursively()
        releases = "[" + listOf(
            release("blazecam-v9.9.9", listOf("BlazeCam-9.9.9-arm64-v8a.apk")),                          // another app in the same repository
            release("pdfmaster-v0.6.0", listOf("PDFMASTER-0.6.0.apk", "SHA256SUMS.txt"), draft = true),  // draft: ignored
            release("pdfmaster-v0.5.0", listOf("PDFMASTER-0.5.0.apk", "SHA256SUMS.txt")),
            release("pdfmaster-v0.4.0", listOf("PDFMASTER-0.4.0.apk", "SHA256SUMS.txt"))).joinToString(",") + "]"
        sums = "${sha(apk)}  PDFMASTER-0.5.0.apk\n"
    }
    @After fun tearDown() = server.stop()

    private fun updater(current: String) = Updater(TestDocs.context, "$base/releases", current, allowHttp = true)

    @Test fun parser_versionsAndChecksums() {
        assertTrue(ReleaseParser.compare("0.10.0", "0.9.9") > 0); assertTrue(ReleaseParser.compare("pdfmaster-v1.0.0", "0.99.99") > 0); assertEquals(0, ReleaseParser.compare("1.2.3", "1.2.3"))
        assertEquals(10203, ReleaseParser.versionCode("1.2.3")); assertNull(ReleaseParser.parseVersion("beta")); assertNull(ReleaseParser.parseVersion("1.2.3.4"))
        assertEquals("a".repeat(64), ReleaseParser.checksumFor("${"A".repeat(64)}  PDFMASTER-1.0.0.apk\n${"b".repeat(64)} *other.apk", "PDFMASTER-1.0.0.apk"))
        assertNull(ReleaseParser.checksumFor("nothing here", "PDFMASTER-1.0.0.apk"))
        val r = ReleaseParser.newest(releases.replace("http://localhost:\${server.port}", "x"), "0.3.0")!!
        assertEquals("0.5.0", r.version); assertEquals("PDFMASTER-0.5.0.apk", r.apkName); assertTrue(r.notes.contains("0.5.0"))
        assertNull("nothing newer than the newest", ReleaseParser.newest(releases, "0.5.0"))
        assertNull("a release without its apk is not offered", ReleaseParser.newest("[" + release("pdfmaster-v0.7.0", listOf("SHA256SUMS.txt")) + "]", "0.1.0"))
        assertNull(ReleaseParser.newest("[" + release("pdfmaster-v0.7.0", listOf("PDFMASTER-0.7.0.apk"), pre = true) + "]", "0.1.0"))
    }

    @Test fun version_codeInGradleMatchesParser() {
        // build.gradle.kts: major * 10000 + minor * 100 + patch. The installed code must rise with every release.
        val g = java.io.File("build.gradle.kts").takeIf { it.exists() } ?: java.io.File("app/build.gradle.kts")
        assertTrue(g.readText().contains("parts[0] * 10000 + parts[1] * 100 + parts[2]"))
    }

    @Test fun finds_downloads_andVerifiesTheUpdate() = runBlocking {
        val u = updater("0.3.0")
        u.check()
        val s = u.state.value as UpdateState.Available; assertEquals("0.5.0", s.release.version)
        val f = u.prepare(s.release, showProgress = true)!!
        assertArrayEquals(apk, f.readBytes()); assertEquals("PDFMASTER-0.5.0.apk", f.name)
        // Already downloaded: nothing is fetched again and the update shows as ready.
        u.dismiss(); u.check(); assertTrue(u.state.value is UpdateState.Ready)
    }

    @Test fun tamperedDownload_isRejectedAndDeleted() = runBlocking {
        sums = "${sha(apk.copyOf(10))}  PDFMASTER-0.5.0.apk\n"
        val u = updater("0.3.0"); u.check()
        val r = (u.state.value as UpdateState.Available).release
        val e = runCatching { u.prepare(r, showProgress = false) }.exceptionOrNull()
        assertTrue(e?.message, e?.message?.contains("did not match its checksum") == true)
        assertTrue(java.io.File(TestDocs.context.filesDir, "updates").listFiles().orEmpty().isEmpty())
    }

    @Test fun missingChecksum_isRefused() = runBlocking {
        sums = ""
        val u = updater("0.3.0"); u.check()
        val e = runCatching { u.prepare((u.state.value as UpdateState.Available).release, showProgress = false) }.exceptionOrNull()
        assertTrue(e?.message, e?.message?.contains("checksum") == true)
    }

    @Test fun upToDate_skipped_andMeteredNetworkWaits() = runBlocking {
        val u = updater("0.5.0"); u.check(); assertEquals(UpdateState.UpToDate, u.state.value)
        val v = updater("0.3.0"); v.check(); val r = (v.state.value as UpdateState.Available).release
        assertNull("on mobile data the background job downloads nothing", v.prepare(r, showProgress = false, allowFull = false))
        v.skip(r); assertTrue(v.isSkipped(r)); v.check(quiet = true); assertEquals(UpdateState.Idle, v.state.value)
        releases = "oops"; val w = updater("0.3.0"); w.check(); assertTrue(w.state.value is UpdateState.Failed)
    }

    @Test fun refusesPlainHttpOutsideTests() = runBlocking {
        val u = Updater(TestDocs.context, "$base/releases", "0.3.0", allowHttp = false); u.check()
        assertTrue((u.state.value as UpdateState.Failed).message.contains("https"))
    }
}
