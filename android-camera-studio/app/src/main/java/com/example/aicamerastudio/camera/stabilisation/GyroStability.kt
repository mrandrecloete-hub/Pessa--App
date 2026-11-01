package com.example.aicamerastudio.camera.stabilisation

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.runtime.*
import androidx.compose.ui.platform.LocalContext

/** Live steadiness from the gyroscope, or null when the phone has no gyroscope. Updates at most 10 times a second. */
@Composable
fun rememberSteadiness(zoom: Float, enabled: Boolean): Steadiness? {
    val context = LocalContext.current
    val meter = remember { StabilityMeter() }
    var state by remember { mutableStateOf<Steadiness?>(null) }
    val zoomState = rememberUpdatedState(zoom)
    DisposableEffect(enabled) {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
        val gyro = sm.getDefaultSensor(Sensor.TYPE_GYROSCOPE)
        if (!enabled || gyro == null) { state = null; return@DisposableEffect onDispose { } }
        var last = 0L
        val l = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                meter.add(e.values[0], e.values[1], e.values[2])
                if (e.timestamp - last > 100_000_000L) { last = e.timestamp; state = meter.state(zoomState.value) }
            }
            override fun onAccuracyChanged(s: Sensor?, a: Int) {}
        }
        sm.registerListener(l, gyro, SensorManager.SENSOR_DELAY_GAME)
        onDispose { sm.unregisterListener(l) }
    }
    return state
}
