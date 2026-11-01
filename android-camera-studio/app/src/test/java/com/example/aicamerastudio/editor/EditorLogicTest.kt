package com.example.aicamerastudio.editor

import com.example.aicamerastudio.core.common.JobState
import com.example.aicamerastudio.core.errors.*
import com.example.aicamerastudio.editor.photo.*
import com.example.aicamerastudio.editor.video.TrimConfig
import org.junit.Assert.*
import org.junit.Test
import java.io.FileNotFoundException
import java.io.IOException
import java.util.concurrent.CancellationException

class EditorLogicTest {
    @Test fun codecRoundTrip() {
        val p = EditParams(exposureEv = 0.5f, contrast = 0.2f, saturation = 1.2f, quarterTurns = 3, flipHorizontal = true, crop = CropAspect.R16_9, sharpen = 0.4f)
        assertEquals(p.validated(), EditParamsCodec.decode(EditParamsCodec.encode(p)))
    }
    @Test fun codecRejectsGarbageAndNewerVersions() {
        assertNull(EditParamsCodec.decode(null))
        assertNull(EditParamsCodec.decode("hello"))
        assertNull(EditParamsCodec.decode("v=99;ev=1"))
        assertNull(EditParamsCodec.decode("v=1;ev=notanumber"))
        assertNull(EditParamsCodec.decode("v=1;ev=NaN"))
    }
    @Test fun codecIgnoresUnknownKeysAndClampsValues() {
        val d = EditParamsCodec.decode("v=1;ev=50;zz=1")!!
        assertEquals(3f, d.exposureEv, 0f)
    }
    @Test fun defaultsEncodeAsDefault() {
        assertTrue(EditParamsCodec.decode(EditParamsCodec.encode(EditParams()))!!.isDefault)
    }
    @Test fun historyUndoRedoAndBranching() {
        val h = EditHistory(EditParams())
        h.push(EditParams(exposureEv = 1f)); h.push(EditParams(exposureEv = 2f))
        assertEquals(2f, h.current.exposureEv, 0f)
        assertEquals(1f, h.undo().exposureEv, 0f)
        assertTrue(h.canRedo)
        h.push(EditParams(contrast = 0.5f))
        assertFalse(h.canRedo)
        assertEquals(0.5f, h.current.contrast, 0f)
        assertEquals(1f, h.undo().exposureEv, 0f)
        assertEquals(0f, h.undo().exposureEv, 0f)
        assertFalse(h.canUndo)
        h.reset(EditParams()); assertFalse(h.canUndo)
    }
    @Test fun historyIgnoresNoOpAndHonoursLimit() {
        val h = EditHistory(0, limit = 3)
        h.push(0); assertFalse(h.canUndo)
        for (i in 1..10) h.push(i)
        assertEquals(10, h.current)
        var steps = 0; while (h.canUndo) { h.undo(); steps++ }
        assertEquals(2, steps)
    }
    @Test fun cropGeometry() {
        assertEquals(CropGeometry.Box(0, 0, 400, 300), CropGeometry.centerCrop(400, 300, null))
        assertEquals(CropGeometry.Box(50, 0, 300, 300), CropGeometry.centerCrop(400, 300, 1f))
        assertEquals(CropGeometry.Box(0, 75, 400, 150), CropGeometry.centerCrop(400, 300, 8f / 3f))
        val tall = CropGeometry.centerCrop(300, 400, 16f / 9f)
        assertEquals(300, tall.width); assertEquals(168, tall.height)
        assertEquals(400 to 300, CropGeometry.rotatedSize(300, 400, 1))
        assertEquals(300 to 400, CropGeometry.rotatedSize(300, 400, 2))
        assertEquals(400 to 300, CropGeometry.rotatedSize(300, 400, -1))
    }
    @Test fun aspectRatiosAreRight() {
        val b = CropGeometry.centerCrop(4000, 3000, CropAspect.R16_9.ratio)
        assertEquals(16f / 9f, b.width.toFloat() / b.height, 0.01f)
    }
    @Test fun toEnhancementMapsEveryField() {
        val e = EditParams(exposureEv = 1f, sharpen = 1f, denoise = 0.5f).toEnhancement()
        assertEquals(1f, e.exposureEv, 0f); assertEquals(1.5f, e.sharpenAmount, 0f); assertTrue(e.hasDenoise)
    }
    @Test fun trimValidation() {
        assertNull(TrimConfig.validate(TrimConfig(10_000, 1000, 5000)))
        assertNotNull(TrimConfig.validate(TrimConfig(10_000, 5000, 5100)))
        assertNotNull(TrimConfig.validate(TrimConfig(10_000, -1, 5000)))
        assertNotNull(TrimConfig.validate(TrimConfig(10_000, 0, 12_000)))
        assertNotNull(TrimConfig.validate(TrimConfig(0, 0, 0)))
        assertTrue(TrimConfig(10_000, 0, 10_000).isFullClip)
    }
    @Test fun jobStateTransitions() {
        assertEquals(JobState.RUNNING, JobState.QUEUED.moveTo(JobState.RUNNING))
        assertTrue(JobState.RUNNING.canMoveTo(JobState.SUCCEEDED))
        assertFalse(JobState.SUCCEEDED.canMoveTo(JobState.QUEUED))
        assertTrue(JobState.FAILED.canMoveTo(JobState.QUEUED))
        assertFalse(JobState.QUEUED.canMoveTo(JobState.SUCCEEDED))
        assertThrows(IllegalArgumentException::class.java) { JobState.CANCELLED.moveTo(JobState.SUCCEEDED) }
        assertTrue(JobState.SUCCEEDED.isTerminal)
    }
    @Test fun errorMapping() {
        assertEquals(ErrorCode.INSUFFICIENT_MEMORY, ErrorMapper.map(OutOfMemoryError()).code)
        assertEquals(ErrorCode.INTERRUPTED, ErrorMapper.map(CancellationException()).code)
        assertEquals(ErrorCode.INVALID_MEDIA, ErrorMapper.map(FileNotFoundException()).code)
        assertEquals(ErrorCode.INSUFFICIENT_STORAGE, ErrorMapper.map(IOException("write failed: ENOSPC (No space left on device)")).code)
        assertEquals(ErrorCode.MEDIA_PROVIDER, ErrorMapper.map(SecurityException()).code)
        assertEquals(ErrorCode.CORRUPTED_MEDIA, ErrorMapper.map(IllegalStateException("Failed to decode image")).code)
        assertEquals(ErrorCode.UNKNOWN, ErrorMapper.map(RuntimeException()).code)
        assertEquals(ErrorCode.CAMERA_UNAVAILABLE, ErrorMapper.map(AppException(Errors.cameraUnavailable())).code)
    }
    @Test fun everyErrorExplainsOriginalAndRetry() {
        val msg = Errors.lowMemory().asMessage()
        assertTrue(msg.contains("original file is safe")); assertTrue(msg.contains("try again"))
        assertFalse(Errors.invalidMedia().asMessage().contains("try again"))
    }
}
