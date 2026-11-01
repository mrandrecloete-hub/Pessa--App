package com.example.aicamerastudio.core.permissions

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import com.example.aicamerastudio.core.design.AppButton
import com.example.aicamerastudio.core.design.EmptyState
import com.example.aicamerastudio.core.design.Tokens

fun Context.has(permission: String) =
    ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

/**
 * Explains why the camera is needed, requests it, and re-checks when the app resumes
 * (the user may grant it from system settings, or revoke it later).
 */
@Composable
fun CameraPermissionGate(content: @Composable (audioGranted: Boolean) -> Unit) {
    val context = LocalContext.current
    var camera by remember { mutableStateOf(context.has(Manifest.permission.CAMERA)) }
    var audio by remember { mutableStateOf(context.has(Manifest.permission.RECORD_AUDIO)) }
    var asked by remember { mutableStateOf(false) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        camera = context.has(Manifest.permission.CAMERA)
        audio = context.has(Manifest.permission.RECORD_AUDIO)
    }
    val owner = LocalLifecycleOwner.current
    LaunchedEffect(owner) {
        owner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            camera = context.has(Manifest.permission.CAMERA)
            audio = context.has(Manifest.permission.RECORD_AUDIO)
        }
    }
    if (camera) {
        content(audio)
    } else {
        EmptyState(
            title = if (asked) "Camera access is turned off" else "Allow the camera",
            body = "AI Camera Studio uses the camera to take photos and record video, and the microphone to record sound with video. " +
                "Everything is processed on this device and nothing is uploaded. " +
                "The microphone is optional: without it, videos are recorded without sound.",
            action = {
                Column(verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    AppButton(if (asked) "Try again" else "Allow camera", onClick = {
                        asked = true
                        launcher.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
                    }, modifier = Modifier.fillMaxWidth())
                    if (asked) AppButton("Open system settings", onClick = {
                        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)))
                    }, modifier = Modifier.fillMaxWidth(), primary = false)
                }
            },
        )
    }
}
