package com.example.aicamerastudio.beauty

import com.example.aicamerastudio.camera.engine.VideoBitrates
import org.junit.Assert.*
import org.junit.Test

class VideoBitratesTest {
    @Test fun higherResolutionGetsHigherBitrate() {
        val h = listOf(480, 720, 1080, 2160).map { VideoBitrates.target(it, 30) }
        assertEquals(h, h.sorted()); assertEquals(h.size, h.toSet().size)
    }

    @Test fun targetsAreAtLeastDoubleTheOldFullHdDefault() {
        // CameraX's own 1080p default is about 10 to 12 Mbps.
        assertTrue(VideoBitrates.target(1080, 30) >= 20_000_000)
        assertEquals(50_000_000, VideoBitrates.target(2160, 30))
        assertEquals(24_000_000, VideoBitrates.target(1080, null))
    }

    @Test fun highFrameRatesGetMore() {
        assertTrue(VideoBitrates.target(1080, 60) > VideoBitrates.target(1080, 30))
        assertTrue(VideoBitrates.target(1080, 24) == VideoBitrates.target(1080, 30))
        assertTrue(VideoBitrates.target(2160, 60) <= 100_000_000)
    }
}
