package com.example.aicamerastudio.photo.enhancement

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.PowerManager
import androidx.exifinterface.media.ExifInterface
import com.example.aicamerastudio.core.errors.AppException
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.photo.pipeline.*

data class EnhanceRequest(
    val source: Uri,
    val profile: EnhancementProfile,
    val strength: Float,
    val level: ProcessingLevel,
    val jpegQuality: Int,
)

data class EnhanceOutcome(
    val outputUri: Uri,
    val width: Int,
    val height: Int,
    val sizeBytes: Long,
    val elapsedMs: Long,
    /** Honest notes, e.g. reduced strength or downscaled for memory. Empty when nothing special happened. */
    val notes: List<String>,
    val params: EnhancementParams,
)

/** Chooses a processing level that respects the device's thermal and battery state. */
object ThermalGuard {
    fun effectiveLevel(context: Context, requested: ProcessingLevel, batteryConscious: Boolean): Pair<ProcessingLevel, String?> {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        if (pm.currentThermalStatus >= PowerManager.THERMAL_STATUS_MODERATE && requested != ProcessingLevel.QUICK) {
            return ProcessingLevel.QUICK to "The device is warm, so Quick processing was used."
        }
        if (batteryConscious && pm.isPowerSaveMode && requested == ProcessingLevel.MAXIMUM) {
            return ProcessingLevel.BALANCED to "Battery saver is on, so Balanced processing was used instead of Maximum."
        }
        return requested to null
    }
}

class EnhancePhoto(private val context: Context, private val media: MediaStoreRepository) {

    /**
     * Enhances [req].source into a NEW file. The original is never modified here.
     * Throws [AppException] with a user facing error, or [EnhancementCancelled].
     */
    fun run(
        req: EnhanceRequest,
        progress: (Float) -> Unit = {},
        isCancelled: () -> Boolean = { false },
    ): EnhanceOutcome {
        val started = System.nanoTime()
        media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE)
        val notes = ArrayList<String>()
        val resolver = context.contentResolver

        var sample = 1
        val src: Bitmap = try {
            ImageLoader.decode(resolver, req.source)
        } catch (oom: OutOfMemoryError) {
            // Retry once at half size and say so; never pretend full resolution was kept.
            sample = 2
            notes += "Not enough memory for full resolution, so the result is half size in each direction."
            try { ImageLoader.decode(resolver, req.source, sampleSize = 2) }
            catch (again: OutOfMemoryError) { throw AppException(Errors.lowMemory(), again) }
        }
        var dst: Bitmap? = null
        try {
            progress(0.02f)
            val srcPixels = BitmapPixels(src)
            val before = ImageAnalyzer.analyze(srcPixels, isCancelled)
            progress(0.08f)
            var strength = req.strength
            var params = EnhancementPlanner.plan(before, req.profile, strength, req.level)
            dst = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
            val enhancer = Enhancer()
            fun pass(p: EnhancementParams, from: Float, to: Float) =
                enhancer.enhance(srcPixels, BitmapPixels(dst!!), p, { f -> progress(from + (to - from) * f) }, isCancelled)

            pass(params, 0.08f, 0.80f)
            var check = QualityValidator.validate(before, ImageAnalyzer.analyze(BitmapPixels(dst), isCancelled))
            if (!check.ok) {
                strength *= 0.5f
                params = EnhancementPlanner.plan(before, req.profile, strength, req.level)
                notes += "Strength was halved to avoid artefacts: ${check.issues.joinToString("; ")}."
                pass(params, 0.80f, 0.92f)
                check = QualityValidator.validate(before, ImageAnalyzer.analyze(BitmapPixels(dst), isCancelled))
                if (!check.ok) {
                    throw AppException(
                        Errors.exportFailed().copy(
                            what = "The enhancement was not applied because it would have damaged the photo (${check.issues.joinToString("; ")}).",
                            whatToDo = "Try a different profile or a lower strength.",
                            retryable = true,
                        ),
                    )
                }
            }
            progress(0.94f)

            val name = MediaStoreRepository.timestampName("AICS_", "_enh")
            val outUri = media.saveJpeg(name, dst, req.jpegQuality) { uri -> copyExif(req.source, uri, req.profile) }
            progress(1f)
            val size = resolver.openAssetFileDescriptor(outUri, "r")?.use { it.length } ?: 0L
            return EnhanceOutcome(outUri, dst.width, dst.height, size, (System.nanoTime() - started) / 1_000_000, notes, params)
        } finally {
            src.recycle()
            dst?.recycle()
        }
    }

    private fun copyExif(from: Uri, to: Uri, profile: EnhancementProfile) =
        ExifCopy.copy(context, from, to, "BlazeCam (${profile.label})")
}

object ExifCopy {
    fun copy(context: Context, from: Uri, to: Uri, software: String) {
        val tags = listOf(
            ExifInterface.TAG_DATETIME_ORIGINAL, ExifInterface.TAG_DATETIME, ExifInterface.TAG_MAKE, ExifInterface.TAG_MODEL,
            ExifInterface.TAG_EXPOSURE_TIME, ExifInterface.TAG_F_NUMBER, ExifInterface.TAG_PHOTOGRAPHIC_SENSITIVITY,
            ExifInterface.TAG_FOCAL_LENGTH, ExifInterface.TAG_WHITE_BALANCE,
        )
        // Location is deliberately not copied. Orientation is not copied because pixels are already upright.
        runCatching {
            val src = context.contentResolver.openInputStream(from)?.use { ExifInterface(it) } ?: return
            context.contentResolver.openFileDescriptor(to, "rw")?.use { pfd ->
                val dstExif = ExifInterface(pfd.fileDescriptor)
                for (t in tags) src.getAttribute(t)?.let { dstExif.setAttribute(t, it) }
                dstExif.setAttribute(ExifInterface.TAG_SOFTWARE, software)
                dstExif.saveAttributes()
            }
        }
    }
}
