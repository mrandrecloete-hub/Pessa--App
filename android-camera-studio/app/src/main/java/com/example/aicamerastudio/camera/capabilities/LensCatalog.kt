package com.example.aicamerastudio.camera.capabilities

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import com.example.aicamerastudio.camera.zoom.LensSpec

/** Back lenses with their real focal lengths and sensor sizes, as Camera2 reports them. */
object LensCatalog {
    data class Catalog(val main: LensSpec?, val others: List<LensSpec>, val manualFocus: Boolean, val minFocusDiopters: Float)

    /**
     * [mainId]: the camera CameraX binds by default (often a logical multi camera).
     * [bindableIds]: back cameras CameraX can open directly.
     */
    fun read(context: Context, mainId: String, bindableIds: Set<String>): Catalog {
        val m = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        fun spec(id: String, separate: Boolean): LensSpec? = runCatching {
            val c = m.getCameraCharacteristics(id)
            val f = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.minOrNull() ?: return null
            val s = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE) ?: return null
            LensSpec(id, f, s.width, s.height, separate)
        }.getOrNull()
        val mainChars = runCatching { m.getCameraCharacteristics(mainId) }.getOrNull()
        val main = spec(mainId, false)
        val members = mainChars?.physicalCameraIds.orEmpty().mapNotNull { spec(it, false) }
        val separate = bindableIds.filter { it != mainId && it !in mainChars?.physicalCameraIds.orEmpty() }.mapNotNull { id ->
            val facing = runCatching { m.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING) }.getOrNull()
            if (facing == CameraMetadata.LENS_FACING_BACK) spec(id, true) else null
        }
        val caps = mainChars?.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)?.toList().orEmpty()
        val minFocus = mainChars?.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE) ?: 0f
        return Catalog(main, members + separate, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR in caps && minFocus > 0f, minFocus)
    }
}
