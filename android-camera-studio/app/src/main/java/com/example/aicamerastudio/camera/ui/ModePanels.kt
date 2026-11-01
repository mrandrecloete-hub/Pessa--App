package com.example.aicamerastudio.camera.ui

import android.graphics.Bitmap
import android.hardware.camera2.CameraMetadata
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.camera.engine.CameraSupport
import com.example.aicamerastudio.camera.engine.LiveExposure
import com.example.aicamerastudio.camera.engine.ManualSettings
import com.example.aicamerastudio.core.design.Tokens
import com.example.aicamerastudio.photo.filters.Filter
import com.example.aicamerastudio.photo.filters.Filters
import com.example.aicamerastudio.photo.portrait.PortraitLight
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.ln
import kotlin.math.exp
import kotlin.math.roundToLong

private val glassPanel = Modifier.clip(RoundedCornerShape(18.dp)).background(Tokens.glassStrong).border(1.dp, Tokens.glassBorder, RoundedCornerShape(18.dp))

fun formatShutter(ns: Long?): String = when {
    ns == null -> "Auto"
    ns >= 500_000_000L -> "%.1fs".format(ns / 1e9)
    else -> "1/${(1e9 / ns).roundToLong()}"
}

fun awbName(m: Int) = when (m) {
    CameraMetadata.CONTROL_AWB_MODE_AUTO -> "Auto"; CameraMetadata.CONTROL_AWB_MODE_DAYLIGHT -> "Daylight"
    CameraMetadata.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT -> "Cloudy"; CameraMetadata.CONTROL_AWB_MODE_SHADE -> "Shade"
    CameraMetadata.CONTROL_AWB_MODE_INCANDESCENT -> "Tungsten"; CameraMetadata.CONTROL_AWB_MODE_FLUORESCENT -> "Fluorescent"
    CameraMetadata.CONTROL_AWB_MODE_WARM_FLUORESCENT -> "Warm fluorescent"; CameraMetadata.CONTROL_AWB_MODE_TWILIGHT -> "Twilight"
    else -> null
} ?: "Mode $m"

private enum class ProParam { ISO, SHUTTER, EV, WB, FOCUS }

private fun logSlider(v: Double, lo: Double, hi: Double) = ((ln(v) - ln(lo)) / (ln(hi) - ln(lo))).toFloat().coerceIn(0f, 1f)
private fun fromLog(t: Float, lo: Double, hi: Double) = exp(ln(lo) + t * (ln(hi) - ln(lo)))

/** Pro controls. Only the controls this camera supports are shown. */
@Composable
fun ProPanel(s: CameraSupport, manual: ManualSettings, live: LiveExposure, evIndex: Int, raw: Boolean, histogram: IntArray?,
             onManual: (ManualSettings) -> Unit, onEv: (Int) -> Unit, onRaw: (Boolean) -> Unit) {
    var sel by remember { mutableStateOf<ProParam?>(null) }
    Column(glassPanel.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f).horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (s.rawSupported) Chip("RAW", raw) { onRaw(!raw) }
                if (s.manualSensor && s.isoRange != null) Chip("ISO ${manual.iso ?: live.iso?.let { "A $it" } ?: "Auto"}", sel == ProParam.ISO || manual.iso != null) { sel = if (sel == ProParam.ISO) null else ProParam.ISO }
                if (s.manualSensor && s.exposureRangeNs != null) Chip("S ${manual.exposureNs?.let { formatShutter(it) } ?: live.exposureNs?.let { "A " + formatShutter(it) } ?: "Auto"}", sel == ProParam.SHUTTER || manual.exposureNs != null) { sel = if (sel == ProParam.SHUTTER) null else ProParam.SHUTTER }
                if (s.evSupported) Chip("EV %+.1f".format(evIndex * s.evStep), sel == ProParam.EV) { sel = if (sel == ProParam.EV) null else ProParam.EV }
                if (s.awbModes.size > 1) Chip("WB ${awbName(manual.awbMode ?: CameraMetadata.CONTROL_AWB_MODE_AUTO)}", sel == ProParam.WB || manual.awbMode != null) { sel = if (sel == ProParam.WB) null else ProParam.WB }
                if (s.manualSensor && s.minFocusDiopters > 0f) Chip(if (manual.focusDiopters == null) "AF" else "MF", sel == ProParam.FOCUS || manual.focusDiopters != null) { sel = if (sel == ProParam.FOCUS) null else ProParam.FOCUS }
            }
            if (histogram != null) Histogram(histogram, Modifier.size(72.dp, 40.dp))
        }
        when (sel) {
            ProParam.ISO -> s.isoRange?.let { r ->
                val v = (manual.iso ?: live.iso ?: r.first).coerceIn(r.first, r.last)
                DialRow("ISO", "$v", { onManual(manual.copy(iso = null)) }) {
                    Slider(logSlider(v.toDouble(), r.first.toDouble(), r.last.toDouble()), { onManual(manual.copy(iso = fromLog(it, r.first.toDouble(), r.last.toDouble()).toInt())) },
                        Modifier.semantics { contentDescription = "ISO" })
                }
            }
            ProParam.SHUTTER -> s.exposureRangeNs?.let { r ->
                val hi = minOf(r.last, 4_000_000_000L).toDouble(); val lo = maxOf(r.first, 50_000L).toDouble()
                val v = (manual.exposureNs ?: live.exposureNs ?: 10_000_000L).toDouble().coerceIn(lo, hi)
                DialRow("Shutter", formatShutter(v.toLong()), { onManual(manual.copy(exposureNs = null)) }) {
                    Slider(logSlider(v, lo, hi), { onManual(manual.copy(exposureNs = fromLog(it, lo, hi).toLong())) }, Modifier.semantics { contentDescription = "Shutter speed" })
                }
                if (v > 100_000_000) Text("Long shutter: hold the phone still or use a support.", color = Tokens.warning, style = MaterialTheme.typography.labelSmall)
            }
            ProParam.EV -> DialRow("Exposure", "%+.1f EV".format(evIndex * s.evStep), { onEv(0) }) {
                Slider(evIndex.toFloat(), { onEv(it.toInt()) }, valueRange = s.evMin.toFloat()..s.evMax.toFloat(), steps = (s.evMax - s.evMin - 1).coerceAtLeast(0),
                    enabled = manual.iso == null && manual.exposureNs == null, modifier = Modifier.semantics { contentDescription = "Exposure compensation" })
                if (manual.iso != null || manual.exposureNs != null) Text("Exposure compensation works only with automatic ISO and shutter.", color = Tokens.warning, style = MaterialTheme.typography.labelSmall)
            }
            ProParam.WB -> Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                s.awbModes.filter { it != CameraMetadata.CONTROL_AWB_MODE_OFF }.forEach { m ->
                    Chip(awbName(m), (manual.awbMode ?: CameraMetadata.CONTROL_AWB_MODE_AUTO) == m) { onManual(manual.copy(awbMode = if (m == CameraMetadata.CONTROL_AWB_MODE_AUTO) null else m)) }
                }
            }
            ProParam.FOCUS -> {
                val v = manual.focusDiopters ?: 0f
                DialRow("Focus", if (manual.focusDiopters == null) "Auto" else if (v < 0.05f) "∞" else "%.2f m".format(1f / v), { onManual(manual.copy(focusDiopters = null)) }) {
                    Slider(v, { onManual(manual.copy(focusDiopters = it)) }, valueRange = 0f..s.minFocusDiopters, modifier = Modifier.semantics { contentDescription = "Manual focus distance" })
                }
            }
            null -> if (!s.manualSensor) Text("This camera does not allow manual ISO, shutter or focus. Exposure and white balance are available.", color = Color.White.copy(0.85f), style = MaterialTheme.typography.labelSmall)
        }
    }
}

@Composable
private fun DialRow(label: String, value: String, onAuto: () -> Unit, slider: @Composable () -> Unit) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(label, color = Color.White, style = MaterialTheme.typography.labelLarge, modifier = Modifier.weight(1f))
            Text(value, color = Tokens.goldLight, style = MaterialTheme.typography.titleMedium)
            Spacer(Modifier.width(8.dp)); Chip("Auto", false, onClick = onAuto)
        }
        slider()
    }
}

/** Portrait controls: lighting look and strength, background blur, and the phone's own portrait mode when present. */
@Composable
fun PortraitPanel(light: PortraitLight, onLight: (PortraitLight) -> Unit, blur: Float, onBlur: (Float) -> Unit, intensity: Float, onIntensity: (Float) -> Unit,
                  phoneBokeh: Boolean?, onPhoneBokeh: (Boolean) -> Unit, faceFound: Boolean?) {
    Column(glassPanel.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (phoneBokeh != null) Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Chip("Phone portrait", phoneBokeh) { onPhoneBokeh(true) }; Chip("BlazeCam portrait", !phoneBokeh) { onPhoneBokeh(false) }
        }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            PortraitLight.values().forEach { l -> Chip(l.label, l == light) { onLight(l) } }
        }
        if (phoneBokeh != true) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Background blur", color = Color.White, style = MaterialTheme.typography.labelLarge, modifier = Modifier.width(130.dp))
                Slider(blur, onBlur, Modifier.weight(1f).semantics { contentDescription = "Background blur" })
            }
        }
        if (light != PortraitLight.NATURAL) Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Lighting strength", color = Color.White, style = MaterialTheme.typography.labelLarge, modifier = Modifier.width(130.dp))
            Slider(intensity, onIntensity, Modifier.weight(1f).semantics { contentDescription = "Lighting strength" })
        }
        Text(when {
            phoneBokeh == true -> "Blur is made by your phone's portrait mode."
            faceFound == true -> "Face found. Blur and lighting are applied by BlazeCam after the photo is taken."
            faceFound == false -> "Looking for a face. Blur and lighting are applied after the photo is taken."
            else -> "Blur and lighting are applied by BlazeCam after the photo is taken."
        }, color = Color.White.copy(0.85f), style = MaterialTheme.typography.labelSmall)
    }
}

/** Filter library with thumbnails rendered from the current camera view, and an intensity slider. */
@Composable
fun FilterPanel(sample: Bitmap?, current: Filter, onFilter: (Filter) -> Unit, intensity: Float, onIntensity: (Float) -> Unit, livePreview: Boolean) {
    var thumbs by remember { mutableStateOf<Map<String, Bitmap>>(emptyMap()) }
    LaunchedEffect(sample) {
        val s = sample ?: return@LaunchedEffect
        thumbs = withContext(Dispatchers.Default) {
            val w = s.width; val h = s.height; val px = IntArray(w * h); s.getPixels(px, 0, w, 0, 0, w, h)
            Filters.ALL.associate { f -> f.id to Bitmap.createBitmap(Filters.render(px, w, h, f, 1f), w, h, Bitmap.Config.ARGB_8888) }
        }
    }
    Column(glassPanel.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Filters.ALL.forEach { f ->
                val sel = f == current
                Column(Modifier.width(72.dp).clickable { onFilter(f) }.semantics { contentDescription = "${f.label} filter" + if (sel) ", selected" else "" },
                    horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(Modifier.size(64.dp).clip(RoundedCornerShape(10.dp)).border(if (sel) 2.dp else 1.dp, if (sel) Tokens.gold else Tokens.glassBorder, RoundedCornerShape(10.dp))) {
                        thumbs[f.id]?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
                    }
                    Text(f.label, color = if (sel) Tokens.gold else Color.White, style = MaterialTheme.typography.labelSmall, maxLines = 1)
                }
            }
        }
        if (current != Filters.NATURAL) Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Intensity", color = Color.White, style = MaterialTheme.typography.labelLarge, modifier = Modifier.width(80.dp))
            Slider(intensity, onIntensity, Modifier.weight(1f).semantics { contentDescription = "Filter intensity" })
            Text("${(intensity * 100).toInt()}%", color = Tokens.goldLight, style = MaterialTheme.typography.labelLarge)
        }
        if (!livePreview) Text("Live filter preview needs Android 12 or newer. The filter is still applied to the photo.", color = Tokens.warning, style = MaterialTheme.typography.labelSmall)
        else if (current.vignette > 0f || current.grain > 0f) Text("Vignette and grain are added to the saved photo.", color = Color.White.copy(0.8f), style = MaterialTheme.typography.labelSmall)
    }
}
