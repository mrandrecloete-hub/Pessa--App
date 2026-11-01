package com.example.aicamerastudio.editor.composite

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.data.database.CompositeProject
import com.example.aicamerastudio.gallery.Thumb
import com.example.aicamerastudio.gallery.formatDate
import kotlinx.coroutines.launch

/** AI Composite Studio: start a removal or a placement, or reopen a saved project. */
@Composable
fun CompositeHubScreen(onBack: () -> Unit, onRemove: (String?) -> Unit, onPlace: (String?) -> Unit) {
    val graph = (LocalContext.current.applicationContext as App).graph
    val projects by graph.database.projects().recent().collectAsState(initial = emptyList())
    val scope = rememberCoroutineScope()
    var toDelete by remember { mutableStateOf<CompositeProject?>(null) }
    Column(Modifier.fillMaxSize()) {
        AppToolbar("AI Composite Studio", onBack)
        LazyColumn(contentPadding = PaddingValues(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        Text("Remove a person", style = MaterialTheme.typography.titleMedium)
                        Text("Select a person (found automatically, by tap, or with a brush) and rebuild the background from the rest of the photo.", style = MaterialTheme.typography.bodyMedium)
                        AppButton("Start", { onRemove(null) }, Modifier.fillMaxWidth())
                    }
                }
            }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(Tokens.spaceMd), verticalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        Text("Place a person into another photo", style = MaterialTheme.typography.titleMedium)
                        Text("Cut a person out of one photo and blend them into another with matched light, colour, focus and shadows. Faces are never changed.", style = MaterialTheme.typography.bodyMedium)
                        AppButton("Start", { onPlace(null) }, Modifier.fillMaxWidth())
                    }
                }
            }
            item {
                Text("All processing runs on this phone with bundled models (MediaPipe segmentation, Apache 2.0). Source photos are never changed; results are saved as new photos.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (projects.isNotEmpty()) item { Text("Recent projects", style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = Tokens.spaceSm)) }
            items(projects, key = { it.id }) { p ->
                Row(Modifier.fillMaxWidth().clickable { if (p.kind == "remove") onRemove(p.id) else onPlace(p.id) }.padding(vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    Thumb(Uri.parse(p.lastExportUri ?: p.destUri ?: p.sourceUri), Modifier.size(64.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (p.kind == "remove") "Person removal" else "Person placement", style = MaterialTheme.typography.bodyLarge)
                        Text("Edited ${formatDate(p.updatedAt)}" + if (p.lastExportUri != null) " · exported" else "", style = MaterialTheme.typography.bodySmall)
                    }
                    IconButton({ toDelete = p }) { Icon(Icons.Default.Delete, "Delete project") }
                }
            }
        }
    }
    toDelete?.let { p ->
        ConfirmDialog("Delete this project?", "The saved selections and settings are deleted. Your photos and exported results are kept.", "Delete",
            onConfirm = { scope.launch { graph.database.projects().delete(p.id); graph.projectFiles.delete(p.id) }; toDelete = null }, onDismiss = { toDelete = null })
    }
}
