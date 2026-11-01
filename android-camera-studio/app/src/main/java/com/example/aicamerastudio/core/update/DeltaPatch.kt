package com.example.aicamerastudio.core.update

import java.io.DataInputStream
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.util.zip.InflaterInputStream

/**
 * Applies a BlazeCam update patch (format BLZDIF01, made by tools/update/make_patch.py): rebuilds the new
 * APK from the installed APK and a small download. The result is only used if its SHA-256 matches the
 * release's SHA256SUMS.txt, so a damaged or wrong patch can never be installed.
 */
object DeltaPatch {
    private val MAGIC = "BLZDIF01".toByteArray()
    /** No BlazeCam APK is anywhere near this; guards against a damaged header. */
    private const val MAX_NEW = 1L shl 31

    class BadPatch(msg: String) : Exception(msg)

    fun apply(old: File, patch: File, out: OutputStream, onProgress: (Float) -> Unit = {}) {
        val patchLen = patch.length()
        RandomAccessFile(old, "r").use { oldRaf ->
            val head = ByteArray(32)
            patch.inputStream().use { DataInputStream(it).readFully(head) }
            if (!head.copyOfRange(0, 8).contentEquals(MAGIC)) throw BadPatch("Not a BlazeCam patch")
            val newSize = le(head, 8); val ctrlLen = le(head, 16); val diffLen = le(head, 24)
            if (newSize !in 1..MAX_NEW || ctrlLen < 0 || diffLen < 0 || 32 + ctrlLen + diffLen > patchLen) throw BadPatch("Damaged patch header")
            val ctrl = section(patch, 32, ctrlLen)
            val diff = section(patch, 32 + ctrlLen, diffLen)
            val extra = section(patch, 32 + ctrlLen + diffLen, patchLen - 32 - ctrlLen - diffLen)
            try {
                val oldSize = oldRaf.length()
                val oldBuf = ByteArray(1 shl 16); val buf = ByteArray(1 shl 16); val num = ByteArray(8)
                var newPos = 0L; var oldPos = 0L; var lastP = 0f
                while (newPos < newSize) {
                    val x = offtin(readFully(ctrl, num)); val y = offtin(readFully(ctrl, num)); val z = offtin(readFully(ctrl, num))
                    if (x < 0 || y < 0 || newPos + x + y > newSize) throw BadPatch("Damaged patch")
                    // x bytes: diff byte + old byte (old bytes outside the old file count as 0).
                    var left = x
                    while (left > 0) {
                        val n = minOf(left, buf.size.toLong()).toInt()
                        readFully(diff, buf, n)
                        val from = oldPos; val inOld = if (from >= oldSize || from + n <= 0) 0 else n
                        if (inOld > 0) {
                            val start = maxOf(from, 0L); val skip = (start - from).toInt()
                            val count = (minOf(from + n, oldSize) - start).toInt()
                            oldRaf.seek(start); oldRaf.readFully(oldBuf, 0, count)
                            for (i in 0 until count) buf[skip + i] = (buf[skip + i] + oldBuf[i]).toByte()
                        }
                        out.write(buf, 0, n); left -= n; oldPos += n; newPos += n
                    }
                    left = y
                    while (left > 0) {
                        val n = minOf(left, buf.size.toLong()).toInt()
                        readFully(extra, buf, n); out.write(buf, 0, n); left -= n; newPos += n
                    }
                    oldPos += z
                    val p = newPos.toFloat() / newSize
                    if (p - lastP > 0.02f) { lastP = p; onProgress(p) }
                }
            } finally { ctrl.close(); diff.close(); extra.close() }
        }
        onProgress(1f)
    }

    private fun section(f: File, start: Long, len: Long): InputStream {
        val raw = f.inputStream().buffered(1 shl 16)
        var s = start; while (s > 0) { val k = raw.skip(s); if (k <= 0) throw BadPatch("Damaged patch"); s -= k }
        return InflaterInputStream(LimitedStream(raw, len), java.util.zip.Inflater(), 1 shl 16)
    }

    private class LimitedStream(private val inner: InputStream, private var left: Long) : InputStream() {
        override fun read(): Int = if (left <= 0) -1 else inner.read().also { if (it >= 0) left-- }
        override fun read(b: ByteArray, off: Int, len: Int): Int {
            if (left <= 0) return -1
            val n = inner.read(b, off, minOf(len.toLong(), left).toInt()); if (n > 0) left -= n; return n
        }
        override fun close() = inner.close()
    }

    private fun readFully(s: InputStream, b: ByteArray, n: Int = b.size): ByteArray {
        var off = 0
        while (off < n) { val k = s.read(b, off, n - off); if (k < 0) throw BadPatch("Patch ended early"); off += k }
        return b
    }

    private fun le(b: ByteArray, at: Int): Long { var v = 0L; for (i in 7 downTo 0) v = (v shl 8) or (b[at + i].toLong() and 0xff); return v }

    /** bsdiff's sign and magnitude 64 bit number. */
    private fun offtin(b: ByteArray): Long {
        var y = (b[7].toLong() and 0x7f)
        for (i in 6 downTo 0) y = (y shl 8) or (b[i].toLong() and 0xff)
        return if (b[7].toInt() and 0x80 != 0) -y else y
    }

}
