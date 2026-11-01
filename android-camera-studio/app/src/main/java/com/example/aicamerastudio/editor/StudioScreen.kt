package com.example.aicamerastudio.editor

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.core.design.AppButton
import com.example.aicamerastudio.core.design.AppToolbar
import com.example.aicamerastudio.core.design.Tokens

@Composable
fun StudioScreen(onEditPhoto: (Uri) -> Unit, onTrimVideo: (Uri) -> Unit, onCreate: () -> Unit) {
    val photo = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { it?.let(onEditPhoto) }
    val video = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { it?.let(onTrimVideo) }
    Column(Modifier.fillMaxSize()) {
        AppToolbar("Studio")
        Column(Modifier.verticalScroll(rememberScrollState()).padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceMd)) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    Text("AI image studio", style = MaterialTheme.typography.titleMedium)
                    Text("Describe an image and create it. Choose online (OpenAI, highest quality, your own API key) or on device (free, private, offline, needs an imported model).", style = MaterialTheme.typography.bodyMedium)
                    AppButton("Create an image", onCreate, Modifier.fillMaxWidth())
                }
            }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    Text("Photo editor", style = MaterialTheme.typography.titleMedium)
                    Text("Exposure, contrast, highlights, shadows, black and white points, saturation, vibrance, temperature, tint, sharpen, denoise, rotate, flip and crop. Edits are saved as a new photo and your edit settings are remembered for each photo.", style = MaterialTheme.typography.bodyMedium)
                    AppButton("Choose a photo", { photo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }, Modifier.fillMaxWidth())
                }
            }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    Text("Video trim", style = MaterialTheme.typography.titleMedium)
                    Text("Trim a clip to the part you want and optionally remove its sound. The result is a new file with real export progress.", style = MaterialTheme.typography.bodyMedium)
                    AppButton("Choose a video", { video.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) }, Modifier.fillMaxWidth())
                }
            }
            Text("You can also open any photo or video from the Gallery and tap Edit or Trim. Photos and videos you pick are read only for the editor; nothing is uploaded.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
