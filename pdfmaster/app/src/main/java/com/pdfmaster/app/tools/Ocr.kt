package com.pdfmaster.app.tools

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.pdfmaster.app.engine.OcrLine
import kotlinx.coroutines.tasks.await

/** Text recognition on the phone with Google ML Kit (Latin script model bundled in the app, no internet needed). */
object Ocr {
    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    /** Recognised lines with boxes as fractions of the picture, top to bottom. */
    suspend fun lines(bitmap: Bitmap): List<OcrLine> {
        val result = recognizer.process(InputImage.fromBitmap(bitmap, 0)).await()
        val w = bitmap.width.toFloat(); val h = bitmap.height.toFloat()
        return result.textBlocks.flatMap { b -> b.lines }.mapNotNull { l ->
            val r = l.boundingBox ?: return@mapNotNull null
            OcrLine(l.text, (r.left / w).coerceIn(0f, 1f), (r.top / h).coerceIn(0f, 1f), (r.right / w).coerceIn(0f, 1f), (r.bottom / h).coerceIn(0f, 1f))
        }.sortedWith(compareBy({ (it.top * 200).toInt() }, { it.left }))
    }
}
