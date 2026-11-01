package com.example.aicamerastudio.camera.ui

import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.camera.engine.CaptureMode
import com.example.aicamerastudio.core.design.Tokens
import com.example.aicamerastudio.core.design.reducedMotion
import com.example.aicamerastudio.gallery.Thumb

/** Round glass button with a gold rim when active. */
@Composable
fun GlassButton(icon: ImageVector?, desc: String, active: Boolean, label: String? = null, onClick: () -> Unit) {
    val bg by animateColorAsState(if (active) Tokens.gold.copy(alpha = 0.95f) else Tokens.glass, label = "bg")
    Row(
        Modifier.heightIn(min = Tokens.minTouch).clip(RoundedCornerShape(24.dp)).background(bg)
            .border(1.dp, if (active) Tokens.goldLight else Tokens.glassBorder, RoundedCornerShape(24.dp))
            .clickable(onClick = onClick).padding(horizontal = 12.dp).semantics { contentDescription = desc },
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (icon != null) Icon(icon, null, tint = if (active) Color.Black else Color.White)
        if (label != null) Text(label, color = if (active) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun Chip(text: String, selected: Boolean, enabled: Boolean = true, onClick: () -> Unit) {
    val bg by animateColorAsState(if (selected) Tokens.gold else Tokens.glass, label = "chip")
    Text(text, color = if (selected) Color.Black else if (enabled) Color.White else Color.White.copy(alpha = 0.4f), style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.heightIn(min = 36.dp).clip(RoundedCornerShape(18.dp)).background(bg)
            .border(1.dp, if (selected) Tokens.goldLight else Tokens.glassBorder, RoundedCornerShape(18.dp))
            .clickable(enabled = enabled, onClick = onClick).padding(horizontal = 12.dp, vertical = 8.dp)
            .semantics { contentDescription = text + if (selected) ", selected" else "" })
}

/** Mode selector with an animated gold underline under the current mode. */
@Composable
fun ModeCarousel(modes: List<CaptureMode>, current: CaptureMode, enabled: Boolean, onSelect: (CaptureMode) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = Tokens.spaceSm), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
        modes.forEach { m ->
            val sel = m == current
            val underline by animateDpAsState(if (sel) 22.dp else 0.dp, label = "u")
            val col by animateColorAsState(if (sel) Tokens.gold else Color.White.copy(alpha = 0.85f), label = "c")
            Column(Modifier.heightIn(min = 44.dp).clip(RoundedCornerShape(12.dp)).clickable(enabled = enabled) { onSelect(m) }
                .padding(horizontal = 12.dp, vertical = 6.dp).semantics { contentDescription = "${m.label} mode" + if (sel) ", selected" else "" },
                horizontalAlignment = Alignment.CenterHorizontally) {
                Text(m.label.uppercase(), color = col, fontWeight = if (sel) FontWeight.Bold else FontWeight.Medium, style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(4.dp))
                Box(Modifier.width(underline).height(3.dp).clip(RoundedCornerShape(2.dp)).background(Tokens.goldBrush))
            }
        }
    }
}

/** Shutter with a metallic gold ring; presses in with a spring. Red core for video, square while recording. */
@Composable
fun ShutterButton(video: Boolean, recording: Boolean, enabled: Boolean, desc: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.88f else 1f, spring(dampingRatio = 0.45f, stiffness = 600f), label = "s")
    val core by animateDpAsState(if (recording) 30.dp else 62.dp, label = "core")
    val corner by animateDpAsState(if (recording) 8.dp else 31.dp, label = "corner")
    Box(Modifier.size(Tokens.shutterSize).scale(scale).clip(CircleShape).border(4.dp, Tokens.goldBrush, CircleShape)
        .clickable(source, null, enabled = enabled, onClick = onClick).semantics { contentDescription = desc },
        contentAlignment = Alignment.Center) {
        Box(Modifier.size(core).clip(RoundedCornerShape(corner)).background(if (video) Tokens.danger else Color.White))
    }
}

/** White flash over the preview when a photo is taken. */
@Composable
fun CaptureFlash(trigger: Int) {
    val reduced = reducedMotion()
    val a = remember { Animatable(0f) }
    LaunchedEffect(trigger) { if (trigger > 0 && !reduced) { a.snapTo(0.55f); a.animateTo(0f, tween(180)) } }
    if (a.value > 0f) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = a.value)))
}

/** Glowing gold focus ring that settles in and breathes while focusing. */
@Composable
fun FocusRing(at: Offset) {
    val reduced = reducedMotion()
    val s = remember(at) { Animatable(if (reduced) 1f else 1.5f) }
    LaunchedEffect(at) { if (!reduced) s.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = 300f)) }
    val glow by rememberInfiniteTransition(label = "g").animateFloat(0.25f, 0.6f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "glow")
    Canvas(Modifier.fillMaxSize()) {
        val r = 38.dp.toPx() * s.value
        drawCircle(Tokens.gold.copy(alpha = if (reduced) 0.4f else glow), r + 6.dp.toPx(), at, style = Stroke(6.dp.toPx()))
        drawCircle(Tokens.goldLight, r, at, style = Stroke(2.dp.toPx()))
    }
}

/** Gold brackets around a detected face (mapped from frame to view with centre crop, like the preview). */
@Composable
fun FaceBrackets(face: FaceBox, mirror: Boolean) {
    Canvas(Modifier.fillMaxSize()) {
        val viewAspect = size.width / size.height
        val scale: Float; val ox: Float; val oy: Float
        if (face.frameAspect > viewAspect) { scale = size.height; ox = (size.width - face.frameAspect * size.height) / 2f; oy = 0f }
        else { scale = size.width / face.frameAspect; ox = 0f; oy = (size.height - size.width / face.frameAspect) / 2f }
        val fw = face.frameAspect * scale
        var x = ox + face.x * fw; val y = oy + face.y * scale; val w = face.w * fw; val h = face.h * scale
        if (mirror) x = size.width - x - w
        val l = minOf(w, h) * 0.28f; val st = Stroke(3.dp.toPx())
        fun corner(cx: Float, cy: Float, dx: Float, dy: Float) {
            drawLine(Tokens.gold, Offset(cx, cy), Offset(cx + dx * l, cy), st.width); drawLine(Tokens.gold, Offset(cx, cy), Offset(cx, cy + dy * l), st.width)
        }
        corner(x, y, 1f, 1f); corner(x + w, y, -1f, 1f); corner(x, y + h, 1f, -1f); corner(x + w, y + h, -1f, -1f)
    }
}

@Composable
fun GalleryThumb(uri: Uri?, size: Dp, onClick: () -> Unit) {
    Box(Modifier.size(size).clip(RoundedCornerShape(12.dp)).border(2.dp, Tokens.goldBrush, RoundedCornerShape(12.dp))
        .background(Tokens.glass).clickable(enabled = uri != null, onClick = onClick).semantics { contentDescription = "Open last photo" }) {
        if (uri != null) Thumb(uri, Modifier.fillMaxSize(), px = 160)
    }
}

@Composable
fun Histogram(bins: IntArray, modifier: Modifier = Modifier) {
    Canvas(modifier.clip(RoundedCornerShape(8.dp)).background(Tokens.glassStrong).semantics { contentDescription = "Brightness histogram" }) {
        val maxV = (bins.maxOrNull() ?: 1).coerceAtLeast(1).toFloat()
        val bw = size.width / bins.size
        bins.forEachIndexed { i, v ->
            val h = size.height * (v / maxV)
            drawRect(Tokens.goldLight.copy(alpha = 0.85f), Offset(i * bw, size.height - h), Size(bw * 0.9f, h))
        }
    }
}
