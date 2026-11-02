package com.example.aicamerastudio.camera.engine

/**
 * Video bitrates for recording. CameraX's own defaults are modest (about 10 to 12 Mbps at 1080p), which looks soft
 * in motion and on processed pictures (Beauty smoothing is hard to compress). These targets are roughly double.
 * The phone's encoder may still limit them to what it supports.
 */
object VideoBitrates {
    private const val MBPS = 1_000_000

    /** Target video bitrate in bits per second for a recording of [height] pixels (the short side, e.g. 1080) at [fps] (null = 30). */
    fun target(height: Int, fps: Int?): Int {
        val base = when {
            height >= 2160 -> 50
            height >= 1440 -> 36
            height >= 1080 -> 24
            height >= 720 -> 12
            else -> 5
        }
        val f = fps ?: 30
        val scale = if (f >= 50) 1.6 else if (f > 30) 1.25 else 1.0
        return (minOf(base * scale, 100.0) * MBPS).toInt()
    }
}
