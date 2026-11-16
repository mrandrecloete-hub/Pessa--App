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
    val Hero = Brush.linearGradient(listOf(Color(0xFF0B1B36), Indigo, Violet))
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
    primary = Color(0xFF9B9EFF), onPrimary = Color(0xFF0F1147), primaryContainer = Color(0xFF30338F), onPrimaryContainer = Color(0xFFE4E5FF),
    secondary = Color(0xFF8FB4FF), onSecondary = Color(0xFF062457), secondaryContainer = Color(0xFF173A7A), onSecondaryContainer = Color(0xFFDCE8FF),
    tertiary = Brand.Cyan, tertiaryContainer = Color(0xFF0B4F5B), onTertiaryContainer = Color(0xFFD3F7FC),
    background = Brand.Navy, onBackground = Color(0xFFE8ECF4), surface = Color(0xFF0E1A2D), onSurface = Color(0xFFE8ECF4),
    surfaceVariant = Color(0xFF1A2942), onSurfaceVariant = Color(0xFFA9B4C8), outline = Color(0xFF52607A), outlineVariant = Color(0xFF26354F),
    surfaceContainer = Color(0xFF12203A), surfaceContainerLow = Color(0xFF0E1A2D), surfaceContainerHigh = Color(0xFF182843), surfaceContainerHighest = Color(0xFF1F3050),
    surfaceContainerLowest = Color(0xFF091423), error = Color(0xFFFF8A8A)
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
