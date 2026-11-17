package com.pdfmaster.desktop

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

object Brand {
    val Navy = Color(0xFF07111F); val Indigo = Color(0xFF5B5FEF); val Royal = Color(0xFF2563EB); val Cyan = Color(0xFF22D3EE); val Violet = Color(0xFF8B5CF6)
    val Hero = Brush.linearGradient(listOf(Color(0xFF0B1B36), Color(0xFF1D3FA8), Indigo))
    val Accent = Brush.linearGradient(listOf(Royal, Indigo, Violet))
}

private val Dark = darkColorScheme(
    primary = Color(0xFF3B82F6), onPrimary = Color.White, primaryContainer = Color(0xFF12306B), onPrimaryContainer = Color(0xFFD6E4FF),
    secondary = Brand.Cyan, onSecondary = Color(0xFF00363D), secondaryContainer = Color(0xFF0E3A5C), onSecondaryContainer = Color(0xFFCFF5FF),
    tertiary = Brand.Violet, background = Color(0xFF050E1D), onBackground = Color(0xFFEAF0FA), surface = Color(0xFF0B1A33), onSurface = Color(0xFFEAF0FA),
    surfaceVariant = Color(0xFF14284A), onSurfaceVariant = Color(0xFF9FB2D3), outline = Color(0xFF3A5280), outlineVariant = Color(0xFF1E3358),
    surfaceContainer = Color(0xFF0F2040), surfaceContainerHigh = Color(0xFF14284A), error = Color(0xFFFF8A8A)
)
private val Light = lightColorScheme(
    primary = Brand.Indigo, onPrimary = Color.White, primaryContainer = Color(0xFFE4E5FF), secondary = Brand.Royal, background = Color(0xFFF5F7FB), onBackground = Brand.Navy,
    surface = Color.White, onSurface = Brand.Navy, surfaceVariant = Color(0xFFE9EDF5), onSurfaceVariant = Color(0xFF4A5568), outline = Color(0xFFB4BCCB), outlineVariant = Color(0xFFDDE2EC), surfaceContainer = Color.White
)

@Composable
fun PdfMasterTheme(dark: Boolean, content: @Composable () -> Unit) = MaterialTheme(colorScheme = if (dark) Dark else Light,
    shapes = Shapes(small = RoundedCornerShape(10.dp), medium = RoundedCornerShape(16.dp), large = RoundedCornerShape(22.dp)), content = content)
