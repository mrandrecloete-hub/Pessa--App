package com.pdfmaster.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import com.pdfmaster.app.engine.Restore
import com.pdfmaster.app.engine.Restore.Mode
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import kotlin.math.hypot

/**
 * Runs the real restoration engine (OpenCV) on simulated photographs of real document pages. The pictures are simulations
 * made by tools/make_photo_fixtures.py (perspective, rotation, shadows, yellow cast, blur, noise, JPEG): real camera
 * photographs were not available when these tests were written.
 */
@RunWith(RobolectricTestRunner::class)
class RestoreTest {
    private fun photo(name: String): Bitmap = javaClass.classLoader!!.getResourceAsStream("photos/$name.jpg")!!.use { BitmapFactory.decodeStream(it) }
    private val corners: JSONObject by lazy { JSONObject(javaClass.classLoader!!.getResourceAsStream("photos/corners.json")!!.readBytes().toString(Charsets.UTF_8)) }
    private val out = File("build/restored").apply { mkdirs() }
    private fun lum(p: Int) = (0.299 * Color.red(p) + 0.587 * Color.green(p) + 0.114 * Color.blue(p))
    private fun px(b: Bitmap): IntArray { val a = IntArray(b.width * b.height); b.getPixels(a, 0, b.width, 0, 0, b.width, b.height); return a }
    private fun save(b: Bitmap, name: String) = File(out, "$name.png").outputStream().use { b.compress(Bitmap.CompressFormat.PNG, 100, it) }

    /** Average brightness and spread of blank paper in patches just inside the page margins. */
    private fun paper(b: Bitmap): Pair<Double, Double> {
        val vals = ArrayList<Double>()
        for ((fx, fy) in listOf(0.04 to 0.04, 0.5 to 0.03, 0.96 to 0.05, 0.04 to 0.5, 0.96 to 0.5, 0.05 to 0.96, 0.5 to 0.97, 0.95 to 0.95))
            for (dx in -6..6 step 3) for (dy in -6..6 step 3) vals.add(lum(b.getPixel((fx * b.width).toInt().coerceIn(7, b.width - 8) + dx, (fy * b.height).toInt().coerceIn(7, b.height - 8) + dy)))
        val m = vals.average(); return m to Math.sqrt(vals.sumOf { (it - m) * (it - m) } / vals.size)
    }
    private fun count(b: Bitmap, f: (Int) -> Boolean) = px(b).count(f)
    private fun red(p: Int) = Color.red(p) - Color.green(p) > 70 && Color.red(p) > 120
    private fun blue(p: Int) = Color.blue(p) - Color.red(p) > 45 && Color.blue(p) > 70

    @Test fun findsThePageCorners_inPhotos() {
        for (n in listOf("photo1", "photo2", "photo3")) {
            val d = Restore.detect(photo(n)); assertTrue("$n: page found", d.found)
            val t = corners.getJSONArray(n); var worst = 0.0
            for (i in 0..3) { val e = hypot(d.quad[2 * i] - t.getJSONArray(i).getDouble(0), d.quad[2 * i + 1] - t.getJSONArray(i).getDouble(1)); worst = maxOf(worst, e) }
            println("DETECT $n worst corner error ${"%.2f".format(worst * 100)} percent of the picture, confidence ${d.confidence}")
            assertTrue("$n: corners within 3 percent (was ${worst * 100})", worst < 0.03)
        }
        val flat = Restore.detect(photo("scan4"))
        println("DETECT scan4 found=${flat.found} already=${flat.alreadyPage} quad=${flat.quad.toList()}")
        assertTrue("a flat scan is either found inside its frame or recognised as already a page", flat.found || flat.alreadyPage)
    }

    @Test fun cleansPaper_straightens_andKeepsInk_inEveryMode() {
        val cases = listOf("photo1", "photo2", "photo3", "scan4")
        for (n in cases) {
            val src = photo(n); val det = Restore.detect(src)
            for (mode in Mode.entries) {
                val r = Restore.process(src, det, Restore.Params(mode, 0.6f), 2200)
                save(r.enhanced, "${n}_${mode.name}"); if (mode == Mode.AUTO) save(r.geometry!!, "${n}_geometry")
                val (m, sd) = paper(r.enhanced)
                println("SHARP $n ${mode.name} ${"%.0f".format(r.report.sharpness)}")
                println("RESTORE $n ${mode.name}: paper ${"%.0f".format(m)} spread ${"%.1f".format(sd)} skew ${r.report.skewDeg} chosen=${r.report.chosen} sharp=${"%.0f".format(r.report.sharpness)} noise=${"%.1f".format(r.report.noise)} size=${r.enhanced.width}x${r.enhanced.height}")
                assertEquals("geometry and result are aligned", r.geometry!!.width, r.enhanced.width); assertEquals(r.geometry!!.height, r.enhanced.height)
                val needWhite = when (mode) { Mode.SIGNATURE -> 238.0; Mode.COLOUR -> 232.0; Mode.WHITE, Mode.BW -> 248.0; else -> 240.0 }
                assertTrue("$n $mode: paper should be clean, was $m", m >= needWhite); assertTrue("$n $mode: paper should be even, spread $sd", sd < 6.0)
                // The page is portrait like the real page.
                assertTrue("$n $mode portrait", r.enhanced.height > r.enhanced.width)
                // Text stays dark and present.
                val dark = count(r.enhanced) { lum(it) < 110 }; assertTrue("$n $mode: text kept ($dark dark pixels)", dark > r.enhanced.width * r.enhanced.height * 0.0015)
                // Coloured ink: a stamp and a signature must survive in colour modes, and not vanish in black and white.
                val rg = count(r.geometry!!) { red(it) }; val bg = count(r.geometry!!) { blue(it) }
                if (rg > 800) { val kept = count(r.enhanced) { red(it) }.toDouble() / rg
                    if (mode != Mode.BW) assertTrue("$n $mode: red stamp kept (${"%.2f".format(kept)})", kept > 0.6) }
                if (bg > 300) { val kept = count(r.enhanced) { blue(it) }.toDouble() / bg
                    if (mode != Mode.BW) assertTrue("$n $mode: blue signature kept (${"%.2f".format(kept)})", kept > 0.5) }
            }
        }
    }

    @Test fun blackAndWhite_keepsStampAndSignatureAsDarkMarks() {
        for ((n, who) in listOf("photo1" to "stamp", "photo3" to "signature")) {
            val src = photo(n); val det = Restore.detect(src); val r = Restore.process(src, det, Restore.Params(Mode.BW, 0.6f), 2200)
            val orig = if (who == "stamp") count(r.geometry!!) { red(it) } else count(r.geometry!!) { blue(it) }
            // The mark has to still be there as non white pixels in the same place.
            val px0 = px(r.geometry!!); val px1 = px(r.enhanced); var inMark = 0; var markDark = 0
            for (i in px0.indices) if ((if (who == "stamp") red(px0[i]) else blue(px0[i]))) { inMark++; if (lum(px1[i]) < 200) markDark++ }
            println("BW $n $who: $markDark of $inMark mark pixels are still dark")
            assertTrue("$n: $who survives in black and white (${markDark}/$inMark)", orig > 200 && markDark > inMark * 0.75)
        }
    }

    @Test fun strengthChangesTheResult_andPreviewSizeIsCheap() {
        val src = photo("photo2"); val det = Restore.detect(src)
        val a = Restore.process(src, det, Restore.Params(Mode.CLEAN, 0.1f), 1400, withGeometry = false).enhanced
        val b = Restore.process(src, det, Restore.Params(Mode.CLEAN, 1.0f), 1400, withGeometry = false).enhanced
        assertNull(Restore.process(src, det, Restore.Params(), 600, withGeometry = false).geometry)
        val pa = px(a); val pb = px(b); var diff = 0L; for (i in pa.indices) diff += Math.abs(lum(pa[i]) - lum(pb[i])).toLong()
        assertTrue("strength has an effect", diff.toDouble() / pa.size > 1.0)
        assertTrue(kotlin.math.abs(maxOf(a.width, a.height) - 1400) <= 2)
        // Rotating by 90 turns the page.
        val rot = Restore.process(src, det, Restore.Params(Mode.CLEAN, 0.5f, rotate = 90), 1400, withGeometry = false).enhanced
        assertTrue(rot.width > rot.height)
        // Without cropping the whole photo is used.
        val whole = Restore.process(src, det, Restore.Params(Mode.CLEAN, 0.5f, autoCrop = false), 1400, withGeometry = false)
        assertTrue(whole.report.notes.none { it.contains("Page edges found") })
    }

    @Test fun honestWarnings_forPoorInput() {
        // A very small, blurry picture: tell the user instead of pretending.
        val src = photo("photo2"); val small = Bitmap.createScaledBitmap(src, 700, 933, true)
        val blur = Bitmap.createBitmap(small.width, small.height, Bitmap.Config.ARGB_8888)
        val a = px(small); val o = IntArray(a.size); val w = small.width
        for (y in 2 until small.height - 2) for (x in 2 until w - 2) { var s = 0; for (dy in -2..2) for (dx in -2..2) s += Color.green(a[(y + dy) * w + x + dx]); val g = s / 25; o[y * w + x] = Color.rgb(g, g, g) }
        blur.setPixels(o, 0, w, 0, 0, w, small.height)
        val r = Restore.process(blur, Restore.detect(blur), Restore.Params(Mode.AUTO, 0.6f), 1500)
        println("WARN small+blurred: sharp=${r.report.sharpness} ${r.report.warnings}")
        assertTrue("low resolution is reported", r.report.warnings.any { it.contains("low resolution") })
        assertTrue("blur is reported", r.report.warnings.any { it.contains("soft or blurred") })
        // A picture with no page in it.
        val rnd = java.util.Random(5); val grey = Bitmap.createBitmap(1400, 1400, Bitmap.Config.ARGB_8888); val g = IntArray(1400 * 1400) { val v = 100 + rnd.nextInt(30); Color.rgb(v, v, v) }; grey.setPixels(g, 0, 1400, 0, 0, 1400, 1400)
        val d = Restore.detect(grey); assertFalse(d.found)
        assertTrue(Restore.process(grey, d, Restore.Params(), 1200).report.warnings.any { it.contains("page edges were not found") })
        // A sharp, well lit photo gets no blur warning.
        val ok = Restore.process(photo("photo1"), Restore.detect(photo("photo1")), Restore.Params(), 2200).report
        println("WARN photo1: ${ok.warnings}  notes=${ok.notes}")
        assertTrue(ok.warnings.none { it.contains("soft or blurred") || it.contains("low resolution") })
    }
}
