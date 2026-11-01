package com.example.aicamerastudio.editor.photo

import com.example.aicamerastudio.photo.pipeline.EnhancementParams

enum class CropAspect(val label: String, val ratio: Float?) {
    ORIGINAL("Original", null), SQUARE("1:1", 1f), R4_3("4:3", 4f / 3f), R3_2("3:2", 3f / 2f),
    R16_9("16:9", 16f / 9f), R9_16("9:16", 9f / 16f),
}

/** Non destructive description of a photo edit. Geometry is applied first, then colour and detail. */
data class EditParams(
    val exposureEv: Float = 0f,
    val contrast: Float = 0f,
    val highlights: Float = 0f,
    val shadows: Float = 0f,
    val blackPoint: Float = 0f,
    val whitePoint: Float = 1f,
    val saturation: Float = 1f,
    val vibrance: Float = 0f,
    val temperature: Float = 0f,
    val tint: Float = 0f,
    val sharpen: Float = 0f,
    val denoise: Float = 0f,
    val quarterTurns: Int = 0,
    val flipHorizontal: Boolean = false,
    val crop: CropAspect = CropAspect.ORIGINAL,
) {
    fun validated() = copy(
        exposureEv = exposureEv.coerceIn(-3f, 3f), contrast = contrast.coerceIn(-1f, 0.8f),
        highlights = highlights.coerceIn(-1f, 1f), shadows = shadows.coerceIn(-1f, 1f),
        blackPoint = blackPoint.coerceIn(0f, 0.3f), whitePoint = whitePoint.coerceIn(0.6f, 1f),
        saturation = saturation.coerceIn(0f, 2f), vibrance = vibrance.coerceIn(-1f, 1f),
        temperature = temperature.coerceIn(-1f, 1f), tint = tint.coerceIn(-1f, 1f),
        sharpen = sharpen.coerceIn(0f, 1f), denoise = denoise.coerceIn(0f, 1f),
        quarterTurns = ((quarterTurns % 4) + 4) % 4,
    )

    fun toEnhancement(denoiseRadius: Int = 2): EnhancementParams = validated().let {
        EnhancementParams(
            exposureEv = it.exposureEv, contrast = it.contrast, highlights = it.highlights, shadows = it.shadows,
            blackPoint = it.blackPoint, whitePoint = it.whitePoint, saturation = it.saturation, vibrance = it.vibrance,
            temperature = it.temperature, tint = it.tint,
            denoiseStrength = it.denoise, denoiseRadius = denoiseRadius, denoiseRangeSigma = 8f + 20f * it.denoise,
            sharpenAmount = it.sharpen * 1.5f, sharpenThreshold = 2f, sharpenLimit = 30f,
        ).validated()
    }

    val hasGeometry: Boolean get() = quarterTurns % 4 != 0 || flipHorizontal || crop != CropAspect.ORIGINAL
    val isDefault: Boolean get() = validated() == EditParams()
}

/** Versioned text encoding for persisting edit sessions. Unknown keys are ignored, so newer versions stay readable. */
object EditParamsCodec {
    const val VERSION = 1

    fun encode(p: EditParams): String {
        val v = p.validated()
        return listOf(
            "v=$VERSION", "ev=${v.exposureEv}", "ct=${v.contrast}", "hl=${v.highlights}", "sh=${v.shadows}",
            "bp=${v.blackPoint}", "wp=${v.whitePoint}", "sa=${v.saturation}", "vi=${v.vibrance}",
            "tp=${v.temperature}", "tn=${v.tint}", "sp=${v.sharpen}", "dn=${v.denoise}",
            "rt=${v.quarterTurns}", "fl=${if (v.flipHorizontal) 1 else 0}", "cr=${v.crop.name}",
        ).joinToString(";")
    }

    /** Returns null when the text is not a valid encoding or comes from a newer, unknown version. */
    fun decode(text: String?): EditParams? {
        if (text.isNullOrBlank()) return null
        val map = HashMap<String, String>()
        for (part in text.split(';')) {
            val i = part.indexOf('=')
            if (i <= 0) return null
            map[part.substring(0, i)] = part.substring(i + 1)
        }
        val version = map["v"]?.toIntOrNull() ?: return null
        if (version > VERSION) return null
        fun f(k: String, d: Float): Float? {
            val raw = map[k] ?: return d
            val x = raw.toFloatOrNull() ?: return null
            return if (x.isNaN() || x.isInfinite()) null else x
        }
        return try {
            EditParams(
                exposureEv = f("ev", 0f)!!, contrast = f("ct", 0f)!!, highlights = f("hl", 0f)!!, shadows = f("sh", 0f)!!,
                blackPoint = f("bp", 0f)!!, whitePoint = f("wp", 1f)!!, saturation = f("sa", 1f)!!, vibrance = f("vi", 0f)!!,
                temperature = f("tp", 0f)!!, tint = f("tn", 0f)!!, sharpen = f("sp", 0f)!!, denoise = f("dn", 0f)!!,
                quarterTurns = map["rt"]?.toIntOrNull() ?: 0,
                flipHorizontal = map["fl"] == "1",
                crop = map["cr"]?.let { n -> CropAspect.values().firstOrNull { it.name == n } } ?: CropAspect.ORIGINAL,
            ).validated()
        } catch (e: NullPointerException) {
            null
        }
    }
}

/** Linear undo and redo history. Pushing after an undo discards the redo branch. */
class EditHistory<T>(initial: T, private val limit: Int = 100) {
    private val states = ArrayList<T>().apply { add(initial) }
    private var index = 0
    val current: T get() = states[index]
    val canUndo: Boolean get() = index > 0
    val canRedo: Boolean get() = index < states.lastIndex

    fun push(value: T) {
        if (value == current) return
        while (states.lastIndex > index) states.removeAt(states.lastIndex)
        states.add(value)
        if (states.size > limit) states.removeAt(0) else index++
        index = states.lastIndex
    }
    fun undo(): T { if (canUndo) index--; return current }
    fun redo(): T { if (canRedo) index++; return current }
    fun reset(initial: T) { states.clear(); states.add(initial); index = 0 }

    /** All states and the current position, for saving a project. */
    fun snapshot(): Pair<List<T>, Int> = states.toList() to index

    fun restore(list: List<T>, position: Int) {
        if (list.isEmpty()) return
        states.clear(); states.addAll(list.takeLast(limit)); index = position.coerceIn(0, states.lastIndex)
    }
}

/** Crop and rotation geometry shared by the preview and the full resolution export. */
object CropGeometry {
    data class Box(val left: Int, val top: Int, val width: Int, val height: Int)

    fun rotatedSize(w: Int, h: Int, quarterTurns: Int): Pair<Int, Int> =
        if (((quarterTurns % 4) + 4) % 2 == 1) h to w else w to h

    /** Largest centred box with the requested aspect ratio (width / height). Null ratio keeps everything. */
    fun centerCrop(w: Int, h: Int, ratio: Float?): Box {
        require(w > 0 && h > 0) { "Size must be positive" }
        if (ratio == null || ratio <= 0f) return Box(0, 0, w, h)
        val current = w.toFloat() / h
        return if (current > ratio) {
            val nw = (h * ratio).toInt().coerceIn(1, w)
            Box((w - nw) / 2, 0, nw, h)
        } else {
            val nh = (w / ratio).toInt().coerceIn(1, h)
            Box(0, (h - nh) / 2, w, nh)
        }
    }
}
