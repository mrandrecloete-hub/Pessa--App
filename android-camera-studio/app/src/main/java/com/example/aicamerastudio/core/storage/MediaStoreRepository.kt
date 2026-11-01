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
    val isComposite: Boolean get() = name.contains("_composite") || name.contains("_removed")
}

/** All app media lives in MediaStore folders owned by this app, so no storage permission is needed. */
class MediaStoreRepository(private val context: Context) {
    private val resolver: ContentResolver get() = context.contentResolver

    companion object {
        const val FOLDER = "AI Camera Studio"
        const val PHOTO_PATH = "Pictures/$FOLDER"
        const val VIDEO_PATH = "Movies/$FOLDER"
        const val MIN_PHOTO_FREE = 100L * 1024 * 1024
        const val MIN_VIDEO_FREE = 300L * 1024 * 1024

        fun timestampName(prefix: String, suffix: String = ""): String =
            prefix + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + suffix
    }

    fun freeBytes(): Long = StatFs(Environment.getDataDirectory().path).availableBytes

    fun requireFree(minBytes: Long) {
        if (freeBytes() < minBytes) throw AppException(Errors.lowStorage())
    }

    fun photoValues(displayName: String) = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME, "$displayName.jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, PHOTO_PATH)
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

    fun thumbnail(uri: Uri, px: Int): Bitmap? =
        runCatching { resolver.loadThumbnail(uri, Size(px, px), null) }.getOrNull()

    /** One page of this app's photos and videos, newest first. */
    fun page(offset: Int, limit: Int): List<MediaItem> {
        val files = MediaStore.Files.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val projection = arrayOf(
            MediaStore.Files.FileColumns._ID, MediaStore.Files.FileColumns.MEDIA_TYPE,
            MediaStore.Files.FileColumns.DISPLAY_NAME, MediaStore.Files.FileColumns.DATE_ADDED,
            MediaStore.Files.FileColumns.SIZE, MediaStore.Files.FileColumns.WIDTH, MediaStore.Files.FileColumns.HEIGHT,
        )
        val selection = "(${MediaStore.Files.FileColumns.MEDIA_TYPE} = ? OR ${MediaStore.Files.FileColumns.MEDIA_TYPE} = ?) AND " +
            "(${MediaStore.Files.FileColumns.RELATIVE_PATH} LIKE ? OR ${MediaStore.Files.FileColumns.RELATIVE_PATH} LIKE ?)"
        val args = arrayOf(
            MediaStore.Files.FileColumns.MEDIA_TYPE_IMAGE.toString(), MediaStore.Files.FileColumns.MEDIA_TYPE_VIDEO.toString(),
            "$PHOTO_PATH%", "$VIDEO_PATH%",
        )
        val query = Bundle().apply {
            putString(ContentResolver.QUERY_ARG_SQL_SELECTION, selection)
            putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS, args)
            putStringArray(ContentResolver.QUERY_ARG_SORT_COLUMNS, arrayOf(MediaStore.Files.FileColumns.DATE_ADDED))
            putInt(ContentResolver.QUERY_ARG_SORT_DIRECTION, ContentResolver.QUERY_SORT_DIRECTION_DESCENDING)
            putInt(ContentResolver.QUERY_ARG_LIMIT, limit)
            putInt(ContentResolver.QUERY_ARG_OFFSET, offset)
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
