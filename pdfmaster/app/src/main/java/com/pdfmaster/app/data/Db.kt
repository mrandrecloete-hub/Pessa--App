package com.pdfmaster.app.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

/** A file kept in the app's library. Only facts about the file are stored here, never its contents. */
@Entity(tableName = "documents")
data class Doc(
    @PrimaryKey val id: String,
    val name: String,          // display name with extension
    val path: String,          // absolute path inside the app's private library folder
    val ext: String,
    val size: Long,
    val pages: Int,            // 0 when unknown or not a PDF
    val category: String,      // one of Category.*
    val favourite: Boolean = false,
    val locked: Boolean = false,
    val addedAt: Long = System.currentTimeMillis(),
    val openedAt: Long = 0,
    val sharedAt: Long = 0
) { val isPdf: Boolean get() = ext == "pdf" }

object Category {
    const val IMPORTED = "imported"; const val CONVERTED = "converted"; const val SCANNED = "scanned"
    const val SIGNED = "signed"; const val EDITED = "edited"
}

@Entity(tableName = "bookmarks", primaryKeys = ["docId", "page"])
data class Bookmark(val docId: String, val page: Int, val label: String, val at: Long = System.currentTimeMillis())

/** One finished or failed job, shown as activity on Home and in conversion history. */
@Entity(tableName = "history")
data class History(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val tool: String, val title: String, val detail: String, val ok: Boolean,
    val outputIds: String = "",   // comma separated Doc ids
    val inputIds: String = "",
    val options: String = "",     // key=value lines, so a failed job can be retried
    val at: Long = System.currentTimeMillis()
)

@Entity(tableName = "signatures")
data class Signature(@PrimaryKey val id: String, val name: String, val path: String, val kind: String, val createdAt: Long = System.currentTimeMillis())

/** A saved set of answers that can be applied to a form again. */
@Entity(tableName = "form_templates")
data class FormTemplate(@PrimaryKey(autoGenerate = true) val id: Long = 0, val name: String, val values: String, val createdAt: Long = System.currentTimeMillis())

@Dao
interface DocDao {
    @Query("SELECT * FROM documents ORDER BY addedAt DESC") fun all(): Flow<List<Doc>>
    @Query("SELECT * FROM documents WHERE id = :id") suspend fun get(id: String): Doc?
    @Query("SELECT * FROM documents WHERE id = :id") fun watch(id: String): Flow<Doc?>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun put(doc: Doc)
    @Update suspend fun update(doc: Doc)
    @Query("DELETE FROM documents WHERE id = :id") suspend fun delete(id: String)
    @Query("UPDATE documents SET favourite = :fav WHERE id = :id") suspend fun setFavourite(id: String, fav: Boolean)
    @Query("UPDATE documents SET openedAt = :at WHERE id = :id") suspend fun touch(id: String, at: Long)
    @Query("UPDATE documents SET sharedAt = :at WHERE id = :id") suspend fun shared(id: String, at: Long)

    @Query("SELECT * FROM bookmarks WHERE docId = :docId ORDER BY page") fun bookmarks(docId: String): Flow<List<Bookmark>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putBookmark(b: Bookmark)
    @Query("DELETE FROM bookmarks WHERE docId = :docId AND page = :page") suspend fun deleteBookmark(docId: String, page: Int)
    @Query("DELETE FROM bookmarks WHERE docId = :docId") suspend fun deleteBookmarks(docId: String)

    @Query("SELECT * FROM history ORDER BY at DESC LIMIT 200") fun history(): Flow<List<History>>
    @Insert suspend fun addHistory(h: History)
    @Query("DELETE FROM history") suspend fun clearHistory()

    @Query("SELECT * FROM signatures ORDER BY createdAt DESC") fun signatures(): Flow<List<Signature>>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun putSignature(s: Signature)
    @Query("DELETE FROM signatures WHERE id = :id") suspend fun deleteSignature(id: String)

    @Query("SELECT * FROM form_templates ORDER BY createdAt DESC") fun templates(): Flow<List<FormTemplate>>
    @Insert suspend fun addTemplate(t: FormTemplate)
    @Query("DELETE FROM form_templates WHERE id = :id") suspend fun deleteTemplate(id: Long)
}

@Database(entities = [Doc::class, Bookmark::class, History::class, Signature::class, FormTemplate::class], version = 1, exportSchema = false)
abstract class AppDb : RoomDatabase() { abstract fun dao(): DocDao }
