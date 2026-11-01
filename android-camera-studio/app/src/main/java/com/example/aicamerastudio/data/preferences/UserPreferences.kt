package com.example.aicamerastudio.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.example.aicamerastudio.core.design.ThemeMode
import com.example.aicamerastudio.photo.pipeline.EnhancementProfile
import com.example.aicamerastudio.photo.pipeline.ProcessingLevel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

enum class SaveLocation(val label: String, val photoPath: String) {
    PICTURES("Pictures/BlazeCam", "Pictures/BlazeCam"), DCIM("DCIM/BlazeCam", "DCIM/BlazeCam")
}

data class UserPreferences(
    val autoEnhance: Boolean = true,
    val profile: EnhancementProfile = EnhancementProfile.NATURAL,
    val strength: Float = 0.75f,
    val level: ProcessingLevel = ProcessingLevel.BALANCED,
    val jpegQuality: Int = 92,
    /** When false, the original photo is deleted after a successful enhancement. Default keeps it. */
    val keepOriginals: Boolean = true,
    val batteryConscious: Boolean = true,
    val grid: Boolean = false,
    val theme: ThemeMode = ThemeMode.DARK,
    /** Requested photo size in megapixels; 0 means the largest the camera offers. */
    val photoMegapixels: Int = 0,
    /** Default video quality name (UHD, FHD, HD, SD) or empty for the best available. */
    val videoQuality: String = "",
    val shutterSound: Boolean = true,
    val defaultTimer: Int = 0,
    val watermark: Boolean = false,
    val watermarkText: String = "Shot on BlazeCam",
    val saveLocation: SaveLocation = SaveLocation.PICTURES,
    /** Keep the untouched capture as well when a filter, portrait effect or watermark is applied. */
    val keepUntouched: Boolean = true,
)

private val Context.store by preferencesDataStore("user_preferences")

class PreferencesRepository(private val context: Context) {
    private object K {
        val auto = booleanPreferencesKey("auto_enhance"); val profile = stringPreferencesKey("profile")
        val strength = floatPreferencesKey("strength"); val level = stringPreferencesKey("level")
        val quality = intPreferencesKey("jpeg_quality"); val keep = booleanPreferencesKey("keep_originals")
        val battery = booleanPreferencesKey("battery_conscious"); val grid = booleanPreferencesKey("grid")
        val theme = stringPreferencesKey("theme"); val mp = intPreferencesKey("photo_mp")
        val vq = stringPreferencesKey("video_quality"); val sound = booleanPreferencesKey("shutter_sound")
        val timer = intPreferencesKey("default_timer"); val wm = booleanPreferencesKey("watermark")
        val wmText = stringPreferencesKey("watermark_text"); val loc = stringPreferencesKey("save_location")
        val untouched = booleanPreferencesKey("keep_untouched")
    }

    private fun read(p: Preferences) = UserPreferences(
        autoEnhance = p[K.auto] ?: true,
        profile = p[K.profile]?.let { n -> EnhancementProfile.values().firstOrNull { it.name == n } } ?: EnhancementProfile.NATURAL,
        strength = (p[K.strength] ?: 0.75f).coerceIn(0f, 1f),
        level = p[K.level]?.let { n -> ProcessingLevel.values().firstOrNull { it.name == n } } ?: ProcessingLevel.BALANCED,
        jpegQuality = (p[K.quality] ?: 92).coerceIn(60, 100),
        keepOriginals = p[K.keep] ?: true,
        batteryConscious = p[K.battery] ?: true,
        grid = p[K.grid] ?: false,
        theme = p[K.theme]?.let { n -> ThemeMode.values().firstOrNull { it.name == n } } ?: ThemeMode.DARK,
        photoMegapixels = (p[K.mp] ?: 0).coerceIn(0, 200),
        videoQuality = p[K.vq] ?: "",
        shutterSound = p[K.sound] ?: true,
        defaultTimer = (p[K.timer] ?: 0).let { if (it in listOf(0, 3, 10)) it else 0 },
        watermark = p[K.wm] ?: false,
        watermarkText = (p[K.wmText] ?: "Shot on BlazeCam").take(40),
        saveLocation = p[K.loc]?.let { n -> SaveLocation.values().firstOrNull { it.name == n } } ?: SaveLocation.PICTURES,
        keepUntouched = p[K.untouched] ?: true,
    )

    val flow: Flow<UserPreferences> = context.store.data.map { read(it) }

    suspend fun update(block: (UserPreferences) -> UserPreferences) {
        context.store.edit { p ->
            val n = block(read(p))
            p[K.auto] = n.autoEnhance; p[K.profile] = n.profile.name; p[K.strength] = n.strength.coerceIn(0f, 1f)
            p[K.level] = n.level.name; p[K.quality] = n.jpegQuality.coerceIn(60, 100); p[K.keep] = n.keepOriginals
            p[K.battery] = n.batteryConscious; p[K.grid] = n.grid; p[K.theme] = n.theme.name
            p[K.mp] = n.photoMegapixels; p[K.vq] = n.videoQuality; p[K.sound] = n.shutterSound; p[K.timer] = n.defaultTimer
            p[K.wm] = n.watermark; p[K.wmText] = n.watermarkText.take(40); p[K.loc] = n.saveLocation.name; p[K.untouched] = n.keepUntouched
        }
    }
}
