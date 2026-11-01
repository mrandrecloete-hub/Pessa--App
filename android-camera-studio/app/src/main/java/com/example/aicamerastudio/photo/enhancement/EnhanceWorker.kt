package com.example.aicamerastudio.photo.enhancement

import android.content.Context
import android.net.Uri
import androidx.work.*
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.common.JobState
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.data.database.MediaAsset
import com.example.aicamerastudio.photo.pipeline.EnhancementProfile
import com.example.aicamerastudio.photo.pipeline.EnhancementCancelled
import com.example.aicamerastudio.photo.pipeline.ProcessingLevel
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import java.util.UUID

/** Runs one enhancement in the background. Survives the app being closed because WorkManager persists it. */
class EnhanceWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val graph = (applicationContext as App).graph
        val prefs = graph.preferences
        val source = Uri.parse(inputData.getString(K_URI) ?: return fail("No photo was given."))
        val profile = EnhancementProfile.values().firstOrNull { it.name == inputData.getString(K_PROFILE) } ?: EnhancementProfile.NATURAL
        val level0 = ProcessingLevel.values().firstOrNull { it.name == inputData.getString(K_LEVEL) } ?: ProcessingLevel.BALANCED
        val strength = inputData.getFloat(K_STRENGTH, 0.75f)
        val quality = inputData.getInt(K_QUALITY, 92)
        val keep = inputData.getBoolean(K_KEEP, true)
        val battery = inputData.getBoolean(K_BATTERY, true)

        val (level, thermalNote) = ThermalGuard.effectiveLevel(applicationContext, level0, battery)
        val active = currentCoroutineContext()
        return try {
            val outcome = EnhancePhoto(applicationContext, graph.media).run(
                EnhanceRequest(source, profile, strength, level, quality),
                progress = { setProgressAsync(workDataOf(K_PROGRESS to it)) },
                isCancelled = { !active.isActive },
            )
            val notes = outcome.notes + listOfNotNull(thermalNote)
            graph.database.assets().upsert(
                MediaAsset(
                    id = UUID.randomUUID().toString(), kind = "enhanced", originalUri = source.toString(),
                    processedUri = outcome.outputUri.toString(), createdAt = System.currentTimeMillis(),
                    width = outcome.width, height = outcome.height, sizeBytes = outcome.sizeBytes,
                    status = JobState.SUCCEEDED.name, profile = profile.name,
                    note = notes.joinToString(" ").ifBlank { null }, processingMs = outcome.elapsedMs, editSessionId = null,
                ),
            )
            // Only delete the original when the user explicitly turned "keep originals" off.
            if (!keep) graph.media.delete(source)
            Result.success(workDataOf(
                K_OUT to outcome.outputUri.toString(), K_MS to outcome.elapsedMs, K_NOTES to notes.joinToString(" "),
                K_MP to (outcome.width.toLong() * outcome.height / 1_000_000f),
            ))
        } catch (c: EnhancementCancelled) {
            Result.failure(workDataOf(K_ERROR to "Processing was cancelled. Your original photo is safe."))
        } catch (t: Throwable) {
            fail(ErrorMapper.map(t).asMessage())
        }
    }

    private fun fail(msg: String) = Result.failure(workDataOf(K_ERROR to msg))

    companion object {
        const val K_URI = "uri"; const val K_PROFILE = "profile"; const val K_LEVEL = "level"; const val K_STRENGTH = "strength"
        const val K_QUALITY = "quality"; const val K_KEEP = "keep"; const val K_BATTERY = "battery"
        const val K_PROGRESS = "progress"; const val K_OUT = "out"; const val K_MS = "ms"; const val K_NOTES = "notes"
        const val K_ERROR = "error"; const val K_MP = "mp"

        fun uniqueName(source: Uri) = "enhance_${source}"

        fun enqueue(context: Context, source: Uri, p: com.example.aicamerastudio.data.preferences.UserPreferences): String {
            val data = workDataOf(
                K_URI to source.toString(), K_PROFILE to p.profile.name, K_LEVEL to p.level.name,
                K_STRENGTH to p.strength, K_QUALITY to p.jpegQuality, K_KEEP to p.keepOriginals, K_BATTERY to p.batteryConscious,
            )
            val req = OneTimeWorkRequestBuilder<EnhanceWorker>().setInputData(data)
                .setConstraints(Constraints.Builder().setRequiresStorageNotLow(true)
                    .setRequiresBatteryNotLow(p.batteryConscious).build())
                .addTag("enhance").build()
            val name = uniqueName(source)
            WorkManager.getInstance(context).enqueueUniqueWork(name, ExistingWorkPolicy.KEEP, req)
            return name
        }

        fun cancel(context: Context, source: Uri) {
            WorkManager.getInstance(context).cancelUniqueWork(uniqueName(source))
        }
    }
}
