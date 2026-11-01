package com.example.aicamerastudio.photo.enhancement

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.ColorSpace
import android.graphics.ImageDecoder
import android.net.Uri
import com.example.aicamerastudio.core.errors.AppException
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.photo.pipeline.PixelSink
import com.example.aicamerastudio.photo.pipeline.PixelSource
import java.io.IOException

class BitmapPixels(val bitmap: Bitmap) : PixelSource, PixelSink {
    init { require(bitmap.config == Bitmap.Config.ARGB_8888) { "Bitmap must be ARGB_8888" } }
    override val width: Int get() = bitmap.width
    override val height: Int get() = bitmap.height
    override fun readRows(y0: Int, y1: Int, out: IntArray) = bitmap.getPixels(out, 0, width, 0, y0, width, y1 - y0)
    override fun writeRows(y0: Int, y1: Int, pixels: IntArray) = bitmap.setPixels(pixels, 0, width, 0, y0, width, y1 - y0)
}

object ImageLoader {
    /**
     * Decodes with EXIF orientation applied and converts to sRGB, in a software mutable ARGB_8888 bitmap.
     * Wide gamut sources are converted to sRGB, which is the colour space the pipeline works in.
     * [maxEdge] <= 0 keeps full resolution. [sampleSize] > 1 halves (and so on) each side.
     */
    fun decode(resolver: ContentResolver, uri: Uri, maxEdge: Int = 0, sampleSize: Int = 1): Bitmap {
        try {
            val source = ImageDecoder.createSource(resolver, uri)
            return ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                decoder.isMutableRequired = true
                decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB))
                val w = info.size.width
                val h = info.size.height
                if (maxEdge > 0 && maxOf(w, h) > maxEdge) {
                    val s = maxEdge.toFloat() / maxOf(w, h)
                    decoder.setTargetSize((w * s).toInt().coerceAtLeast(1), (h * s).toInt().coerceAtLeast(1))
                } else if (sampleSize > 1) {
                    decoder.setTargetSampleSize(sampleSize)
                }
            }
        } catch (e: ImageDecoder.DecodeException) {
            throw AppException(Errors.corruptedMedia(), e)
        } catch (e: IOException) {
            throw AppException(Errors.invalidMedia(), e)
        }
    }

    fun sizeOf(resolver: ContentResolver, uri: Uri): Pair<Int, Int> {
        var size = 0 to 0
        try {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(resolver, uri)) { decoder, info, _ ->
                size = info.size.width to info.size.height
                throw StopDecode
            }
        } catch (_: StopDecode) {
        } catch (e: Exception) {
            throw AppException(Errors.invalidMedia(), e)
        }
        return size
    }

    private object StopDecode : RuntimeException() {
        private fun readResolve(): Any = StopDecode
        override fun fillInStackTrace(): Throwable = this
    }
}
