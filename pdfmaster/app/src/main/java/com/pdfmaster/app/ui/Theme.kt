package com.pdfmaster.app.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object Brand {
    val Navy = Color(0xFF07111F)
    val Indigo = Color(0xFF5B5FEF)
    val Royal = Color(0xFF2563EB)
    val Cyan = Color(0xFF22D3EE)
    val Violet = Color(0xFF8B5CF6)
    val Grey = Color(0xFFF5F7FB)
    val Hero = Brush.linearGradient(listOf(Color(0xFF0B1B36), Color(0xFF1D3FA8), Indigo))
    val Accent = Brush.linearGradient(listOf(Royal, Indigo, Violet))
}

private val Light = lightColorScheme(
    primary = Brand.Indigo, onPrimary = Color.White, primaryContainer = Color(0xFFE4E5FF), onPrimaryContainer = Color(0xFF14164F),
    secondary = Brand.Royal, onSecondary = Color.White, secondaryContainer = Color(0xFFDCE8FF), onSecondaryContainer = Color(0xFF0A2A66),
    tertiary = Color(0xFF0E8FA3), tertiaryContainer = Color(0xFFD3F7FC), onTertiaryContainer = Color(0xFF053C45),
    background = Brand.Grey, onBackground = Brand.Navy, surface = Color.White, onSurface = Brand.Navy,
    surfaceVariant = Color(0xFFE9EDF5), onSurfaceVariant = Color(0xFF4A5568), outline = Color(0xFFB4BCCB), outlineVariant = Color(0xFFDDE2EC),
    surfaceContainer = Color.White, surfaceContainerLow = Color.White, surfaceContainerHigh = Color(0xFFF0F2F8), surfaceContainerHighest = Color(0xFFE9EDF5),
    surfaceContainerLowest = Color.White, error = Color(0xFFDC2626)
)
private val Dark = darkColorScheme(
    primary = Color(0xFF3B82F6), onPrimary = Color.White, primaryContainer = Color(0xFF12306B), onPrimaryContainer = Color(0xFFD6E4FF),
    secondary = Brand.Cyan, onSecondary = Color(0xFF00363D), secondaryContainer = Color(0xFF0E3A5C), onSecondaryContainer = Color(0xFFCFF5FF),
    tertiary = Brand.Violet, tertiaryContainer = Color(0xFF3B2A7A), onTertiaryContainer = Color(0xFFE9DDFF),
    background = Color(0xFF050E1D), onBackground = Color(0xFFEAF0FA), surface = Color(0xFF0B1A33), onSurface = Color(0xFFEAF0FA),
    surfaceVariant = Color(0xFF14284A), onSurfaceVariant = Color(0xFF9FB2D3), outline = Color(0xFF3A5280), outlineVariant = Color(0xFF1E3358),
    surfaceContainer = Color(0xFF0F2040), surfaceContainerLow = Color(0xFF0B1A33), surfaceContainerHigh = Color(0xFF14284A), surfaceContainerHighest = Color(0xFF1A3159),
    surfaceContainerLowest = Color(0xFF040B17), error = Color(0xFFFF8A8A)
)

private val Type = Typography().let { t ->
    t.copy(
        headlineMedium = t.headlineMedium.copy(fontWeight = FontWeight.Bold, letterSpacing = (-0.3).sp),
        headlineSmall = t.headlineSmall.copy(fontWeight = FontWeight.Bold),
        titleLarge = t.titleLarge.copy(fontWeight = FontWeight.SemiBold),
        titleMedium = t.titleMedium.copy(fontWeight = FontWeight.SemiBold),
        titleSmall = t.titleSmall.copy(fontWeight = FontWeight.SemiBold),
        labelLarge = t.labelLarge.copy(fontWeight = FontWeight.SemiBold),
        bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp)
    )
}

@Composable
fun PdfMasterTheme(mode: String, content: @Composable () -> Unit) {
    val dark = when (mode) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    MaterialTheme(colorScheme = if (dark) Dark else Light, typography = Type,
        shapes = Shapes(extraSmall = RoundedCornerShape(8.dp), small = RoundedCornerShape(12.dp), medium = RoundedCornerShape(18.dp), large = RoundedCornerShape(24.dp), extraLarge = RoundedCornerShape(30.dp)),
        content = content)
}
