package com.example.aicamerastudio.aistudio

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.exifinterface.media.ExifInterface
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorCode
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import kotlinx.coroutines.*
import java.net.HttpURLConnection
import kotlin.random.Random

private fun GenException.toAppError(): AppError {
    val code = when (kind) {
        GenException.Kind.NETWORK, GenException.Kind.SERVER, GenException.Kind.RATE_LIMIT -> ErrorCode.NETWORK
        GenException.Kind.AUTH, GenException.Kind.QUOTA, GenException.Kind.NO_KEY -> ErrorCode.ACCOUNT
        GenException.Kind.POLICY -> ErrorCode.CONTENT_POLICY
        GenException.Kind.NO_MODEL, GenException.Kind.UNSUPPORTED_DEVICE -> ErrorCode.MODEL_UNAVAILABLE
        GenException.Kind.CANCELLED -> ErrorCode.INTERRUPTED
        else -> ErrorCode.INFERENCE_FAILED
    }
    val retry = kind in setOf(GenException.Kind.NETWORK, GenException.Kind.SERVER, GenException.Kind.RATE_LIMIT, GenException.Kind.INFERENCE, GenException.Kind.CANCELLED, GenException.Kind.BAD_RESPONSE)
    return AppError(code, message ?: "Image generation failed.", "", originalSafe = null, retryable = retry)
}

data class Generated(val bitmap: Bitmap, val uri: Uri?, val engine: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AiStudioScreen(onBack: () -> Unit, onEdit: (Uri) -> Unit) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val settings = remember { AiSettings(context) }
    val secrets = remember { SecretStore(context) }
    val device = remember { OnDeviceGenerator(context) }
    val scope = rememberCoroutineScope()

    var engine by remember { mutableStateOf(settings.engine) }
    var prompt by rememberSaveableText()
    var style by remember { mutableStateOf(StylePreset.NONE) }
    var size by remember { mutableStateOf(OnlineSize.SQUARE) }
    var quality by remember { mutableStateOf(OnlineQuality.MEDIUM) }
    var count by remember { mutableIntStateOf(1) }
    var steps by remember { mutableIntStateOf(20) }
    var fixedSeed by remember { mutableStateOf(false) }
    var seedText by remember { mutableStateOf("1234") }
    var model by remember { mutableStateOf(settings.model) }
    var hasKey by remember { mutableStateOf(secrets.has()) }
    var keyInput by remember { mutableStateOf("") }
    var modelInstalled by remember { mutableStateOf(device.isModelInstalled()) }
    var askConsent by remember { mutableStateOf(false) }

    var busy by remember { mutableStateOf(false) }
    var status by remember { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var job by remember { mutableStateOf<Job?>(null) }
    var error by remember { mutableStateOf<AppError?>(null) }
    val results = remember { mutableStateListOf<Generated>() }

    fun save(b: Bitmap, label: String, fullPrompt: String): Uri? = runCatching {
        graph.media.saveJpeg(MediaStoreRepository.timestampName("AICS_", "_gen"), b, 95) { uri ->
            context.contentResolver.openFileDescriptor(uri, "rw")?.use { pfd ->
                val ex = ExifInterface(pfd.fileDescriptor)
                ex.setAttribute(ExifInterface.TAG_SOFTWARE, "BlazeCam, AI generated ($label)")
                ex.setAttribute(ExifInterface.TAG_IMAGE_DESCRIPTION, "AI generated image. Prompt: ${fullPrompt.take(500)}")
                ex.saveAttributes()
            }
        }
    }.getOrNull()

    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree ->
        if (tree == null) return@rememberLauncherForActivityResult
        job = scope.launch {
            busy = true; error = null; progress = 0f; status = "Checking the folder"
            try {
                withContext(Dispatchers.IO) {
                    ModelFolderCheck.problems(device.listFolder(tree))?.let { throw GenException(GenException.Kind.NO_MODEL, it) }
                    val active = coroutineContext.job
                    device.importFolder(tree, { progress = it; status = "Importing model ${(it * 100).toInt()}%" }, { !active.isActive })
                }
                modelInstalled = true; status = "Model imported (${device.installedSizeBytes() / 1_048_576} MB)."
            } catch (e: GenException) { error = e.toAppError(); status = null }
            catch (e: CancellationException) { status = "Import cancelled." }
            finally { busy = false; progress = null }
        }
    }

    fun generate() {
        val full = PromptRules.compose(prompt, style)
        PromptRules.validate(full, engine)?.let { error = AppError(ErrorCode.INFERENCE_FAILED, it, "", null, false); return }
        if (engine == GenEngine.ONLINE && !settings.onlineConsent) { askConsent = true; return }
        job = scope.launch {
            busy = true; error = null; progress = null
            val started = System.currentTimeMillis()
            try {
                if (engine == GenEngine.ONLINE) {
                    val key = secrets.load() ?: throw GenException(GenException.Kind.NO_KEY, "Add your OpenAI API key first.")
                    val ticker = launch { while (isActive) { status = "Waiting for OpenAI… ${(System.currentTimeMillis() - started) / 1000} s"; delay(1000) } }
                    val bytes = try {
                        withContext(Dispatchers.IO) {
                            var conn: HttpURLConnection? = null
                            val h = coroutineContext.job.invokeOnCompletion { if (it != null) conn?.disconnect() }
                            try {
                                OpenAiImageClient(UrlConnectionTransport { conn = it })
                                    .generate(key, OnlineRequest(full, model, size, quality, count))
                            } finally { h.dispose() }
                        }
                    } finally { ticker.cancel() }
                    ensureActive()
                    val label = "OpenAI ${model.ifBlank { OpenAiImageClient.DEFAULT_MODEL }}"
                    bytes.forEach { b ->
                        val bmp = withContext(Dispatchers.Default) { BitmapFactory.decodeByteArray(b, 0, b.size) }
                            ?: throw GenException(GenException.Kind.BAD_RESPONSE, "The image from the service could not be decoded.")
                        val argb = if (bmp.config == Bitmap.Config.ARGB_8888) bmp else bmp.copy(Bitmap.Config.ARGB_8888, false)
                        results.add(0, Generated(argb, withContext(Dispatchers.IO) { save(argb, label, full) }, label))
                    }
                } else {
                    val seed = if (fixedSeed) seedText.toIntOrNull() ?: 0 else Random.nextInt(0, Int.MAX_VALUE)
                    progress = 0f; status = "Loading the on-device model"
                    val bmp = withContext(Dispatchers.Default) {
                        val active = coroutineContext.job
                        device.generate(OnDeviceRequest(full, steps, seed), { i, n -> progress = i.toFloat() / n; status = "Step $i of $n" }, { !active.isActive })
                    }
                    val label = "on device, Stable Diffusion, seed $seed"
                    results.add(0, Generated(bmp, withContext(Dispatchers.IO) { save(bmp, label, full) }, label))
                }
                status = "Done in ${(System.currentTimeMillis() - started) / 1000} s. Saved to the gallery."
            } catch (e: GenException) {
                error = e.toAppError(); status = null
            } catch (e: CancellationException) {
                status = "Cancelled. Nothing was saved."
            } finally { busy = false; progress = null }
        }
    }

    Column(Modifier.fillMaxSize()) {
        AppToolbar("AI image studio", onBack)
        Column(Modifier.verticalScroll(rememberScrollState()).padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                GenEngine.values().forEachIndexed { i, e ->
                    SegmentedButton(engine == e, { engine = e; settings.engine = e }, SegmentedButtonDefaults.itemShape(i, GenEngine.values().size), enabled = !busy) { Text(e.label) }
                }
            }
            Text(
                if (engine == GenEngine.ONLINE) "Highest quality. Uses OpenAI's image model with your own API key and is billed by OpenAI per image. Only your text description is sent; no photos."
                else "Free, private and offline. Runs Stable Diffusion 1.5 on this phone at 512 × 512. Slower and lower quality than online. Needs a recent 64 bit phone.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            // Engine setup
            if (engine == GenEngine.ONLINE) {
                if (!hasKey) Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        Text("Add your OpenAI API key", style = MaterialTheme.typography.titleSmall)
                        Text("Create one at platform.openai.com under API keys. It is encrypted with this phone's keystore and only sent to OpenAI.", style = MaterialTheme.typography.bodySmall)
                        OutlinedTextField(keyInput, { keyInput = it }, Modifier.fillMaxWidth(), label = { Text("API key") }, singleLine = true,
                            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password))
                        AppButton("Save key", { secrets.save(keyInput); keyInput = ""; hasKey = secrets.has() }, enabled = keyInput.trim().length >= 20)
                    }
                } else Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text("API key saved (encrypted)", style = MaterialTheme.typography.bodyMedium)
                    TextButton({ secrets.clear(); hasKey = false }, enabled = !busy) { Text("Remove key") }
                }
                OutlinedTextField(model, { model = it; settings.model = it }, Modifier.fillMaxWidth(), singleLine = true, enabled = !busy,
                    label = { Text("Model") }, supportingText = { Text("Default ${OpenAiImageClient.DEFAULT_MODEL}. Change it if OpenAI offers a newer image model on your account.") })
            } else {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        if (modelInstalled) {
                            Text("On-device model installed (${device.installedSizeBytes() / 1_048_576} MB)", style = MaterialTheme.typography.titleSmall)
                            TextButton({ device.deleteModel(); modelInstalled = false }, enabled = !busy) { Text("Delete model to free space") }
                        } else {
                            Text("No on-device model yet", style = MaterialTheme.typography.titleSmall)
                            Text("The model is about 2 GB and is not included in the app. Convert Stable Diffusion 1.5 weights with Google's MediaPipe image generator conversion script on a computer, copy the output folder to this phone, then import it here. Stable Diffusion 1.5 is released under the CreativeML OpenRAIL-M licence, which has use restrictions you must follow.", style = MaterialTheme.typography.bodySmall)
                            AppButton("Import model folder", { importer.launch(null) }, enabled = !busy)
                        }
                    }
                }
            }

            OutlinedTextField(prompt, { prompt = it }, Modifier.fillMaxWidth().heightIn(min = 120.dp), enabled = !busy,
                label = { Text("Describe the image") }, placeholder = { Text("A red fishing boat on a calm lake at sunrise, mist over the water") },
                supportingText = { Text("${prompt.length} characters" + (PromptRules.warning(PromptRules.compose(prompt, style), engine)?.let { ". $it" } ?: "")) })
            Text("Style", style = MaterialTheme.typography.labelLarge)
            FlowRowChips(StylePreset.values().toList(), style, { it.label }, !busy) { style = it }

            if (engine == GenEngine.ONLINE) {
                Text("Shape", style = MaterialTheme.typography.labelLarge)
                FlowRowChips(OnlineSize.values().toList(), size, { "${it.label} ${it.api}" }, !busy) { size = it }
                if (!model.startsWith("dall-e")) {
                    Text("Quality (higher costs more)", style = MaterialTheme.typography.labelLarge)
                    FlowRowChips(OnlineQuality.values().toList(), quality, { it.label }, !busy) { quality = it }
                }
                LabeledSlider("Images", count.toFloat(), 1f..4f, "$count", { count = it.toInt() })
            } else {
                LabeledSlider("Steps (more is slower, often cleaner)", steps.toFloat(), 5f..50f, "$steps", { steps = it.toInt() })
                Row(Modifier.fillMaxWidth(), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                    Text("Fixed seed (repeatable result)", Modifier.weight(1f)); Switch(fixedSeed, { fixedSeed = it }, enabled = !busy)
                }
                if (fixedSeed) OutlinedTextField(seedText, { t -> seedText = t.filter { it.isDigit() }.take(9) }, label = { Text("Seed") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), enabled = !busy)
            }

            val ready = if (engine == GenEngine.ONLINE) hasKey else modelInstalled
            if (busy) {
                LoadingIndicator(status, progress = progress)
                TextButton({ job?.cancel() }) { Text("Cancel") }
            } else {
                AppButton("Generate", { generate() }, Modifier.fillMaxWidth(), enabled = ready && prompt.isNotBlank())
                status?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
            error?.let { ErrorCard(it, onRetry = { error = null; generate() }, onDismiss = { error = null }) }

            results.forEach { g ->
                Card(Modifier.fillMaxWidth()) {
                    Image(g.bitmap.asImageBitmap(), "Generated image", Modifier.fillMaxWidth().aspectRatio(g.bitmap.width.toFloat() / g.bitmap.height), contentScale = ContentScale.Fit)
                    Row(Modifier.fillMaxWidth().padding(Tokens.spaceSm), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        Text("AI generated, ${g.engine}", Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                        g.uri?.let { u ->
                            TextButton({ onEdit(u) }) { Text("Edit") }
                            TextButton({
                                context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                                    type = "image/jpeg"; putExtra(Intent.EXTRA_STREAM, u); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }, "Share"))
                            }) { Text("Share") }
                        } ?: Text("Not saved", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
            Text("Generated images can be wrong or unexpected and are not photographs. They are labelled as AI generated in the file details. You are responsible for following the image service's or model's usage rules.",
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    if (askConsent) AlertDialog(onDismissRequest = { askConsent = false },
        title = { Text("Send this description to OpenAI?") },
        text = { Text("Online generation sends your text description to OpenAI using your API key. OpenAI charges your account for each image and its own privacy policy applies. No photos or other data from this phone are sent. You can switch to the on-device engine at any time.") },
        confirmButton = { TextButton({ settings.onlineConsent = true; askConsent = false; generate() }) { Text("Agree and generate") } },
        dismissButton = { TextButton({ askConsent = false }) { Text("Cancel") } })
}

@Composable
private fun rememberSaveableText() = androidx.compose.runtime.saveable.rememberSaveable { mutableStateOf("") }

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun <T> FlowRowChips(options: List<T>, selected: T, label: (T) -> String, enabled: Boolean, onSelect: (T) -> Unit) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
        options.forEach { o -> FilterChip(o == selected, { onSelect(o) }, { Text(label(o)) }, enabled = enabled) }
    }
}
