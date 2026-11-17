package com.pdfmaster.desktop

import androidx.compose.foundation.*
import androidx.compose.foundation.draganddrop.dragAndDropTarget
import androidx.compose.ui.draganddrop.DragAndDropEvent
import androidx.compose.ui.draganddrop.DragAndDropTarget
import androidx.compose.ui.draganddrop.awtTransferable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.draw.paint
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.File
import java.awt.datatransfer.DataFlavor
import java.text.SimpleDateFormat
import java.util.Date

@OptIn(ExperimentalComposeUiApi::class)
@Composable
fun HomeScreen(model: AppModel) {
    var dropping by remember { mutableStateOf(false) }
    val openFiles: (List<File>) -> Unit = { fs -> val f = fs.firstOrNull { it.extension.lowercase() in listOf("pdf", "jpg", "jpeg", "png") }; if (f != null) model.open(f) else model.toast = "Drop a PDF or a photo of a document" }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Column(Modifier.fillMaxWidth().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Color(0xFF0E2A66), MaterialTheme.colorScheme.background))).padding(horizontal = 32.dp, vertical = 28.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(painterResource("logo.png"), "PDFMASTER logo", Modifier.size(84.dp))
                    Column(Modifier.padding(start = 18.dp)) {
                        Text(buildAnnotatedString { withStyle(SpanStyle(color = Color.White)) { append("PDF") }; withStyle(SpanStyle(color = Brand.Cyan)) { append("MASTER") } }, fontSize = 38.sp, fontWeight = FontWeight.Black)
                        Text("Every Document. Every Format. One Intelligent Workspace.", color = Color.White.copy(alpha = 0.8f))
                    }
                }
                Spacer(Modifier.height(22.dp))
                Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(if (dropping) Color(0xFF1B4DB8).copy(alpha = 0.6f) else Color(0xFF123A8C).copy(alpha = 0.45f)).drawBehind {
                    drawRoundRect(Brand.Royal, style = Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f))), cornerRadius = CornerRadius(22.dp.toPx())) }
                    .onExternalDragCompat({ dropping = it }, openFiles).clickable { Files.pick("Open a PDF or a photo of a document", Files.PDF + Files.IMAGES).let(openFiles) }.padding(26.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Outlined.CloudUpload, null, tint = Brand.Cyan, modifier = Modifier.size(64.dp))
                    Column(Modifier.padding(start = 20.dp).weight(1f)) {
                        Text(buildAnnotatedString { withStyle(SpanStyle(color = Color.White)) { append("Open or drop your ") }; withStyle(SpanStyle(color = Brand.Cyan)) { append("PDF") } }, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                        Text("Drag a PDF or a photo of a document here, or click to browse your computer.", color = Color.White.copy(alpha = 0.8f))
                    }
                    Button({ Files.pick("Open a PDF or a photo of a document", Files.PDF + Files.IMAGES).let(openFiles) }, Modifier.height(50.dp)) { Icon(Icons.Outlined.FolderOpen, null); Text("  Open file") }
                }
            }
        }
        item {
            Text("Quick actions", Modifier.padding(start = 32.dp, top = 20.dp, bottom = 8.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Row(Modifier.padding(horizontal = 28.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                listOf("merge", "split", "compress", "to_docx", "to_xlsx", "protect").forEach { id -> val t = TOOLS.first { it.id == id }; ToolCard(t, Modifier.weight(1f)) { model.screen = Screen.Tool(id, emptyList()) } }
            }
        }
        item { Text("Recent files", Modifier.padding(start = 32.dp, top = 22.dp, bottom = 6.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold) }
        if (model.recent.isEmpty()) item { Text("Files you open appear here.", Modifier.padding(horizontal = 32.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        items(model.recent.toList()) { f ->
            Row(Modifier.padding(horizontal = 28.dp, vertical = 3.dp).fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceContainer).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp)).clickable { model.open(f) }.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (f.extension.equals("pdf", true)) Icons.Outlined.PictureAsPdf else Icons.Outlined.Image, null, tint = if (f.extension.equals("pdf", true)) Color(0xFFE5484D) else Brand.Violet, modifier = Modifier.size(32.dp))
                Column(Modifier.padding(start = 14.dp).weight(1f)) { Text(f.name, fontWeight = FontWeight.SemiBold, maxLines = 1); Text("${Files.human(f.length())}  ·  ${SimpleDateFormat("d MMM yyyy, HH:mm").format(Date(f.lastModified()))}  ·  ${f.parentFile?.name ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }
                TextButton({ Files.showInFolder(f) }) { Text("Show in folder") }
            }
        }
    }
}

/** Accepts files dropped from the file manager. */
@OptIn(ExperimentalComposeUiApi::class, ExperimentalFoundationApi::class)
fun Modifier.onExternalDragCompat(hover: (Boolean) -> Unit, drop: (List<File>) -> Unit): Modifier = this.dragAndDropTarget(
    shouldStartDragAndDrop = { e -> e.awtTransferable.isDataFlavorSupported(DataFlavor.javaFileListFlavor) },
    target = object : DragAndDropTarget {
        override fun onEntered(event: DragAndDropEvent) { hover(true) }
        override fun onExited(event: DragAndDropEvent) { hover(false) }
        override fun onDrop(event: DragAndDropEvent): Boolean { hover(false)
            return runCatching { @Suppress("UNCHECKED_CAST") drop(event.awtTransferable.getTransferData(DataFlavor.javaFileListFlavor) as List<File>); true }.getOrDefault(false) }
    })
