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

/**
 * A removal or placement project. Masks are stored as files (see ProjectFiles), never in the database.
 * [params] is the current LayerCodec text, [history] the undo states (one LayerCodec text per line).
 */
@Entity(tableName = "composite_project")
data class CompositeProject(
    @PrimaryKey val id: String,
    val kind: String,              // "remove" | "place"
    val sourceUri: String,
    val destUri: String?,
    val params: String?,
    val history: String?,
    val maskFile: String?,
    val occluderFile: String?,
    val sourceCrop: String?,       // normalised x,y,w,h of the person in the source photo
    val createdAt: Long,
    val updatedAt: Long,
    val lastExportUri: String?,
)

@Dao
interface CompositeProjectDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsert(p: CompositeProject)
    @Query("SELECT * FROM composite_project WHERE id = :id") suspend fun get(id: String): CompositeProject?
    @Query("SELECT * FROM composite_project ORDER BY updatedAt DESC LIMIT 50") fun recent(): Flow<List<CompositeProject>>
    @Query("DELETE FROM composite_project WHERE id = :id") suspend fun delete(id: String)
}

@Entity(tableName = "album")
data class Album(@PrimaryKey val id: String, val name: String, val createdAt: Long)

@Entity(tableName = "album_item", primaryKeys = ["albumId", "uri"], indices = [Index("uri")])
data class AlbumItem(val albumId: String, val uri: String, val addedAt: Long)

@Entity(tableName = "favourite")
data class Favourite(@PrimaryKey val uri: String, val addedAt: Long)

data class AlbumWithCount(val id: String, val name: String, val createdAt: Long, val count: Int, val cover: String?)

@Dao
interface LibraryDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun addFavourite(f: Favourite)
    @Query("DELETE FROM favourite WHERE uri = :uri") suspend fun removeFavourite(uri: String)
    @Query("SELECT uri FROM favourite ORDER BY addedAt DESC") fun favourites(): Flow<List<String>>
    @Query("SELECT COUNT(*) FROM favourite WHERE uri = :uri") fun isFavourite(uri: String): Flow<Int>

    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun addAlbum(a: Album)
    @Query("DELETE FROM album WHERE id = :id") suspend fun deleteAlbum(id: String)
    @Query("DELETE FROM album_item WHERE albumId = :id") suspend fun clearAlbum(id: String)
    @Query("UPDATE album SET name = :name WHERE id = :id") suspend fun renameAlbum(id: String, name: String)
    @Insert(onConflict = OnConflictStrategy.IGNORE) suspend fun addToAlbum(i: AlbumItem)
    @Query("DELETE FROM album_item WHERE albumId = :id AND uri = :uri") suspend fun removeFromAlbum(id: String, uri: String)
    @Query("SELECT a.id, a.name, a.createdAt, COUNT(i.uri) AS count, (SELECT uri FROM album_item WHERE albumId = a.id ORDER BY addedAt DESC LIMIT 1) AS cover " +
        "FROM album a LEFT JOIN album_item i ON i.albumId = a.id GROUP BY a.id ORDER BY a.createdAt DESC")
    fun albums(): Flow<List<AlbumWithCount>>
    @Query("SELECT uri FROM album_item WHERE albumId = :id ORDER BY addedAt DESC") fun albumItems(id: String): Flow<List<String>>
    /** Forget a deleted file everywhere. */
    @Query("DELETE FROM album_item WHERE uri = :uri") suspend fun forgetInAlbums(uri: String)
}

@Database(entities = [MediaAsset::class, EditSession::class, CompositeProject::class, Album::class, AlbumItem::class, Favourite::class], version = 3, exportSchema = true)
abstract class AppDatabase : RoomDatabase() {
    abstract fun assets(): MediaAssetDao
    abstract fun sessions(): EditSessionDao
    abstract fun projects(): CompositeProjectDao
    abstract fun library(): LibraryDao

    companion object {
        /** Exact SQL Room generates for composite_project (checked against schemas/2.json by a unit test). */
        const val CREATE_COMPOSITE_PROJECT = "CREATE TABLE IF NOT EXISTS `composite_project` (`id` TEXT NOT NULL, `kind` TEXT NOT NULL, " +
            "`sourceUri` TEXT NOT NULL, `destUri` TEXT, `params` TEXT, `history` TEXT, `maskFile` TEXT, `occluderFile` TEXT, " +
            "`sourceCrop` TEXT, `createdAt` INTEGER NOT NULL, `updatedAt` INTEGER NOT NULL, `lastExportUri` TEXT, PRIMARY KEY(`id`))"

        val MIGRATION_1_2 = object : androidx.room.migration.Migration(1, 2) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) { db.execSQL(CREATE_COMPOSITE_PROJECT) }
        }

        /** Exact SQL Room generates for the version 3 tables (checked against schemas/3.json by a unit test). */
        val CREATE_V3 = listOf(
            "CREATE TABLE IF NOT EXISTS `album` (`id` TEXT NOT NULL, `name` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, PRIMARY KEY(`id`))",
            "CREATE TABLE IF NOT EXISTS `album_item` (`albumId` TEXT NOT NULL, `uri` TEXT NOT NULL, `addedAt` INTEGER NOT NULL, PRIMARY KEY(`albumId`, `uri`))",
            "CREATE INDEX IF NOT EXISTS `index_album_item_uri` ON `album_item` (`uri`)",
            "CREATE TABLE IF NOT EXISTS `favourite` (`uri` TEXT NOT NULL, `addedAt` INTEGER NOT NULL, PRIMARY KEY(`uri`))",
        )

        val MIGRATION_2_3 = object : androidx.room.migration.Migration(2, 3) {
            override fun migrate(db: androidx.sqlite.db.SupportSQLiteDatabase) { CREATE_V3.forEach { db.execSQL(it) } }
        }

        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context, AppDatabase::class.java, "aicamerastudio.db").addMigrations(MIGRATION_1_2, MIGRATION_2_3).build()
    }
}
