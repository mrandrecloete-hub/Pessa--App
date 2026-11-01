package com.example.aicamerastudio.core.storage

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.StatFs
import android.provider.MediaStore
import android.util.Size
import com.example.aicamerastudio.core.errors.AppException
import com.example.aicamerastudio.core.errors.Errors
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class MediaItem(
    val uri: Uri,
    val isVideo: Boolean,
    val name: String,
    val dateMs: Long,
    val sizeBytes: Long,
    val width: Int,
    val height: Int,
) {
    val isEnhanced: Boolean get() = name.contains("_enh")
    val isEdited: Boolean get() = name.contains("_edit") || name.contains("_trim") || name.contains("_composite") || name.contains("_removed")
    val isGenerated: Boolean get() = name.contains("_gen")
    val isZoom: Boolean get() = name.contains("_zoom")
    val isNight: Boolean get() = name.contains("_night")
    val isHdr: Boolean get() = name.contains("_hdr")
    val isLook: Boolean get() = name.contains("_look")
    val isComposite: Boolean get() = name.contains("_composite") || name.contains("_removed")
}

/** All app media lives in MediaStore folders owned by this app, so no storage permission is needed. */
class MediaStoreRepository(private val context: Context) {
    private val resolver: ContentResolver get() = context.contentResolver

    companion object {
        const val FOLDER = "BlazeCam"
        /** Folder used before the BlazeCam name; still shown in the gallery. */
        const val LEGACY_FOLDER = "AI Camera Studio"
        const val PHOTO_PATH = "Pictures/$FOLDER"
        const val VIDEO_PATH = "Movies/$FOLDER"
        val ALL_PATHS = listOf(PHOTO_PATH, VIDEO_PATH, "DCIM/$FOLDER", "Pictures/$LEGACY_FOLDER", "Movies/$LEGACY_FOLDER")
        const val MIN_PHOTO_FREE = 100L * 1024 * 1024
        const val MIN_VIDEO_FREE = 300L * 1024 * 1024

        fun timestampName(prefix: String, suffix: String = ""): String =
            prefix + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + suffix
    }

    fun freeBytes(): Long = StatFs(Environment.getDataDirectory().path).availableBytes

    fun requireFree(minBytes: Long) {
        if (freeBytes() < minBytes) throw AppException(Errors.lowStorage())
    }

    /** Where new photos go (Settings > Save location). Videos always go to Movies/BlazeCam. */
    @Volatile var photoPath: String = PHOTO_PATH

    fun photoValues(displayName: String, mime: String = "image/jpeg", ext: String = "jpg") = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "$displayName.$ext")
        put(MediaStore.Images.Media.MIME_TYPE, mime)
        put(MediaStore.Images.Media.RELATIVE_PATH, photoPath)
    }

    /** Bytes used by BlazeCam's own photos and videos, and how many there are. */
    fun usage(): Pair<Long, Int> {
        var total = 0L; var n = 0; var off = 0
        while (true) { val p = page(off, 500); p.forEach { total += it.sizeBytes; n++ }; if (p.size < 500) break; off += 500 }
        return total to n
    }

    fun videoValues(displayName: String) = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME, "$displayName.mp4")
        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
        put(MediaStore.Video.Media.RELATIVE_PATH, VIDEO_PATH)
    }

    /** Writes a JPEG atomically: the file stays hidden (pending) until it is complete. */
    fun saveJpeg(displayName: String, bitmap: Bitmap, quality: Int, exifWriter: ((Uri) -> Unit)? = null): Uri {
        val values = photoValues(displayName).apply { put(MediaStore.Images.Media.IS_PENDING, 1) }
        val uri = resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
            ?: throw AppException(Errors.mediaProvider())
        try {
            resolver.openOutputStream(uri, "w")?.use { out ->
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, quality, out)) throw AppException(Errors.exportFailed())
            } ?: throw AppException(Errors.mediaProvider())
            exifWriter?.invoke(uri)
            resolver.update(uri, ContentValues().apply { put(MediaStore.Images.Media.IS_PENDING, 0) }, null, null)
            return uri
        } catch (t: Throwable) {
            runCatching { resolver.delete(uri, null, null) }
            throw t
        }
    }

    /** Creates a pending video item to copy a finished export into. */
    fun copyVideoInto(displayName: String, source: java.io.File): Uri {
        val values = videoValues(displayName).apply { put(MediaStore.Video.Media.IS_PENDING, 1) }
        val uri = resolver.insert(MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
            ?: throw AppException(Errors.mediaProvider())
        try {
            resolver.openOutputStream(uri, "w")?.use { out -> source.inputStream().use { it.copyTo(out) } }
                ?: throw AppException(Errors.mediaProvider())
            resolver.update(uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null)
            return uri
        } catch (t: Throwable) {
            runCatching { resolver.delete(uri, null, null) }
            throw t
        }
    }

    fun delete(uri: Uri): Boolean = runCatching { resolver.delete(uri, null, null) > 0 }.getOrDefault(false)

    /** True on Android 11+, where deleted items can go to the system recycle bin (kept 30 days) and be restored. */
    val trashSupported: Boolean get() = android.os.Build.VERSION.SDK_INT >= 30

    /**
     * Moves this app's own items to (or out of) the recycle bin. Returns the items Android refused to change
     * directly; those need the system confirmation from [trashRequest].
     */
    fun setTrashed(uris: List<Uri>, trashed: Boolean): List<Uri> {
        if (!trashSupported) return uris
        val refused = ArrayList<Uri>()
        for (u in uris) {
            val ok = runCatching { resolver.update(u, ContentValues().apply { put(MediaStore.MediaColumns.IS_TRASHED, if (trashed) 1 else 0) }, null, null) > 0 }.getOrDefault(false)
            if (!ok) refused += u
        }
        return refused
    }

    /** System dialog asking the user to trash or restore items (Android 11+). */
    fun trashRequest(uris: List<Uri>, trashed: Boolean): android.app.PendingIntent? =
        if (trashSupported && uris.isNotEmpty()) MediaStore.createTrashRequest(resolver, uris, trashed) else null

    /** Specific items by address (favourites, albums). Missing or trashed items are skipped. */
    fun itemsFor(uris: List<Uri>): List<MediaItem> {
        if (uris.isEmpty()) return emptyList()
        val ids = uris.mapNotNull { runCatching { ContentUris.parseId(it) }.getOrNull() }
        if (ids.isEmpty()) return emptyList()
        val byId = query("${MediaStore.Files.FileColumns._ID} IN (${ids.joinToString(",")})", emptyArray(), 0, ids.size, trashedOnly = false).associateBy { ContentUris.parseId(it.uri) }
        return ids.mapNotNull { byId[it] }
    }

    /** Items in the recycle bin (Android 11+). */
    fun trashed(): List<MediaItem> = if (!trashSupported) emptyList()
        else query("(" + ALL_PATHS.joinToString(" OR ") { "${MediaStore.Files.FileColumns.RELATIVE_PATH} LIKE ?" } + ")", ALL_PATHS.map { "$it%" }.toTypedArray(), 0, 500, trashedOnly = true)

    fun thumbnail(uri: Uri, px: Int): Bitmap? =
        runCatching { resolver.loadThumbnail(uri, Size(px, px), null) }.getOrNull()

    /** One page of this app's photos and videos, newest first. */
    fun page(offset: Int, limit: Int): List<MediaItem> =
        query("(" + ALL_PATHS.joinToString(" OR ") { "${MediaStore.Files.FileColumns.RELATIVE_PATH} LIKE ?" } + ")", ALL_PATHS.map { "$it%" }.toTypedArray(), offset, limit, trashedOnly = false)

    private fun query(where: String, whereArgs: Array<String>, offset: Int, limit: Int, trashedOnly: Boolean): List<MediaItem> {
        val files = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID, MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.Files.FileColumns.DISPLAY_NAME, MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.SIZE, MediaStore.Files.FileColumns.WIDTH, MediaStore.Files.FileColumns.HEIGHT,
        )
        val selection = "(${MediaStore.Files.FileColumns.MEDIA_TYPE} = ? OR ${MediaStore.Files.FileColumns.MEDIA_TYPE} = ?) AND $where"
        val args = arrayOf(MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(), MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString(), *whereArgs)
        val query = Bundle().apply {
            putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
            putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args)
            putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(MediaStore.Files.FileColumns.DATE_ADDED))
            putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING)
            putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
            putInt(ContentResolver.QUERY_ARG_OFFSET, offset)
            if (trashedOnly && android.os.Build.VERSION.SDK_INT >= 30) putInt(MediaStore.QUERY_ARG_MATCH_TRASHED, MediaStore.MATCH_ONLY)
        }
        val out = ArrayList<MediaItem>()
        resolver.query(files, projection, query, null)?.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val video = c.getInt(1) == MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO
                val base = if (video) MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                else MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                out += MediaItem(ContentUris.withAppendedId(base, id), video, c.getString(2).orEmpty(),
                    c.getLong(3) * 1000, c.getLong(4), c.getInt(5), c.getInt(6))
            }
        }
        return out
    }
}
