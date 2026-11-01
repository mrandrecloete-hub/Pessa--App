package com.example.aicamerastudio.gallery

import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.util.LruCache
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
import com.example.aicamerastudio.data.database.Album
import com.example.aicamerastudio.data.database.AlbumItem
import com.example.aicamerastudio.data.database.Favourite
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.DateFormat
import java.util.Date
import java.util.UUID

private enum class Filter(val label: String) { ALL("All"), PHOTOS("Photos"), VIDEOS("Videos"), ENHANCED("Enhanced"), EDITED("Edited"), GENERATED("AI generated"), ORIGINALS("Originals") }
private enum class SortBy(val label: String) { NEWEST("Newest"), OLDEST("Oldest"), LARGEST("Largest") }
private enum class Tab(val label: String) { LIBRARY("Library"), FAVOURITES("Favourites"), ALBUMS("Albums"), TRASH("Recycle bin") }

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

private fun badge(item: MediaItem) = when {
    item.isZoom -> "Ultra zoom"; item.isNight -> "Night"; item.isHdr -> "HDR"; item.isLook -> "Styled"
    item.isComposite -> "Composite"; item.isGenerated -> "AI generated"; item.isEnhanced -> "Enhanced"; item.isEdited -> "Edited"
    else -> null
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun MediaGrid(items: List<MediaItem>, selected: List<Uri>, favourites: Set<String>, onOpen: (MediaItem) -> Unit, onToggle: (Uri) -> Unit, onNearEnd: () -> Unit = {}) {
    LazyVerticalGrid(GridCells.Adaptive(110.dp), Modifier.fillMaxSize(), contentPadding = PaddingValues(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        itemsIndexed(items, key = { _, it -> it.uri.toString() }) { i, item ->
            if (i >= items.size - 12) LaunchedEffect(items.size) { onNearEnd() }
            val sel = item.uri in selected
            Box(Modifier.animateItem().aspectRatio(1f).combinedClickable(
                onClick = { if (selected.isNotEmpty()) onToggle(item.uri) else onOpen(item) },
                onLongClick = { if (!sel) onToggle(item.uri) },
            ).semantics { contentDescription = (if (item.isVideo) "Video " else "Photo ") + item.name + if (sel) ", selected" else "" }) {
                Thumb(item.uri, Modifier.fillMaxSize())
                if (item.isVideo) Icon(Icons.Default.PlayCircle, null, Modifier.align(Alignment.Center), tint = Color.White)
                badge(item)?.let { Text(it, Modifier.align(Alignment.BottomStart).background(Color(0xAA000000)).padding(horizontal = 4.dp), color = Tokens.goldLight, style = MaterialTheme.typography.labelSmall) }
                if (item.uri.toString() in favourites) Icon(Icons.Default.Favorite, "Favourite", Modifier.align(Alignment.TopStart).padding(4.dp).size(16.dp), tint = Tokens.gold)
                if (sel) Icon(Icons.Default.CheckCircle, "Selected", Modifier.align(Alignment.TopEnd).padding(4.dp), tint = Tokens.gold)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun GalleryScreen(onOpen: (MediaItem) -> Unit) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val media = graph.media
    val lib = graph.database.library()
    val scope = rememberCoroutineScope()
    var tab by rememberSaveable { mutableStateOf(Tab.LIBRARY) }
    val items = remember { mutableStateListOf<MediaItem>() }
    var loading by remember { mutableStateOf(true) }
    var end by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var filter by remember { mutableStateOf(Filter.ALL) }
    var sort by remember { mutableStateOf(SortBy.NEWEST) }
    val selected = remember { mutableStateListOf<Uri>() }
    var confirm by remember { mutableStateOf<String?>(null) }
    var reload by remember { mutableIntStateOf(0) }
    var albumOpen by remember { mutableStateOf<Pair<String, String>?>(null) }
    var pickAlbum by remember { mutableStateOf(false) }
    var newAlbum by remember { mutableStateOf<String?>(null) }
    var albumMenu by remember { mutableStateOf<Pair<String, String>?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val favourites by lib.favourites().collectAsState(initial = emptyList())
    val favSet = favourites.toSet()
    val albums by lib.albums().collectAsState(initial = emptyList())
    var tabItems by remember { mutableStateOf<List<MediaItem>>(emptyList()) }
    val tabs = Tab.values().filter { it != Tab.TRASH || media.trashSupported }
    val pageSize = 90

    val sender = rememberLauncherForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { reload++ }

    suspend fun loadMore() {
        if (end) return
        val page = withContext(Dispatchers.IO) { media.page(items.size, pageSize) }
        items.addAll(page); if (page.size < pageSize) end = true; loading = false
    }
    var refreshing by remember { mutableStateOf(false) }
    LaunchedEffect(reload) { items.clear(); end = false; loading = true; selected.clear(); loadMore(); refreshing = false }
    val albumUris by (albumOpen?.let { lib.albumItems(it.first) } ?: kotlinx.coroutines.flow.flowOf(emptyList())).collectAsState(initial = emptyList())
    LaunchedEffect(tab, favourites, albumUris, reload, albumOpen) {
        tabItems = withContext(Dispatchers.IO) {
            when {
                tab == Tab.FAVOURITES -> media.itemsFor(favourites.map(Uri::parse))
                tab == Tab.ALBUMS && albumOpen != null -> media.itemsFor(albumUris.map(Uri::parse))
                tab == Tab.TRASH -> media.trashed()
                else -> emptyList()
            }
        }
    }

    val shown = items.filter {
        (query.isBlank() || it.name.contains(query, true)) && when (filter) {
            Filter.ALL -> true; Filter.PHOTOS -> !it.isVideo; Filter.VIDEOS -> it.isVideo
            Filter.ENHANCED -> it.isEnhanced; Filter.EDITED -> it.isEdited || it.isLook; Filter.GENERATED -> it.isGenerated
            Filter.ORIGINALS -> badge(it) == null
        }
    }.let { l -> when (sort) { SortBy.NEWEST -> l; SortBy.OLDEST -> l.reversed(); SortBy.LARGEST -> l.sortedByDescending { it.sizeBytes } } }
    val toggle: (Uri) -> Unit = { u -> if (u in selected) selected.remove(u) else selected.add(u) }

    fun moveToTrash(uris: List<Uri>) {
        scope.launch {
            val refused = withContext(Dispatchers.IO) { media.setTrashed(uris, true) }
            media.trashRequest(refused, true)?.let { sender.launch(IntentSenderRequest.Builder(it.intentSender).build()) }
            message = "${uris.size - refused.size} item(s) moved to the recycle bin. They are kept for 30 days."
            reload++
        }
    }

    Column(Modifier.fillMaxSize()) {
        if (selected.isEmpty()) {
            AppToolbar(albumOpen?.second ?: "Gallery", if (albumOpen != null) ({ albumOpen = null }) else null)
            ScrollableTabRow(tabs.indexOf(tab).coerceAtLeast(0), edgePadding = 8.dp) {
                tabs.forEach { t -> Tab(tab == t, { tab = t; albumOpen = null; selected.clear(); message = null }, text = { Text(t.label) }) }
            }
        } else {
            TopAppBar(title = { Text("${selected.size} selected") },
                navigationIcon = { IconButton({ selected.clear() }) { Icon(Icons.Default.Close, "Clear selection") } },
                actions = {
                    if (tab == Tab.TRASH) {
                        IconButton({
                            scope.launch {
                                val list = selected.toList()
                                val refused = withContext(Dispatchers.IO) { media.setTrashed(list, false) }
                                media.trashRequest(refused, false)?.let { sender.launch(IntentSenderRequest.Builder(it.intentSender).build()) }
                                message = "Restored ${list.size - refused.size} item(s)."; selected.clear(); reload++
                            }
                        }) { Icon(Icons.Default.RestoreFromTrash, "Restore") }
                        IconButton({ confirm = "forever" }) { Icon(Icons.Default.DeleteForever, "Delete forever") }
                    } else {
                        IconButton({
                            val send = Intent(Intent.ACTION_SEND_MULTIPLE).apply { type = "*/*"; putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(selected)); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) }
                            context.startActivity(Intent.createChooser(send, "Share"))
                        }) { Icon(Icons.Default.Share, "Share selected") }
                        IconButton({ scope.launch { val now = System.currentTimeMillis(); selected.toList().forEach { u -> if (u.toString() in favSet) lib.removeFavourite(u.toString()) else lib.addFavourite(Favourite(u.toString(), now)) }; selected.clear() } }) {
                            Icon(Icons.Default.Favorite, "Toggle favourite") }
                        IconButton({ pickAlbum = true }) { Icon(Icons.Default.PhotoAlbum, "Add to album") }
                        if (albumOpen != null) IconButton({ val id = albumOpen!!.first; scope.launch { selected.toList().forEach { lib.removeFromAlbum(id, it.toString()) }; selected.clear() } }) {
                            Icon(Icons.Default.RemoveCircleOutline, "Remove from album") }
                        IconButton({ confirm = "trash" }) { Icon(Icons.Default.Delete, "Delete selected") }
                    }
                })
        }
        message?.let { Text(it, Modifier.fillMaxWidth().padding(horizontal = Tokens.spaceMd, vertical = 4.dp), style = MaterialTheme.typography.bodySmall, color = Tokens.goldLight) }
        // Pull down to refresh: reloads photos, favourites, albums and the recycle bin.
        val pullState = rememberPullToRefreshState()
        PullToRefreshBox(refreshing, { refreshing = true; message = null; reload++ }, Modifier.weight(1f).fillMaxWidth(), state = pullState,
            indicator = { PullToRefreshDefaults.Indicator(state = pullState, isRefreshing = refreshing, modifier = Modifier.align(Alignment.TopCenter),
                color = Tokens.gold, containerColor = Tokens.panel) }) {
        Column(Modifier.fillMaxSize()) {
        when (tab) {
            Tab.LIBRARY -> {
                if (selected.isEmpty()) {
                    OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = Tokens.spaceMd), singleLine = true,
                        label = { Text("Search by file name") }, leadingIcon = { Icon(Icons.Default.Search, null) })
                    LazyRow(contentPadding = PaddingValues(Tokens.spaceMd, Tokens.spaceSm), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        items(Filter.values().toList()) { f -> FilterChip(filter == f, { filter = f }, { Text(f.label) }) }
                        items(SortBy.values().toList()) { s -> AssistChip({ sort = s }, { Text(if (sort == s) "Sort: ${s.label}" else s.label) }) }
                    }
                }
                when {
                    loading -> LoadingIndicator("Loading your media", modifier = Modifier.fillMaxWidth().padding(Tokens.spaceLg))
                    shown.isEmpty() -> EmptyState(if (items.isEmpty()) "No photos or videos yet" else "Nothing matches",
                        if (items.isEmpty()) "Photos and videos you take with BlazeCam appear here." else "Try a different search or filter. Search and filters apply to the items loaded so far.")
                    else -> MediaGrid(shown, selected, favSet, onOpen, toggle) { scope.launch { loadMore() } }
                }
            }
            Tab.FAVOURITES -> if (tabItems.isEmpty()) EmptyState("No favourites yet", "Tap the heart on a photo, or select photos and tap the heart.")
                else MediaGrid(tabItems, selected, favSet, onOpen, toggle)
            Tab.ALBUMS -> if (albumOpen != null) {
                if (tabItems.isEmpty()) EmptyState("This album is empty", "Select photos in the Library and tap the album button to add them.")
                else MediaGrid(tabItems, selected, favSet, onOpen, toggle)
            } else Column {
                AppButton("New album", { newAlbum = "" }, Modifier.padding(Tokens.spaceMd))
                if (albums.isEmpty()) EmptyState("No albums yet", "Create an album, then add photos to it from the Library.")
                else LazyVerticalGrid(GridCells.Adaptive(150.dp), contentPadding = PaddingValues(Tokens.spaceSm), horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    items(albums.size, key = { albums[it].id }) { i -> val a = albums[i]
                        Column(Modifier.animateItem().combinedClickable(onClick = { albumOpen = a.id to a.name }, onLongClick = { albumMenu = a.id to a.name })
                            .semantics { contentDescription = "Album ${a.name}, ${a.count} items. Long press to rename or delete." }) {
                            Box(Modifier.aspectRatio(1f).clip(RoundedCornerShape(14.dp)).background(Tokens.panel)) {
                                a.cover?.let { Thumb(Uri.parse(it), Modifier.fillMaxSize()) } ?: Icon(Icons.Default.PhotoAlbum, null, Modifier.align(Alignment.Center).size(40.dp), tint = Tokens.gold)
                            }
                            Text(a.name, style = MaterialTheme.typography.titleSmall); Text("${a.count} items", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
            Tab.TRASH -> if (tabItems.isEmpty()) EmptyState("The recycle bin is empty", "Deleted items stay here for 30 days, then Android removes them.")
                else MediaGrid(tabItems, selected, favSet, onOpen = { selected.add(it.uri) }, onToggle = toggle)
        }
        }
        }
    }

    when (confirm) {
        "trash" -> ConfirmDialog(
            if (media.trashSupported) "Move ${selected.size} item(s) to the recycle bin?" else "Delete ${selected.size} item(s)?",
            if (media.trashSupported) "You can restore them from the Recycle bin tab for 30 days." else "This version of Android has no recycle bin, so they are removed permanently.",
            if (media.trashSupported) "Move" else "Delete",
            onConfirm = {
                val list = selected.toList(); confirm = null; selected.clear()
                if (media.trashSupported) moveToTrash(list)
                else { list.forEach { media.delete(it) }; scope.launch { list.forEach { lib.forgetInAlbums(it.toString()); lib.removeFavourite(it.toString()) } }; reload++ }
            }, onDismiss = { confirm = null })
        "forever" -> ConfirmDialog("Delete ${selected.size} item(s) forever?", "This cannot be undone.", "Delete forever",
            onConfirm = { val list = selected.toList(); confirm = null; selected.clear(); list.forEach { media.delete(it) }
                scope.launch { list.forEach { lib.forgetInAlbums(it.toString()); lib.removeFavourite(it.toString()) } }; reload++ },
            onDismiss = { confirm = null })
    }
    if (pickAlbum) AlertDialog(onDismissRequest = { pickAlbum = false }, confirmButton = { TextButton({ pickAlbum = false; newAlbum = "" }) { Text("New album") } },
        dismissButton = { TextButton({ pickAlbum = false }) { Text("Cancel") } }, title = { Text("Add to album") }, text = {
            Column {
                if (albums.isEmpty()) Text("No albums yet.")
                albums.forEach { a ->
                    Text(a.name, Modifier.fillMaxWidth().clickable {
                        val list = selected.toList()
                        scope.launch { val now = System.currentTimeMillis(); list.forEach { lib.addToAlbum(AlbumItem(a.id, it.toString(), now)) }; message = "Added ${list.size} item(s) to ${a.name}." }
                        selected.clear(); pickAlbum = false
                    }.padding(vertical = 12.dp), style = MaterialTheme.typography.bodyLarge)
                }
            }
        })
    newAlbum?.let { name ->
        AlertDialog(onDismissRequest = { newAlbum = null }, title = { Text("New album") },
            text = { OutlinedTextField(name, { newAlbum = it.take(40) }, singleLine = true, label = { Text("Album name") }) },
            confirmButton = { TextButton({
                val n = name.trim(); val list = selected.toList()
                if (n.isNotEmpty()) scope.launch {
                    val id = UUID.randomUUID().toString(); val now = System.currentTimeMillis()
                    lib.addAlbum(Album(id, n, now)); list.forEach { lib.addToAlbum(AlbumItem(id, it.toString(), now)) }
                }
                selected.clear(); newAlbum = null
            }, enabled = name.isNotBlank()) { Text("Create") } },
            dismissButton = { TextButton({ newAlbum = null }) { Text("Cancel") } })
    }
    albumMenu?.let { (id, name) ->
        var rename by remember(id) { mutableStateOf(name) }
        AlertDialog(onDismissRequest = { albumMenu = null }, title = { Text("Album") },
            text = { Column { OutlinedTextField(rename, { rename = it.take(40) }, singleLine = true, label = { Text("Name") })
                Text("Deleting an album keeps its photos.", style = MaterialTheme.typography.bodySmall) } },
            confirmButton = { TextButton({ scope.launch { lib.renameAlbum(id, rename.trim().ifBlank { name }) }; albumMenu = null }) { Text("Rename") } },
            dismissButton = { TextButton({ scope.launch { lib.clearAlbum(id); lib.deleteAlbum(id) }; albumMenu = null }) { Text("Delete album") } })
    }
}

fun formatDate(ms: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(ms))
fun formatSize(bytes: Long): String = if (bytes >= 1_048_576) "%.1f MB".format(bytes / 1_048_576f) else "${bytes / 1024} KB"
