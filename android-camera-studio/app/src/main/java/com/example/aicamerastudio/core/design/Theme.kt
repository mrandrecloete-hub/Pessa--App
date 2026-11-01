package com.example.aicamerastudio.core.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

/** Central design tokens. Screens use these instead of styling themselves. */
object Tokens {
    val spaceXs = 4.dp
    val spaceSm = 8.dp
    val spaceMd = 16.dp
    val spaceLg = 24.dp
    val minTouch = 48.dp
    val shutterSize = 76.dp
    val glass = Color(0x66000000)
    val glassStrong = Color(0x99000000)
    val accent = Color(0xFF7AA7FF)
    val warning = Color(0xFFFFB74D)
    val danger = Color(0xFFFF6B6B)
}

private val Dark = darkColorScheme(
    primary = Tokens.accent, onPrimary = Color(0xFF0A1630),
    background = Color(0xFF0E1013), onBackground = Color(0xFFE8EAEE),
    surface = Color(0xFF16191E), onSurface = Color(0xFFE8EAEE),
    surfaceVariant = Color(0xFF232830), onSurfaceVariant = Color(0xFFB4BAC4),
    error = Tokens.danger,
)
private val Light = lightColorScheme(
    primary = Color(0xFF2F5FD0), onPrimary = Color.White,
    background = Color(0xFFF6F7F9), onBackground = Color(0xFF14171C),
    surface = Color.White, onSurface = Color(0xFF14171C),
    surfaceVariant = Color(0xFFE6E9EE), onSurfaceVariant = Color(0xFF454B55),
    error = Color(0xFFB3261E),
)

enum class ThemeMode { SYSTEM, DARK, LIGHT }

@Composable
fun AppTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.DARK -> true; ThemeMode.LIGHT -> false }
    MaterialTheme(colorScheme = if (dark) Dark else Light, content = content)
}
