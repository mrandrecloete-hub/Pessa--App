package com.example.aicamerastudio.camera.zoom

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Matrix
import android.graphics.Rect
import android.net.Uri
import android.provider.MediaStore
import androidx.exifinterface.media.ExifInterface
import androidx.work.*
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.common.JobState
import com.example.aicamerastudio.core.errors.AppException
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.database.MediaAsset
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.ModelUnavailable
import com.example.aicamerastudio.photo.enhancement.BitmapPixels
import com.example.aicamerastudio.photo.enhancement.ThermalGuard
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.multiframe.FrameMerger
import com.example.aicamerastudio.photo.pipeline.*
import com.example.aicamerastudio.photo.superresolution.SrMethod
import com.example.aicamerastudio.photo.superresolution.SuperResolutionPipeline
import com.example.aicamerastudio.photo.superresolution.SuperResolver
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import java.io.File
import java.util.UUID
import kotlin.math.ceil
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/**
 * Turns a burst of captured frames into one ultra zoom photo. Frames come from files in the cache,
 * so the work survives leaving the camera screen. The reference frame is kept, untouched, as the original.
 */
class UltraZoomWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {

    override suspend fun doWork(): Result {
        val graph = (applicationContext as App).graph
        val dir = File(inputData.getString(K_DIR) ?: return fail("No frames were given."))
        // Only accept frame folders inside this app's own cache.
        if (!dir.canonicalPath.startsWith(File(applicationContext.cacheDir, "zoom").canonicalPath)) return fail("Invalid frame folder.")
        val files = (0 until inputData.getInt(K_COUNT, 0)).map { File(dir, "frame_$it.jpg") }.filter { it.isFile }
        val crop = inputData.getFloat(K_CROP, 1f).coerceIn(1f, 4f)
        val rotation = inputData.getInt(K_ROTATION, 0)
        var useAi = inputData.getBoolean(K_AI, true)
        val strength = inputData.getFloat(K_STRENGTH, 0.7f)
        val label = inputData.getString(K_LABEL).orEmpty()
        val active = currentCoroutineContext()
        val cancelled = { !active.isActive }
        val notes = ArrayList<String>()
        val started = System.nanoTime()
        try {
            if (files.isEmpty()) return fail("No frames were captured.")
            val (level, thermal) = ThermalGuard.effectiveLevel(applicationContext, ProcessingLevel.BALANCED, true)
            if (thermal != null) { notes += thermal; if (level == ProcessingLevel.QUICK && useAi) { useAi = false; notes += "AI upscaling was skipped because the device is warm." } }

            // 1. Keep the untouched reference frame as the original photo (no recompression, orientation tag set).
            val originalUri = saveOriginal(files[0], rotation)
            progress(0.05f)

            // 2. Decode the same centre region from every frame.
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }.also { BitmapFactory.decodeFile(files[0].path, it) }
            val fw = bounds.outWidth; val fh = bounds.outHeight
            if (fw <= 0 || fh <= 0) throw AppException(Errors.corruptedMedia())
            val rw = (fw / crop).roundToInt(); val rh = (fh / crop).roundToInt()
            val rect = Rect((fw - rw) / 2, (fh - rh) / 2, (fw - rw) / 2 + rw, (fh - rh) / 2 + rh)
            var sample = 1
            if (files.size > 1 && rw.toLong() * rh > 3_000_000L) { sample = 2; notes += "Frames were merged at half resolution to fit in memory." }
            val frames = ArrayList<IntArray>(); var w = 0; var h = 0
            for ((i, f) in files.withIndex()) {
                if (cancelled()) throw EnhancementCancelled()
                val b = decodeRegion(f, rect, sample, rotation)
                w = b.width; h = b.height
                val px = IntArray(w * h); b.getPixels(px, 0, w, 0, 0, w, h); b.recycle()
                frames += px
                progress(0.05f + 0.15f * (i + 1) / files.size)
            }

            // 3. Merge the burst (blur rejection, alignment, ghost rejection), or use the single frame.
            var px: IntArray
            if (frames.size > 1) {
                val sigma = ImageAnalyzer.analyze(ArrayPixels(w, h, frames[0])).noiseSigma
                val (merged, rep) = FrameMerger.merge(frames, w, h, sigma, isCancelled = cancelled)
                px = merged
                notes += "Merged ${rep.framesUsed} of ${rep.framesGiven} frames" +
                    (if (rep.rejectedBlurry.isNotEmpty()) "; ${rep.rejectedBlurry.size} blurred frame(s) rejected" else "") +
                    (if (rep.ghostRejectedFraction > 0.01f) "; moving areas taken from one frame to avoid ghosting" else "") + "."
            } else px = frames[0]
            frames.clear()
            progress(0.35f)

            // 4. Gentle correction before upscaling (denoise, exposure, white balance, sharpening).
            val stats = ImageAnalyzer.analyze(ArrayPixels(w, h, px), cancelled)
            val ep = EnhancementPlanner.plan(stats, EnhancementProfile.NATURAL, 0.6f, level)
            val corrected = ArrayPixels(w, h)
            Enhancer().enhance(ArrayPixels(w, h, px), corrected, ep, isCancelled = cancelled)
            px = corrected.pixels
            progress(0.45f)

            // 5. Upscale the crop back toward the original framing resolution.
            val targetScale = crop * sample
            var outW = w; var outH = h
            if (targetScale > 1.05f) {
                val maxF = sqrt(SuperResolutionPipeline.MAX_OUTPUT_PIXELS.toDouble() / (w.toLong() * h)).toInt()
                val factor = min(4, min(maxF, ceil(targetScale).toInt())).coerceAtLeast(2)
                val canAi = useAi && w.toLong() * h <= SuperResolutionPipeline.MAX_INPUT_PIXELS
                if (useAi && !canAi) notes += "The crop was too large for AI upscaling, so the standard method was used."
                val model = if (canAi) try { SuperResolver(graph.models.get(ModelNames.SUPER_RES)) } catch (e: ModelUnavailable) { notes += e.message ?: "AI model unavailable."; null } else null
                val res = SuperResolutionPipeline.run(px, w, h, factor, strength, model, progress = { setProgressAsync(workDataOf(K_PROGRESS to 0.45f + 0.45f * it)) }, isCancelled = cancelled)
                notes += res.notes
                val tw = min(res.width, (w * targetScale).roundToInt()); val th = min(res.height, (h * targetScale).roundToInt())
                px = if (tw < res.width) Resample.area(res.pixels, res.width, res.height, tw, th) else res.pixels
                outW = if (tw < res.width) tw else res.width; outH = if (tw < res.width) th else res.height
                if (res.method == SrMethod.AI) notes += "Upscaled detail is generated by AI and is not guaranteed to match the real scene."
            }
            progress(0.93f)

            // 6. Save the result as a new photo, labelled honestly, and link it to the original.
            val bmp = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
            BitmapPixels(bmp).writeRows(0, outH, px)
            val note = notes.joinToString(" ")
            val out = graph.media.saveJpeg(MediaStoreRepository.timestampName("AICS_", "_zoom"), bmp, 95) { uri ->
                applicationContext.contentResolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                    val ex = ExifInterface(pfd.fileDescriptor)
                    ex.setAttribute(ExifInterface.TAG_SOFTWARE, "AI Camera Studio ultra zoom")
                    ex.setAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION, "$label. ${note.take(400)}")
                    ex.saveAttributes()
                }
            }
            bmp.recycle()
            val ms = (System.nanoTime() - started) / 1_000_000
            graph.database.assets().upsert(MediaAsset(UUID.randomUUID().toString(), "zoom", originalUri.toString(), out.toString(),
                System.currentTimeMillis(), outW, outH, 0, JobState.SUCCEEDED.name, null, "$label. $note", ms, null))
            progress(1f)
            return Result.success(workDataOf(K_OUT to out.toString(), K_NOTES to note, K_MS to ms))
        } catch (c: EnhancementCancelled) {
            return Result.failure(workDataOf(K_ERROR to "Processing was cancelled. The original frame was kept."))
        } catch (oom: OutOfMemoryError) {
            return fail(Errors.lowMemory().asMessage())
        } catch (t: Throwable) {
            return fail(ErrorMapper.map(t).asMessage())
        } finally {
            dir.deleteRecursively() // never leave captured frames behind
        }
    }

    private suspend fun progress(f: Float) = setProgress(workDataOf(K_PROGRESS to f))

    private fun decodeRegion(f: File, r: Rect, sample: Int, rotation: Int): Bitmap {
        val dec = if (android.os.Build.VERSION.SDK_INT >= 31) BitmapRegionDecoder.newInstance(f.path) else @Suppress("DEPRECATION") BitmapRegionDecoder.newInstance(f.path, false)
            ?: throw AppException(Errors.corruptedMedia())
        val b = try {
            dec.decodeRegion(r, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.ARGB_8888 })
        } finally { dec.recycle() } ?: throw AppException(Errors.corruptedMedia())
        if (rotation % 360 == 0) return b
        val m = Matrix().apply { postRotate(rotation.toFloat()) }
        return Bitmap.createBitmap(b, 0, 0, b.width, b.height, m, true).also { if (it !== b) b.recycle() }
    }

    private fun saveOriginal(frame: File, rotation: Int): Uri {
        val graph = (applicationContext as App).graph
        val resolver = applicationContext.contentResolver
        val values = graph.media.photoValues(MediaStoreRepository.timestampName("AICS_")).apply { put(MediaStore.Images.Media.IS_PENDING, 1) }
        val uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values) ?: throw AppException(Errors.mediaProvider())
        try {
            resolver.openOutputStream(uri, "w")?.use { o -> frame.inputStream().use { it.copyTo(o) } } ?: throw AppException(Errors.mediaProvider())
            resolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                val ex = ExifInterface(pfd.fileDescriptor)
                ex.setAttribute(ExifInterface.TAG_ORIENTATION, when (((rotation % 360) + 360) % 360) {
                    90 -> ExifInterface.ORIENTATION_ROTATE_90; 180 -> ExifInterface.ORIENTATION_ROTATE_180
                    270 -> ExifInterface.ORIENTATION_ROTATE_270; else -> ExifInterface.ORIENTATION_NORMAL
                }.toString())
                ex.saveAttributes()
            }
            resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            return uri
        } catch (t: Throwable) { runCatching { resolver.delete(uri, null, null) }; throw t }
    }

    private fun fail(msg: String) = Result.failure(workDataOf(K_ERROR to msg))

    companion object {
        const val K_DIR = "dir"; const val K_COUNT = "count"; const val K_CROP = "crop"; const val K_ROTATION = "rotation"
        const val K_AI = "ai"; const val K_STRENGTH = "strength"; const val K_LABEL = "label"
        const val K_PROGRESS = "progress"; const val K_OUT = "out"; const val K_NOTES = "notes"; const val K_MS = "ms"; const val K_ERROR = "error"

        fun enqueue(context: Context, name: String, dir: File, count: Int, crop: Float, rotation: Int, ai: Boolean, strength: Float, label: String) {
            val data = workDataOf(K_DIR to dir.path, K_COUNT to count, K_CROP to crop, K_ROTATION to rotation, K_AI to ai, K_STRENGTH to strength, K_LABEL to label)
            WorkManager.getInstance(context).enqueueUniqueWork(name, ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<UltraZoomWorker>().setInputData(data).addTag("zoom").build())
        }
    }
}
