package com.example.aicamerastudio.camera.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Compare
import androidx.compose.material.icons.filled.RestartAlt
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.aicamerastudio.camera.beauty.BeautyLevels
import com.example.aicamerastudio.camera.beauty.BeautyPreset
import com.example.aicamerastudio.camera.beauty.BeautyState
import com.example.aicamerastudio.camera.beauty.BeautyStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** Beauty camera colours: dark panel with subtle blue and silver accents. */
object BeautyColors {
    val panel = Color(0xE6090C12)
    val card = Color(0xFF141922)
    val blue = Color(0xFF6E9BFF)
    val blueDeep = Color(0xFF2E5BD8)
    val silver = Color(0xFFD3D8E0)
    val muted = Color(0xFF9AA3B2)
}

private enum class BeautyTab(val label: String) { BEAUTY("Beauty"), MAKEUP("Makeup"), FILTER("Filter") }

/**
 * The beauty controls under the live preview. Every change applies to the live picture at once.
 * [onCompare] is true while the compare button is held (shows the camera without effects).
 */
@Composable
fun BeautyPanel(
    state: BeautyState,
    onState: (BeautyState) -> Unit,
    status: BeautyStatus,
    effectActive: Boolean,
    video: Boolean,
    sample: Bitmap?,
    onCompare: (Boolean) -> Unit,
) {
    var tab by remember { mutableStateOf(BeautyTab.BEAUTY) }
    Column(
        Modifier.fillMaxWidth().widthIn(max = 560.dp).clip(RoundedCornerShape(22.dp)).background(BeautyColors.panel)
            .border(1.dp, BeautyColors.silver.copy(alpha = 0.12f), RoundedCornerShape(22.dp)).padding(horizontal = 12.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Beauty", color = BeautyColors.silver, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.width(8.dp))
            Text(statusLine(state, status, effectActive, video), color = BeautyColors.muted, style = MaterialTheme.typography.labelSmall,
                maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            CompareButton(onCompare)
            IconButton({ onState(state.withPreset(state.preset)) }, Modifier.size(44.dp)) {
                Icon(Icons.Default.RestartAlt, "Reset ${state.preset.label} to its own settings", tint = BeautyColors.silver)
            }
            Switch(state.enabled, { onState(state.copy(enabled = it)) },
                Modifier.semantics { contentDescription = if (state.enabled) "Beauty on. Tap to turn every beauty effect off" else "Beauty off. Tap to turn on" },
                colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = BeautyColors.blueDeep, uncheckedThumbColor = BeautyColors.silver,
                    uncheckedTrackColor = BeautyColors.card, uncheckedBorderColor = BeautyColors.muted))
        }

        PresetCarousel(sample, state.preset) { p -> onState(state.withPreset(p).copy(enabled = true)) }

        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(BeautyColors.card).padding(3.dp)) {
            BeautyTab.entries.forEach { t ->
                val sel = t == tab
                Text(t.label, textAlign = TextAlign.Center, color = if (sel) Color.White else BeautyColors.muted, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal,
                    style = MaterialTheme.typography.labelLarge,
                    modifier = Modifier.weight(1f).clip(RoundedCornerShape(11.dp)).background(if (sel) BeautyColors.blueDeep.copy(alpha = 0.55f) else Color.Transparent)
                        .clickable(role = Role.Tab) { tab = t }.padding(vertical = 8.dp).semantics { stateDescription = if (sel) "Selected" else "" })
            }
        }

        val l = state.levels
        fun set(f: (BeautyLevels) -> BeautyLevels) = onState(state.copy(levels = f(l), enabled = true))
        Column(Modifier.heightIn(max = 210.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            when (tab) {
                BeautyTab.BEAUTY -> {
                    LevelSlider("Beauty intensity", state.master, highlight = true) { onState(state.copy(master = it, enabled = true)) }
                    LevelSlider("Skin smoothing", l.smoothing) { v -> set { it.copy(smoothing = v) } }
                    LevelSlider("Skin brightness", l.brightness) { v -> set { it.copy(brightness = v) } }
                    LevelSlider("Blemish reduction", l.blemish) { v -> set { it.copy(blemish = v) } }
                    LevelSlider("Under eyes", l.underEye) { v -> set { it.copy(underEye = v) } }
                    LevelSlider("Even skin tone", l.toneBalance) { v -> set { it.copy(toneBalance = v) } }
                    LevelSlider("Face lighting", l.lighting) { v -> set { it.copy(lighting = v) } }
                    LevelSlider("Eye enhancement", l.eyes) { v -> set { it.copy(eyes = v) } }
                    LevelSlider("Teeth whitening", l.teeth) { v -> set { it.copy(teeth = v) } }
                    Text("Beauty never changes skin colour, eye size, nose or face shape.", color = BeautyColors.muted, style = MaterialTheme.typography.labelSmall)
                }
                BeautyTab.MAKEUP -> {
                    LevelSlider("Makeup intensity", l.makeup, highlight = true) { v -> set { it.copy(makeup = v) } }
                    ToggleRow("Lip colour", l.lipColor) { v -> set { it.copy(lipColor = v) } }
                    if (l.lipColor) Row(Modifier.horizontalScroll(rememberScrollState()).padding(start = 4.dp, bottom = 4.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        BeautyLevels.LIP_TINTS.forEachIndexed { i, c ->
                            val sel = c == l.lipTint
                            Box(Modifier.size(34.dp).clip(CircleShape).background(Color(c)).border(if (sel) 3.dp else 1.dp, if (sel) BeautyColors.silver else Color.White.copy(0.25f), CircleShape)
                                .clickable { set { it.copy(lipTint = c) } }.semantics { contentDescription = "Lip colour ${LIP_NAMES[i]}"; stateDescription = if (sel) "Selected" else "" })
                        }
                    }
                    ToggleRow("Blush", l.blush) { v -> set { it.copy(blush = v) } }
                    LevelSlider("Contour", l.contour) { v -> set { it.copy(contour = v) } }
                    LevelSlider("Jawline refinement", l.jawline) { v -> set { it.copy(jawline = v) } }
                    Text("Jawline refinement is optional and off by default. It slims the lower jaw sides very slightly; nothing else changes shape.",
                        color = BeautyColors.muted, style = MaterialTheme.typography.labelSmall)
                }
                BeautyTab.FILTER -> {
                    LevelSlider("Filter strength", state.filterStrength, highlight = true) { onState(state.copy(filterStrength = it, enabled = true)) }
                    Text("${state.preset.label}: the colour look of the preset. Choose Original for no filter.", color = BeautyColors.muted, style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

private val LIP_NAMES = listOf("rose", "nude", "berry", "coral", "red")

private fun statusLine(s: BeautyState, st: BeautyStatus, effectActive: Boolean, video: Boolean): String = when {
    !s.enabled -> "Off. The camera shows the plain picture."
    !effectActive -> "Live beauty could not start on this camera. The plain camera is in use."
    st.error != null -> st.error
    else -> buildString {
        append(when (st.faces) { 0 -> "Looking for a face. Colour filter is on."; 1 -> "Face found"; else -> "${st.faces} faces found" })
        if (st.quality < 2) append(". Simplified to keep the picture smooth")
        if (video) append(". Recording keeps these effects (up to 1080p)")
    }
}

/** Hold to see the camera without any effect. */
@Composable
private fun CompareButton(onCompare: (Boolean) -> Unit) {
    var held by remember { mutableStateOf(false) }
    Box(Modifier.size(44.dp).clip(CircleShape).background(if (held) BeautyColors.blueDeep else Color.Transparent)
        .pointerInput(Unit) { detectTapGestures(onPress = { held = true; onCompare(true); try { tryAwaitRelease() } finally { held = false; onCompare(false) } }) }
        .semantics { contentDescription = "Hold to compare with the original"; role = Role.Button }, contentAlignment = Alignment.Center) {
        Icon(Icons.Default.Compare, null, tint = BeautyColors.silver)
    }
}

@Composable
private fun LevelSlider(label: String, value: Float, highlight: Boolean = false, onChange: (Float) -> Unit) {
    val pct = (value * 100).roundToInt()
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.heightIn(min = 44.dp)) {
        Text(label, color = if (highlight) Color.White else BeautyColors.silver, fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal,
            style = MaterialTheme.typography.labelLarge, modifier = Modifier.width(132.dp), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Slider(value, onChange, Modifier.weight(1f).semantics { contentDescription = label; stateDescription = if (pct == 0) "Off" else "$pct percent" },
            colors = SliderDefaults.colors(thumbColor = BeautyColors.silver, activeTrackColor = BeautyColors.blue, inactiveTrackColor = BeautyColors.card))
        Text(if (pct == 0) "Off" else "$pct", color = BeautyColors.muted, style = MaterialTheme.typography.labelMedium, textAlign = TextAlign.End, modifier = Modifier.width(34.dp))
    }
}

@Composable
private fun ToggleRow(label: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp).clickable(role = Role.Switch) { onChange(!on) }) {
        Text(label, color = BeautyColors.silver, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
        Switch(on, onChange, colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = BeautyColors.blueDeep, uncheckedThumbColor = BeautyColors.silver,
            uncheckedTrackColor = BeautyColors.card, uncheckedBorderColor = BeautyColors.muted))
    }
}

/** Presets as thumbnails of the current camera picture with each preset's colour grade applied. */
@Composable
private fun PresetCarousel(sample: Bitmap?, current: BeautyPreset, onPick: (BeautyPreset) -> Unit) {
    var thumbs by remember { mutableStateOf<Map<BeautyPreset, Bitmap>>(emptyMap()) }
    LaunchedEffect(sample) {
        val src = sample ?: return@LaunchedEffect
        thumbs = withContext(Dispatchers.Default) {
            val w = src.width; val h = src.height
            val px = IntArray(w * h); src.getPixels(px, 0, w, 0, 0, w, h)
            val rgb = FloatArray(3)
            BeautyPreset.entries.associateWith { p ->
                val out = IntArray(px.size)
                for (i in px.indices) {
                    val c = px[i]
                    rgb[0] = ((c shr 16) and 255) / 255f; rgb[1] = ((c shr 8) and 255) / 255f; rgb[2] = (c and 255) / 255f
                    val g = p.grade.apply(rgb)
                    out[i] = (0xFF shl 24) or ((g[0] * 255).roundToInt() shl 16) or ((g[1] * 255).roundToInt() shl 8) or (g[2] * 255).roundToInt()
                }
                Bitmap.createBitmap(out, w, h, Bitmap.Config.ARGB_8888)
            }
        }
    }
    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp), contentPadding = PaddingValues(horizontal = 2.dp)) {
        items(BeautyPreset.entries) { p ->
            val sel = p == current
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(66.dp).clickable(role = Role.RadioButton) { onPick(p) }
                .semantics(mergeDescendants = true) { stateDescription = if (sel) "Selected" else "" }) {
                Box(Modifier.size(58.dp).clip(RoundedCornerShape(16.dp))
                    .border(if (sel) 2.5.dp else 1.dp, if (sel) Brush.linearGradient(listOf(BeautyColors.blue, BeautyColors.silver)) else Brush.linearGradient(listOf(Color.White.copy(0.15f), Color.White.copy(0.15f))), RoundedCornerShape(16.dp))
                    .background(BeautyColors.card), contentAlignment = Alignment.Center) {
                    thumbs[p]?.let { Image(it.asImageBitmap(), null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                        ?: Box(Modifier.fillMaxSize().background(swatch(p)))
                }
                Text(p.label, color = if (sel) Color.White else BeautyColors.muted, fontSize = 10.sp, lineHeight = 12.sp, textAlign = TextAlign.Center, maxLines = 2,
                    fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal, modifier = Modifier.padding(top = 3.dp))
            }
        }
    }
}

/** Fallback thumbnail before a camera sample exists: a skin tone gradient through the preset's grade. */
private fun swatch(p: BeautyPreset): Brush {
    fun c(r: Float, g: Float, b: Float) = p.grade.apply(floatArrayOf(r, g, b)).let { Color(it[0], it[1], it[2]) }
    return Brush.verticalGradient(listOf(c(0.93f, 0.80f, 0.72f), c(0.72f, 0.52f, 0.42f), c(0.35f, 0.24f, 0.19f)))
}
