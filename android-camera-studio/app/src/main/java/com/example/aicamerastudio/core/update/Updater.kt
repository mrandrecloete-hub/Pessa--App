package com.example.aicamerastudio.core.update

import android.app.ActivityManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.ConnectivityManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.example.aicamerastudio.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FilterOutputStream
import java.io.OutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

sealed class UpdateState {
    data object Idle : UpdateState()
    data object Checking : UpdateState()
    data object UpToDate : UpdateState()
    data class Available(val release: ReleaseInfo) : UpdateState()
    data class Downloading(val release: ReleaseInfo, val progress: Float, val small: Boolean) : UpdateState()
    /** Downloaded and checksum verified; installing takes a few seconds and needs no more data. */
    data class Ready(val release: ReleaseInfo) : UpdateState()
    data object Installing : UpdateState()
    data class Failed(val message: String) : UpdateState()
}

/**
 * Checks GitHub releases for a newer BlazeCam and installs it.
 *
 * Fast path: each release carries small patches from recent versions. BlazeCam downloads the patch for the
 * installed version (usually under 1 MB), rebuilds the new APK from the installed one, and checks its
 * SHA-256 against the release's SHA256SUMS.txt. If there is no patch or anything does not match, it
 * downloads the full APK and checks that the same way. Android itself refuses an update that is not
 * signed with the same key. Only the public release list and the downloads are requested; nothing about
 * the user or their photos is sent.
 *
 * Automatic: [UpdateWorker] checks every few hours, prepares the update in the background (full APKs only
 * on Wi-Fi or other unmetered networks) and, on Android 12 and newer once BlazeCam installed itself at
 * least once, installs it without asking while BlazeCam is not on screen.
 */
class Updater(private val context: Context) {
    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state
    private val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)
    private val dir get() = File(context.filesDir, "updates").apply { mkdirs() }
    private val lock = Mutex()

    val currentVersion: String get() = BuildConfig.VERSION_NAME
    /** Debug builds have a different app ID (.debug), so release APKs cannot update them. */
    val canInstall: Boolean get() = !BuildConfig.APPLICATION_ID.endsWith(".debug")

    /** Automatic updates: check, download in the background and install when possible. */
    var autoCheck: Boolean
        get() = prefs.getBoolean("auto", true)
        set(v) { prefs.edit().putBoolean("auto", v).apply(); UpdateWorker.schedule(context, v) }

    private fun get(url: String, accept: String? = null): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        require(c.url.protocol == "https")
        c.connectTimeout = 15_000; c.readTimeout = 30_000
        c.setRequestProperty("User-Agent", "BlazeCam/${BuildConfig.VERSION_NAME}")
        accept?.let { c.setRequestProperty("Accept", it) }
        c.instanceFollowRedirects = true
        return c
    }

    /** Check when the app opens, at most once an hour (GitHub allows 60 unsigned requests an hour). */
    suspend fun checkIfDue() {
        if (!autoCheck) return
        if (System.currentTimeMillis() - prefs.getLong("last", 0) < 3600_000L) { readyFile(null)?.let { restoreReady() }; return }
        check(quiet = true)
    }

    /** Newest release for this phone, or null when up to date. Throws when GitHub cannot be reached. */
    suspend fun fetchLatest(): ReleaseInfo? {
        val json = withContext(Dispatchers.IO) {
            val c = get(UpdateSource.RELEASES_API, "application/vnd.github+json")
            try {
                if (c.responseCode == 403 || c.responseCode == 429) throw IllegalStateException("GitHub is limiting requests right now. Try again in an hour.")
                if (c.responseCode != 200) throw IllegalStateException("GitHub answered ${c.responseCode}.")
                c.inputStream.bufferedReader().use { it.readText() }
            } finally { c.disconnect() }
        }
        prefs.edit().putLong("last", System.currentTimeMillis()).apply()
        return ReleaseParser.newest(json, currentVersion, Build.SUPPORTED_ABIS.toList())
    }

    fun isSkipped(r: ReleaseInfo) = r.version == prefs.getString("skipped", null)

    suspend fun check(quiet: Boolean = false) {
        if (_state.value is UpdateState.Downloading || _state.value is UpdateState.Installing) return
        _state.value = UpdateState.Checking
        _state.value = try {
            val r = fetchLatest()
            when {
                r == null -> { clearPrepared(); if (quiet) UpdateState.Idle else UpdateState.UpToDate }
                r.version == prefs.getString("skipped", null) && quiet -> UpdateState.Idle
                readyFile(r.version) != null -> UpdateState.Ready(r)
                else -> UpdateState.Available(r)
            }
        } catch (e: Exception) {
            if (quiet) UpdateState.Idle else UpdateState.Failed(e.message ?: "Could not reach GitHub. Check your internet connection.")
        }
    }

    fun skip(r: ReleaseInfo) { prefs.edit().putString("skipped", r.version).apply(); _state.value = UpdateState.Idle }
    fun dismiss() { _state.value = UpdateState.Idle }

    /** Android asks the user once to allow BlazeCam to install updates. */
    fun needsInstallPermission(): Boolean = !context.packageManager.canRequestPackageInstalls()
    fun installPermissionIntent() = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    /**
     * Android 12+ lets an app update itself without a confirmation screen when it installed the current
     * version itself. The first update after installing from a browser or file manager still asks once.
     */
    fun canInstallSilently(): Boolean {
        if (Build.VERSION.SDK_INT < 31 || !canInstall || needsInstallPermission()) return false
        return runCatching { context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName == context.packageName }.getOrDefault(false)
    }

    fun appOnScreen(): Boolean {
        val info = ActivityManager.RunningAppProcessInfo(); ActivityManager.getMyMemoryState(info)
        return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    }

    fun onUnmeteredNetwork(): Boolean = !(context.getSystemService(ConnectivityManager::class.java)?.isActiveNetworkMetered ?: true)

    private fun readyFile(version: String?): File? {
        val v = version ?: prefs.getString("ready", null) ?: return null
        return File(dir, "BlazeCam-$v.apk").takeIf { it.exists() && prefs.getString("ready", null) == v && ReleaseParser.compare(v, currentVersion) > 0 }
    }
    private suspend fun restoreReady() { if (_state.value == UpdateState.Idle) check(quiet = true) }
    private fun clearPrepared() { dir.listFiles()?.forEach { it.delete() }; prefs.edit().remove("ready").apply() }

    /**
     * Downloads and verifies [r] into the app's own storage. Uses the small patch when possible.
     * [allowFull] false: only the patch (for background work on mobile data); returns null if a full download would be needed.
     */
    suspend fun prepare(r: ReleaseInfo, showProgress: Boolean, allowFull: Boolean = true): File? = lock.withLock {
        readyFile(r.version)?.let { return it }
        clearPrepared()
        val out = File(dir, "BlazeCam-${r.version}.apk")
        val tmp = File(dir, "download.tmp")
        val sumsUrl = r.sumsUrl ?: throw IllegalStateException("This release has no checksum file, so it was not installed.")
        val expected = withContext(Dispatchers.IO) {
            val c = get(sumsUrl); try { ReleaseParser.checksumFor(c.inputStream.bufferedReader().use { it.readText() }, r.apkName) } finally { c.disconnect() }
        } ?: throw IllegalStateException("The checksum for ${r.apkName} is missing, so it was not installed.")
        try {
            var ok = false
            val installed = context.applicationInfo.let { ai -> if (ai.splitSourceDirs.isNullOrEmpty()) File(ai.sourceDir) else null }
            if (r.patchUrl != null && installed != null && installed.canRead()) {
                ok = runCatching {
                    if (showProgress) _state.value = UpdateState.Downloading(r, 0f, true)
                    download(r.patchUrl, tmp, r.patchSize) { p -> if (showProgress) _state.value = UpdateState.Downloading(r, p * 0.6f, true) }
                    val md = MessageDigest.getInstance("SHA-256")
                    withContext(Dispatchers.IO) {
                        out.outputStream().buffered(1 shl 16).use { o ->
                            DeltaPatch.apply(installed, tmp, DigestStream(o, md)) { p -> if (showProgress) _state.value = UpdateState.Downloading(r, 0.6f + p * 0.4f, true) }
                        }
                    }
                    hex(md.digest()) == expected
                }.getOrElse { if (it is kotlinx.coroutines.CancellationException) throw it; false }
                tmp.delete()
                if (!ok) out.delete()
            }
            if (!ok) {
                if (!allowFull) return null
                if (showProgress) _state.value = UpdateState.Downloading(r, 0f, false)
                val actual = download(r.apkUrl, out, r.apkSize) { p -> if (showProgress) _state.value = UpdateState.Downloading(r, p, false) }
                if (actual != expected) throw IllegalStateException("The download did not match its checksum, so it was not installed. Try again.")
            }
            prefs.edit().putString("ready", r.version).apply()
            return out
        } catch (e: Throwable) {
            out.delete(); tmp.delete(); throw e
        }
    }

    /** Downloads [url] to [to] and returns its SHA-256. */
    private suspend fun download(url: String, to: File, size: Long, progress: (Float) -> Unit): String = withContext(Dispatchers.IO) {
        val md = MessageDigest.getInstance("SHA-256")
        val c = get(url)
        try {
            if (c.responseCode != 200) throw IllegalStateException("GitHub answered ${c.responseCode} for the download.")
            val total = c.contentLengthLong.takeIf { it > 0 } ?: size
            c.inputStream.use { input -> to.outputStream().use { out ->
                val buf = ByteArray(1 shl 16); var done = 0L; var lastP = 0f
                while (true) {
                    ensureActive()
                    val n = input.read(buf); if (n < 0) break
                    out.write(buf, 0, n); md.update(buf, 0, n); done += n
                    val p = if (total > 0) done.toFloat() / total else 0f
                    if (p - lastP > 0.01f) { lastP = p; progress(p) }
                }
            } }
        } finally { c.disconnect() }
        hex(md.digest())
    }

    /** Update button: download (patch when possible) and install. */
    suspend fun downloadAndInstall(r: ReleaseInfo) {
        if (!canInstall) { _state.value = UpdateState.Failed("This is a development build. Install the release APK from GitHub instead."); return }
        try {
            val apk = prepare(r, showProgress = true)!!
            _state.value = UpdateState.Installing
            withContext(Dispatchers.IO) { install(apk) }
        } catch (e: kotlinx.coroutines.CancellationException) {
            _state.value = UpdateState.Idle; throw e
        } catch (e: Exception) {
            _state.value = UpdateState.Failed(e.message ?: "The update failed.")
        }
    }

    /** Called by [UpdateWorker] when a prepared update is ready. */
    fun announceReady(r: ReleaseInfo) { if (_state.value !is UpdateState.Downloading && _state.value != UpdateState.Installing) _state.value = UpdateState.Ready(r) }

    fun installFile(apk: File) {
        _state.value = UpdateState.Installing
        install(apk)
    }

    private fun install(apk: File) {
        val pi = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            setSize(apk.length())
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = pi.createSession(params)
        pi.openSession(id).use { s ->
            apk.inputStream().use { input -> s.openWrite("base.apk", 0, apk.length()).use { out -> input.copyTo(out, 1 shl 16); s.fsync(out) } }
            val intent = Intent(context, InstallResultReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getBroadcast(context, id, intent, flags).intentSender)
        }
    }

    internal fun onInstallFinished(success: Boolean) {
        if (success) clearPrepared()
        if (_state.value == UpdateState.Installing) _state.value = UpdateState.Idle
    }

    private class DigestStream(out: OutputStream, private val md: MessageDigest) : FilterOutputStream(out) {
        override fun write(b: Int) { out.write(b); md.update(b.toByte()) }
        override fun write(b: ByteArray, off: Int, len: Int) { out.write(b, off, len); md.update(b, off, len) }
    }

    companion object {
        val lastResult = MutableStateFlow<String?>(null)
        private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
    }
}

/** Receives the installer's answer. Shows Android's confirmation screen when the system needs the user to approve. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val updater = (context.applicationContext as? com.example.aicamerastudio.app.App)?.graph?.updater
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT))
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { context.startActivity(it) }
                return
            }
            PackageInstaller.STATUS_SUCCESS -> { Updater.lastResult.value = "Update installed."; updater?.onInstallFinished(true) }
            else -> {
                Updater.lastResult.value = "The update was not installed: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "unknown reason") +
                    ". If it says the signature does not match, uninstall the test version once and install the release from GitHub."
                updater?.onInstallFinished(false)
            }
        }
    }
}
