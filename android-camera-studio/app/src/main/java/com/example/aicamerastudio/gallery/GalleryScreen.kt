package com.example.aicamerastudio.gallery

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.util.LruCache
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.grid.itemsIndexed
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.core.storage.MediaItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date

private enum class Filter(val label: String) { ALL("All"), PHOTOS("Photos"), VIDEOS("Videos"), ENHANCED("Enhanced"), EDITED("Edited"), GENERATED("AI generated"), ORIGINALS("Originals") }
private enum class SortBy(val label: String) { NEWEST("Newest"), OLDEST("Oldest"), LARGEST("Largest") }

private object ThumbCache : LruCache<String, Bitmap>(24 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
}

@Composable
fun Thumb(uri: Uri, modifier: Modifier = Modifier, px: Int = 256) {
    val media = (LocalContext.current.applicationContext as App).graph.media
    var bmp by remember(uri) { mutableStateOf<Bitmap?>(ThumbCache.get(uri.toString())) }
    LaunchedEffect(uri) {
        if (bmp == null) bmp = withContext(Dispatchers.IO) { media.thumbnail(uri, px) }?.also { ThumbCache.put(uri.toString(), it) }
    }
    Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant)) {
        bmp?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop) }
    }
}

@OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class)
@Composable
fun GalleryScreen(onOpen: (MediaItem) -> Unit) {
    val context = LocalContext.current
    val media = (context.applicationContext as App).graph.media
    val items = remember { mutableStateListOf<MediaItem>() }
    var loading by remember { mutableStateOf(true) }
    var end by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(Filter.ALL) }
    var sort by remember { mutableStateOf(SortBy.NEWEST) }
    val selected = remember { mutableStateListOf<Uri>() }
    var confirmDelete by remember { mutableStateOf(false) }
    var reload by remember { mutableIntStateOf(0) }
    val pageSize = 90

    suspend fun loadMore() {
        if (end) return
        val page = withContext(Dispatchers.IO) { media.page(items.size, pageSize) }
        items.addAll(page)
        if (page.size < pageSize) end = true
        loading = false
    }
    LaunchedEffect(reload) { items.clear(); end = false; loading = true; selected.clear(); loadMore() }

    val shown = items.filter {
        (query.isBlank() || it.name.contains(query, true)) && when (filter) {
            Filter.ALL -> true; Filter.PHOTOS -> !it.isVideo; Filter.VIDEOS -> it.isVideo
            Filter.ENHANCED -> it.isEnhanced; Filter.EDITED -> it.isEdited; Filter.GENERATED -> it.isGenerated
            Filter.ORIGINALS -> !it.isEnhanced && !it.isEdited && !it.isGenerated
        }
    }.let { l -> when (sort) { SortBy.NEWEST -> l; SortBy.OLDEST -> l.reversed(); SortBy.LARGEST -> l.sortedByDescending { it.sizeBytes } } }

    Column(Modifier.fillMaxSize()) {
        if (selected.isEmpty()) {
            AppToolbar("Gallery")
            OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = Tokens.spaceMd), singleLine = true,
                label = { Text("Search by file name") }, leadingIcon = { Icon(Icons.Default.Search, null) })
            LazyRow(contentPadding = PaddingValues(Tokens.spaceMd, Tokens.spaceSm), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                items(Filter.values().toList()) { f -> FilterChip(filter == f, { filter = f }, { Text(f.label) }) }
                items(SortBy.values().toList()) { s -> AssistChip({ sort = s }, { Text(if (sort == s) "Sort: ${s.label}" else s.label) }) }
            }
        } else {
            TopAppBar(title = { Text("${selected.size} selected") },
                navigationIcon = { IconButton({ selected.clear() }) { Icon(Icons.Default.Close, "Clear selection") } },
                actions = {
                    IconButton({
                        val send = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                            type = "*/*"; putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(selected))
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        }
                        context.startActivity(Intent.createChooser(send, "Share"))
                    }) { Icon(Icons.Default.Share, "Share selected") }
                    IconButton({ confirmDelete = true }) { Icon(Icons.Default.Delete, "Delete selected") }
                })
        }
        when {
            loading -> LoadingIndicator("Loading your media", modifier = Modifier.fillMaxWidth().padding(Tokens.spaceLg))
            shown.isEmpty() -> EmptyState(if (items.isEmpty()) "No photos or videos yet" else "Nothing matches",
                if (items.isEmpty()) "Photos and videos you take with AI Camera Studio appear here. Items load as you scroll." else "Try a different search or filter. Search and filters apply to the items loaded so far.")
            else -> LazyVerticalGrid(GridCells.Adaptive(110.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(2.dp),
                horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                itemsIndexed(shown, key = { _, it -> it.uri.toString() }) { i, item ->
                    if (i >= shown.size - 12 && !end) LaunchedEffect(items.size) { loadMore() }
                    val sel = item.uri in selected
                    Box(Modifier.aspectRatio(1f).combinedClickable(
                        onClick = { if (selected.isNotEmpty()) { if (sel) selected.remove(item.uri) else selected.add(item.uri) } else onOpen(item) },
                        onLongClick = { if (!sel) selected.add(item.uri) },
                    ).semantics { contentDescription = (if (item.isVideo) "Video " else "Photo ") + item.name + if (sel) ", selected" else "" }) {
                        Thumb(item.uri, Modifier.fillMaxSize())
                        if (item.isVideo) Icon(Icons.Default.PlayCircle, null, Modifier.align(Alignment.Center), tint = Color.White)
                        if (item.isGenerated) Text("AI generated", Modifier.align(Alignment.BottomStart).background(Color(0xAA000000)).padding(horizontal = 4.dp), color = Color.White, style = MaterialTheme.typography.labelSmall)
                        else if (item.isEnhanced) Text("Enhanced", Modifier.align(Alignment.BottomStart).background(Color(0xAA000000)).padding(horizontal = 4.dp), color = Color.White, style = MaterialTheme.typography.labelSmall)
                        else if (item.isEdited) Text("Edited", Modifier.align(Alignment.BottomStart).background(Color(0xAA000000)).padding(horizontal = 4.dp), color = Color.White, style = MaterialTheme.typography.labelSmall)
                        if (sel) Icon(Icons.Default.CheckCircle, "Selected", Modifier.align(Alignment.TopEnd).padding(4.dp), tint = Tokens.accent)
                    }
                }
            }
        }
    }
    if (confirmDelete) ConfirmDialog("Delete ${selected.size} item(s)?", "They will be removed from this device. This cannot be undone.", "Delete",
        onConfirm = {
            selected.toList().forEach { media.delete(it) }
            confirmDelete = false; reload++
        }, onDismiss = { confirmDelete = false })
}

fun formatDate(ms: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(ms))
fun formatSize(bytes: Long): String = if (bytes >= 1_048_576) "%.1f MB".format(bytes / 1_048_576f) else "${bytes / 1024} KB"
