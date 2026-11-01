package com.example.aicamerastudio.core.update

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.example.aicamerastudio.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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
    data object Installing : UpdateState()
    data class Failed(val message: String) : UpdateState()
}

/**
 * Checks GitHub releases for a newer BlazeCam, downloads the APK for this phone, verifies its SHA-256
 * against the release's SHA256SUMS.txt, and asks Android to install it. Android itself refuses an update
 * that is not signed with the same key as the installed app. Only the public releases list and the
 * download are requested; nothing about the user or their photos is sent.
 */
class Updater(private val context: Context) {
    private val _state = MutableStateFlow<UpdateState>(UpdateState.Idle)
    val state: StateFlow<UpdateState> = _state
    private val prefs = context.getSharedPreferences("updates", Context.MODE_PRIVATE)

    val currentVersion: String get() = BuildConfig.VERSION_NAME
    /** Debug builds have a different app ID (.debug), so release APKs cannot update them. */
    val canInstall: Boolean get() = !BuildConfig.APPLICATION_ID.endsWith(".debug")

    var autoCheck: Boolean
        get() = prefs.getBoolean("auto", true)
        set(v) { prefs.edit().putBoolean("auto", v).apply() }

    private fun get(url: String, accept: String? = null): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        require(c.url.protocol == "https")
        c.connectTimeout = 15_000; c.readTimeout = 30_000
        c.setRequestProperty("User-Agent", "BlazeCam/${BuildConfig.VERSION_NAME}")
        accept?.let { c.setRequestProperty("Accept", it) }
        c.instanceFollowRedirects = true
        return c
    }

    /** Automatic check at most once a day. */
    suspend fun checkIfDue() {
        if (!autoCheck) return
        val last = prefs.getLong("last", 0)
        if (System.currentTimeMillis() - last < 24 * 3600_000L) return
        check(quiet = true)
    }

    suspend fun check(quiet: Boolean = false) {
        _state.value = UpdateState.Checking
        _state.value = try {
            val json = withContext(Dispatchers.IO) {
                val c = get(UpdateSource.RELEASES_API, "application/vnd.github+json")
                try {
                    if (c.responseCode == 403 || c.responseCode == 429) throw IllegalStateException("GitHub is limiting requests right now. Try again in an hour.")
                    if (c.responseCode != 200) throw IllegalStateException("GitHub answered ${c.responseCode}.")
                    c.inputStream.bufferedReader().use { it.readText() }
                } finally { c.disconnect() }
            }
            prefs.edit().putLong("last", System.currentTimeMillis()).apply()
            val r = ReleaseParser.newest(json, currentVersion, Build.SUPPORTED_ABIS.toList())
            when {
                r == null -> if (quiet) UpdateState.Idle else UpdateState.UpToDate
                r.version == prefs.getString("skipped", null) && quiet -> UpdateState.Idle
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

    suspend fun downloadAndInstall(r: ReleaseInfo) {
        if (!canInstall) { _state.value = UpdateState.Failed("This is a development build. Install the release APK from GitHub instead."); return }
        val dir = File(context.cacheDir, "updates").apply { mkdirs() }
        val apk = File(dir, "update.apk")
        try {
            val sumsUrl = r.sumsUrl ?: throw IllegalStateException("This release has no checksum file, so it was not installed.")
            val expected = withContext(Dispatchers.IO) {
                val c = get(sumsUrl); try { ReleaseParser.checksumFor(c.inputStream.bufferedReader().use { it.readText() }, r.apkName) } finally { c.disconnect() }
            } ?: throw IllegalStateException("The checksum for ${r.apkName} is missing, so it was not installed.")
            _state.value = UpdateState.Downloading(r, 0f)
            val actual = withContext(Dispatchers.IO) {
                val md = MessageDigest.getInstance("SHA-256")
                val c = get(r.apkUrl)
                try {
                    val total = c.contentLengthLong.takeIf { it > 0 } ?: r.apkSize
                    c.inputStream.use { input -> apk.outputStream().use { out ->
                        val buf = ByteArray(1 shl 16); var done = 0L; var lastP = 0f
                        while (true) {
                            ensureActive()
                            val n = input.read(buf); if (n < 0) break
                            out.write(buf, 0, n); md.update(buf, 0, n); done += n
                            val p = if (total > 0) done.toFloat() / total else 0f
                            if (p - lastP > 0.01f) { lastP = p; _state.value = UpdateState.Downloading(r, p) }
                        }
                    } }
                } finally { c.disconnect() }
                md.digest().joinToString("") { "%02x".format(it) }
            }
            if (actual != expected) throw IllegalStateException("The download did not match its checksum, so it was not installed. Try again.")
            _state.value = UpdateState.Installing
            withContext(Dispatchers.IO) { install(apk) }
        } catch (e: kotlinx.coroutines.CancellationException) {
            apk.delete(); _state.value = UpdateState.Idle; throw e
        } catch (e: Exception) {
            apk.delete(); _state.value = UpdateState.Failed(e.message ?: "The update failed.")
        }
    }

    private fun install(apk: File) {
        val pi = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = pi.createSession(params)
        pi.openSession(id).use { s ->
            apk.inputStream().use { input -> s.openWrite("base.apk", 0, apk.length()).use { out -> input.copyTo(out); s.fsync(out) } }
            val intent = Intent(context, InstallResultReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
            s.commit(PendingIntent.getBroadcast(context, id, intent, flags).intentSender)
        }
    }

    companion object {
        val lastResult = MutableStateFlow<String?>(null)
    }
}

/** Receives the installer's answer. Shows Android's confirmation screen when the system needs the user to approve. */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT))
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { context.startActivity(it) }
            }
            PackageInstaller.STATUS_SUCCESS -> Updater.lastResult.value = "Update installed."
            else -> Updater.lastResult.value = "The update was not installed: " + (intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: "unknown reason") +
                ". If it says the signature does not match, uninstall the test version once and install the release from GitHub."
        }
        File(context.cacheDir, "updates/update.apk").delete()
    }
}
