package com.example.aicamerastudio.photo.pipeline

/** Row-oriented read access to ARGB_8888 pixels so large images can be processed in bands. */
interface PixelSource {
    val width: Int
    val height: Int

    /** Copies rows [y0, y1) into [out] (row-major, width ints per row). */
    fun readRows(y0: Int, y1: Int, out: IntArray)
}

interface PixelSink {
    fun writeRows(y0: Int, y1: Int, pixels: IntArray)
}

/** In-memory pixels, used by tests and by the editor preview. */
class ArrayPixels(
    override val width: Int,
    override val height: Int,
    val pixels: IntArray = IntArray(width * height),
) : PixelSource, PixelSink {
    init {
        require(width > 0 && height > 0) { "Image must have positive size" }
        require(pixels.size == width * height) { "Pixel array does not match ${width}x$height" }
    }

    override fun readRows(y0: Int, y1: Int, out: IntArray) {
        System.arraycopy(pixels, y0 * width, out, 0, (y1 - y0) * width)
    }

    override fun writeRows(y0: Int, y1: Int, pixels: IntArray) {
        System.arraycopy(pixels, 0, this.pixels, y0 * width, (y1 - y0) * width)
    }
}

class EnhancementCancelled : kotlin.coroutines.cancellation.CancellationException("Enhancement cancelled")
