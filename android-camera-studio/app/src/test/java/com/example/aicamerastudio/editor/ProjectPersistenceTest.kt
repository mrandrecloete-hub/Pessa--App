package com.example.aicamerastudio.editor

import com.example.aicamerastudio.data.database.AppDatabase
import com.example.aicamerastudio.editor.history.ProjectFiles
import com.example.aicamerastudio.editor.masks.AlphaMask
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.nio.file.Files

class ProjectPersistenceTest {
    @Test fun migrationSqlMatchesTheSchemaRoomExported() {
        val json = JSONObject(File("schemas/com.example.aicamerastudio.data.database.AppDatabase/2.json").readText())
        val entities = json.getJSONObject("database").getJSONArray("entities")
        val sql = (0 until entities.length()).map { entities.getJSONObject(it) }.first { it.getString("tableName") == "composite_project" }.getString("createSql")
        assertEquals(sql.replace("\${TABLE_NAME}", "composite_project"), AppDatabase.CREATE_COMPOSITE_PROJECT)
        // Version 1 tables are unchanged, so the migration only adds the new table.
        val v1 = JSONObject(File("schemas/com.example.aicamerastudio.data.database.AppDatabase/1.json").readText()).getJSONObject("database").getJSONArray("entities")
        val v2 = (0 until entities.length()).associate { entities.getJSONObject(it).let { e -> e.getString("tableName") to e.getString("createSql") } }
        for (i in 0 until v1.length()) { val e = v1.getJSONObject(i); assertEquals(e.getString("createSql"), v2[e.getString("tableName")]) }
    }

    @Test fun masksRoundTripAndPathsCannotEscape() {
        val root = Files.createTempDirectory("aics").toFile()
        val files = ProjectFiles(root)
        val m = AlphaMask(37, 21); m.brush(10f, 10f, 6f, true)
        val name = files.saveMask("abc-123", "source", m)
        val back = files.loadMask("abc-123", name)!!
        assertEquals(37, back.width); for (i in m.data.indices) assertEquals(m.data[i], back.data[i], 1f / 255f)
        assertNull(files.loadMask("abc-123", "../../etc/passwd"))
        assertNull(files.loadMask("abc-123", "missing.mask"))
        assertThrows(IllegalArgumentException::class.java) { files.saveMask("../x", "source", m) }
        assertThrows(IllegalArgumentException::class.java) { files.saveMask("ok", "a/b", m) }
        File(root, "projects/abc-123/source.mask").writeBytes(byteArrayOf(1, 2, 3))
        assertNull("corrupt file must not crash", files.loadMask("abc-123", "source.mask"))
        files.delete("abc-123"); assertFalse(File(root, "projects/abc-123").exists())
    }
}

class HistoryPersistenceTest {
    @Test fun layerHistorySurvivesSaveAndReload() {
        val h = com.example.aicamerastudio.editor.photo.EditHistory(com.example.aicamerastudio.photo.compositing.LayerParams())
        h.push(com.example.aicamerastudio.photo.compositing.LayerParams(cx = 0.2f)); h.push(com.example.aicamerastudio.photo.compositing.LayerParams(cx = 0.3f)); h.undo()
        val (list, pos) = h.snapshot()
        val text = (listOf("pos=$pos") + list.map { com.example.aicamerastudio.photo.compositing.LayerCodec.encode(it) }).joinToString("\n")
        val lines = text.lines()
        val back = com.example.aicamerastudio.editor.photo.EditHistory(com.example.aicamerastudio.photo.compositing.LayerParams())
        back.restore(lines.drop(1).mapNotNull { com.example.aicamerastudio.photo.compositing.LayerCodec.decode(it) }, lines[0].removePrefix("pos=").toInt())
        assertEquals(0.2f, back.current.cx, 1e-6f); assertTrue(back.canRedo); assertEquals(0.3f, back.redo().cx, 1e-6f)
        assertEquals(0.2f, back.undo().cx, 1e-6f); assertEquals(0.5f, back.undo().cx, 1e-6f); assertFalse(back.canUndo)
    }
}

class Version3Test {
    @Test fun migration2to3MatchesRoomSchema() {
        val json = JSONObject(File("schemas/com.example.aicamerastudio.data.database.AppDatabase/3.json").readText())
        val entities = json.getJSONObject("database").getJSONArray("entities")
        val expected = ArrayList<String>()
        for (i in 0 until entities.length()) {
            val e = entities.getJSONObject(i); val t = e.getString("tableName")
            if (t !in listOf("album", "album_item", "favourite")) continue
            expected += e.getString("createSql").replace("\${TABLE_NAME}", t)
            val idx = e.optJSONArray("indices"); if (idx != null) for (j in 0 until idx.length()) expected += idx.getJSONObject(j).getString("createSql").replace("\${TABLE_NAME}", t)
        }
        assertEquals(expected.sorted(), AppDatabase.CREATE_V3.sorted())
        // Version 2 tables are unchanged.
        val v2 = JSONObject(File("schemas/com.example.aicamerastudio.data.database.AppDatabase/2.json").readText()).getJSONObject("database").getJSONArray("entities")
        val v3 = (0 until entities.length()).associate { entities.getJSONObject(it).let { e -> e.getString("tableName") to e.getString("createSql") } }
        for (i in 0 until v2.length()) { val e = v2.getJSONObject(i); assertEquals(e.getString("createSql"), v3[e.getString("tableName")]) }
    }

    @Test fun editSettingsKeepTheFilterAndOldSavesStillOpen() {
        val p = com.example.aicamerastudio.editor.photo.EditParams(exposureEv = 0.3f, filterId = "cinematic", filterIntensity = 0.4f)
        assertEquals(p.validated(), com.example.aicamerastudio.editor.photo.EditParamsCodec.decode(com.example.aicamerastudio.editor.photo.EditParamsCodec.encode(p)))
        val old = com.example.aicamerastudio.editor.photo.EditParamsCodec.decode("v=1;ev=0.5;ct=0.1")!!
        assertEquals("natural", old.filterId); assertEquals(1f, old.filterIntensity, 0f)
        assertEquals("natural", com.example.aicamerastudio.editor.photo.EditParamsCodec.decode("v=1;fi=does-not-exist")!!.filterId)
    }
}
