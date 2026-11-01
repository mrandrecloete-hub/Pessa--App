package com.example.aicamerastudio.camera.capabilities

import android.content.Context
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.util.Range

/** Facts read from the Camera2 API for one camera id. Nothing here is assumed or invented. */
data class CameraFacts(
    val id: String,
    val facing: String,
    val hardwareLevel: String,
    val physicalIds: List<String>,
    val focalLengthsMm: List<Float>,
    val minFocusDistanceDiopters: Float?,
    val isoRange: IntRange?,
    val exposureTimeNs: LongRange?,
    val exposureCompRange: IntRange?,
    val exposureCompStep: Float?,
    val maxJpegSize: String?,
    val supportsRaw: Boolean,
    val hasFlash: Boolean,
    val opticalStabilisation: Boolean,
    val videoStabilisation: Boolean,
    val autoFocusModes: Int,
    val fpsRanges: List<String>,
    val maxDigitalZoom: Float?,
    val capabilities: List<String>,
)

class CameraCapabilityService(private val context: Context) {
    private val manager get() = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager

    fun read(): List<CameraFacts> = manager.cameraIdList.mapNotNull { id ->
        runCatching { factsFor(id) }.getOrNull()
    }

    private fun factsFor(id: String): CameraFacts {
        val c = manager.getCameraCharacteristics(id)
        val facing = when (c.get(CameraCharacteristics.LENS_FACING)) {
            CameraMetadata.LENS_FACING_FRONT -> "Front"
            CameraMetadata.LENS_FACING_BACK -> "Back"
            CameraMetadata.LENS_FACING_EXTERNAL -> "External"
            else -> "Unknown"
        }
        val level = when (c.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)) {
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LEGACY -> "Legacy"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_LIMITED -> "Limited"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_FULL -> "Full"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_3 -> "Level 3"
            CameraMetadata.INFO_SUPPORTED_HARDWARE_LEVEL_EXTERNAL -> "External"
            else -> "Unknown"
        }
        val caps = c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.toList().orEmpty()
        val map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val jpeg = map?.getOutputSizes(ImageFormat.JPEG)?.maxByOrNull { it.width.toLong() * it.height }
        val iso: Range<Int>? = c.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE)
        val exp: Range<Long>? = c.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE)
        val ev: Range<Int>? = c.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
        val ois = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION)?.any {
            it == CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON
        } ?: false
        val eis = c.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES)?.any {
            it == CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON
        } ?: false
        val fps = c.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
            ?.sortedWith(compareBy({ it.upper }, { it.lower }))?.map { "${it.lower}-${it.upper}" }.orEmpty()
        val physical = c.physicalCameraIds.toList()
        return CameraFacts(
            id = id, facing = facing, hardwareLevel = level, physicalIds = physical,
            focalLengthsMm = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.toList().orEmpty(),
            minFocusDistanceDiopters = c.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE),
            isoRange = iso?.let { it.lower..it.upper },
            exposureTimeNs = exp?.let { it.lower..it.upper },
            exposureCompRange = ev?.let { it.lower..it.upper },
            exposureCompStep = c.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)?.toFloat(),
            maxJpegSize = jpeg?.let { "${it.width}x${it.height}" },
            supportsRaw = CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW in caps,
            hasFlash = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true,
            opticalStabilisation = ois, videoStabilisation = eis,
            autoFocusModes = c.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES)?.size ?: 0,
            fpsRanges = fps,
            maxDigitalZoom = c.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM),
            capabilities = caps.map { capName(it) },
        )
    }

    private fun capName(v: Int) = when (v) {
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR -> "Manual sensor"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW -> "RAW"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_BURST_CAPTURE -> "Burst capture"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA -> "Logical multi camera"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DEPTH_OUTPUT -> "Depth output"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_CONSTRAINED_HIGH_SPEED_VIDEO -> "High speed video"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_POST_PROCESSING -> "Manual post processing"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_READ_SENSOR_SETTINGS -> "Read sensor settings"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MOTION_TRACKING -> "Motion tracking"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_YUV_REPROCESSING -> "YUV reprocessing"
        CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_PRIVATE_REPROCESSING -> "Private reprocessing"
        else -> "Capability $v"
    }
}
