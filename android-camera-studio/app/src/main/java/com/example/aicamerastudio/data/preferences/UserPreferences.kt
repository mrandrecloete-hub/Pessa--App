package com.example.aicamerastudio.data.preferences

import android.content.Context
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import com.example.aicamerastudio.core.design.ThemeMode
import com.example.aicamerastudio.photo.pipeline.EnhancementProfile
import com.example.aicamerastudio.photo.pipeline.ProcessingLevel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

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
    val theme: ThemeMode = ThemeMode.SYSTEM,
)

private val Context.store by preferencesDataStore("user_preferences")

class PreferencesRepository(private val context: Context) {
    private object K {
        val auto = booleanPreferencesKey("auto_enhance")
        val profile = stringPreferencesKey("profile")
        val strength = floatPreferencesKey("strength")
        val level = stringPreferencesKey("level")
        val quality = intPreferencesKey("jpeg_quality")
        val keep = booleanPreferencesKey("keep_originals")
        val battery = booleanPreferencesKey("battery_conscious")
        val grid = booleanPreferencesKey("grid")
        val theme = stringPreferencesKey("theme")
    }

    val flow: Flow<UserPreferences> = context.store.data.map { p ->
        UserPreferences(
            autoEnhance = p[K.auto] ?: true,
            profile = p[K.profile]?.let { n -> EnhancementProfile.values().firstOrNull { it.name == n } } ?: EnhancementProfile.NATURAL,
            strength = (p[K.strength] ?: 0.75f).coerceIn(0f, 1f),
            level = p[K.level]?.let { n -> ProcessingLevel.values().firstOrNull { it.name == n } } ?: ProcessingLevel.BALANCED,
            jpegQuality = (p[K.quality] ?: 92).coerceIn(60, 100),
            keepOriginals = p[K.keep] ?: true,
            batteryConscious = p[K.battery] ?: true,
            grid = p[K.grid] ?: false,
            theme = p[K.theme]?.let { n -> ThemeMode.values().firstOrNull { it.name == n } } ?: ThemeMode.SYSTEM,
        )
    }

    suspend fun update(block: (UserPreferences) -> UserPreferences) {
        context.store.edit { p ->
            val cur = UserPreferences(
                p[K.auto] ?: true,
                p[K.profile]?.let { n -> EnhancementProfile.values().firstOrNull { it.name == n } } ?: EnhancementProfile.NATURAL,
                p[K.strength] ?: 0.75f,
                p[K.level]?.let { n -> ProcessingLevel.values().firstOrNull { it.name == n } } ?: ProcessingLevel.BALANCED,
                p[K.quality] ?: 92, p[K.keep] ?: true, p[K.battery] ?: true, p[K.grid] ?: false,
                p[K.theme]?.let { n -> ThemeMode.values().firstOrNull { it.name == n } } ?: ThemeMode.SYSTEM,
            )
            val n = block(cur)
            p[K.auto] = n.autoEnhance; p[K.profile] = n.profile.name; p[K.strength] = n.strength.coerceIn(0f, 1f)
            p[K.level] = n.level.name; p[K.quality] = n.jpegQuality.coerceIn(60, 100); p[K.keep] = n.keepOriginals
            p[K.battery] = n.batteryConscious; p[K.grid] = n.grid; p[K.theme] = n.theme.name
        }
    }
}
