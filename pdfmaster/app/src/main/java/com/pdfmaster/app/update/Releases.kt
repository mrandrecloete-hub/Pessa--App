package com.pdfmaster.app.update

import org.json.JSONArray

/** Where PDFMASTER looks for updates: the public GitHub releases of this repository, tags named pdfmaster-vX.Y.Z. */
object UpdateSource {
    const val OWNER = "mrandrecloete-hub"
    const val REPO = "Pessa--App"
    const val TAG_PREFIX = "pdfmaster-v"
    /** 100 per page because other apps in this repository publish releases into the same list. */
    const val RELEASES_API = "https://api.github.com/repos/$OWNER/$REPO/releases?per_page=100"
    const val SUMS_FILE = "SHA256SUMS.txt"
    const val RELEASES_PAGE = "https://github.com/$OWNER/$REPO/releases"
}

data class ReleaseInfo(val version: String, val tag: String, val notes: String, val apkName: String, val apkUrl: String, val apkSize: Long, val sumsUrl: String?, val pageUrl: String)

object ReleaseParser {
    /** "1.2.3" or "pdfmaster-v1.2.3" gives [1, 2, 3]; null when it is not a plain version. */
    fun parseVersion(s: String): IntArray? {
        val v = s.removePrefix(UpdateSource.TAG_PREFIX).removePrefix("v").trim()
        val parts = v.split('.')
        if (parts.size !in 1..3) return null
        val nums = parts.map { it.toIntOrNull()?.takeIf { n -> n in 0..999 } ?: return null }
        return IntArray(3) { nums.getOrElse(it) { 0 } }
    }

    fun compare(a: String, b: String): Int {
        val x = parseVersion(a) ?: return -1; val y = parseVersion(b) ?: return 1
        for (i in 0..2) if (x[i] != y[i]) return x[i].compareTo(y[i])
        return 0
    }

    /** The version code Android compares: 1.2.3 gives 10203. Must match app/build.gradle.kts. */
    fun versionCode(v: String): Int = parseVersion(v)?.let { it[0] * 10000 + it[1] * 100 + it[2] } ?: 0

    /** Newest published (not draft, not pre-release) PDFMASTER release that is newer than [current] and has its APK attached. */
    fun newest(json: String, current: String): ReleaseInfo? {
        val arr = JSONArray(json)
        var best: ReleaseInfo? = null
        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            if (r.optBoolean("draft") || r.optBoolean("prerelease")) continue
            val tag = r.optString("tag_name")
            if (!tag.startsWith(UpdateSource.TAG_PREFIX)) continue
            val version = tag.removePrefix(UpdateSource.TAG_PREFIX)
            if (parseVersion(version) == null || compare(version, current) <= 0) continue
            val assets = r.optJSONArray("assets") ?: continue
            val list = (0 until assets.length()).map { assets.getJSONObject(it) }
            val apk = list.firstOrNull { it.optString("name") == "PDFMASTER-$version.apk" } ?: continue
            val sums = list.firstOrNull { it.optString("name") == UpdateSource.SUMS_FILE }
            val info = ReleaseInfo(version, tag, r.optString("body").take(4000), apk.optString("name"), apk.optString("browser_download_url"), apk.optLong("size"), sums?.optString("browser_download_url"), r.optString("html_url"))
            if (best == null || compare(info.version, best.version) > 0) best = info
        }
        return best
    }

    /** Finds the SHA-256 for [fileName] in a sha256sum style file ("<hex>  <name>"). */
    fun checksumFor(sums: String, fileName: String): String? = sums.lineSequence().map { it.trim() }.mapNotNull { line ->
        val parts = line.split(Regex("\\s+"), limit = 2)
        if (parts.size == 2 && parts[1].removePrefix("*") == fileName && parts[0].matches(Regex("[0-9a-fA-F]{64}"))) parts[0].lowercase() else null
    }.firstOrNull()
}
