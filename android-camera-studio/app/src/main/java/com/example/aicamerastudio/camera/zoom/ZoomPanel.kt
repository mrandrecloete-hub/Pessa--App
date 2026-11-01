package com.example.aicamerastudio.camera.zoom

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.camera.stabilisation.Steadiness
import com.example.aicamerastudio.core.design.Tokens
import kotlin.math.abs

/** Ultra zoom controls. Every label comes from [ZoomPlanner], so optical and digital are never confused. */
@Composable
fun ZoomPanel(
    plan: ZoomPlan, planner: ZoomPlanner, steadiness: Steadiness?, onZoom: (Float) -> Unit,
    frames: Int, onFrames: (Int) -> Unit, ai: Boolean, onAi: (Boolean) -> Unit,
    aeLocked: Boolean, onAeLock: (Boolean) -> Unit, afLocked: Boolean, onAfLock: (Boolean) -> Unit,
    manualFocusSupported: Boolean, minFocusDiopters: Float, manualFocus: Float?, onManualFocus: (Float?) -> Unit,
) {
    val glass = Modifier.clip(RoundedCornerShape(18.dp)).background(Tokens.glassStrong)
    Column(Modifier.fillMaxWidth().padding(horizontal = Tokens.spaceSm), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Column(glass.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(plan.label, color = Color.White, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
                steadiness?.let { s ->
                    val (txt, col) = when (s) { Steadiness.STEADY -> "Steady" to Color(0xFF7CE38B); Steadiness.OK -> "Almost steady" to Tokens.warning; Steadiness.SHAKY -> "Hold still" to Tokens.danger }
                    Text(txt, color = Color.Black, style = MaterialTheme.typography.labelMedium,
                        modifier = Modifier.clip(RoundedCornerShape(10.dp)).background(col).padding(horizontal = 8.dp, vertical = 2.dp)
                            .semantics { contentDescription = "Stability: $txt" })
                }
            }
            plan.warning?.let { wtxt ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, "Warning", tint = Tokens.warning, modifier = Modifier.size(16.dp))
                    Text(" $wtxt", color = Tokens.warning, style = MaterialTheme.typography.labelSmall)
                }
            }
            Slider(ZoomPlanner.zoomToSlider(plan.requested, planner.minZoom, planner.maxZoom),
                { onZoom(ZoomPlanner.sliderToZoom(it, planner.minZoom, planner.maxZoom)) },
                modifier = Modifier.semantics { contentDescription = "Zoom, ${plan.label}" })
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                planner.quickStops().forEach { z ->
                    val sel = abs(plan.requested - z) / z < 0.04f
                    val kind = planner.plan(z).kind
                    val txt = (if (z < 10f && z % 1f != 0f) "%.1f×".format(z) else "%.0f×".format(z))
                    Text(txt, color = if (sel) Color.Black else Color.White, fontWeight = if (sel) FontWeight.Bold else FontWeight.Normal,
                        modifier = Modifier.heightIn(min = 40.dp).widthIn(min = 44.dp).clip(CircleShape).background(if (sel) Color.White else Tokens.glass)
                            .clickable { onZoom(z) }.padding(horizontal = 10.dp, vertical = 10.dp)
                            .semantics { contentDescription = "Zoom $txt, ${kind.name.lowercase()}" })
                }
            }
        }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            Toggle("Focus lock", afLocked) { onAfLock(!afLocked) }
            Toggle("Exposure lock", aeLocked) { onAeLock(!aeLocked) }
            listOf(1, 3, 5).forEach { n -> Toggle(if (n == 1) "1 frame" else "$n frames", frames == n) { onFrames(n) } }
            Toggle(if (plan.kind == ZoomKind.EXTENDED) "AI upscale" else "AI upscale (beyond camera zoom)", ai) { onAi(!ai) }
        }
        if (manualFocusSupported) Row(glass.fillMaxWidth().padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Toggle(if (manualFocus == null) "Auto focus" else "Manual focus", manualFocus != null) { onManualFocus(if (manualFocus == null) 0f else null) }
            if (manualFocus != null) {
                Slider(manualFocus, { onManualFocus(it) }, valueRange = 0f..minFocusDiopters, modifier = Modifier.weight(1f).padding(start = 8.dp)
                    .semantics { contentDescription = "Manual focus distance" })
                Text(if (manualFocus < 0.05f) "∞" else "%.1f m".format(1f / manualFocus), color = Color.White, style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

@Composable
private fun Toggle(text: String, on: Boolean, onClick: () -> Unit) {
    Text(text, color = if (on) Color.Black else Color.White, style = MaterialTheme.typography.labelLarge,
        modifier = Modifier.heightIn(min = 40.dp).clip(RoundedCornerShape(20.dp)).background(if (on) Tokens.accent else Tokens.glassStrong)
            .clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 10.dp)
            .semantics { contentDescription = text + if (on) ", on" else ", off" })
}
