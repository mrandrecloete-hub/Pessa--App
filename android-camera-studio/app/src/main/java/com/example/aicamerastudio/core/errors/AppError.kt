package com.example.aicamerastudio.core.errors

import java.io.FileNotFoundException
import java.io.IOException
import java.util.concurrent.CancellationException

enum class ErrorCode {
    CAMERA_PERMISSION_DENIED, CAMERA_UNAVAILABLE, UNSUPPORTED_RESOLUTION, UNSUPPORTED_FRAME_RATE,
    INSUFFICIENT_STORAGE, INSUFFICIENT_MEMORY, MODEL_UNAVAILABLE, INFERENCE_FAILED, INVALID_MEDIA,
    CORRUPTED_MEDIA, EXPORT_FAILED, INTERRUPTED, UNSUPPORTED_CODEC, MEDIA_PROVIDER, CAPTURE_FAILED, NETWORK, ACCOUNT, CONTENT_POLICY, UNKNOWN,
}

/** User facing error: what happened, what to do, whether the original is safe, whether retrying can help. */
data class AppError(
    val code: ErrorCode,
    val what: String,
    val whatToDo: String,
    /** Null when no original file is involved (e.g. generating a new image). */
    val originalSafe: Boolean?,
    val retryable: Boolean,
) {
    fun asMessage(): String = buildString {
        append(what).append(' ').append(whatToDo).append(' ')
        when (originalSafe) {
            true -> append("Your original file is safe.")
            false -> append("Check your original file before continuing.")
            null -> {}
        }
        if (retryable) append(" You can try again.")
    }
}

class AppException(val error: AppError, cause: Throwable? = null) : Exception(error.what, cause)

object Errors {
    fun cameraPermissionDenied() = AppError(ErrorCode.CAMERA_PERMISSION_DENIED,
        "Camera access is turned off.", "Allow the camera in system settings to take photos and videos.", true, true)
    fun cameraUnavailable() = AppError(ErrorCode.CAMERA_UNAVAILABLE,
        "The camera could not be opened. Another app may be using it, or it was disconnected.",
        "Close other camera apps and try again.", true, true)
    fun lowStorage() = AppError(ErrorCode.INSUFFICIENT_STORAGE,
        "There is not enough free storage.", "Free some space on the device.", true, true)
    fun lowMemory() = AppError(ErrorCode.INSUFFICIENT_MEMORY,
        "The device ran out of memory while processing this file.",
        "Close other apps, or choose the Quick processing level in Settings.", true, true)
    fun invalidMedia() = AppError(ErrorCode.INVALID_MEDIA,
        "This file could not be read as a photo or video.", "Choose a different file.", true, false)
    fun corruptedMedia() = AppError(ErrorCode.CORRUPTED_MEDIA,
        "This file appears to be damaged.", "Use another copy of the file if you have one.", true, false)
    fun unsupportedCodec() = AppError(ErrorCode.UNSUPPORTED_CODEC,
        "This device cannot decode or encode the format of this video.", "Try a different video.", true, false)
    fun exportFailed() = AppError(ErrorCode.EXPORT_FAILED,
        "The export could not be completed.", "Check free storage and try again.", true, true)
    fun interrupted() = AppError(ErrorCode.INTERRUPTED,
        "Processing was stopped before it finished.", "Start it again when you are ready.", true, true)
    fun mediaProvider() = AppError(ErrorCode.MEDIA_PROVIDER,
        "The device media store refused access to this file.", "Reopen the app and try again.", true, true)
    fun captureFailed() = AppError(ErrorCode.CAPTURE_FAILED,
        "The photo could not be captured.", "Check that the camera is not covered or in use elsewhere.", true, true)
    fun unknown() = AppError(ErrorCode.UNKNOWN,
        "Something unexpected went wrong.", "Try again. If it keeps happening, restart the app.", true, true)
}

object ErrorMapper {
    fun map(t: Throwable): AppError = when {
        t is AppException -> t.error
        t is OutOfMemoryError -> Errors.lowMemory()
        t is CancellationException -> Errors.interrupted()
        t is SecurityException -> Errors.mediaProvider()
        t is FileNotFoundException -> Errors.invalidMedia()
        t is IOException && t.message.orEmpty().let { it.contains("ENOSPC") || it.contains("No space", ignoreCase = true) } ->
            Errors.lowStorage()
        t is IOException -> Errors.mediaProvider()
        t is IllegalArgumentException || t is IllegalStateException ->
            if (t.message.orEmpty().contains("decode", ignoreCase = true)) Errors.corruptedMedia() else Errors.unknown()
        else -> Errors.unknown()
    }
}
