package com.pdfmaster.app.engine

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.PDPageContentStream
import com.tom_roush.pdfbox.pdmodel.common.PDRectangle
import com.tom_roush.pdfbox.pdmodel.graphics.image.JPEGFactory
import com.tom_roush.pdfbox.pdmodel.graphics.image.LosslessFactory
import com.tom_roush.pdfbox.pdmodel.graphics.state.RenderingMode
import java.io.Closeable
import java.io.File
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Turns a photo or scan of a page into a clean page: even white paper (shadows, tint and fold marks removed),
 * dark crisp text, and optionally black and white like a freshly printed original.
 */
object ScanClean {
    enum class Mode { COLOUR, GREY, BW }

    fun clean(src: Bitmap, mode: Mode, maxSide: Int = 2600): Bitmap {
        var bmp = src
        val side = max(src.width, src.height)
        if (side > maxSide) {
            val s = maxSide.toFloat() / side
            bmp = Bitmap.createScaledBitmap(src, max(1, (src.width * s).roundToInt()), max(1, (src.height * s).roundToInt()), true)
        }
        val w = bmp.width; val h = bmp.height
        val px = IntArray(w * h); bmp.getPixels(px, 0, w, 0, 0, w, h)
        if (bmp !== src) bmp.recycle()
        val cs = max(12, max(w, h) / 56)
        val gw = (w + cs - 1) / cs; val gh = (h + cs - 1) / cs
        val grids = Array(3) { c -> paperLevel(px, w, h, cs, gw, gh, 16 - 8 * c) }
        // Interpolation tables, so the inner loop only does a few multiplications.
        val x0 = IntArray(w); val fx = FloatArray(w)
        for (x in 0 until w) { val g = ((x + 0.5f) / cs - 0.5f).coerceIn(0f, (gw - 1).toFloat()); x0[x] = min(gw - 2, floor(g).toInt()).coerceAtLeast(0); fx[x] = if (gw == 1) 0f else g - x0[x] }
        val out = IntArray(w * h)
        for (y in 0 until h) {
            val g = ((y + 0.5f) / cs - 0.5f).coerceIn(0f, (gh - 1).toFloat()); val y0 = min(gh - 2, floor(g).toInt()).coerceAtLeast(0); val fy = if (gh == 1) 0f else g - y0
            val r0 = y0 * gw; val r1 = (if (gh == 1) y0 else y0 + 1) * gw
            for (x in 0 until w) {
                val a = x0[x]; val b = if (gw == 1) a else a + 1; val t = fx[x]
                val p = px[y * w + x]
                var rr = 0f; var gg = 0f; var bb = 0f
                for (c in 0..2) {
                    val gr = grids[c]
                    val bg = (gr[r0 + a] * (1 - t) + gr[r0 + b] * t) * (1 - fy) + (gr[r1 + a] * (1 - t) + gr[r1 + b] * t) * fy
                    val v = ((p shr (16 - 8 * c)) and 255) / max(bg, 64f)
                    when (c) { 0 -> rr = min(1f, v); 1 -> gg = min(1f, v); else -> bb = min(1f, v) }
                }
                out[y * w + x] = when (mode) {
                    Mode.BW -> { val l = smooth(0.299f * rr + 0.587f * gg + 0.114f * bb, 0.46f, 0.74f); gray(l) }
                    Mode.GREY -> { val l = levels(0.299f * rr + 0.587f * gg + 0.114f * bb, 0.12f, 0.88f, 1.15f); gray(l) }
                    Mode.COLOUR -> Color.rgb(to255(levels(rr, 0.10f, 0.90f, 1.08f)), to255(levels(gg, 0.10f, 0.90f, 1.08f)), to255(levels(bb, 0.10f, 0.90f, 1.08f)))
                }
            }
        }
        if (mode != Mode.BW) sharpen(out, w, h, 0.35f)
        return Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888)
    }

    private fun to255(v: Float) = (v * 255f + 0.5f).toInt().coerceIn(0, 255)
    private fun gray(v: Float): Int { val g = to255(v); return Color.rgb(g, g, g) }
    private fun levels(v: Float, black: Float, white: Float, gamma: Float): Float = Math.pow(((v - black) / (white - black)).coerceIn(0f, 1f).toDouble(), gamma.toDouble()).toFloat()
    private fun smooth(v: Float, a: Float, b: Float): Float { val t = ((v - a) / (b - a)).coerceIn(0f, 1f); return t * t * (3 - 2 * t) }

    /** Brightness of the blank paper for every cell of a coarse grid, from a high percentile so text does not pull it down. */
    private fun paperLevel(px: IntArray, w: Int, h: Int, cs: Int, gw: Int, gh: Int, shift: Int): FloatArray {
        val g = FloatArray(gw * gh); val hist = IntArray(256); val step = max(1, cs / 16)
        for (gy in 0 until gh) for (gx in 0 until gw) {
            java.util.Arrays.fill(hist, 0); var n = 0
            var y = gy * cs; val y1 = min(h, y + cs); val x1 = min(w, gx * cs + cs)
            while (y < y1) { var x = gx * cs; while (x < x1) { hist[(px[y * w + x] shr shift) and 255]++; n++; x += step }; y += step }
            val target = n * 0.90; var acc = 0; var v = 255
            for (i in 0..255) { acc += hist[i]; if (acc >= target) { v = i; break } }
            g[gy * gw + gx] = v.toFloat()
        }
        // Large dark areas (a coloured banner, a photo) must not be turned white: take the brightest paper nearby, then smooth.
        val r = 2; val d = FloatArray(gw * gh)
        for (gy in 0 until gh) for (gx in 0 until gw) {
            var m = 0f
            for (yy in max(0, gy - r)..min(gh - 1, gy + r)) for (xx in max(0, gx - r)..min(gw - 1, gx + r)) m = max(m, g[yy * gw + xx])
            d[gy * gw + gx] = m
        }
        var cur = d
        repeat(1) {
            val nx = FloatArray(gw * gh)
            for (gy in 0 until gh) for (gx in 0 until gw) {
                var s = 0f; var c = 0
                for (yy in max(0, gy - 1)..min(gh - 1, gy + 1)) for (xx in max(0, gx - 1)..min(gw - 1, gx + 1)) { s += cur[yy * gw + xx]; c++ }
                nx[gy * gw + gx] = s / c
            }
            cur = nx
        }
        return cur
    }

    private fun sharpen(a: IntArray, w: Int, h: Int, amount: Float) {
        val src = a.copyOf()
        for (y in 1 until h - 1) for (x in 1 until w - 1) {
            val i = y * w + x; var res = 0xFF shl 24
            for (shift in intArrayOf(16, 8, 0)) {
                val c = (src[i] shr shift) and 255
                val nb = ((src[i - 1] shr shift) and 255) + ((src[i + 1] shr shift) and 255) + ((src[i - w] shr shift) and 255) + ((src[i + w] shr shift) and 255)
                res = res or ((c + (amount * (4 * c - nb)).toInt()).coerceIn(0, 255) shl shift)
            }
            a[i] = res
        }
    }
}

class ScanPage(val bitmap: Bitmap, val lines: List<OcrLine> = emptyList())

/**
 * Writes cleaned pages into a PDF one at a time (so long scans do not fill the phone's memory).
 * With [typed] the recognised text is drawn again as real, crisp text on top of a cleaned page picture,
 * and the original text pixels are painted out. Lines the recogniser was unsure about, pictures, logos,
 * stamps and handwriting stay as they are. Without [typed] the recognised text is added invisibly so the page can be searched.
 */
class ScanPdfWriter(private val context: Context, private val mode: ScanClean.Mode, private val typed: Boolean, private val a4: Boolean = true,
                    private val minConfidence: Float = 0.70f) : Closeable {
    private val doc = PDDocument()
    private val fonts = Fonts(context, doc)
    var retypedLines = 0; private set
    var skippedLines = 0; private set

    fun add(page: ScanPage) {
        val bmp = page.bitmap
        val w = bmp.width; val h = bmp.height
        val ar = w.toFloat() / h
        val box = if (!a4) PDRectangle(w * 72f / 200f, h * 72f / 200f) else if (ar > 1.15f) PDRectangle(PDRectangle.A4.height, PDRectangle.A4.width) else PDRectangle.A4
        val s = min(box.width / w, box.height / h)
        val sw = w * s; val sh = h * s; val ox = (box.width - sw) / 2; val oy = (box.height - sh) / 2   // oy is from the top

        val use = if (typed) page.lines.filter { it.confidence >= minConfidence && fonts.clean(it.text).isNotBlank() } else emptyList()
        if (typed) skippedLines += page.lines.size - use.size
        val image: Bitmap = if (use.isEmpty()) bmp else {
            val m = bmp.copy(Bitmap.Config.ARGB_8888, true)
            val paper = Paint().apply { color = Color.WHITE; style = Paint.Style.FILL }
            val c = Canvas(m)
            for (l in use) { val bh = (l.bottom - l.top) * h; val pad = max(2f, bh * 0.10f)
                c.drawRect(l.left * w - pad, l.top * h - pad, l.right * w + pad, l.bottom * h + pad, paper) }
            m
        }
        val pdPage = PDPage(box); doc.addPage(pdPage)
        val img = if (mode == ScanClean.Mode.COLOUR || mode == ScanClean.Mode.GREY) JPEGFactory.createFromImage(doc, image, 0.9f) else LosslessFactory.createFromImage(doc, image)
        PDPageContentStream(doc, pdPage).use { cs ->
            cs.drawImage(img, ox, box.height - oy - sh, sw, sh)
            val lines = if (typed) use else page.lines.filter { it.confidence >= 0.5f }
            if (lines.isNotEmpty()) {
                if (!typed) cs.setRenderingMode(RenderingMode.NEITHER) else cs.setNonStrokingColor(rgb(0x111111))
                for (l in lines) {
                    val t = fonts.clean(l.text).trim(); if (t.isEmpty()) continue
                    val bw = (l.right - l.left) * sw; val bh = (l.bottom - l.top) * sh
                    if (bw <= 1f || bh <= 1f) continue
                    var size = (bh * 0.82f).coerceIn(2f, 200f)
                    val natural = fonts.width(fonts.regular, t, size); if (natural <= 0f) continue
                    val raw = bw / natural
                    if (typed && raw < 0.7f) size *= raw / 0.7f          // long line: shrink the letters instead of squashing them
                    val scale = (bw / fonts.width(fonts.regular, t, size) * 100f).coerceIn(if (typed) 75f else 10f, if (typed) 125f else 1000f)
                    cs.beginText(); cs.setFont(fonts.regular, size); cs.setHorizontalScaling(scale)
                    cs.newLineAtOffset(ox + l.left * sw, box.height - oy - l.bottom * sh + bh * 0.2f); cs.showText(t); cs.endText()
                    if (typed) retypedLines++
                }
            }
        }
        if (image !== bmp) image.recycle()
    }

    fun save(out: File, title: String? = null) {
        check(doc.numberOfPages > 0) { "There are no pages to save" }
        doc.documentInformation.producer = "PDFMASTER"; if (title != null) doc.documentInformation.title = title
        doc.save(out)
    }
    override fun close() = doc.close()
}
