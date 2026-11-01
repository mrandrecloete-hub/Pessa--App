package com.example.aicamerastudio.core

import com.example.aicamerastudio.core.update.ReleaseParser
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class ReleaseParserTest {
    private fun release(tag: String, assets: List<String>, draft: Boolean = false, pre: Boolean = false) = JSONObject()
        .put("tag_name", tag).put("draft", draft).put("prerelease", pre).put("body", "Notes for $tag").put("html_url", "https://github.com/x/y/releases/tag/$tag")
        .put("assets", JSONArray(assets.map { JSONObject().put("name", it).put("size", 123).put("browser_download_url", "https://github.com/dl/$it") }))

    @Test fun versionsCompareNumerically() {
        assertTrue(ReleaseParser.compare("0.10.0", "0.9.9") > 0)
        assertEquals(0, ReleaseParser.compare("blazecam-v1.2.0", "1.2"))
        assertTrue(ReleaseParser.compare("1.0.1", "1.0.0") > 0)
        assertNull(ReleaseParser.parseVersion("1.2.3-beta")); assertNull(ReleaseParser.parseVersion("abc"))
        assertEquals(10203, ReleaseParser.versionCode("1.2.3")); assertEquals(200, ReleaseParser.versionCode("0.2.0"))
    }

    @Test fun picksNewestMatchingReleaseForThisPhone() {
        val json = JSONArray(listOf(
            release("blazecam-v0.3.0", listOf("BlazeCam-0.3.0-arm64-v8a.apk", "SHA256SUMS.txt")),
            release("blazecam-v0.5.0", listOf("BlazeCam-0.5.0-arm64-v8a.apk"), draft = true),
            release("blazecam-v0.4.0", listOf("BlazeCam-0.4.0-x86_64.apk", "SHA256SUMS.txt")),
            release("blazecam-v0.6.0", listOf("BlazeCam-0.6.0-arm64-v8a.apk"), pre = true),
            release("2026.10.202", listOf("index.html")), // Pesa web app releases in the same repo are ignored
        )).toString()
        val r = ReleaseParser.newest(json, "0.2.0", listOf("arm64-v8a", "armeabi-v7a"))!!
        assertEquals("0.3.0", r.version); assertEquals("BlazeCam-0.3.0-arm64-v8a.apk", r.apkName); assertNotNull(r.sumsUrl)
        assertEquals("0.4.0", ReleaseParser.newest(json, "0.2.0", listOf("x86_64"))!!.version)
        assertNull("already up to date", ReleaseParser.newest(json, "0.4.0", listOf("arm64-v8a", "x86_64")))
        assertNull(ReleaseParser.newest("[]", "0.1.0", listOf("arm64-v8a")))
    }

    @Test fun readsChecksumsFile() {
        val sums = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855  BlazeCam-0.3.0-arm64-v8a.apk\n" +
            "aaaa  broken-line\n" + "D4735E3A265E16EEE03F59718B9B5D03019C07D8B6C51F90DA3A666EEC13AB35 *BlazeCam-0.3.0-x86_64.apk\n"
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", ReleaseParser.checksumFor(sums, "BlazeCam-0.3.0-arm64-v8a.apk"))
        assertEquals("d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35", ReleaseParser.checksumFor(sums, "BlazeCam-0.3.0-x86_64.apk"))
        assertNull(ReleaseParser.checksumFor(sums, "other.apk"))
    }
}
