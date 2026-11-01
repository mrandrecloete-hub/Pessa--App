package com.example.aicamerastudio.photo.pipeline

/** Tuning constants of one named look. Every field maps to a real processing operation. */
data class ProfileTuning(
    /** Target median brightness on the encoded 0..1 axis. */
    val targetMedian: Float,
    val maxEvUp: Float,
    val maxEvDown: Float,
    val shadowLift: Float,
    val highlightRecover: Float,
    val contrast: Float,
    val saturation: Float,
    val vibrance: Float,
    /** How strongly a detected colour cast is corrected, 0..1. */
    val whiteBalance: Float,
    val sharpen: Float,
    /** Multiplier on the noise driven denoise strength. */
    val denoiseBias: Float,
)

enum class EnhancementProfile(val label: String, val description: String, val tuning: ProfileTuning) {
    NATURAL(
        "Natural", "Faithful colour and gentle tone correction.",
        ProfileTuning(0.46f, 1.0f, 0.7f, 0.15f, 0.15f, 0.05f, 1.02f, 0.08f, 0.40f, 0.35f, 1.0f),
    ),
    IPHONE_INSPIRED(
        "iPhone-inspired", "An original look with lifted shadows, bright clean highlights and punchy colour. Not Apple's processing.",
        ProfileTuning(0.48f, 1.0f, 0.7f, 0.35f, 0.25f, 0.12f, 1.06f, 0.18f, 0.50f, 0.50f, 1.0f),
    ),
    PROFESSIONAL(
        "Professional", "Neutral colour with controlled contrast, suited to later editing.",
        ProfileTuning(0.45f, 0.8f, 0.7f, 0.20f, 0.20f, 0.10f, 1.00f, 0.05f, 0.60f, 0.45f, 1.0f),
    ),
    NIGHT(
        "Night", "Stronger brightening and noise reduction for dark scenes. Works on a single frame.",
        ProfileTuning(0.42f, 1.6f, 0.4f, 0.50f, 0.30f, 0.05f, 1.04f, 0.10f, 0.50f, 0.25f, 1.6f),
    ),
    PORTRAIT(
        "Portrait", "Softer sharpening and skin friendly colour. There is no face detection yet, so it applies to the whole frame.",
        ProfileTuning(0.50f, 0.9f, 0.6f, 0.20f, 0.25f, 0.03f, 1.00f, 0.06f, 0.50f, 0.15f, 1.2f),
    ),
    MAX_DETAIL(
        "Maximum detail", "Stronger sharpening with careful noise control. Detail is enhanced, not reconstructed.",
        ProfileTuning(0.46f, 1.0f, 0.7f, 0.25f, 0.20f, 0.12f, 1.03f, 0.10f, 0.40f, 0.90f, 0.9f),
    ),
}
