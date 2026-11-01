package com.example.aicamerastudio.core.update

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.example.aicamerastudio.R
import com.example.aicamerastudio.app.App
import java.util.concurrent.TimeUnit

/**
 * Automatic updates in the background, every 6 hours when online:
 * check GitHub, prepare the update (small patch on any network, full APK only on unmetered networks),
 * then install it silently when Android allows that and BlazeCam is not on screen; otherwise show
 * "Update ready" (a notification, and a dialog the next time BlazeCam opens).
 */
class UpdateWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val updater = (applicationContext as App).graph.updater
        if (!updater.autoCheck || !updater.canInstall) return Result.success()
        val r = try { updater.fetchLatest() } catch (e: Exception) { return Result.retry() } ?: return Result.success()
        if (updater.isSkipped(r)) return Result.success()
        val apk = try { updater.prepare(r, showProgress = false, allowFull = updater.onUnmeteredNetwork()) } catch (e: Exception) { return Result.retry() }
            ?: return Result.success() // full download needed: wait for Wi-Fi
        if (updater.canInstallSilently() && !updater.appOnScreen()) {
            runCatching { updater.installFile(apk) }.onFailure { notifyReady(r) }
        } else {
            updater.announceReady(r)
            if (!updater.appOnScreen()) notifyReady(r)
        }
        return Result.success()
    }

    private fun notifyReady(r: ReleaseInfo) {
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) nm.createNotificationChannel(NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT))
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return
        val pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(R.drawable.ic_stat_processing)
            .setContentTitle("BlazeCam ${r.version} is ready").setContentText("Downloaded. Tap to install; it takes a few seconds.")
            .setContentIntent(pi).setAutoCancel(true).build()
        runCatching { NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, n) }
    }

    companion object {
        private const val NAME = "blazecam-updates"
        private const val CHANNEL = "updates"
        private const val NOTIFICATION_ID = 7301

        fun schedule(context: Context, enabled: Boolean) {
            val wm = WorkManager.getInstance(context)
            if (!enabled) { wm.cancelUniqueWork(NAME); return }
            val req = PeriodicWorkRequestBuilder<UpdateWorker>(6, TimeUnit.HOURS)
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInitialDelay(15, TimeUnit.MINUTES)
                .build()
            wm.enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
        }
    }
}
