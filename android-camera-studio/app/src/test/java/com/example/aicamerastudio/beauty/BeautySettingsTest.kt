package com.example.aicamerastudio.beauty

import com.example.aicamerastudio.camera.beauty.BeautyPreset
import com.example.aicamerastudio.camera.beauty.BeautyState
import com.example.aicamerastudio.camera.beauty.BeautyStore
import com.example.aicamerastudio.camera.beauty.Grade
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.abs

class BeautySettingsTest {
    /** Skin tones from light to deep, sky, foliage, greys. */
    private val samples = listOf(
        floatArrayOf(0.93f, 0.78f, 0.69f), floatArrayOf(0.80f, 0.60f, 0.48f), floatArrayOf(0.55f, 0.38f, 0.28f), floatArrayOf(0.30f, 0.20f, 0.15f),
        floatArrayOf(0.45f, 0.62f, 0.85f), floatArrayOf(0.25f, 0.45f, 0.20f), floatArrayOf(0.1f, 0.1f, 0.1f), floatArrayOf(0.5f, 0.5f, 0.5f), floatArrayOf(0.9f, 0.9f, 0.9f))

    private fun diff(a: Grade, b: Grade, k: Float = 1f): Float = samples.maxOf { s ->
        val x = a.apply(s, k); val y = b.apply(s, k); (0..2).maxOf { abs(x[it] - y[it]) } }

    @Test fun originalAndZeroStrengthChangeNothing() {
        assertEquals(0f, diff(BeautyPreset.ORIGINAL.grade, Grade()), 1e-6f)
        for (p in BeautyPreset.entries) samples.forEach { s -> val o = p.grade.apply(s, 0f); for (c in 0..2) assertEquals(s[c], o[c], 1e-6f) }
    }

    @Test fun everyPresetReallyChangesTheImageAndEachIsDifferent() {
        for (p in BeautyPreset.entries) if (p != BeautyPreset.ORIGINAL) {
            val d = diff(p.grade, Grade())
            println("%-16s max change %.3f".format(p.label, d))
            assertTrue("${p.label} must visibly change colours (${"%.3f".format(d)})", d > 0.03f)
        }
        val list = BeautyPreset.entries
        for (i in list.indices) for (j in i + 1 until list.size)
            assertTrue("${list[i].label} vs ${list[j].label}", diff(list[i].grade, list[j].grade) > 0.01f || list[i].levels != list[j].levels)
        assertEquals(12, list.size)
    }

    @Test fun gradesNeverChangeSkinIntoAnotherSkinTone() {
        // Natural looks keep skin hue and lightness close: no lightening or darkening of skin colour beyond a small amount.
        for (p in listOf(BeautyPreset.NATURAL, BeautyPreset.CLEAN_GIRL, BeautyPreset.SOFT_GLAM, BeautyPreset.STUDIO)) samples.take(4).forEach { s ->
            val o = p.grade.apply(s)
            assertEquals("${p.label} lightness", Grade.luma(s[0], s[1], s[2]), Grade.luma(o[0], o[1], o[2]), 0.06f)
        }
    }

    @Test fun masterIntensityScalesAndOffIsNeutral() {
        val s = BeautyState(enabled = true).withPreset(BeautyPreset.NATURAL)
        assertEquals(s.levels.smoothing, s.effective().smoothing, 1e-6f)
        assertEquals(0f, s.copy(master = 0f).effective().smoothing, 1e-6f)
        assertEquals(minOf(1f, s.levels.smoothing * 2), s.copy(master = 1f).effective().smoothing, 1e-6f)
        assertFalse(s.isNeutral)
        assertTrue(s.copy(enabled = false).isNeutral)
        assertTrue(BeautyState(enabled = true).withPreset(BeautyPreset.ORIGINAL).isNeutral)
        assertEquals("jawline is off by default in every preset", 0f, BeautyPreset.entries.maxOf { it.levels.jawline })
    }

    @Test fun savesAndLoads() {
        val s = BeautyState(enabled = true, preset = BeautyPreset.SOFT_GLAM, master = 0.7f, filterStrength = 0.4f)
            .let { it.copy(levels = it.preset.levels.copy(teeth = 0.9f, lipTint = 0x11223344)) }
        assertEquals(s, BeautyStore.fromJson(org.json.JSONObject(BeautyStore.toJson(s).toString())))
    }
}
