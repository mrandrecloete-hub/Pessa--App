@file:Suppress("unused", "UNUSED_PARAMETER")
package android.graphics

import java.awt.image.BufferedImage
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageIO
import javax.imageio.ImageWriteParam
import javax.imageio.stream.MemoryCacheImageOutputStream

/**
 * Just enough of Android's picture classes for the shared document engine, backed by java.awt.
 * The engine source is the Android app's; on Windows it runs against these.
 */
class Bitmap private constructor(val image: BufferedImage, private var alpha: Boolean) {
    enum class Config { ARGB_8888, RGB_565, ALPHA_8 }
    enum class CompressFormat { JPEG, PNG, WEBP }

    val width: Int get() = image.width
    val height: Int get() = image.height
    val config: Config get() = Config.ARGB_8888
    val byteCount: Int get() = width * height * 4

    fun hasAlpha(): Boolean = alpha
    fun setHasAlpha(v: Boolean) { alpha = v }
    fun getPixel(x: Int, y: Int): Int = image.getRGB(x, y)
    fun setPixel(x: Int, y: Int, c: Int) = image.setRGB(x, y, c)
    fun getPixels(px: IntArray, offset: Int, stride: Int, x: Int, y: Int, w: Int, h: Int) { image.getRGB(x, y, w, h, px, offset, stride) }
    fun setPixels(px: IntArray, offset: Int, stride: Int, x: Int, y: Int, w: Int, h: Int) { image.setRGB(x, y, w, h, px, offset, stride) }
    fun eraseColor(c: Int) { for (y in 0 until height) for (x in 0 until width) image.setRGB(x, y, c) }
    fun copy(config: Config, mutable: Boolean): Bitmap { val b = BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB); b.graphics.apply { drawImage(image, 0, 0, null); dispose() }; return Bitmap(b, alpha) }
    fun recycle() {}

    fun compress(format: CompressFormat, quality: Int, out: OutputStream): Boolean {
        val name = if (format == CompressFormat.JPEG) "jpeg" else "png"
        var img = image
        if (format == CompressFormat.JPEG) { val rgb = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB); rgb.graphics.apply { drawImage(image, 0, 0, java.awt.Color.WHITE, null); dispose() }; img = rgb }
        val writer = ImageIO.getImageWritersByFormatName(name).next()
        val p = writer.defaultWriteParam
        if (format == CompressFormat.JPEG) { p.compressionMode = ImageWriteParam.MODE_EXPLICIT; p.compressionQuality = quality.coerceIn(1, 100) / 100f }
        MemoryCacheImageOutputStream(out).use { s -> writer.output = s; writer.write(null, IIOImage(img, null, null), p); s.flush() }
        writer.dispose(); return true
    }

    companion object {
        fun wrap(img: BufferedImage): Bitmap {
            val a = img.colorModel.hasAlpha()
            if (img.type == BufferedImage.TYPE_INT_ARGB) return Bitmap(img, a)
            val b = BufferedImage(img.width, img.height, BufferedImage.TYPE_INT_ARGB); b.graphics.apply { drawImage(img, 0, 0, null); dispose() }; return Bitmap(b, a)
        }
        fun createBitmap(w: Int, h: Int, c: Config): Bitmap = Bitmap(BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB), true)
        fun createBitmap(px: IntArray, w: Int, h: Int, c: Config): Bitmap { val b = createBitmap(w, h, c); b.setPixels(px, 0, w, 0, 0, w, h); return b }
        fun createScaledBitmap(src: Bitmap, w: Int, h: Int, filter: Boolean): Bitmap {
            val b = BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB)
            b.createGraphics().apply {
                setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, if (filter) java.awt.RenderingHints.VALUE_INTERPOLATION_BICUBIC else java.awt.RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR)
                // Shrinking by a lot: go in steps for a clean result.
                var cur = src.image; var cw = cur.width; var ch = cur.height
                while (cw / 2 >= w && ch / 2 >= h) { cw /= 2; ch /= 2; val t = BufferedImage(cw, ch, BufferedImage.TYPE_INT_ARGB); t.createGraphics().apply { setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR); drawImage(cur, 0, 0, cw, ch, null); dispose() }; cur = t }
                drawImage(cur, 0, 0, w, h, null); dispose()
            }
            return Bitmap(b, src.hasAlpha())
        }
    }
}

object Color {
    const val BLACK = -0x1000000
    const val WHITE = -0x1
    const val TRANSPARENT = 0
    @JvmStatic fun rgb(r: Int, g: Int, b: Int): Int = (0xFF shl 24) or ((r and 255) shl 16) or ((g and 255) shl 8) or (b and 255)
    @JvmStatic fun argb(a: Int, r: Int, g: Int, b: Int): Int = ((a and 255) shl 24) or ((r and 255) shl 16) or ((g and 255) shl 8) or (b and 255)
    @JvmStatic fun red(c: Int): Int = (c shr 16) and 255
    @JvmStatic fun green(c: Int): Int = (c shr 8) and 255
    @JvmStatic fun blue(c: Int): Int = c and 255
    @JvmStatic fun alpha(c: Int): Int = (c ushr 24) and 255
}

class Paint(flags: Int = 0) {
    enum class Style { FILL, STROKE, FILL_AND_STROKE }
    var color: Int = Color.BLACK
    var style: Style = Style.FILL
    companion object { const val ANTI_ALIAS_FLAG = 1 }
}

class Canvas(private val bitmap: Bitmap) {
    private fun g() = bitmap.image.createGraphics()
    fun drawColor(c: Int) { g().apply { composite = java.awt.AlphaComposite.Src; color = java.awt.Color(c, true); fillRect(0, 0, bitmap.width, bitmap.height); dispose() } }
    fun drawBitmap(b: Bitmap, left: Float, top: Float, paint: Paint?) { g().apply { drawImage(b.image, left.toInt(), top.toInt(), null); dispose() } }
    fun drawRect(l: Float, t: Float, r: Float, b: Float, paint: Paint) {
        g().apply { color = java.awt.Color(paint.color, true)
            val x = Math.round(l); val y = Math.round(t); val w = Math.round(r) - x; val h = Math.round(b) - y
            if (paint.style == Paint.Style.STROKE) drawRect(x, y, w, h) else fillRect(x, y, w, h); dispose() }
    }
}

object BitmapFactory {
    class Options { var inJustDecodeBounds = false; var inSampleSize = 1; var outWidth = 0; var outHeight = 0; var outMimeType: String? = null }

    private fun decode(read: () -> InputStream, o: Options?): Bitmap? {
        val iis = ImageIO.createImageInputStream(read())
        val it = ImageIO.getImageReaders(iis); if (!it.hasNext()) return null
        val reader = it.next()
        try {
            reader.input = iis
            val w = reader.getWidth(0); val h = reader.getHeight(0)
            val mime = when (reader.formatName.lowercase()) { "jpeg", "jpg" -> "image/jpeg"; "png" -> "image/png"; "gif" -> "image/gif"; "bmp" -> "image/bmp"; else -> "image/" + reader.formatName.lowercase() }
            o?.let { it.outWidth = w; it.outHeight = h; it.outMimeType = mime }
            if (o?.inJustDecodeBounds == true) return null
            var img = reader.read(0)
            val s = o?.inSampleSize ?: 1
            val alpha = img.colorModel.hasAlpha()
            if (s > 1) { val t = BufferedImage(maxOf(1, img.width / s), maxOf(1, img.height / s), BufferedImage.TYPE_INT_ARGB); t.createGraphics().apply { setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR); drawImage(img, 0, 0, t.width, t.height, null); dispose() }; img = t }
            return Bitmap.wrap(img).also { it.setHasAlpha(alpha) }
        } finally { reader.dispose(); iis.close() }
    }
    fun decodeFile(path: String, o: Options? = null): Bitmap? = decode({ File(path).inputStream() }, o)
    fun decodeByteArray(data: ByteArray, off: Int, len: Int, o: Options? = null): Bitmap? = decode({ data.inputStream(off, len) }, o)
    fun decodeStream(s: InputStream, outPadding: Any? = null, o: Options? = null): Bitmap? { val b = s.readBytes(); return decode({ b.inputStream() }, o) }
}
