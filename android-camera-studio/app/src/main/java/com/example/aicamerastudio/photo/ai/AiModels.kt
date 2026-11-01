package com.example.aicamerastudio.photo.ai

import android.content.Context
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorCode

/**
 * Lazily loads the bundled models from assets. Each model is loaded once and kept until [release]
 * (called when the system is low on memory). Loading failures are reported, never hidden.
 */
class AiModels(private val context: Context) {
    private val cache = HashMap<String, OnnxModel>()

    @Synchronized
    fun get(name: String): OnnxModel = cache.getOrPut(name) {
        try {
            val bytes = context.assets.open(name).use { it.readBytes() }
            OnnxModel(bytes, threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4), tryXnnpack = true)
        } catch (e: UnsatisfiedLinkError) {
            throw ModelUnavailable("The AI runtime could not start on this device.", e)
        } catch (e: OutOfMemoryError) {
            throw ModelUnavailable("Not enough memory to load the AI model. Close other apps and try again.", e)
        } catch (e: Exception) {
            throw ModelUnavailable("The AI model could not be loaded: ${e.message ?: e.javaClass.simpleName}", e)
        }
    }

    @Synchronized
    fun release() { cache.values.forEach { runCatching { it.close() } }; cache.clear() }
}

class ModelUnavailable(message: String, cause: Throwable?) : Exception(message, cause) {
    fun toAppError() = AppError(ErrorCode.MODEL_UNAVAILABLE, message ?: "AI model unavailable.", "The non AI tools still work.", true, true)
}
