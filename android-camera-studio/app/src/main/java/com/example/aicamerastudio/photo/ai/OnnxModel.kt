package com.example.aicamerastudio.photo.ai

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer

/**
 * Thin wrapper over an ONNX Runtime session. The same code runs on Android (onnxruntime-android)
 * and in JVM unit tests (onnxruntime desktop), so inference is tested with the real models.
 */
class OnnxModel(bytes: ByteArray, threads: Int = 4, tryXnnpack: Boolean = false) : AutoCloseable {
    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    val accelerator: String
    private val session: OrtSession

    init {
        var accel = "CPU"
        val opts = OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(threads)
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            if (tryXnnpack) {
                try { addXnnpack(mapOf("intra_op_num_threads" to threads.toString())); accel = "XNNPACK" } catch (_: Throwable) { }
            }
        }
        session = env.createSession(bytes, opts)
        accelerator = accel
    }

    val inputName: String get() = session.inputNames.first()

    /** Runs the model on one float input and returns the first output with its shape. */
    fun run(data: FloatArray, shape: LongArray): Pair<FloatArray, LongArray> {
        OnnxTensor.createTensor(env, FloatBuffer.wrap(data), shape).use { input ->
            session.run(mapOf(inputName to input)).use { result ->
                val t = result.get(0) as OnnxTensor
                val buf = t.floatBuffer
                val out = FloatArray(buf.remaining()); buf.get(out)
                return out to t.info.shape
            }
        }
    }

    /** Runs the model and returns every output in the model's declared order. */
    fun runAll(data: FloatArray, shape: LongArray): List<FloatArray> {
        OnnxTensor.createTensor(env, FloatBuffer.wrap(data), shape).use { input ->
            session.run(mapOf(inputName to input)).use { result ->
                return session.outputNames.map { name ->
                    val buf = (result.get(name).get() as OnnxTensor).floatBuffer
                    FloatArray(buf.remaining()).also { buf.get(it) }
                }
            }
        }
    }

    override fun close() { session.close() }
}

/** Where model bytes come from: Android assets in the app, files in tests. */
fun interface ModelSource { fun bytes(name: String): ByteArray }

object ModelNames {
    const val SUPER_RES = "models/realesr_general_x4v3.onnx"
    const val PERSON_SEG = "models/selfie_multiclass_256x256.onnx"
    const val TAP_SELECT = "models/magic_touch.onnx"
    const val FACE_DETECT = "models/face_detection_short_range.onnx"
    const val FACE_MESH = "models/face_landmark.onnx"
}
