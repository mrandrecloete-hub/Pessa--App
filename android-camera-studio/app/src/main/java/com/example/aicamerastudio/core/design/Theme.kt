package com.example.aicamerastudio.core.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** BlazeCam design tokens: deep black, royal blue accents, metallic gold highlights. */
object Tokens {
    val spaceXs = 4.dp
    val spaceSm = 8.dp
    val spaceMd = 16.dp
    val spaceLg = 24.dp
    val minTouch = 48.dp
    val shutterSize = 78.dp

    val black = Color(0xFF000000)
    val ink = Color(0xFF07090E)
    val panel = Color(0xFF10141C)
    val royal = Color(0xFF2F6BFF)
    val royalDeep = Color(0xFF0B2A7A)
    val gold = Color(0xFFE8B84A)
    val goldLight = Color(0xFFFFE08A)
    val goldDark = Color(0xFFA9781E)

    val glass = Color(0x99070A12)
    val glassStrong = Color(0xCC05070C)
    val glassBorder = Color(0x55E8B84A)
    val accent = royal
    val warning = Color(0xFFFFB74D)
    val danger = Color(0xFFFF4B55)

    /** Metallic gold gradient used for the shutter ring, selected states and headings. */
    val goldBrush = Brush.linearGradient(listOf(goldLight, gold, goldDark, gold))
    val royalBrush = Brush.linearGradient(listOf(Color(0xFF4F86FF), royal, royalDeep))
}

private val Dark = darkColorScheme(
    primary = Tokens.gold, onPrimary = Color(0xFF1A1200),
    secondary = Tokens.royal, onSecondary = Color.White,
    tertiary = Tokens.goldLight,
    background = Tokens.black, onBackground = Color(0xFFEDEFF4),
    surface = Tokens.ink, onSurface = Color(0xFFEDEFF4),
    surfaceVariant = Tokens.panel, onSurfaceVariant = Color(0xFFB7BECB),
    surfaceContainer = Tokens.ink, surfaceContainerHigh = Tokens.panel, surfaceContainerHighest = Color(0xFF161B26),
    secondaryContainer = Color(0xFF13285E), onSecondaryContainer = Color(0xFFDCE6FF),
    primaryContainer = Color(0xFF3A2C08), onPrimaryContainer = Tokens.goldLight,
    outline = Color(0xFF39404E), error = Tokens.danger,
)
private val Light = lightColorScheme(
    primary = Color(0xFF8A6210), onPrimary = Color.White,
    secondary = Color(0xFF1D4FD8), onSecondary = Color.White,
    background = Color(0xFFF6F7F9), onBackground = Color(0xFF14171C),
    surface = Color.White, onSurface = Color(0xFF14171C),
    surfaceVariant = Color(0xFFE6E9EE), onSurfaceVariant = Color(0xFF454B55),
    error = Color(0xFFB3261E),
)

enum class ThemeMode { SYSTEM, DARK, LIGHT }

private val base = Typography()
/** Elegant, slightly wider titles; body text stays the readable system font and scales with the user's font size. */
private val typography = base.copy(
    displayLarge = base.displayLarge.copy(fontWeight = FontWeight.Light),
    headlineMedium = base.headlineMedium.copy(fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold),
    titleLarge = base.titleLarge.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.4.sp),
    titleMedium = base.titleMedium.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.3.sp),
    labelLarge = base.labelLarge.copy(letterSpacing = 0.6.sp),
)

val WordmarkStyle = TextStyle(fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 40.sp, letterSpacing = 1.sp)

@Composable
fun AppTheme(mode: ThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) { ThemeMode.SYSTEM -> isSystemInDarkTheme(); ThemeMode.DARK -> true; ThemeMode.LIGHT -> false }
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = typography, content = content)
}
