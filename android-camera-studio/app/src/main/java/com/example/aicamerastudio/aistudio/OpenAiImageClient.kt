package com.example.aicamerastudio.aistudio

import org.json.JSONException
import org.json.JSONObject
import java.util.Base64

data class HttpResponse(val code: Int, val body: String)

/** Minimal HTTP abstraction so the client can be tested without the network. */
fun interface HttpTransport {
    fun postJson(url: String, headers: Map<String, String>, body: String): HttpResponse
}

/**
 * Text to image through OpenAI's Images API with the user's own key.
 * Only the prompt text is sent. Nothing from the camera or gallery is uploaded.
 */
class OpenAiImageClient(private val transport: HttpTransport, private val endpoint: String = ENDPOINT) {

    companion object {
        const val ENDPOINT = "https://api.openai.com/v1/images/generations"
        const val DEFAULT_MODEL = "gpt-image-1"

        fun buildBody(r: OnlineRequest): String {
            val o = JSONObject()
                .put("model", r.model.trim().ifEmpty { DEFAULT_MODEL })
                .put("prompt", r.prompt)
                .put("n", PromptRules.clampCount(r.count))
                .put("size", r.size.api)
            if (r.model.startsWith("dall-e")) {
                // Older models return URLs by default; ask for inline data so nothing else is fetched.
                o.put("response_format", "b64_json")
            } else {
                o.put("quality", r.quality.api)
            }
            return o.toString()
        }

        /** Parses a response into decoded image bytes, or throws a [GenException] that says what went wrong. */
        fun parse(resp: HttpResponse): List<ByteArray> {
            if (resp.code in 200..299) {
                try {
                    val data = JSONObject(resp.body).getJSONArray("data")
                    val out = ArrayList<ByteArray>()
                    for (i in 0 until data.length()) {
                        val b64 = data.getJSONObject(i).optString("b64_json", "")
                        if (b64.isNotEmpty()) out += Base64.getDecoder().decode(b64)
                    }
                    if (out.isEmpty()) throw GenException(GenException.Kind.BAD_RESPONSE, "The service answered without any image.")
                    return out
                } catch (e: JSONException) {
                    throw GenException(GenException.Kind.BAD_RESPONSE, "The service sent a response that could not be read.", e)
                } catch (e: IllegalArgumentException) {
                    throw GenException(GenException.Kind.BAD_RESPONSE, "The image data from the service was damaged.", e)
                }
            }
            val err = runCatching { JSONObject(resp.body).getJSONObject("error") }.getOrNull()
            val code = err?.optString("code", "").orEmpty()
            val type = err?.optString("type", "").orEmpty()
            val msg = err?.optString("message", "").orEmpty().take(300)
            val detail = if (msg.isNotBlank()) " ($msg)" else ""
            throw when {
                resp.code == 401 -> GenException(GenException.Kind.AUTH, "The API key was refused. Check it in the AI studio settings.$detail")
                code == "insufficient_quota" || code == "billing_hard_limit_reached" || type == "insufficient_quota" ->
                    GenException(GenException.Kind.QUOTA, "Your OpenAI account has no remaining credit or reached its limit.$detail")
                resp.code == 429 -> GenException(GenException.Kind.RATE_LIMIT, "Too many requests right now. Wait a moment and try again.$detail")
                code == "moderation_blocked" || code == "content_policy_violation" || type == "image_generation_user_error" && msg.contains("safety", true) ->
                    GenException(GenException.Kind.POLICY, "The request was blocked by OpenAI's safety system. Change the description.$detail")
                resp.code in 400..499 -> GenException(GenException.Kind.BAD_REQUEST, "The request was not accepted.$detail")
                else -> GenException(GenException.Kind.SERVER, "The image service had a problem (HTTP ${resp.code}). Try again later.")
            }
        }
    }

    fun generate(apiKey: String, r: OnlineRequest): List<ByteArray> {
        if (apiKey.isBlank()) throw GenException(GenException.Kind.NO_KEY, "Add your OpenAI API key first.")
        val resp = try {
            transport.postJson(endpoint, mapOf("Authorization" to "Bearer ${apiKey.trim()}", "Content-Type" to "application/json"), buildBody(r))
        } catch (e: GenException) {
            throw e
        } catch (e: java.io.IOException) {
            throw GenException(GenException.Kind.NETWORK, "Could not reach the image service. Check your internet connection.", e)
        }
        return parse(resp)
    }
}
