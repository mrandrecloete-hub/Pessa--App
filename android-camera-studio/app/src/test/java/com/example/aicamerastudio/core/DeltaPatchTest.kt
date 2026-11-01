package com.example.aicamerastudio.core

import com.example.aicamerastudio.core.update.DeltaPatch
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest

class DeltaPatchTest {
    private fun res(name: String) = File(javaClass.classLoader!!.getResource("delta/$name")!!.toURI())

    @Test fun rebuildsTheNewFileExactly() {
        val out = ByteArrayOutputStream(); var last = 0f
        DeltaPatch.apply(res("old.bin"), res("old_to_new.patch"), out) { last = it }
        assertArrayEquals(res("new.bin").readBytes(), out.toByteArray())
        assertEquals(1f, last)
    }

    @Test fun refusesSomethingThatIsNotAPatch() {
        assertThrows(DeltaPatch.BadPatch::class.java) { DeltaPatch.apply(res("old.bin"), res("new.bin"), ByteArrayOutputStream()) }
    }

    @Test fun damagedPatchNeverGivesTheRightFile() {
        val bytes = res("old_to_new.patch").readBytes()
        val cut = File.createTempFile("cut", ".patch").apply { writeBytes(bytes.copyOf(bytes.size - 50)); deleteOnExit() }
        val out = ByteArrayOutputStream()
        val failed = runCatching { DeltaPatch.apply(res("old.bin"), cut, out) }.isFailure
        // Either it fails, or (checked by the app through SHA-256) the output differs.
        assert(failed || !out.toByteArray().contentEquals(res("new.bin").readBytes()))
    }

    /** Optional check with real release APKs: set BLAZECAM_DELTA_DIR to a folder with old.apk, new.apk, old_to_new.patch. */
    @Test fun realApks() {
        val dir = System.getenv("BLAZECAM_DELTA_DIR")?.let(::File)
        assumeTrue(dir != null && File(dir, "old_to_new.patch").exists())
        val md = MessageDigest.getInstance("SHA-256")
        val out = object : java.io.OutputStream() {
            override fun write(b: Int) { md.update(b.toByte()) }
            override fun write(b: ByteArray, off: Int, len: Int) { md.update(b, off, len) }
        }
        DeltaPatch.apply(File(dir, "old.apk"), File(dir, "old_to_new.patch"), out)
        val want = MessageDigest.getInstance("SHA-256").digest(File(dir, "new.apk").readBytes())
        assertArrayEquals(want, md.digest())
    }
}
