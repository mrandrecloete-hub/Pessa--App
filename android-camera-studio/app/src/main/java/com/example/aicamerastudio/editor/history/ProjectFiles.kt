package com.example.aicamerastudio.editor.history

import com.example.aicamerastudio.editor.masks.AlphaMask
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.util.zip.GZIPInputStream
import java.util.zip.GZIPOutputStream

/**
 * Stores project masks in app private storage: projects/<id>/<name>.mask (gzip: magic, version, width, height, bytes).
 * Ids and names are validated so no path can escape the projects folder.
 */
class ProjectFiles(root: File) {
    private val base = File(root, "projects")
    private val safe = Regex("^[A-Za-z0-9_-]{1,64}$")

    private fun dir(id: String): File {
        require(safe.matches(id)) { "Invalid project id" }
        return File(base, id)
    }

    fun saveMask(id: String, name: String, m: AlphaMask): String {
        require(safe.matches(name)) { "Invalid mask name" }
        val d = dir(id).apply { mkdirs() }
        val tmp = File(d, "$name.mask.tmp"); val f = File(d, "$name.mask")
        DataOutputStream(GZIPOutputStream(tmp.outputStream().buffered())).use { o ->
            o.writeInt(MAGIC); o.writeInt(1); o.writeInt(m.width); o.writeInt(m.height); o.write(m.toBytes())
        }
        if (!tmp.renameTo(f)) { f.delete(); tmp.renameTo(f) }
        return "$name.mask"
    }

    fun loadMask(id: String, file: String?): AlphaMask? {
        if (file == null || !safe.matches(file.removeSuffix(".mask"))) return null
        val f = File(dir(id), file); if (!f.isFile) return null
        return runCatching {
            DataInputStream(GZIPInputStream(f.inputStream().buffered())).use { i ->
                require(i.readInt() == MAGIC && i.readInt() == 1)
                val w = i.readInt(); val h = i.readInt()
                require(w in 1..10_000 && h in 1..10_000)
                val b = ByteArray(w * h); i.readFully(b)
                AlphaMask.fromBytes(w, h, b)
            }
        }.getOrNull()
    }

    fun delete(id: String) { dir(id).deleteRecursively() }

    companion object { private const val MAGIC = 0x41494353 } // "AICS"
}
