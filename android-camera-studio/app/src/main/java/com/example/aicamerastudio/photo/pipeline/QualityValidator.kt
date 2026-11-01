package com.example.aicamerastudio.photo.pipeline

data class ValidationResult(val ok: Boolean, val issues: List<String>)

/** Stage 10: inspects an output for obvious artefacts relative to its input. */
object QualityValidator {
    fun validate(before: ImageStats, after: ImageStats): ValidationResult {
        val issues = mutableListOf<String>()
        if (after.highlightClip - before.highlightClip > 0.03f) {
            issues += "Highlights clipped noticeably more than in the original"
        }
        if (after.shadowClip - before.shadowClip > 0.05f) {
            issues += "Shadows crushed noticeably more than in the original"
        }
        if (kotlin.math.abs(after.meanLuma - before.meanLuma) > 0.25f) {
            issues += "Overall brightness changed by more than expected"
        }
        if (after.p995 - after.p01 < 25 && before.p995 - before.p01 >= 25) {
            issues += "Tonal range collapsed"
        }
        return ValidationResult(issues.isEmpty(), issues)
    }
}
