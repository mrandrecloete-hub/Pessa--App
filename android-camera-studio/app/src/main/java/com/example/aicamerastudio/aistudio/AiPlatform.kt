package com.example.aicamerastudio.aistudio

import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.documentfile.provider.DocumentFile
import com.google.mediapipe.framework.image.BitmapExtractor
import com.google.mediapipe.tasks.vision.imagegenerator.ImageGenerator
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** HTTPS POST with HttpURLConnection. [onConnection] lets the caller disconnect to cancel. */
class UrlConnectionTransport(private val onConnection: (HttpURLConnection) -> Unit = {}) : HttpTransport {
    override fun postJson(url: String, headers: Map<String, String>, body: String): HttpResponse {
        val u = URL(url)
        require(u.protocol == "https") { "Only HTTPS is allowed" }
        val c = u.openConnection() as HttpURLConnection
        onConnection(c)
        try {
            c.requestMethod = "POST"
            c.connectTimeout = 20_000
            c.readTimeout = 180_000 // high quality images can take a while
            c.doOutput = true
            headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = c.responseCode
            val stream = if (code in 200..299) c.inputStream else c.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            return HttpResponse(code, text)
        } finally {
            c.disconnect()
        }
    }
}

/** API key encrypted with an Android Keystore AES key that never leaves the secure hardware or keystore. */
class SecretStore(context: Context) {
    private val prefs = context.getSharedPreferences("ai_secrets", Context.MODE_PRIVATE)
    private val alias = "aics_openai_key"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build())
        return gen.generateKey()
    }

    fun save(secret: String) {
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val enc = c.doFinal(secret.trim().toByteArray(Charsets.UTF_8))
        prefs.edit().putString("iv", Base64.encodeToString(c.iv, Base64.NO_WRAP))
            .putString("ct", Base64.encodeToString(enc, Base64.NO_WRAP)).apply()
    }

    fun load(): String? = runCatching {
        val iv = Base64.decode(prefs.getString("iv", null) ?: return null, Base64.NO_WRAP)
        val ct = Base64.decode(prefs.getString("ct", null) ?: return null, Base64.NO_WRAP)
        val c = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
        String(c.doFinal(ct), Charsets.UTF_8)
    }.getOrNull()

    fun has(): Boolean = prefs.contains("ct")
    fun clear() { prefs.edit().clear().apply() }
}

/** Small, non secret settings for the AI studio. */
class AiSettings(context: Context) {
    private val p = context.getSharedPreferences("ai_studio", Context.MODE_PRIVATE)
    var engine: GenEngine
        get() = GenEngine.values().firstOrNull { it.name == p.getString("engine", null) } ?: GenEngine.ON_DEVICE
        set(v) { p.edit().putString("engine", v.name).apply() }
    var model: String
        get() = p.getString("model", OpenAiImageClient.DEFAULT_MODEL) ?: OpenAiImageClient.DEFAULT_MODEL
        set(v) { p.edit().putString("model", v.trim()).apply() }
    var onlineConsent: Boolean
        get() = p.getBoolean("consent", false)
        set(v) { p.edit().putBoolean("consent", v).apply() }
}

/** On-device Stable Diffusion through MediaPipe's Image Generator. The model is imported by the user. */
class OnDeviceGenerator(private val context: Context) {
    val modelDir: File get() = File(context.filesDir, "sd_model")

    fun isModelInstalled(): Boolean = modelDir.listFiles()?.any { it.name.endsWith(".bin") } == true

    fun installedSizeBytes(): Long = modelDir.listFiles()?.sumOf { it.length() } ?: 0L

    fun deleteModel() { modelDir.deleteRecursively() }

    /** Lists a picked folder so it can be checked before anything is copied. */
    fun listFolder(tree: Uri): List<ModelFolderCheck.Entry> {
        val dir = DocumentFile.fromTreeUri(context, tree) ?: return emptyList()
        return dir.listFiles().filter { it.isFile }.map { ModelFolderCheck.Entry(it.name.orEmpty(), it.length()) }
    }

    /** Copies the .bin files into private storage. Partial copies are removed on failure or cancel. */
    fun importFolder(tree: Uri, onProgress: (Float) -> Unit, isCancelled: () -> Boolean) {
        val dir = DocumentFile.fromTreeUri(context, tree) ?: throw GenException(GenException.Kind.NO_MODEL, "The folder could not be opened.")
        val files = dir.listFiles().filter { it.isFile && it.name.orEmpty().endsWith(".bin", true) }
        val entries = files.map { ModelFolderCheck.Entry(it.name.orEmpty(), it.length()) }
        ModelFolderCheck.problems(entries)?.let { throw GenException(GenException.Kind.NO_MODEL, it) }
        val total = ModelFolderCheck.totalBytes(entries)
        val free = android.os.StatFs(context.filesDir.path).availableBytes
        if (free < total + 200L * 1024 * 1024) throw GenException(GenException.Kind.NO_MODEL, "Not enough free storage to import the model (needs about ${total / 1_048_576} MB).")
        val tmp = File(context.filesDir, "sd_model_importing")
        tmp.deleteRecursively(); tmp.mkdirs()
        try {
            var done = 0L
            val buf = ByteArray(1 shl 20)
            for (f in files) {
                val name = File(f.name!!).name // strips any path parts
                context.contentResolver.openInputStream(f.uri)?.use { input ->
                    File(tmp, name).outputStream().use { out ->
                        while (true) {
                            if (isCancelled()) throw GenException(GenException.Kind.CANCELLED, "Import cancelled.")
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n); done += n
                            onProgress(done.toFloat() / total)
                        }
                    }
                } ?: throw GenException(GenException.Kind.NO_MODEL, "A model file could not be read.")
            }
            modelDir.deleteRecursively()
            if (!tmp.renameTo(modelDir)) throw GenException(GenException.Kind.NO_MODEL, "The model could not be stored.")
        } finally {
            tmp.deleteRecursively()
        }
    }

    /**
     * Runs [OnDeviceRequest.steps] diffusion steps one at a time, so progress is real and cancel takes
     * effect between steps. Produces one 512x512 image (the size of the Stable Diffusion 1.5 model).
     */
    fun generate(r: OnDeviceRequest, onStep: (Int, Int) -> Unit, isCancelled: () -> Boolean): Bitmap {
        if (!isModelInstalled()) throw GenException(GenException.Kind.NO_MODEL, "Import an on-device model first.")
        val gen = try {
            ImageGenerator.createFromOptions(context,
                ImageGenerator.ImageGeneratorOptions.builder().setImageGeneratorModelDirectory(modelDir.absolutePath).build())
        } catch (e: UnsatisfiedLinkError) {
            throw GenException(GenException.Kind.UNSUPPORTED_DEVICE, "On-device generation needs a 64 bit ARM phone. It is not available on this device.", e)
        } catch (e: Throwable) {
            throw GenException(GenException.Kind.INFERENCE, "The on-device model could not be loaded. The imported files may be incomplete or from a different converter.", e)
        }
        try {
            val steps = PromptRules.clampSteps(r.steps)
            gen.setInputs(r.prompt, steps, r.seed)
            for (i in 1..steps) {
                if (isCancelled()) throw GenException(GenException.Kind.CANCELLED, "Generation cancelled.")
                val result = gen.execute(i == steps)
                onStep(i, steps)
                if (i == steps) {
                    val img = result?.generatedImage() ?: throw GenException(GenException.Kind.INFERENCE, "The model finished without an image.")
                    return BitmapExtractor.extract(img).copy(Bitmap.Config.ARGB_8888, true)
                }
            }
            throw GenException(GenException.Kind.INFERENCE, "The model finished without an image.")
        } catch (e: OutOfMemoryError) {
            throw GenException(GenException.Kind.INFERENCE, "The device ran out of memory while generating. Close other apps and try again.")
        } catch (e: GenException) {
            throw e
        } catch (e: Throwable) {
            throw GenException(GenException.Kind.INFERENCE, "On-device generation failed: ${e.message ?: e.javaClass.simpleName}", e)
        } finally {
            gen.close()
        }
    }
}
