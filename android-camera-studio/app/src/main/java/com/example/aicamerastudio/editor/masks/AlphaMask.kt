package com.example.aicamerastudio.editor.masks

import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/** Soft selection mask, values 0..1, row major. */
class AlphaMask(val width: Int, val height: Int, val data: FloatArray = FloatArray(width * height)) {
    init { require(data.size == width * height) }

    fun copy() = AlphaMask(width, height, data.copyOf())
    operator fun get(x: Int, y: Int) = data[y * width + x]
    fun coverage(): Float = data.sum() / data.size

    /** Soft round brush. [add] true paints selection, false erases it. */
    fun brush(cx: Float, cy: Float, radius: Float, add: Boolean, hardness: Float = 0.6f) {
        val r = max(radius, 0.5f)
        val inner = r * hardness.coerceIn(0f, 1f)
        val x0 = max(0, (cx - r).toInt()); val x1 = min(width - 1, (cx + r).toInt() + 1)
        val y0 = max(0, (cy - r).toInt()); val y1 = min(height - 1, (cy + r).toInt() + 1)
        for (y in y0..y1) for (x in x0..x1) {
            val d = sqrt((x + 0.5f - cx) * (x + 0.5f - cx) + (y + 0.5f - cy) * (y + 0.5f - cy))
            if (d > r) continue
            val w = if (d <= inner) 1f else 1f - (d - inner) / (r - inner + 1e-6f)
            val i = y * width + x
            data[i] = if (add) max(data[i], w) else min(data[i], 1f - w)
        }
    }

    /** Brush along a stroke from (ax,ay) to (bx,by) without gaps. */
    fun stroke(ax: Float, ay: Float, bx: Float, by: Float, radius: Float, add: Boolean, hardness: Float = 0.6f) {
        val len = sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay))
        val steps = max(1, (len / max(radius * 0.35f, 0.5f)).toInt())
        for (s in 0..steps) { val t = s.toFloat() / steps; brush(ax + (bx - ax) * t, ay + (by - ay) * t, radius, add, hardness) }
    }

    fun union(o: AlphaMask) { require(o.width == width && o.height == height); for (i in data.indices) data[i] = max(data[i], o.data[i]) }

    data class Box(val x: Int, val y: Int, val w: Int, val h: Int)

    fun bounds(threshold: Float = 0.02f): Box? {
        var x0 = width; var y0 = height; var x1 = -1; var y1 = -1
        for (y in 0 until height) for (x in 0 until width) if (data[y * width + x] > threshold) {
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
        }
        return if (x1 < 0) null else Box(x0, y0, x1 - x0 + 1, y1 - y0 + 1)
    }

    fun toBytes(): ByteArray = ByteArray(data.size) { (data[it].coerceIn(0f, 1f) * 255f + 0.5f).toInt().toByte() }

    companion object {
        fun fromBytes(w: Int, h: Int, b: ByteArray) = AlphaMask(w, h, FloatArray(w * h) { (b[it].toInt() and 255) / 255f })
    }
}

/** Morphology, blurs, connected components and guided filtering for masks. */
object MaskOps {
    /** Separable box blur with clamped edges, O(n) per pass. */
    fun boxBlur(src: FloatArray, w: Int, h: Int, r: Int): FloatArray {
        if (r <= 0) return src.copyOf()
        val tmp = FloatArray(w * h); val out = FloatArray(w * h)
        val n = 2 * r + 1
        for (y in 0 until h) {
            val row = y * w
            var s = 0f
            for (k in -r..r) s += src[row + min(max(k, 0), w - 1)]
            for (x in 0 until w) {
                tmp[row + x] = s / n
                s += src[row + min(x + r + 1, w - 1)] - src[row + max(x - r, 0)]
            }
        }
        for (x in 0 until w) {
            var s = 0f
            for (k in -r..r) s += tmp[min(max(k, 0), h - 1) * w + x]
            for (y in 0 until h) {
                out[y * w + x] = s / n
                s += tmp[min(y + r + 1, h - 1) * w + x] - tmp[max(y - r, 0) * w + x]
            }
        }
        return out
    }

    /**
     * Gaussian blur. Exact separable kernel up to sigma 4; beyond that, three box passes with widths
     * chosen to match the requested sigma (Kutskir / Wells), which keeps large blurs fast.
     */
    fun gaussian(src: FloatArray, w: Int, h: Int, sigma: Float): FloatArray {
        if (sigma < 0.2f) return src.copyOf()
        if (sigma <= 4f) {
            val r = kotlin.math.ceil(3 * sigma).toInt()
            val k = FloatArray(2 * r + 1) { val d = it - r; kotlin.math.exp(-(d * d) / (2f * sigma * sigma)) }
            val sum = k.sum(); for (i in k.indices) k[i] /= sum
            val tmp = FloatArray(w * h); val out = FloatArray(w * h)
            for (y in 0 until h) for (x in 0 until w) {
                var a = 0f; for (j in -r..r) a += k[j + r] * src[y * w + min(max(x + j, 0), w - 1)]; tmp[y * w + x] = a
            }
            for (y in 0 until h) for (x in 0 until w) {
                var a = 0f; for (j in -r..r) a += k[j + r] * tmp[min(max(y + j, 0), h - 1) * w + x]; out[y * w + x] = a
            }
            return out
        }
        val n = 3
        val wIdeal = sqrt(12f * sigma * sigma / n + 1f)
        var wl = wIdeal.toInt(); if (wl % 2 == 0) wl--
        val wu = wl + 2
        val m = ((12f * sigma * sigma - n * wl * wl - 4f * n * wl - 3f * n) / (-4f * wl - 4f)).let { kotlin.math.round(it).toInt() }
        var cur = src
        for (i in 0 until n) cur = boxBlur(cur, w, h, ((if (i < m) wl else wu) - 1) / 2)
        return cur
    }

    /** Grows (r > 0) or shrinks (r < 0) a soft mask using separable max / min filters. */
    fun morph(src: FloatArray, w: Int, h: Int, r: Int): FloatArray {
        if (r == 0) return src.copyOf()
        val grow = r > 0; val rr = kotlin.math.abs(r)
        fun pick(a: Float, b: Float) = if (grow) max(a, b) else min(a, b)
        val tmp = FloatArray(w * h); val out = FloatArray(w * h)
        for (y in 0 until h) for (x in 0 until w) {
            var v = src[y * w + x]
            for (k in max(0, x - rr)..min(w - 1, x + rr)) v = pick(v, src[y * w + k])
            tmp[y * w + x] = v
        }
        for (y in 0 until h) for (x in 0 until w) {
            var v = tmp[y * w + x]
            for (k in max(0, y - rr)..min(h - 1, y + rr)) v = pick(v, tmp[k * w + x])
            out[y * w + x] = v
        }
        return out
    }

    /**
     * Edge aware refinement (He, Sun and Tang, "Guided Image Filtering"). The image luma guides the
     * coarse mask so its edges snap to real image edges, which keeps hair and fingers instead of blobs.
     */
    fun guidedFilter(guide: FloatArray, p: FloatArray, w: Int, h: Int, r: Int, eps: Float): FloatArray {
        val meanI = boxBlur(guide, w, h, r)
        val meanP = boxBlur(p, w, h, r)
        val ip = FloatArray(w * h) { guide[it] * p[it] }
        val ii = FloatArray(w * h) { guide[it] * guide[it] }
        val corrIP = boxBlur(ip, w, h, r)
        val corrII = boxBlur(ii, w, h, r)
        val a = FloatArray(w * h); val b = FloatArray(w * h)
        for (i in 0 until w * h) {
            val varI = corrII[i] - meanI[i] * meanI[i]
            val covIP = corrIP[i] - meanI[i] * meanP[i]
            a[i] = covIP / (varI + eps)
            b[i] = meanP[i] - a[i] * meanI[i]
        }
        val ma = boxBlur(a, w, h, r); val mb = boxBlur(b, w, h, r)
        return FloatArray(w * h) { (ma[it] * guide[it] + mb[it]).coerceIn(0f, 1f) }
    }

    /**
     * Refines a coarse selection against the image: a wide band guided filter for hair, a tight one elsewhere,
     * then a gentle contrast curve so the core stays solid and only edges are soft.
     */
    fun refine(coarse: FloatArray, guideLuma: FloatArray, w: Int, h: Int, strength: Float = 1f, hair: FloatArray? = null): FloatArray {
        val base = max(2, (min(w, h) / 160f * strength).toInt())
        val tight = guidedFilter(guideLuma, coarse, w, h, base, 1e-3f)
        val out = if (hair != null) {
            val wide = guidedFilter(guideLuma, coarse, w, h, base * 2, 4e-4f)
            val hw = gaussian(hair, w, h, base.toFloat())
            FloatArray(w * h) { tight[it] + (wide[it] - tight[it]) * hw[it].coerceIn(0f, 1f) }
        } else tight
        for (i in out.indices) { val v = out[i]; out[i] = ((v - 0.08f) / 0.84f).coerceIn(0f, 1f) }
        return out
    }

    data class Component(val id: Int, val area: Int, val x: Int, val y: Int, val w: Int, val h: Int)

    /** 4 connected components of mask > threshold. Returns label image (0 = none) and components by area. */
    fun components(m: FloatArray, w: Int, h: Int, threshold: Float = 0.5f): Pair<IntArray, List<Component>> {
        val labels = IntArray(w * h)
        val queue = IntArray(w * h)
        val comps = ArrayList<Component>()
        var next = 1
        for (s in 0 until w * h) {
            if (labels[s] != 0 || m[s] <= threshold) continue
            var head = 0; var tail = 0
            queue[tail++] = s; labels[s] = next
            var x0 = w; var y0 = h; var x1 = 0; var y1 = 0
            while (head < tail) {
                val i = queue[head++]; val x = i % w; val y = i / w
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y
                if (x > 0 && labels[i - 1] == 0 && m[i - 1] > threshold) { labels[i - 1] = next; queue[tail++] = i - 1 }
                if (x < w - 1 && labels[i + 1] == 0 && m[i + 1] > threshold) { labels[i + 1] = next; queue[tail++] = i + 1 }
                if (y > 0 && labels[i - w] == 0 && m[i - w] > threshold) { labels[i - w] = next; queue[tail++] = i - w }
                if (y < h - 1 && labels[i + w] == 0 && m[i + w] > threshold) { labels[i + w] = next; queue[tail++] = i + w }
            }
            comps += Component(next, tail, x0, y0, x1 - x0 + 1, y1 - y0 + 1)
            next++
        }
        return labels to comps.sortedByDescending { it.area }
    }

    /** Keeps only the soft mask values connected to component [id] (plus a small soft halo). */
    fun isolate(m: FloatArray, labels: IntArray, w: Int, h: Int, id: Int): FloatArray {
        val core = FloatArray(w * h) { if (labels[it] == id) 1f else 0f }
        val halo = morph(core, w, h, max(2, min(w, h) / 100))
        return FloatArray(w * h) { min(m[it], halo[it]) }
    }
}
