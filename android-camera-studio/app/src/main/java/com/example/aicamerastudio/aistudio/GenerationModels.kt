package com.example.aicamerastudio.aistudio

/** Which engine creates the image. Both are optional; neither is needed for the camera or editor. */
enum class GenEngine(val label: String) { ONLINE("Online (OpenAI)"), ON_DEVICE("On device") }

enum class OnlineSize(val label: String, val api: String) {
    SQUARE("Square", "1024x1024"), LANDSCAPE("Landscape", "1536x1024"), PORTRAIT("Portrait", "1024x1536")
}

enum class OnlineQuality(val label: String, val api: String) { LOW("Low", "low"), MEDIUM("Medium", "medium"), HIGH("High", "high") }

/** Optional style words added to the prompt. They are plain text sent to the model, nothing more. */
enum class StylePreset(val label: String, val words: String?) {
    NONE("None", null),
    PHOTO("Photo", "photorealistic photograph, natural light, sharp focus"),
    CINEMATIC("Cinematic", "cinematic film still, dramatic lighting, shallow depth of field"),
    ILLUSTRATION("Illustration", "detailed digital illustration"),
    RENDER_3D("3D render", "3D render, soft studio lighting"),
    WATERCOLOUR("Watercolour", "watercolour painting on textured paper"),
    ANIME("Anime", "anime style illustration"),
}

data class OnlineRequest(
    val prompt: String,
    val model: String,
    val size: OnlineSize,
    val quality: OnlineQuality,
    val count: Int,
)

data class OnDeviceRequest(val prompt: String, val steps: Int, val seed: Int)

class GenException(val kind: Kind, message: String, cause: Throwable? = null) : Exception(message, cause) {
    enum class Kind { NO_KEY, AUTH, QUOTA, RATE_LIMIT, POLICY, BAD_REQUEST, SERVER, NETWORK, BAD_RESPONSE, NO_MODEL, UNSUPPORTED_DEVICE, INFERENCE, CANCELLED }
}

object PromptRules {
    const val ONLINE_MAX = 4000
    /** Stable Diffusion 1.5 reads at most 77 tokens; a long prompt is cut by the model, so warn. */
    const val ON_DEVICE_SOFT_MAX = 300

    fun compose(prompt: String, style: StylePreset): String {
        val p = prompt.trim().replace(Regex("\\s+"), " ")
        return if (style.words == null || p.isEmpty()) p else "$p, ${style.words}"
    }

    /** Returns an error message or null. */
    fun validate(prompt: String, engine: GenEngine): String? = when {
        prompt.isBlank() -> "Describe the image you want."
        prompt.trim().length < 3 -> "The description is too short."
        engine == GenEngine.ONLINE && prompt.length > ONLINE_MAX -> "The description is too long (maximum $ONLINE_MAX characters)."
        else -> null
    }

    fun warning(prompt: String, engine: GenEngine): String? =
        if (engine == GenEngine.ON_DEVICE && prompt.length > ON_DEVICE_SOFT_MAX)
            "The on-device model only reads roughly the first 75 words. The rest may be ignored."
        else null

    fun clampSteps(steps: Int) = steps.coerceIn(5, 50)
    fun clampCount(n: Int) = n.coerceIn(1, 4)
}

/**
 * Checks a folder the user wants to import as an on-device model: MediaPipe's converted
 * Stable Diffusion 1.5 weights are a folder of .bin files. This does not prove the files are valid;
 * the generator reports that when it loads them.
 */
object ModelFolderCheck {
    data class Entry(val name: String, val size: Long)

    fun problems(entries: List<Entry>): String? {
        val bins = entries.filter { it.name.endsWith(".bin", ignoreCase = true) }
        return when {
            entries.isEmpty() -> "The folder is empty."
            bins.isEmpty() -> "No .bin model files were found. Choose the folder made by the MediaPipe image generator conversion."
            bins.any { it.size <= 0 } -> "Some model files are empty."
            bins.any { it.name.contains("/") || it.name.contains("\\") || it.name.startsWith(".") } -> "A file name in the folder is not allowed."
            bins.sumOf { it.size } < 100L * 1024 * 1024 -> "The model files are too small to be a Stable Diffusion model."
            else -> null
        }
    }

    fun totalBytes(entries: List<Entry>) = entries.filter { it.name.endsWith(".bin", true) }.sumOf { it.size }
}
