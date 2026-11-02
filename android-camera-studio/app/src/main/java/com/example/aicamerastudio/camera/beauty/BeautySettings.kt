package com.example.aicamerastudio.camera.beauty

import android.content.Context
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/**
 * Individual beauty amounts, each 0 (off) to 1. None of them changes face shape except [jawline], which is
 * off by default and limited to a small slimming of the lower jaw sides. Skin colour, eye size, nose and
 * other defining features are never changed.
 */
data class BeautyLevels(
    val smoothing: Float = 0f,
    val brightness: Float = 0f,
    val blemish: Float = 0f,
    val underEye: Float = 0f,
    val toneBalance: Float = 0f,
    val lighting: Float = 0f,
    val eyes: Float = 0f,
    val teeth: Float = 0f,
    /** Overall strength of the makeup below (lip colour, blush, contour). */
    val makeup: Float = 0f,
    val lipColor: Boolean = false,
    val lipTint: Int = LIP_TINTS[0],
    val blush: Boolean = false,
    val contour: Float = 0f,
    val jawline: Float = 0f,
) {
    companion object {
        /** Natural lip tints: rose, nude, berry, coral, red. */
        val LIP_TINTS = intArrayOf(0xFFC2566B.toInt(), 0xFFB97A6B.toInt(), 0xFF8E2F4F.toInt(), 0xFFE0705A.toInt(), 0xFFB3202F.toInt())
        val NONE = BeautyLevels()
    }
}

/**
 * A colour grade. The same formulas run on the GPU (BeautyShaders) and here (thumbnails and tests).
 * Values are small offsets around 0 = no change.
 */
data class Grade(
    val exposure: Float = 0f,      // stops
    val contrast: Float = 0f,      // -1..1
    val saturation: Float = 0f,    // -1..1
    val vibrance: Float = 0f,      // 0..1, boosts muted colours more than vivid ones
    val temperature: Float = 0f,   // -1 cool .. 1 warm
    val tint: Float = 0f,          // -1 green .. 1 magenta
    val fade: Float = 0f,          // 0..1 lifted blacks
    val shadowTint: Int = 0,       // RGB colour pushed into shadows (0 = none)
    val highlightTint: Int = 0,    // RGB colour pushed into highlights
    val splitAmount: Float = 0f,   // 0..1
    val glow: Float = 0f,          // 0..1 soft bloom (GPU only)
    val vignette: Float = 0f,      // 0..1
    val grain: Float = 0f,         // 0..1
) {
    val isIdentity: Boolean get() = this == Grade()

    /** Applies the grade to one colour (components 0..1), as the shader does without glow, vignette and grain. */
    fun apply(rgb: FloatArray, strength: Float = 1f): FloatArray {
        val r0 = rgb[0]; val g0 = rgb[1]; val b0 = rgb[2]
        val e = 2f.pow(exposure)
        var r = r0 * e; var g = g0 * e; var b = b0 * e
        r += temperature * 0.08f; b -= temperature * 0.08f
        g -= tint * 0.05f; r += tint * 0.02f; b += tint * 0.02f
        fun curve(x: Float): Float { val c = x.coerceIn(0f, 1f); val s = c * c * (3f - 2f * c); return c + (s - c) * contrast * 2.5f }
        r = curve(r); g = curve(g); b = curve(b)
        val l = luma(r, g, b)
        val mx = max(r, max(g, b)); val mn = min(r, min(g, b))
        val sat = (mx - mn)
        val k = 1f + saturation + vibrance * (1f - sat).coerceIn(0f, 1f)
        r = l + (r - l) * k; g = l + (g - l) * k; b = l + (b - l) * k
        if (splitAmount > 0f) {
            val ll = luma(r, g, b).coerceIn(0f, 1f)
            val sw = (1f - ll) * (1f - ll) * splitAmount * 0.35f; val hw = ll * ll * splitAmount * 0.35f
            r += (ch(shadowTint, 16) - 0.5f) * sw + (ch(highlightTint, 16) - 0.5f) * hw
            g += (ch(shadowTint, 8) - 0.5f) * sw + (ch(highlightTint, 8) - 0.5f) * hw
            b += (ch(shadowTint, 0) - 0.5f) * sw + (ch(highlightTint, 0) - 0.5f) * hw
        }
        r = r * (1f - fade * 0.12f) + fade * 0.08f; g = g * (1f - fade * 0.12f) + fade * 0.08f; b = b * (1f - fade * 0.12f) + fade * 0.08f
        return floatArrayOf(
            (r0 + (r - r0) * strength).coerceIn(0f, 1f), (g0 + (g - g0) * strength).coerceIn(0f, 1f), (b0 + (b - b0) * strength).coerceIn(0f, 1f))
    }

    companion object {
        fun luma(r: Float, g: Float, b: Float) = 0.2126f * r + 0.7152f * g + 0.0722f * b
        fun ch(c: Int, shift: Int) = if (c == 0) 0.5f else ((c shr shift) and 255) / 255f
    }
}

enum class BeautyPreset(val id: String, val label: String, val grade: Grade, val levels: BeautyLevels) {
    NATURAL("natural", "Natural Beauty", Grade(exposure = 0.04f, contrast = 0.07f, vibrance = 0.1f, temperature = 0.07f, glow = 0.08f),
        BeautyLevels(smoothing = 0.45f, brightness = 0.2f, blemish = 0.4f, underEye = 0.3f, toneBalance = 0.3f, lighting = 0.25f, eyes = 0.25f, teeth = 0.2f)),
    GLASS_SKIN("glass", "Glass Skin", Grade(exposure = 0.12f, contrast = -0.06f, saturation = -0.04f, temperature = -0.03f, glow = 0.35f),
        BeautyLevels(smoothing = 0.65f, brightness = 0.35f, blemish = 0.55f, underEye = 0.4f, toneBalance = 0.4f, lighting = 0.45f, eyes = 0.25f, teeth = 0.2f)),
    SOFT_GLAM("softglam", "Soft Glam", Grade(contrast = 0.08f, saturation = 0.03f, temperature = 0.08f, tint = 0.08f, highlightTint = 0xFFD6CC, splitAmount = 0.3f, glow = 0.2f),
        BeautyLevels(smoothing = 0.55f, brightness = 0.25f, blemish = 0.5f, underEye = 0.4f, toneBalance = 0.35f, lighting = 0.35f, eyes = 0.4f, teeth = 0.25f,
            makeup = 0.6f, lipColor = true, lipTint = BeautyLevels.LIP_TINTS[0], blush = true, contour = 0.35f)),
    GOLDEN_HOUR("golden", "Golden Hour", Grade(temperature = 0.4f, tint = 0.04f, vibrance = 0.15f, shadowTint = 0x6B4423, highlightTint = 0xFFC46B, splitAmount = 0.5f, glow = 0.25f, vignette = 0.15f),
        BeautyLevels(smoothing = 0.4f, brightness = 0.15f, blemish = 0.35f, underEye = 0.3f, toneBalance = 0.25f, lighting = 0.3f, eyes = 0.25f, teeth = 0.15f)),
    STUDIO("studio", "Studio Portrait", Grade(contrast = 0.16f, saturation = -0.06f, vignette = 0.25f),
        BeautyLevels(smoothing = 0.4f, brightness = 0.2f, blemish = 0.45f, underEye = 0.35f, toneBalance = 0.3f, lighting = 0.5f, eyes = 0.35f, teeth = 0.25f, makeup = 0.3f, contour = 0.4f)),
    CLEAN_GIRL("clean", "Clean Girl", Grade(exposure = 0.06f, saturation = -0.03f, temperature = 0.03f, glow = 0.12f),
        BeautyLevels(smoothing = 0.35f, brightness = 0.25f, blemish = 0.45f, underEye = 0.35f, toneBalance = 0.35f, lighting = 0.3f, eyes = 0.2f, teeth = 0.2f,
            makeup = 0.35f, lipColor = true, lipTint = BeautyLevels.LIP_TINTS[1], blush = true)),
    CINEMATIC("cinematic", "Cinematic", Grade(contrast = 0.2f, saturation = -0.12f, fade = 0.5f, shadowTint = 0x1F6F7A, highlightTint = 0xFFB070, splitAmount = 0.8f, vignette = 0.3f),
        BeautyLevels(smoothing = 0.3f, brightness = 0.1f, blemish = 0.3f, underEye = 0.25f, toneBalance = 0.2f, lighting = 0.2f, eyes = 0.2f, teeth = 0.1f)),
    LUXURY("luxury", "Luxury Portrait", Grade(contrast = 0.12f, saturation = -0.05f, temperature = 0.06f, highlightTint = 0xF2D29B, splitAmount = 0.35f, glow = 0.15f, vignette = 0.2f),
        BeautyLevels(smoothing = 0.5f, brightness = 0.2f, blemish = 0.5f, underEye = 0.4f, toneBalance = 0.35f, lighting = 0.4f, eyes = 0.35f, teeth = 0.25f,
            makeup = 0.45f, lipColor = true, lipTint = BeautyLevels.LIP_TINTS[2], contour = 0.3f)),
    WARM_GLOW("warm", "Warm Glow", Grade(exposure = 0.05f, temperature = 0.28f, vibrance = 0.1f, glow = 0.3f),
        BeautyLevels(smoothing = 0.45f, brightness = 0.25f, blemish = 0.4f, underEye = 0.3f, toneBalance = 0.3f, lighting = 0.35f, eyes = 0.25f, teeth = 0.2f, makeup = 0.3f, blush = true)),
    COOL_TONE("cool", "Cool Tone", Grade(contrast = 0.06f, saturation = -0.05f, temperature = -0.32f, tint = -0.03f),
        BeautyLevels(smoothing = 0.4f, brightness = 0.2f, blemish = 0.4f, underEye = 0.3f, toneBalance = 0.3f, lighting = 0.25f, eyes = 0.3f, teeth = 0.25f)),
    VINTAGE("vintage", "Vintage Film", Grade(contrast = -0.05f, saturation = -0.22f, temperature = 0.14f, fade = 1f, shadowTint = 0x3E5A3A, highlightTint = 0xF5E6C4, splitAmount = 0.5f, grain = 0.35f, vignette = 0.25f),
        BeautyLevels(smoothing = 0.3f, brightness = 0.1f, blemish = 0.3f, underEye = 0.25f, toneBalance = 0.2f, lighting = 0.15f, eyes = 0.15f, teeth = 0.1f)),
    ORIGINAL("original", "Original", Grade(), BeautyLevels.NONE);

    companion object { fun byId(id: String) = entries.firstOrNull { it.id == id } ?: NATURAL }
}

/** Everything the beauty camera needs. [master] scales every beauty amount: 0.5 uses the amounts as set, 1 doubles them (capped). */
data class BeautyState(
    val enabled: Boolean = false,
    val preset: BeautyPreset = BeautyPreset.NATURAL,
    val master: Float = 0.5f,
    val levels: BeautyLevels = BeautyPreset.NATURAL.levels,
    val filterStrength: Float = 1f,
) {
    /** The amounts actually used, after the master intensity. */
    fun effective(): BeautyLevels {
        val k = master * 2f
        fun s(v: Float) = (v * k).coerceIn(0f, 1f)
        val l = levels
        return l.copy(smoothing = s(l.smoothing), brightness = s(l.brightness), blemish = s(l.blemish), underEye = s(l.underEye), toneBalance = s(l.toneBalance),
            lighting = s(l.lighting), eyes = s(l.eyes), teeth = s(l.teeth), makeup = s(l.makeup), contour = s(l.contour), jawline = s(l.jawline))
    }

    /** True when the picture would come out exactly as the camera sees it. */
    val isNeutral: Boolean get() = !enabled || (preset.grade.isIdentity || filterStrength == 0f) && effective().let {
        it.smoothing + it.brightness + it.blemish + it.underEye + it.toneBalance + it.lighting + it.eyes + it.teeth + it.jawline == 0f &&
            (it.makeup == 0f || (!it.lipColor && !it.blush && it.contour == 0f))
    }

    fun withPreset(p: BeautyPreset) = copy(preset = p, levels = p.levels)
}

/** Saves the beauty choices on this phone (SharedPreferences). No face data is ever stored. */
class BeautyStore(context: Context) {
    private val prefs = context.getSharedPreferences("beauty", Context.MODE_PRIVATE)

    fun load(): BeautyState = runCatching { fromJson(JSONObject(prefs.getString("state", null) ?: return BeautyState())) }.getOrDefault(BeautyState())
    fun save(s: BeautyState) { prefs.edit().putString("state", toJson(s).toString()).apply() }

    companion object {
        fun toJson(s: BeautyState): JSONObject = JSONObject().put("enabled", s.enabled).put("preset", s.preset.id).put("master", s.master.toDouble())
            .put("filter", s.filterStrength.toDouble()).put("levels", JSONObject().apply {
                val l = s.levels
                put("smoothing", l.smoothing.toDouble()); put("brightness", l.brightness.toDouble()); put("blemish", l.blemish.toDouble())
                put("underEye", l.underEye.toDouble()); put("toneBalance", l.toneBalance.toDouble()); put("lighting", l.lighting.toDouble())
                put("eyes", l.eyes.toDouble()); put("teeth", l.teeth.toDouble()); put("makeup", l.makeup.toDouble()); put("lipColor", l.lipColor)
                put("lipTint", l.lipTint); put("blush", l.blush); put("contour", l.contour.toDouble()); put("jawline", l.jawline.toDouble())
            })

        fun fromJson(o: JSONObject): BeautyState {
            val p = BeautyPreset.byId(o.optString("preset"))
            val j = o.optJSONObject("levels")
            fun f(k: String, d: Float) = (j?.optDouble(k, d.toDouble()) ?: d.toDouble()).toFloat().coerceIn(0f, 1f)
            val d = p.levels
            val levels = BeautyLevels(f("smoothing", d.smoothing), f("brightness", d.brightness), f("blemish", d.blemish), f("underEye", d.underEye),
                f("toneBalance", d.toneBalance), f("lighting", d.lighting), f("eyes", d.eyes), f("teeth", d.teeth), f("makeup", d.makeup),
                j?.optBoolean("lipColor", d.lipColor) ?: d.lipColor, j?.optInt("lipTint", d.lipTint) ?: d.lipTint, j?.optBoolean("blush", d.blush) ?: d.blush,
                f("contour", d.contour), f("jawline", d.jawline))
            return BeautyState(o.optBoolean("enabled", false), p, o.optDouble("master", 0.5).toFloat().coerceIn(0f, 1f), levels,
                o.optDouble("filter", 1.0).toFloat().coerceIn(0f, 1f))
        }
    }
}
