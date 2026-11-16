package com.pdfmaster.app.engine

import android.graphics.Bitmap
import org.opencv.core.Core
import org.opencv.core.CvType
import org.opencv.core.Mat
import org.opencv.core.MatOfDouble
import org.opencv.core.MatOfPoint
import org.opencv.core.MatOfPoint2f
import org.opencv.core.Point
import org.opencv.core.Scalar
import org.opencv.core.Size
import org.opencv.imgproc.Imgproc
import org.opencv.photo.Photo
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Starts OpenCV and converts between Android bitmaps and OpenCV images. Works on the phone and, for tests, on a computer. */
object Cv {
    @Volatile private var ready = false
    fun ensure() {
        if (ready) return
        synchronized(this) {
            if (ready) return
            try {
                val ok = Class.forName("org.opencv.android.OpenCVLoader").getMethod("initLocal").invoke(null) as Boolean
                check(ok) { "The image engine could not start on this phone" }
            } catch (e: ClassNotFoundException) {
                Class.forName("nu.pattern.OpenCV").getMethod("loadLocally").invoke(null)
            }
            ready = true
        }
    }

    /** Bitmap to a 3 channel BGR image. */
    fun toMat(b: Bitmap): Mat {
        val w = b.width; val h = b.height
        val px = IntArray(w * h); b.getPixels(px, 0, w, 0, 0, w, h)
        val bytes = ByteArray(w * h * 3)
        var j = 0
        for (p in px) { bytes[j++] = p.toByte(); bytes[j++] = (p shr 8).toByte(); bytes[j++] = (p shr 16).toByte() }
        return Mat(h, w, CvType.CV_8UC3).also { it.put(0, 0, bytes) }
    }

    /** A 1 or 3 channel (BGR) image to a bitmap. */
    fun toBitmap(m: Mat): Bitmap {
        val w = m.cols(); val h = m.rows(); val ch = m.channels()
        val bytes = ByteArray(w * h * ch); m.get(0, 0, bytes)
        val px = IntArray(w * h)
        if (ch == 1) for (i in px.indices) { val g = bytes[i].toInt() and 255; px[i] = (0xFF shl 24) or (g shl 16) or (g shl 8) or g }
        else for (i in px.indices) { val k = i * 3; px[i] = (0xFF shl 24) or ((bytes[k + 2].toInt() and 255) shl 16) or ((bytes[k + 1].toInt() and 255) shl 8) or (bytes[k].toInt() and 255) }
        return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
    }
}

/** Collects OpenCV images so their native memory is freed as soon as a step is done. */
private class Scope {
    private val all = ArrayList<Mat>()
    fun <T : Mat> T.keep(): T { all.add(this); return this }
    fun mat(): Mat = Mat().keep()
    fun release() { all.forEach { it.release() }; all.clear() }
}

/**
 * Professional document restoration: finds the page in a photo, straightens it, evens out the light, cleans the paper,
 * and sharpens the text, using OpenCV. It changes tones and geometry only. It never draws, retypes or invents anything:
 * strokes, signatures, stamps, seals and logos stay as the camera recorded them.
 */
object Restore {
    enum class Mode(val label: String, val blurb: String) {
        AUTO("AI Auto Enhance", "Analyses the page on your phone and picks the settings. Nothing is sent anywhere"),
        CLEAN("Professional Clean Scan", "Even light, clean paper, sharp dark text. Colours are kept"),
        WHITE("White Paper Restoration", "Strong whitening for grey, yellow or stained paper"),
        BW("Black & White Document", "Crisp black text on white, like a printed original. Stamps and signatures keep their tones"),
        COLOUR("Colour Document Preservation", "A gentle clean up that keeps the colours of the original"),
        SIGNATURE("Signature & Stamp Preservation", "Only the paper is cleaned. Ink, stamps and seals are not touched")
    }

    data class Params(val mode: Mode = Mode.AUTO, val strength: Float = 0.6f, val autoCrop: Boolean = true, val rotate: Int = 0)

    /** Page corners as fractions of the picture (top left, top right, bottom right, bottom left), or the whole picture when none were found. */
    class Detection(val quad: FloatArray, val found: Boolean, val alreadyPage: Boolean, val confidence: Float, val touchesEdge: Boolean) {
        companion object { val WHOLE = Detection(floatArrayOf(0f, 0f, 1f, 0f, 1f, 1f, 0f, 1f), false, false, 0f, false) }
    }

    class Report {
        val warnings = ArrayList<String>()
        val notes = ArrayList<String>()
        var skewDeg = 0f
        var chosen: Mode = Mode.CLEAN
        var sharpness = 0f
        var noise = 0f
    }

    class Result(val geometry: Bitmap?, val enhanced: Bitmap, val report: Report)

    // ---------------------------------------------------------------- finding the page

    private fun orderCorners(p: List<Point>): List<Point> {
        val sum = p.map { it.x + it.y }; val diff = p.map { it.y - it.x }
        return listOf(p[sum.indexOf(sum.min())], p[diff.indexOf(diff.min())], p[sum.indexOf(sum.max())], p[diff.indexOf(diff.max())])
    }

    private fun cornerAnglesOk(q: List<Point>): Boolean {
        for (i in 0..3) {
            val a = q[(i + 3) % 4]; val b = q[i]; val c = q[(i + 1) % 4]
            val v1x = a.x - b.x; val v1y = a.y - b.y; val v2x = c.x - b.x; val v2y = c.y - b.y
            val cos = (v1x * v2x + v1y * v2y) / (hypot(v1x, v1y) * hypot(v2x, v2y) + 1e-9)
            val deg = Math.toDegrees(acos(cos.coerceIn(-1.0, 1.0)))
            if (deg < 55 || deg > 125) return false
        }
        return true
    }

    private fun quadFrom(c: MatOfPoint, sc: Scope): List<Point>? = with(sc) {
        val c2f = MatOfPoint2f(*c.toArray()).keep()
        val peri = Imgproc.arcLength(c2f, true)
        for (eps in doubleArrayOf(0.02, 0.03, 0.045)) {
            val ap = MatOfPoint2f().keep(); Imgproc.approxPolyDP(c2f, ap, eps * peri, true)
            if (ap.rows() == 4 && Imgproc.isContourConvex(MatOfPoint(*ap.toArray()))) return orderCorners(ap.toList())
        }
        // Rounded corners or a curled page: the tightest rotated rectangle around it.
        val rect = Imgproc.minAreaRect(c2f); val pts = arrayOf(Point(), Point(), Point(), Point()); rect.points(pts)
        orderCorners(pts.toList())
    }

    /** Looks for the page in a photo: the largest four sided shape with good corners. */
    fun detect(src: Bitmap): Detection {
        Cv.ensure(); val sc = Scope()
        return try { with(sc) {
            val full = Cv.toMat(src).keep(); val s = 900.0 / max(full.cols(), full.rows()).coerceAtLeast(1)
            val small = mat(); Imgproc.resize(full, small, Size(), min(1.0, s), min(1.0, s), Imgproc.INTER_AREA)
            val w = small.cols().toDouble(); val h = small.rows().toDouble(); val total = w * h
            val gray = mat(); Imgproc.cvtColor(small, gray, Imgproc.COLOR_BGR2GRAY)
            val blur = mat(); Imgproc.GaussianBlur(gray, blur, Size(7.0, 7.0), 0.0)
            val cands = ArrayList<Pair<List<Point>, Double>>()
            fun consider(mask: Mat) {
                val cs = ArrayList<MatOfPoint>(); Imgproc.findContours(mask, cs, mat(), Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE)
                for (c in cs.sortedByDescending { Imgproc.contourArea(it) }.take(6)) {
                    val area = Imgproc.contourArea(c); if (area < total * 0.18) break
                    val q = quadFrom(c, sc) ?: continue
                    if (!cornerAnglesOk(q)) continue
                    cands.add(q to area / total)
                }
            }
            // 1. outlines (works when the page edge is visible against the table)
            val edges = mat(); Imgproc.Canny(blur, edges, 40.0, 120.0)
            val k = Imgproc.getStructuringElement(Imgproc.MORPH_RECT, Size(5.0, 5.0)).keep()
            Imgproc.dilate(edges, edges, k, Point(-1.0, -1.0), 2); Imgproc.morphologyEx(edges, edges, Imgproc.MORPH_CLOSE, k)
            consider(edges)
            // 2. bright region (paper is lighter than the surface under it)
            val bw = mat(); Imgproc.threshold(blur, bw, 0.0, 255.0, Imgproc.THRESH_BINARY or Imgproc.THRESH_OTSU)
            val big = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(max(9.0, w / 40), max(9.0, w / 40))).keep()
            Imgproc.morphologyEx(bw, bw, Imgproc.MORPH_CLOSE, big); Imgproc.morphologyEx(bw, bw, Imgproc.MORPH_OPEN, big)
            consider(bw)
            val best = cands.filter { it.second < 0.985 }.maxByOrNull { it.second }
            if (best == null) {
                // Nothing page shaped inside the frame: either the picture is already the page (a scan) or the page was not found.
                val ink = mat(); Imgproc.adaptiveThreshold(blur, ink, 255.0, Imgproc.ADAPTIVE_THRESH_GAUSSIAN_C, Imgproc.THRESH_BINARY_INV, 31, 12.0)
                val meanBright = Core.mean(gray).`val`[0]
                return Detection(Detection.WHOLE.quad, false, meanBright > 150, 0f, false)
            }
            val q = best.first; val area = best.second
            val touches = q.any { it.x < w * 0.012 || it.y < h * 0.012 || it.x > w * 0.988 || it.y > h * 0.988 }
            Detection(floatArrayOf(*q.flatMap { listOf((it.x / w).toFloat(), (it.y / h).toFloat()) }.toFloatArray()), true, false, area.toFloat().coerceIn(0f, 1f), touches)
        } } finally { sc.release() }
    }

    // ---------------------------------------------------------------- geometry

    private fun warp(src: Mat, d: Detection, maxSide: Int, sc: Scope): Mat = with(sc) {
        val w = src.cols().toDouble(); val h = src.rows().toDouble()
        // Trim a hair so no table edge is left at the border.
        val cx = (d.quad[0] + d.quad[2] + d.quad[4] + d.quad[6]) / 4; val cy = (d.quad[1] + d.quad[3] + d.quad[5] + d.quad[7]) / 4
        val pts = (0..3).map { i -> val x = d.quad[2 * i]; val y = d.quad[2 * i + 1]; Point((x + (cx - x) * 0.004f) * w, (y + (cy - y) * 0.004f) * h) }
        val wTop = hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y); val wBot = hypot(pts[2].x - pts[3].x, pts[2].y - pts[3].y)
        val hL = hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y); val hR = hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y)
        var ow = max(wTop, wBot); var oh = max(hL, hR)
        val k = maxSide / max(ow, oh); if (k < 1.0) { ow *= k; oh *= k }
        val dst = MatOfPoint2f(Point(0.0, 0.0), Point(ow - 1, 0.0), Point(ow - 1, oh - 1), Point(0.0, oh - 1)).keep()
        val m = Imgproc.getPerspectiveTransform(MatOfPoint2f(*pts.toTypedArray()).keep(), dst).keep()
        val out = Mat()
        Imgproc.warpPerspective(src, out, m, Size(ow.roundToInt().toDouble(), oh.roundToInt().toDouble()), Imgproc.INTER_CUBIC, Core.BORDER_REPLICATE)
        out
    }

    private fun fitTo(src: Mat, maxSide: Int, sc: Scope): Mat {
        val side = max(src.cols(), src.rows()); if (side <= maxSide) return src
        val k = maxSide.toDouble() / side; val out = sc.mat(); Imgproc.resize(src, out, Size(), k, k, Imgproc.INTER_AREA); return out
    }

    private fun long(m: Mat, sc: Scope, side: Int): Mat = with(sc) {
        val k = side.toDouble() / max(m.cols(), m.rows()); if (k >= 1.0) return m
        val o = mat(); Imgproc.resize(m, o, Size(), k, k, Imgproc.INTER_AREA); o
    }

    /** Skew of the text lines in degrees (positive means the text runs downhill to the right), found by testing small turns. */
    private fun skew(norm: Mat, sc: Scope): Float = with(sc) {
        val s = long(norm, sc, 700); val g = mat(); Imgproc.cvtColor(s, g, Imgproc.COLOR_BGR2GRAY)
        val ink = mat(); Imgproc.threshold(g, ink, 0.0, 255.0, Imgproc.THRESH_BINARY_INV or Imgproc.THRESH_OTSU)
        if (Core.countNonZero(ink) < ink.total() * 0.004) return 0f
        fun score(a: Double): Double {
            val r = Imgproc.getRotationMatrix2D(Point(ink.cols() / 2.0, ink.rows() / 2.0), a, 1.0).keep()
            val rot = Mat().keep(); Imgproc.warpAffine(ink, rot, r, ink.size(), Imgproc.INTER_LINEAR, Core.BORDER_CONSTANT, Scalar(0.0))
            val prof = Mat().keep(); Core.reduce(rot, prof, 1, Core.REDUCE_SUM, CvType.CV_32F)
            val mean = MatOfDouble().keep(); val sd = MatOfDouble().keep(); Core.meanStdDev(prof, mean, sd)
            return sd.toArray()[0]
        }
        val base = score(0.0)
        var best = 0.0; var bestScore = base
        var a = -6.0
        while (a <= 6.0) { val sc2 = score(a); if (sc2 > bestScore) { bestScore = sc2; best = a }; a += 0.5 }
        var f = best - 0.45
        while (f <= best + 0.45) { val sc2 = score(f); if (sc2 > bestScore) { bestScore = sc2; best = f }; f += 0.1 }
        if (bestScore < base * 1.04 || abs(best) < 0.25) 0f else best.toFloat()
    }

    private fun rotate(src: Mat, deg: Double, border: Scalar, sc: Scope): Mat = with(sc) {
        val r = Imgproc.getRotationMatrix2D(Point(src.cols() / 2.0, src.rows() / 2.0), deg, 1.0).keep()
        val out = Mat(); Imgproc.warpAffine(src, out, r, src.size(), Imgproc.INTER_CUBIC, Core.BORDER_CONSTANT, border); out
    }

    private fun turn(src: Mat, quarter: Int, sc: Scope): Mat {
        if (quarter % 4 == 0) return src
        val o = sc.mat(); Core.rotate(src, o, when (quarter % 4) { 1 -> Core.ROTATE_90_CLOCKWISE; 2 -> Core.ROTATE_180; else -> Core.ROTATE_90_COUNTERCLOCKWISE }); return o
    }

    // ---------------------------------------------------------------- light and paper

    /**
     * Evens out lighting by dividing the picture by an estimate of the blank paper. The estimate is made by a
     * grey closing, which fills in thin dark things (text, signature strokes) but not large dark areas (photos, seals),
     * so those keep their darkness.
     */
    private fun normalize(src: Mat, sc: Scope, info: DoubleArray?, kernFrac: Double = 0.045): Mat = with(sc) {
        val small = long(src, sc, 640)
        val kern = max(9, (small.cols().coerceAtLeast(small.rows()) * kernFrac).toInt()) or 1
        val ker = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(kern.toDouble(), kern.toDouble())).keep()
        val bg = mat(); Imgproc.morphologyEx(small, bg, Imgproc.MORPH_CLOSE, ker)
        Imgproc.medianBlur(bg, bg, 5); Imgproc.GaussianBlur(bg, bg, Size(0.0, 0.0), max(3.0, kern / 3.0))
        val big = mat(); Imgproc.resize(bg, big, src.size(), 0.0, 0.0, Imgproc.INTER_LINEAR)
        Core.max(big, Scalar(40.0, 40.0, 40.0), big)
        if (info != null) {
            val mean = Core.mean(bg).`val`; info[0] = mean[0]; info[1] = mean[1]; info[2] = mean[2]
            val g = mat(); Imgproc.cvtColor(bg, g, Imgproc.COLOR_BGR2GRAY); val mm = Core.minMaxLoc(g); info[3] = mm.minVal; info[4] = mm.maxVal
        }
        val out = Mat(); Core.divide(src, big, out, 255.0); out
    }

    private fun percentile(g: Mat, sc: Scope, p: Double): Int = with(sc) {
        val s = long(g, sc, 600); val b = ByteArray(s.rows() * s.cols()); s.get(0, 0, b)
        val hist = IntArray(256); for (v in b) hist[v.toInt() and 255]++
        val target = (b.size * p).toLong(); var acc = 0L
        for (i in 0..255) { acc += hist[i]; if (acc >= target) return i }
        255
    }

    private fun gray(m: Mat, sc: Scope): Mat { val g = sc.mat(); Imgproc.cvtColor(m, g, Imgproc.COLOR_BGR2GRAY); return g }

    private fun lut(black: Double, white: Double, gamma: Double): Mat {
        val l = Mat(1, 256, CvType.CV_8U); val b = ByteArray(256)
        for (i in 0..255) b[i] = (Math.pow(((i - black) / (white - black)).coerceIn(0.0, 1.0), gamma) * 255 + 0.5).toInt().coerceIn(0, 255).toByte()
        l.put(0, 0, b); return l
    }

    private fun smooth(x: Double, a: Double, b: Double): Double { val t = ((x - a) / (b - a)).coerceIn(0.0, 1.0); return t * t * (3 - 2 * t) }

    /** Estimates image noise (Immerkaer) in grey levels. */
    private fun noiseSigma(norm: Mat, sc: Scope): Double = with(sc) {
        val g = gray(long(norm, sc, 1200), sc)
        val k = Mat(3, 3, CvType.CV_32F).keep(); k.put(0, 0, floatArrayOf(1f, -2f, 1f, -2f, 4f, -2f, 1f, -2f, 1f))
        val o = mat(); Imgproc.filter2D(g, o, CvType.CV_32F, k)
        val abs = mat(); Core.absdiff(o, Scalar(0.0), abs)
        // Text edges also respond, so use the lower half of the responses: they come from flat paper.
        val b = FloatArray(abs.rows() * abs.cols()); abs.get(0, 0, b); b.sort()
        val half = b.size / 2; var sum = 0.0; for (i in 0 until half) sum += b[i]
        sqrt(Math.PI / 2) * (sum / half) / 6.0
    }

    /** Sharpness of the text: variance of the Laplacian, measured only around the ink so empty paper does not hide blur. */
    private fun sharpness(norm: Mat, sc: Scope): Double = with(sc) {
        val g = gray(long(norm, sc, 1600), sc); val l = mat(); Imgproc.Laplacian(g, l, CvType.CV_32F)
        val ink = mat(); Imgproc.threshold(g, ink, 0.0, 255.0, Imgproc.THRESH_BINARY_INV or Imgproc.THRESH_OTSU)
        val k = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(7.0, 7.0)).keep(); Imgproc.dilate(ink, ink, k)
        if (Core.countNonZero(ink) < 200) return 1e6
        val m = MatOfDouble().keep(); val sd = MatOfDouble().keep(); Core.meanStdDev(l, m, sd, ink); val s = sd.toArray()[0]; s * s
    }

    private fun lab(m: Mat, sc: Scope): List<Mat> = with(sc) { val l = mat(); Imgproc.cvtColor(m, l, Imgproc.COLOR_BGR2Lab); val ch = ArrayList<Mat>(); Core.split(l, ch); ch.forEach { it.keep() }; ch }
    private fun unlab(ch: List<Mat>, sc: Scope): Mat { val l = sc.mat(); Core.merge(ch, l); val o = Mat(); Imgproc.cvtColor(l, o, Imgproc.COLOR_Lab2BGR); return o }

    private fun unsharp(ch: List<Mat>, amount: Double, sigma: Double, sc: Scope) = with(sc) {
        val l = ch[0]; val b = mat(); Imgproc.GaussianBlur(l, b, Size(0.0, 0.0), sigma); Core.addWeighted(l, 1.0 + amount, b, -amount, 0.0, l)
    }

    private fun denoise(norm: Mat, sigma: Double, s: Double, sc: Scope): Mat = with(sc) {
        if (sigma > 3.0 && s > 0.15) {
            val ch = lab(norm, sc); val h = (sigma * (0.55 + s)).coerceIn(2.0, 11.0)
            val d = mat(); Photo.fastNlMeansDenoising(ch[0], d, h.toFloat(), 5, 15); d.copyTo(ch[0]); return unlab(ch, sc)
        }
        if (sigma > 1.2 && s > 0.2) { val o = Mat(); Imgproc.bilateralFilter(norm, o, 5, 14.0 + 30 * s, 3.0); return o }
        norm.clone()
    }

    /** Blends two full images by a 0..1 weight mask: a*(1-m) + b*m. */
    private fun blend(a: Mat, b: Mat, mask: Mat, sc: Scope): Mat = with(sc) {
        val m3 = mat(); Core.merge(listOf(mask, mask, mask), m3)
        val af = mat(); a.convertTo(af, CvType.CV_32FC3); val bf = mat(); b.convertTo(bf, CvType.CV_32FC3)
        val one = mat(); Core.subtract(Mat.ones(m3.size(), CvType.CV_32FC3).also { it.setTo(Scalar(1.0, 1.0, 1.0)) }.keep(), m3, one)
        val t1 = mat(); Core.multiply(af, one, t1); val t2 = mat(); Core.multiply(bf, m3, t2); Core.add(t1, t2, t1)
        val o = Mat(); t1.convertTo(o, CvType.CV_8UC3); o
    }

    /** Pixels that carry colour ink: stamps, seals, logos, blue pen. */
    private fun colourInk(norm: Mat, sc: Scope): Mat = with(sc) {
        val hsv = mat(); Imgproc.cvtColor(norm, hsv, Imgproc.COLOR_BGR2HSV)
        val m = mat(); Core.inRange(hsv, Scalar(0.0, 75.0, 40.0), Scalar(180.0, 255.0, 255.0), m)
        val k = Imgproc.getStructuringElement(Imgproc.MORPH_ELLIPSE, Size(5.0, 5.0)).keep(); Imgproc.dilate(m, m, k); m
    }

    // ---------------------------------------------------------------- the enhancements

    private fun enhance(norm: Mat, mode: Mode, strength: Double, rep: Report, tint: Double, sc: Scope): Mat = with(sc) {
        val s = strength.coerceIn(0.0, 1.0)
        val sigma = noiseSigma(norm, sc); val sharp = sharpness(norm, sc); rep.noise = sigma.toFloat(); rep.sharpness = sharp.toFloat()
        val longSide = max(norm.cols(), norm.rows())
        var m = mode
        if (mode == Mode.AUTO) {
            m = if (tint > 12) Mode.WHITE else Mode.CLEAN
            rep.notes.add("Auto: chose ${m.label}" + (if (tint > 12) " because the paper has a clear colour cast" else " because the paper is already fairly neutral") + (if (sigma > 3) ", with noise reduction" else "") + (if (sharp < 700) " and extra sharpening for a slightly soft photo" else "") + ".")
        }
        rep.chosen = m
        val softBoost = if (sharp < 700) 1.3 else 1.0
        val sig = max(0.8, longSide * 0.0005)
        when (m) {
            Mode.CLEAN, Mode.WHITE, Mode.AUTO -> {
                var cur = denoise(norm, sigma, s, sc).keep()
                if (s > 0.2) { val ch = lab(cur, sc); val cl = Imgproc.createCLAHE(1.0 + 1.6 * s, Size(8.0, 8.0)); val c2 = mat(); cl.apply(ch[0], c2); Core.addWeighted(ch[0], 0.5, c2, 0.5, 0.0, ch[0]); cur = unlab(ch, sc).keep() }
                val g = gray(cur, sc); val white = percentile(g, sc, 0.72).coerceIn(120, 255); val black = percentile(g, sc, 0.004).coerceAtMost(white - 40)
                val l = lut(black * 0.6, white * (if (m == Mode.WHITE) 0.88 else 0.89), 1.0 + 0.3 * s).keep(); val st = mat(); Core.LUT(cur, l, st)
                val ch = lab(st, sc); unsharp(ch, (0.45 + 1.1 * s) * softBoost, sig, sc); var out = unlab(ch, sc).keep()
                if (m == Mode.WHITE) {
                    // Take the colour out of anything that is paper: bright and nearly colourless. Coloured ink keeps its colour.
                    val c3 = lab(out, sc); val a = mat(); c3[1].convertTo(a, CvType.CV_32F, 1.0, -128.0); val b = mat(); c3[2].convertTo(b, CvType.CV_32F, 1.0, -128.0)
                    val chroma = mat(); Core.magnitude(a, b, chroma)
                    val lf = mat(); c3[0].convertTo(lf, CvType.CV_32F)
                    val bright = mat(); Core.subtract(lf, Scalar(176.0), bright); Core.multiply(bright, Scalar(1.0 / 60), bright)
                    val lowc = mat(); Core.subtract(Scalar(30.0).let { Mat(chroma.size(), CvType.CV_32F, it).keep() }, chroma, lowc); Core.multiply(lowc, Scalar(1.0 / 18), lowc)
                    Core.min(bright, lowc, bright); Core.max(bright, Scalar(0.0), bright); Core.min(bright, Scalar(1.0), bright)
                    val neutral = mat(); Mat(c3[1].size(), CvType.CV_8U, Scalar(128.0)).also { it.copyTo(neutral) }
                    val na = mat(); c3[1].convertTo(na, CvType.CV_32F); val nb = mat(); c3[2].convertTo(nb, CvType.CV_32F)
                    val inv = mat(); Core.subtract(Mat(bright.size(), CvType.CV_32F, Scalar(1.0)).keep(), bright, inv)
                    Core.multiply(na, inv, na); Core.addWeighted(na, 1.0, bright, 128.0, 0.0, na); Core.multiply(nb, inv, nb); Core.addWeighted(nb, 1.0, bright, 128.0, 0.0, nb)
                    na.convertTo(c3[1], CvType.CV_8U); nb.convertTo(c3[2], CvType.CV_8U)
                    // Snap near white paper to pure white.
                    val snap = mat(); Core.subtract(lf, Scalar(232.0 - 8 * s), snap); Core.multiply(snap, Scalar(1.0 / 14), snap); Core.min(snap, Scalar(1.0), snap); Core.max(snap, Scalar(0.0), snap)
                    val ls = mat(); Core.subtract(Mat(lf.size(), CvType.CV_32F, Scalar(1.0)).keep(), snap, ls); Core.multiply(lf, ls, ls); Core.addWeighted(ls, 1.0, snap, 255.0, 0.0, ls); ls.convertTo(c3[0], CvType.CV_8U)
                    out = unlab(c3, sc).keep()
                }
                out
            }
            Mode.COLOUR -> {
                var cur = if (sigma > 2.5) denoise(norm, sigma, min(s, 0.5), sc).keep() else norm
                val g = gray(cur, sc); val white = percentile(g, sc, 0.72).coerceIn(120, 255)
                val l = lut(0.0, white * 1.02, 1.0).keep(); val st = mat(); Core.LUT(cur, l, st)
                val ch = lab(st, sc); unsharp(ch, (0.3 + 0.6 * s) * softBoost, sig, sc); unlab(ch, sc)
            }
            Mode.SIGNATURE -> {
                val g = gray(norm, sc); val white = percentile(g, sc, 0.72).coerceIn(120, 255)
                // Weight 1 on paper (bright and colourless), 0 on anything that is ink. Ink pixels are left exactly as they are.
                val gf = mat(); g.convertTo(gf, CvType.CV_32F, 1.0 / white); val w = mat()
                Core.subtract(gf, Scalar(0.90 - 0.06 * s), w); Core.multiply(w, Scalar(1.0 / (0.07 + 0.0 * s)), w); Core.min(w, Scalar(1.0), w); Core.max(w, Scalar(0.0), w)
                val ink = colourInk(norm, sc); val inkF = mat(); ink.convertTo(inkF, CvType.CV_32F, 1.0 / 255); val keep = mat(); Core.subtract(Mat(inkF.size(), CvType.CV_32F, Scalar(1.0)).keep(), inkF, keep); Core.multiply(w, keep, w)
                val white255 = mat(); norm.copyTo(white255); white255.setTo(Scalar(255.0, 255.0, 255.0))
                blend(norm, white255, w, sc)
            }
            Mode.BW -> {
                val g0 = gray(norm, sc); val g = if (sigma > 2.5) { val d = mat(); Photo.fastNlMeansDenoising(g0, d, (sigma * 0.8).coerceIn(2.0, 9.0).toFloat(), 5, 15); d } else g0
                val white = percentile(g, sc, 0.72).coerceIn(120, 255); val black = percentile(g, sc, 0.004).coerceAtMost(white - 40)
                val block = (max(31, longSide / 45)) or 1
                val mean = mat(); Imgproc.GaussianBlur(g, mean, Size(block.toDouble(), block.toDouble()), 0.0)
                val gf = mat(); g.convertTo(gf, CvType.CV_32F); val mf = mat(); mean.convertTo(mf, CvType.CV_32F)
                // d = how much darker a pixel is than the paper around it. Lighter than -w1 is paper (white), darker than -w2 is ink (black).
                val w1 = 10.0 + 10.0 * s; val w2 = 55.0
                val diff = mat(); Core.subtract(gf, mf, diff)
                val ramp = mat(); diff.convertTo(ramp, CvType.CV_8U, 255.0 / (w2 - w1), 255.0 * w2 / (w2 - w1))
                // Colour marks (stamps, seals, signatures) keep their tones instead of being flattened to black or white.
                val ink = colourInk(norm, sc); val toned = mat(); Core.LUT(g0, lut(black.toDouble(), white.toDouble(), 1.1).keep(), toned)
                toned.copyTo(ramp, ink)
                val o = mat(); Imgproc.cvtColor(ramp, o, Imgproc.COLOR_GRAY2BGR); o.clone()
            }
        }
    }

    // ---------------------------------------------------------------- the whole job

    /**
     * Restores one page. [maxSide] limits the longest side of the result in pixels. With [withGeometry] the straightened
     * but otherwise untouched page is returned too, aligned with the result, for before and after comparison.
     */
    fun process(src: Bitmap, det: Detection, p: Params, maxSide: Int, withGeometry: Boolean = true): Result {
        Cv.ensure(); val sc = Scope(); val rep = Report()
        return try { with(sc) {
            val full = Cv.toMat(src).keep()
            // Quality checks on the original picture.
            if (max(full.cols(), full.rows()) < 1100) rep.warnings.add("The picture has a low resolution (${full.cols()} by ${full.rows()} pixels). Small print will not become sharper than the camera recorded it. Photograph the page closer or with more light.")
            var page = if (p.autoCrop && det.found) warp(full, det, maxSide, sc).keep() else fitTo(full, maxSide, sc)
            if (p.autoCrop) {
                if (det.found) { rep.notes.add("Page edges found and the page was straightened."); if (det.touchesEdge && det.confidence < 0.93f) rep.warnings.add("The page touches the edge of the photo, so a corner may be cut off. Check the edges.") }
                else if (det.alreadyPage) rep.notes.add("The picture already fills the frame, so no cropping was needed.")
                else rep.warnings.add("The page edges were not found, so the whole picture was used. Photograph the page on a darker surface for automatic cropping.")
            }
            page = turn(page, (p.rotate / 90) % 4, sc)
            val info = DoubleArray(5)
            var norm = normalize(page, sc, info).keep()
            norm = normalize(norm, sc, null, 0.028).keep()      // second, finer pass: follows sharp shadow edges
            val tint = max(abs(info[0] - info[1]), max(abs(info[1] - info[2]), abs(info[0] - info[2])))
            if (info[4] > 0 && info[3] / info[4] < 0.5) rep.warnings.add("The photo has very uneven light with a strong shadow. It was evened out, but check the darkest side for lost text.")
            val angle = skew(norm, sc)
            if (angle != 0f) {
                norm = rotate(norm, angle.toDouble(), Scalar(255.0, 255.0, 255.0), sc).keep()
                page = rotate(page, angle.toDouble(), Scalar(info[0], info[1], info[2]).let { Scalar(info[0], info[1], info[2]) }, sc).keep()
                rep.skewDeg = angle; rep.notes.add("Text lines straightened by ${"%.1f".format(abs(angle))} degrees.")
            }
            // Text running up and down the page: probably a sideways photo.
            run {
                val g = gray(long(norm, sc, 700), sc); val ink = mat(); Imgproc.threshold(g, ink, 0.0, 255.0, Imgproc.THRESH_BINARY_INV or Imgproc.THRESH_OTSU)
                val rows = mat(); Core.reduce(ink, rows, 1, Core.REDUCE_SUM, CvType.CV_32F); val cols = mat(); Core.reduce(ink, cols, 0, Core.REDUCE_SUM, CvType.CV_32F)
                val ms = MatOfDouble().keep(); val sr = MatOfDouble().keep(); val sc2 = MatOfDouble().keep(); Core.meanStdDev(rows, ms, sr); Core.meanStdDev(cols, ms, sc2)
                val vr = sr.toArray()[0] / (ms.toArray()[0].coerceAtLeast(1.0)); val vc = sc2.toArray()[0] / (Core.mean(cols).`val`[0].coerceAtLeast(1.0))
                if (vc > vr * 2.2 && Core.countNonZero(ink) > ink.total() * 0.03) rep.warnings.add("The text may be sideways or upside down. Use Rotate to turn the page.")
            }
            val enhanced = enhance(norm, p.mode, p.strength.toDouble(), rep, tint, sc)
            if (rep.sharpness in 0.1f..300f) rep.warnings.add("The text is soft or blurred. It was sharpened, but sharpening cannot recover letters the camera did not capture. Check numbers and small print, or retake the photo.")
            if (rep.noise > 9f) rep.warnings.add("The photo is very noisy (grainy). Some fine detail may be unreliable.")
            // Glare: areas brighter than the paper around them.
            run {
                val g = gray(long(page, sc, 600), sc); val gb = mat(); Imgproc.GaussianBlur(g, gb, Size(0.0, 0.0), 25.0)
                val a = mat(); g.convertTo(a, CvType.CV_32F); val b = mat(); gb.convertTo(b, CvType.CV_32F)
                val ratio = mat(); Core.divide(a, b, ratio); val hot = mat(); Imgproc.threshold(ratio, hot, 1.18, 1.0, Imgproc.THRESH_BINARY)
                val frac = Core.mean(hot).`val`[0]; val sat = mat(); Imgproc.threshold(g, sat, 250.0, 255.0, Imgproc.THRESH_BINARY); val satFrac = Core.countNonZero(sat).toDouble() / sat.total()
                if (frac > 0.02 || satFrac > 0.04) rep.warnings.add("There is glare or a reflection on the page. Text under it may be washed out and cannot be restored. Retake the photo from another angle.")
            }
            Result(if (withGeometry) Cv.toBitmap(page) else null, Cv.toBitmap(enhanced), rep)
        } } finally { sc.release() }
    }
}
