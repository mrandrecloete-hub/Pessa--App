package com.example.aicamerastudio.editor.video

/** Validated trim and export settings for a single clip. */
data class TrimConfig(
    val sourceDurationMs: Long,
    val startMs: Long,
    val endMs: Long,
    val removeAudio: Boolean = false,
) {
    val durationMs: Long get() = endMs - startMs
    val isFullClip: Boolean get() = startMs == 0L && endMs == sourceDurationMs

    companion object {
        const val MIN_DURATION_MS = 500L

        /** Returns an error message, or null when the configuration is valid. */
        fun validate(c: TrimConfig): String? = when {
            c.sourceDurationMs <= 0 -> "The video length is unknown."
            c.startMs < 0 -> "The start cannot be before the beginning of the video."
            c.endMs > c.sourceDurationMs -> "The end cannot be after the end of the video."
            c.endMs - c.startMs < minOf(MIN_DURATION_MS, c.sourceDurationMs) -> "The selection is too short."
            else -> null
        }
    }
}
