package com.example.aicamerastudio.core.design

import android.provider.Settings
import androidx.compose.animation.core.*
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.R
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** True when the user turned animations off in Android settings. */
@Composable
fun reducedMotion(): Boolean {
    val ctx = LocalContext.current
    return remember { Settings.Global.getFloat(ctx.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }
}

/**
 * Logo reveal drawn over the app while the camera starts underneath, so it adds no start up delay.
 * About 1.3 seconds; tap anywhere to skip. Shorter and static when animations are turned off.
 */
@Composable
fun StartupReveal(onDone: () -> Unit) {
    val reduced = reducedMotion()
    val logo = remember { Animatable(if (reduced) 1f else 0.6f) }
    val fade = remember { Animatable(if (reduced) 1f else 0f) }
    val word = remember { Animatable(if (reduced) 1f else 0f) }
    val out = remember { Animatable(1f) }
    LaunchedEffect(Unit) {
        if (reduced) { delay(350); onDone(); return@LaunchedEffect }
        launchAll(
            { logo.animateTo(1f, spring(dampingRatio = 0.6f, stiffness = 120f)) },
            { fade.animateTo(1f, tween(450)) },
            { delay(350); word.animateTo(1f, tween(500, easing = FastOutSlowInEasing)) },
        )
        delay(250)
        out.animateTo(0f, tween(280))
        onDone()
    }
    Box(Modifier.fillMaxSize().alpha(out.value)
        .background(Brush.radialGradient(listOf(Color(0xFF0B2A7A), Color(0xFF04070F), Color.Black), radius = 1400f)),
        contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Image(painterResource(R.drawable.blazecam_logo), "BlazeCam", Modifier.size(260.dp).scale(logo.value).alpha(fade.value))
            Spacer(Modifier.height(Tokens.spaceMd))
            Text(buildAnnotatedString {
                withStyle(SpanStyle(brush = Tokens.goldBrush)) { append("Blaze") }
                withStyle(SpanStyle(color = Color(0xFFE9ECF2))) { append("Cam") }
            }, style = WordmarkStyle, modifier = Modifier.alpha(word.value).offset(y = (12 * (1 - word.value)).dp))
            Text("Capture. Create. Inspire.", color = Tokens.goldLight.copy(alpha = 0.8f), style = MaterialTheme.typography.labelLarge,
                modifier = Modifier.alpha(word.value))
        }
    }
}

private suspend fun launchAll(vararg blocks: suspend () -> Unit) {
    kotlinx.coroutines.coroutineScope { for (b in blocks) launch { b() } }
}
