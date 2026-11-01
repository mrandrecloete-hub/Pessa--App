package com.example.aicamerastudio.photo.pipeline

/**
 * Complete, validated description of one enhancement pass.
 * Ranges are enforced by [validated]; the pipeline always calls it before processing.
 */
data class EnhancementParams(
    val exposureEv: Float = 0f,
    val contrast: Float = 0f,
    val highlights: Float = 0f,
    val shadows: Float = 0f,
    val blackPoint: Float = 0f,
    val whitePoint: Float = 1f,
    val saturation: Float = 1f,
    val vibrance: Float = 0f,
    val temperature: Float = 0f,
    val tint: Float = 0f,
    val gainR: Float = 1f,
    val gainG: Float = 1f,
    val gainB: Float = 1f,
    val denoiseStrength: Float = 0f,
    val denoiseRadius: Int = 1,
    val denoiseRangeSigma: Float = 10f,
    val sharpenAmount: Float = 0f,
    val sharpenThreshold: Float = 2f,
    val sharpenLimit: Float = 40f,
) {
    fun validated(): EnhancementParams = copy(
        exposureEv = exposureEv.coerceIn(-3f, 3f),
        contrast = contrast.coerceIn(-1f, 0.8f),
        highlights = highlights.coerceIn(-1f, 1f),
        shadows = shadows.coerceIn(-1f, 1f),
        blackPoint = blackPoint.coerceIn(0f, 0.3f),
        whitePoint = whitePoint.coerceIn(0.6f, 1f),
        saturation = saturation.coerceIn(0f, 2f),
        vibrance = vibrance.coerceIn(-1f, 1f),
        temperature = temperature.coerceIn(-1f, 1f),
        tint = tint.coerceIn(-1f, 1f),
        gainR = gainR.coerceIn(0.5f, 2f),
        gainG = gainG.coerceIn(0.5f, 2f),
        gainB = gainB.coerceIn(0.5f, 2f),
        denoiseStrength = denoiseStrength.coerceIn(0f, 1f),
        denoiseRadius = denoiseRadius.coerceIn(1, 3),
        denoiseRangeSigma = denoiseRangeSigma.coerceIn(2f, 60f),
        sharpenAmount = sharpenAmount.coerceIn(0f, 2f),
        sharpenThreshold = sharpenThreshold.coerceIn(0f, 30f),
        sharpenLimit = sharpenLimit.coerceIn(5f, 80f),
    ).let { v ->
        // keep the white point strictly above the black point
        if (v.whitePoint - v.blackPoint < 0.3f) v.copy(blackPoint = v.whitePoint - 0.3f) else v
    }

    val hasDenoise: Boolean get() = denoiseStrength > 0.001f
    val hasSharpen: Boolean get() = sharpenAmount > 0.001f

    fun isIdentity(): Boolean {
        val v = validated()
        return v == EnhancementParams().validated()
    }

    /** Radius of neighbourhood context needed above and below a band so band edges match a whole-image run. */
    fun haloRows(): Int = (if (validated().hasDenoise) validated().denoiseRadius else 0) + 1
}

enum class ProcessingLevel(val label: String, val denoiseRadius: Int, val note: String) {
    QUICK("Quick", 1, "Fastest. Light noise reduction. Lowest battery and memory use."),
    BALANCED("Balanced", 2, "Good quality at a reasonable speed."),
    MAXIMUM("Maximum quality", 3, "Strongest noise reduction. Slower and uses more time, memory, battery power and storage."),
}
