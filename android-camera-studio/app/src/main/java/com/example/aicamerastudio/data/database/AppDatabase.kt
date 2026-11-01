package com.example.aicamerastudio.data.database

import android.content.Context
import androidx.room.*
import kotlinx.coroutines.flow.Flow

/** One processed result linked to its original. Only metadata is stored; media stays in MediaStore. */
@Entity(tableName = "media_asset", indices = [Index("originalUri"), Index("processedUri")])
data class MediaAsset(
    @PrimaryKey val id: String,
    val kind: String,              // "enhanced" | "edited"
    val originalUri: String,
    val processedUri: String?,
    val createdAt: Long,
    val width: Int,
    val height: Int,
    val sizeBytes: Long,
    val status: String,            // JobState name
    val profile: String?,
    val note: String?,             // e.g. downscaled because of memory, reduced strength
    val processingMs: Long,
    val editSessionId: String?,
)

/** Saved editing state of one source photo so reopening restores it. */
@Entity(tableName = "edit_session")
data class EditSession(
    @PrimaryKey val id: String,    // stable id derived from the source uri
    val sourceUri: String,
    val params: String,            // EditParamsCodec text, versioned
    val updatedAt: Long,
)

@Dao
interface MediaAssetDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(a: MediaAsset)
    @Query("SELECT * FROM media_asset WHERE processedUri = :uri LIMIT 1") suspend fun byProcessed(uri: String): MediaAsset?
    @Query("SELECT * FROM media_asset WHERE originalUri = :uri AND status = 'SUCCEEDED' ORDER BY createdAt DESC LIMIT 1")
    suspend fun latestFor(uri: String): MediaAsset?
    @Query("SELECT * FROM media_asset ORDER BY createdAt DESC") fun all(): Flow<List<MediaAsset>>
    @Query("DELETE FROM media_asset WHERE processedUri = :uri OR originalUri = :uri") suspend fun forget(uri: String)
}

@Dao
interface EditSessionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(s: EditSession)
    @Query("SELECT * FROM edit_session WHERE id = :id") suspend fun get(id: String): EditSession?
}

@Database(entities = [MediaAsset::class, EditSession::class], version = 1, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun assets(): MediaAssetDao
    abstract fun sessions(): EditSessionDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "aicamerastudio.db").build()
    }
}
