package com.example.aicamerastudio.photo.enhancement

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import androidx.work.*
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.common.JobState
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.database.MediaAsset
import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.ModelUnavailable
import com.example.aicamerastudio.photo.filters.Filters
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.pipeline.*
import com.example.aicamerastudio.photo.portrait.PortraitLight
import com.example.aicamerastudio.photo.portrait.PortraitRenderer
import com.example.aicamerastudio.photo.segmentation.PersonSegmenter
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import java.util.UUID

/**
 * Finishes a photo taken with a look: optional enhancement, portrait effect, filter and watermark,
 * saved as ONE new photo. The untouched capture is kept unless the user turned that off.
 */
class FinishPhotoWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val graph = (applicationContext as App).graph
        val source = Uri.parse(inputData.getString(K_URI) ?: return fail("No photo."))
        val active = currentCoroutineContext(); val cancelled = { !active.isActive }
        val notes = ArrayList<String>(); val started = System.nanoTime()
        return try {
            graph.media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE)
            val bmp = ImageLoader.decode(applicationContext.contentResolver, source)
            val w = bmp.width; val h = bmp.height
            var px = IntArray(w * h); BitmapPixels(bmp).readRows(0, h, px)
            setProgress(workDataOf(K_PROGRESS to 0.1f))
            if (inputData.getBoolean(K_ENHANCE, false)) {
                val profile = EnhancementProfile.values().firstOrNull { it.name == inputData.getString(K_PROFILE) } ?: EnhancementProfile.NATURAL
                val st = ImageAnalyzer.analyze(ArrayPixels(w, h, px), cancelled)
                val p = EnhancementPlanner.plan(st, profile, inputData.getFloat(K_STRENGTH, 0.75f), ProcessingLevel.BALANCED)
                val o = ArrayPixels(w, h); Enhancer().enhance(ArrayPixels(w, h, px), o, p, isCancelled = cancelled); px = o.pixels
                notes += "Enhanced (${profile.label})."
            }
            setProgress(workDataOf(K_PROGRESS to 0.4f))
            val light = inputData.getString(K_LIGHT)?.let { n -> PortraitLight.values().firstOrNull { it.name == n } }
            if (light != null) {
                try {
                    val seg = PersonSegmenter(graph.models.get(ModelNames.PERSON_SEG))
                    // Segment and refine at working size, then enlarge the soft mask to full size.
                    val ww = minOf(w, 1280); val wh = (h.toLong() * ww / w).toInt().coerceAtLeast(1)
                    val small = Resample.resize(px, w, h, ww, wh)
                    val m = seg.segment(small, ww, wh)
                    if (m.person.count { it > 0.5f } < ww * wh / 100) notes += "No person was found, so the portrait effect was not applied."
                    else {
                        val refined = MaskOps.refine(m.person, Resample.luma(small), ww, wh, hair = m.hair)
                        val full = Resample.bilinear(refined, ww, wh, w, h)
                        px = PortraitRenderer.render(px, w, h, full, inputData.getFloat(K_BLUR, 0.6f), light, inputData.getFloat(K_LIGHT_K, 0.6f))
                        notes += "Portrait effect (${light.label}) with on-device person detection."
                    }
                } catch (e: ModelUnavailable) { notes += e.message ?: "Portrait model unavailable." }
            }
            setProgress(workDataOf(K_PROGRESS to 0.75f))
            val filter = Filters.byId(inputData.getString(K_FILTER))
            if (filter != Filters.NATURAL) { px = Filters.render(px, w, h, filter, inputData.getFloat(K_FILTER_K, 1f)); notes += "Filter: ${filter.label}." }
            val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888); BitmapPixels(out).writeRows(0, h, px); bmp.recycle()
            inputData.getString(K_WATERMARK)?.takeIf { it.isNotBlank() }?.let { Watermark.draw(out, it); notes += "Watermark added." }
            val uri = graph.media.saveJpeg(MediaStoreRepository.timestampName("BC_", "_look"), out, inputData.getInt(K_QUALITY, 92)) { u ->
                ExifCopy.copy(applicationContext, source, u, "BlazeCam (${notes.joinToString(" ")})".take(200))
            }
            out.recycle()
            val ms = (System.nanoTime() - started) / 1_000_000
            graph.database.assets().upsert(MediaAsset(UUID.randomUUID().toString(), "finished", source.toString(), uri.toString(), System.currentTimeMillis(),
                w, h, 0, JobState.SUCCEEDED.name, null, notes.joinToString(" "), ms, null))
            if (!inputData.getBoolean(K_KEEP, true)) graph.media.delete(source)
            Result.success(workDataOf(K_OUT to uri.toString(), K_NOTES to notes.joinToString(" ")))
        } catch (e: EnhancementCancelled) { fail("Cancelled. Your original photo is safe.") }
        catch (e: OutOfMemoryError) { fail(Errors.lowMemory().asMessage()) }
        catch (t: Throwable) { fail(ErrorMapper.map(t).asMessage()) }
    }

    private fun fail(m: String) = Result.failure(workDataOf(K_ERROR to m))

    data class Look(val enhance: Boolean, val profile: EnhancementProfile, val strength: Float, val light: PortraitLight?, val blur: Float,
                    val lightIntensity: Float, val filterId: String, val filterIntensity: Float, val watermark: String?, val quality: Int, val keep: Boolean) {
        val needsFinishing: Boolean get() = light != null || filterId != Filters.NATURAL.id || !watermark.isNullOrBlank()
    }

    companion object {
        const val K_URI = "uri"; const val K_ENHANCE = "enh"; const val K_PROFILE = "profile"; const val K_STRENGTH = "strength"
        const val K_LIGHT = "light"; const val K_BLUR = "blur"; const val K_LIGHT_K = "lightk"; const val K_FILTER = "filter"; const val K_FILTER_K = "filterk"
        const val K_WATERMARK = "wm"; const val K_QUALITY = "q"; const val K_KEEP = "keep"
        const val K_PROGRESS = "progress"; const val K_OUT = "out"; const val K_NOTES = "notes"; const val K_ERROR = "error"

        fun uniqueName(u: Uri) = "finish_$u"

        fun enqueue(context: Context, source: Uri, look: Look) {
            val d = Data.Builder().putString(K_URI, source.toString()).putBoolean(K_ENHANCE, look.enhance).putString(K_PROFILE, look.profile.name)
                .putFloat(K_STRENGTH, look.strength).putString(K_LIGHT, look.light?.name).putFloat(K_BLUR, look.blur).putFloat(K_LIGHT_K, look.lightIntensity)
                .putString(K_FILTER, look.filterId).putFloat(K_FILTER_K, look.filterIntensity).putString(K_WATERMARK, look.watermark)
                .putInt(K_QUALITY, look.quality).putBoolean(K_KEEP, look.keep).build()
            WorkManager.getInstance(context).enqueueUniqueWork(uniqueName(source), ExistingWorkPolicy.KEEP,
                OneTimeWorkRequestBuilder<FinishPhotoWorker>().setInputData(d).addTag("finish").build())
        }
    }
}
