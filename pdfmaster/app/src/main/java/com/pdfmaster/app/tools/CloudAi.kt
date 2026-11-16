package com.pdfmaster.app.tools

import com.pdfmaster.app.data.Secrets
import com.pdfmaster.app.data.Settings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class CloudAnswer(val text: String, val model: String, val note: String? = null)

/**
 * Optional cloud assistant. It is only called after the user switches it on, enters THEIR OWN key and
 * agrees to send the document text. No key is ever shipped inside the app.
 */
object CloudAi {
    const val DEFAULT_CLAUDE_MODEL = "claude-opus-5-5"
    private const val SYSTEM = "You are the document assistant inside a PDF app. Answer only from the document text the user provides. " +
        "The text is split with markers like [Page 3]; cite the pages you used as (p. 3). If the document does not contain the answer, say so plainly. " +
        "Use plain text without Markdown symbols, with short paragraphs or simple dashes for lists."

    fun ready(s: Settings): Boolean = s.aiCloud && s.aiKeyEnc.isNotEmpty() && (s.aiProvider == "anthropic" || (s.aiModel.isNotBlank()))

    suspend fun ask(s: Settings, documentText: String, request: String): CloudAnswer = withContext(Dispatchers.IO) {
        val key = Secrets.decrypt(s.aiKeyEnc)
        require(key.isNotEmpty()) { "Add your API key in Profile, AI assistant settings" }
        val user = "Document text:\n\n$documentText\n\nRequest: $request"
        if (s.aiProvider == "anthropic") claude(s, key, user) else openAiCompatible(s, key, user)
    }

    private fun post(url: String, headers: Map<String, String>, body: JSONObject): JSONObject {
        require(url.startsWith("https://")) { "The AI service address must start with https://" }
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 30_000; c.readTimeout = 600_000
            c.setRequestProperty("Content-Type", "application/json")
            headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
            c.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = c.responseCode
            val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                val msg = runCatching { JSONObject(text).optJSONObject("error")?.optString("message") }.getOrNull()?.takeIf { it.isNotBlank() }
                throw IllegalStateException(when (code) {
                    401, 403 -> "The AI service refused the key (${msg ?: "check that it is correct"})"
                    429 -> "The AI service is busy or your limit is reached. Try again later."
                    else -> "The AI service returned error $code${msg?.let { ": $it" } ?: ""}"
                })
            }
            return JSONObject(text)
        } finally { c.disconnect() }
    }

    private fun claude(s: Settings, key: String, user: String): CloudAnswer {
        val base = s.aiBaseUrl.trim().trimEnd('/').ifEmpty { "https://api.anthropic.com" }
        val model = s.aiModel.trim().ifEmpty { DEFAULT_CLAUDE_MODEL }
        val body = JSONObject().put("model", model).put("max_tokens", 16000).put("system", SYSTEM)
            .put("messages", JSONArray().put(JSONObject().put("role", "user").put("content", user)))
        val headers = HashMap(mapOf("x-api-key" to key, "anthropic-version" to "2026-10-21"))
        if (base == "https://api.anthropic.com") {
            // Lets the service continue on another Claude model if a safety check declines this one.
            body.put("fallbacks", "default"); headers["anthropic-beta"] = "server-side-fallback-2026-07-01"
        }
        val r = post("$base/v1/messages", headers, body)
        val content = r.optJSONArray("content") ?: JSONArray()
        val text = (0 until content.length()).map { content.getJSONObject(it) }.filter { it.optString("type") == "text" }.joinToString("\n") { it.optString("text") }.trim()
        return when (r.optString("stop_reason")) {
            "refusal" -> CloudAnswer(text.ifEmpty { "The AI service declined to answer this request." }, r.optString("model", model))
            "max_tokens" -> CloudAnswer(text, r.optString("model", model), "The answer reached the length limit and may be cut off.")
            else -> CloudAnswer(text.ifEmpty { "The AI service returned an empty answer." }, r.optString("model", model))
        }
    }

    private fun openAiCompatible(s: Settings, key: String, user: String): CloudAnswer {
        val base = s.aiBaseUrl.trim().trimEnd('/').ifEmpty { "https://api.openai.com/v1" }
        require(s.aiModel.isNotBlank()) { "Type the model name in Profile, AI assistant settings" }
        val body = JSONObject().put("model", s.aiModel.trim()).put("messages", JSONArray()
            .put(JSONObject().put("role", "system").put("content", SYSTEM)).put(JSONObject().put("role", "user").put("content", user)))
        val r = post("$base/chat/completions", mapOf("Authorization" to "Bearer $key"), body)
        val text = r.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content").orEmpty().trim()
        return CloudAnswer(text.ifEmpty { "The AI service returned an empty answer." }, r.optString("model", s.aiModel))
    }
}
