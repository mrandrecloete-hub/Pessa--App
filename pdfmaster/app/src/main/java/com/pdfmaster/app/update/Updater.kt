package com.pdfmaster.app.update

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
import com.pdfmaster.app.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

sealed class UpdateState {
    data object Idle : UpdateState()
    data object Checking : UpdateState()
    data object UpToDate : UpdateState()
    data class Available(val release: ReleaseInfo) : UpdateState()
    data class Downloading(val release: ReleaseInfo, val progress: Float) : UpdateState()
    /** Downloaded and checksum verified. */
    data class Ready(val release: ReleaseInfo) : UpdateState()
    data object Installing : UpdateState()
    data class Failed(val message: String) : UpdateState()
}

/**
 * Checks the GitHub releases for a newer PDFMASTER, downloads it, checks its SHA-256 against the release's
 * SHA256SUMS.txt and hands it to Android's installer. Android itself refuses an update that is not signed with
 * the same key as the installed app, so a tampered file cannot replace it. Only the public release list and the
 * download are requested: nothing about the user or their documents is sent.
 *
 * Background: [UpdateWorker] checks every few hours and prepares the update (Wi-Fi only). On Android 12 and newer,
 * once PDFMASTER has installed an update itself, later updates install without a prompt while the app is not on
 * screen. The first update after installing from a browser or file manager asks once.
 */
class Updater(private val context: Context, private val releasesUrl: String = UpdateSource.RELEASES_API,
              val currentVersion: String = BuildConfig.VERSION_NAME, private val allowHttp: Boolean = false) {
    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state
    private val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)
    private val dir get() = File(context.filesDir, "updates").apply { mkdirs() }
    private val lock = Mutex()

    var autoCheck: Boolean
        get() = prefs.getBoolean("auto", true)
        set(v) { prefs.edit().putBoolean("auto", v).apply(); UpdateWorker.schedule(context, v) }

    private fun open(url: String, accept: String? = null): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        require(c.url.protocol == "https" || (allowHttp && c.url.host == "localhost")) { "Updates are only downloaded over https" }
        c.connectTimeout = 15_000; c.readTimeout = 30_000
        c.setRequestProperty("User-Agent", "PDFMASTER/$currentVersion")
        accept?.let { c.setRequestProperty("Accept", it) }
        c.instanceFollowRedirects = true
        return c
    }

    /** Called when the app opens: at most one check an hour (GitHub allows 60 unsigned requests an hour). */
    suspend fun checkIfDue() {
        if (!autoCheck) return
        if (System.currentTimeMillis() - prefs.getLong("last", 0) < 3_600_000L) { if (readyFile(null) != null) check(quiet = true); return }
        check(quiet = true)
    }

    /** The newest newer release, or null when up to date. Throws when GitHub cannot be reached. */
    suspend fun fetchLatest(): ReleaseInfo? {
        val json = withContext(Dispatchers.IO) {
            val c = open(releasesUrl, "application/vnd.github+json")
            try {
                if (c.responseCode == 403 || c.responseCode == 429) throw IllegalStateException("GitHub is limiting requests right now. Try again in an hour.")
                if (c.responseCode != 200) throw IllegalStateException("GitHub answered ${c.responseCode}.")
                c.inputStream.bufferedReader().use { it.readText() }
            } finally { c.disconnect() }
        }
        prefs.edit().putLong("last", System.currentTimeMillis()).apply()
        return ReleaseParser.newest(json, currentVersion)
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

    /** Android asks the user once to allow PDFMASTER to install updates. */
    fun needsInstallPermission(): Boolean = !context.packageManager.canRequestPackageInstalls()
    fun installPermissionIntent() = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))

    fun canInstallSilently(): Boolean {
        if (Build.VERSION.SDK_INT < 31 || needsInstallPermission()) return false
        return runCatching { context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName == context.packageName }.getOrDefault(false)
    }

    fun appOnScreen(): Boolean { val info = ActivityManager.RunningAppProcessInfo(); ActivityManager.getMyMemoryState(info); return info.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE }
    fun onUnmeteredNetwork(): Boolean = !(context.getSystemService(ConnectivityManager::class.java)?.isActiveNetworkMetered ?: true)

    private fun readyFile(version: String?): File? {
        val v = version ?: prefs.getString("ready", null) ?: return null
        return File(dir, "PDFMASTER-$v.apk").takeIf { it.exists() && prefs.getString("ready", null) == v && ReleaseParser.compare(v, currentVersion) > 0 }
    }
    private fun clearPrepared() { dir.listFiles()?.forEach { it.delete() }; prefs.edit().remove("ready").apply() }

    /**
     * Downloads [r] into the app's own storage and checks its SHA-256 against the release's checksum file.
     * [allowFull] false means "only if the network is not metered": returns null instead of downloading.
     */
    suspend fun prepare(r: ReleaseInfo, showProgress: Boolean, allowFull: Boolean = true): File? = lock.withLock {
        readyFile(r.version)?.let { return it }
        if (!allowFull) return null
        clearPrepared()
        val out = File(dir, "PDFMASTER-${r.version}.apk")
        val sumsUrl = r.sumsUrl ?: throw IllegalStateException("This release has no checksum file, so it was not installed.")
        val expected = withContext(Dispatchers.IO) {
            val c = open(sumsUrl); try { ReleaseParser.checksumFor(c.inputStream.bufferedReader().use { it.readText() }, r.apkName) } finally { c.disconnect() }
        } ?: throw IllegalStateException("The checksum for ${r.apkName} is missing, so it was not installed.")
        try {
            if (showProgress) _state.value = UpdateState.Downloading(r, 0f)
            val actual = download(r.apkUrl, out, r.apkSize) { p -> if (showProgress) _state.value = UpdateState.Downloading(r, p) }
            if (actual != expected) throw IllegalStateException("The download did not match its checksum, so it was not installed. Try again.")
            prefs.edit().putString("ready", r.version).apply()
            return out
        } catch (e: Throwable) { out.delete(); throw e }
    }

    private suspend fun download(url: String, to: File, size: Long, progress: (Float) -> Unit): String = withContext(Dispatchers.IO) {
        val md = MessageDigest.getInstance("SHA-256")
        val c = open(url)
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
        md.digest().joinToString("") { "%02x".format(it) }
    }

    /** The Update button: download, verify and install. */
    suspend fun downloadAndInstall(r: ReleaseInfo) {
        try {
            val apk = prepare(r, showProgress = true)!!
            _state.value = UpdateState.Installing
            withContext(Dispatchers.IO) { install(apk) }
        } catch (e: kotlinx.coroutines.CancellationException) { _state.value = UpdateState.Idle; throw e
        } catch (e: Exception) { _state.value = UpdateState.Failed(e.message ?: "The update failed.") }
    }

    fun announceReady(r: ReleaseInfo) { if (_state.value !is UpdateState.Downloading && _state.value != UpdateState.Installing) _state.value = UpdateState.Ready(r) }
    fun installFile(apk: File) { _state.value = UpdateState.Installing; install(apk) }

    private fun install(apk: File) {
        // Last check before handing over: it must be this app and a newer version.
        val pm = context.packageManager
        val info = pm.getPackageArchiveInfo(apk.path, 0) ?: throw IllegalStateException("The downloaded file is not a valid app.")
        check(info.packageName == context.packageName) { "The downloaded file is a different app, so it was not installed." }
        val now = pm.getPackageInfo(context.packageName, 0)
        check(info.longVersionCode > now.longVersionCode) { "The downloaded file is not newer than the installed app." }
        val pi = pm.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName); setSize(apk.length())
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = pi.createSession(params)
        pi.openSession(id).use { s ->
            apk.inputStream().use { input -> s.openWrite("base.apk", 0, apk.length()).use { out -> input.copyTo(out, 1 shl 16); s.fsync(out) } }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getBroadcast(context, id, Intent(context, InstallResultReceiver::class.java), flags).intentSender)
        }
    }

    internal fun onInstallFinished(success: Boolean) {
        if (success) clearPrepared()
        if (_state.value == UpdateState.Installing) _state.value = UpdateState.Idle
    }

    companion object {
        val lastResult = MutableStateFlow<String?>(null)
        @Volatile private var instance: Updater? = null
        fun get(context: Context): Updater = instance ?: synchronized(this) { instance ?: Updater(context.applicationContext).also { instance = it } }
    }
}

/** Receives the installer's answer and shows Android's confirmation screen when the system needs the user to approve. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val updater = Updater.get(context)
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT)
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { context.startActivity(it) }
            }
            PackageInstaller.STATUS_SUCCESS -> { Updater.lastResult.value = "Update installed."; updater.onInstallFinished(true) }
            else -> { Updater.lastResult.value = "The update was not installed: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "unknown reason") +
                ". If it says the signature does not match, the installed copy was signed with a different key: uninstall it once (this removes its documents) and install the release from GitHub."
                updater.onInstallFinished(false) }
        }
    }
}
