package com.pdfmaster.app.ui

import android.graphics.Bitmap
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pdfmaster.app.data.AndroidRasterizer
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.tools.human
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Small in-memory cache of first-page thumbnails, sized by bytes so it cannot grow without limit. */
object Thumbs {
    private val cache = object : LruCache<String, Bitmap>(24 * 1024 * 1024) { override fun sizeOf(key: String, value: Bitmap) = value.byteCount }
    suspend fun get(doc: Doc, page: Int = 0, side: Int = 320): Bitmap? = withContext(Dispatchers.IO) {
        val key = "${doc.id}:$page:$side:${doc.size}"
        cache.get(key) ?: try {
            val bmp = if (doc.isPdf) AndroidRasterizer(File(doc.path)).use { it.render(page, side) } else decodeSampled(File(doc.path), side)
            bmp?.also { cache.put(key, it) }
        } catch (e: Throwable) { null }
    }
    fun decodeSampled(f: File, side: Int): Bitmap? {
        val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeFile(f.absolutePath, o)
        if (o.outWidth <= 0) return null
        var s = 1; while (maxOf(o.outWidth, o.outHeight) / (s * 2) >= side) s *= 2
        return android.graphics.BitmapFactory.decodeFile(f.absolutePath, android.graphics.BitmapFactory.Options().apply { inSampleSize = s })
    }
}

fun typeColor(ext: String): Color = when (ext) {
    "pdf" -> Color(0xFFE5484D); "docx", "rtf" -> Color(0xFF2563EB); "xlsx", "csv" -> Color(0xFF16A34A); "pptx" -> Color(0xFFEA580C)
    "jpg", "jpeg", "png", "webp", "tiff" -> Color(0xFF8B5CF6); else -> Color(0xFF64748B)
}

@Composable
fun DocThumb(doc: Doc, modifier: Modifier = Modifier, width: Dp = 52.dp, height: Dp = 68.dp) {
    var bmp by remember(doc.id, doc.size) { mutableStateOf<Bitmap?>(null) }
    val visual = doc.isPdf && !doc.locked || doc.ext in setOf("jpg", "jpeg", "png", "webp")
    if (visual) LaunchedEffect(doc.id, doc.size) { bmp = Thumbs.get(doc) }
    Box(modifier.size(width, height).clip(RoundedCornerShape(8.dp)).background(Color.White).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(8.dp)), contentAlignment = Alignment.Center) {
        val b = bmp
        if (b != null) Image(b.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alignment = Alignment.TopCenter)
        else if (doc.locked) Icon(Icons.Outlined.Lock, null, tint = typeColor(doc.ext))
        Box(Modifier.align(Alignment.BottomStart).padding(3.dp).clip(RoundedCornerShape(4.dp)).background(typeColor(doc.ext)).padding(horizontal = 4.dp, vertical = 1.dp)) {
            Text(doc.ext.uppercase().take(4), color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Bold, lineHeight = 11.sp)
        }
    }
}

fun whenText(ms: Long): String {
    val diff = System.currentTimeMillis() - ms
    return when {
        diff < 60_000 -> "Just now"
        diff < 3_600_000 -> "${diff / 60_000} min ago"
        diff < 86_400_000 -> "${diff / 3_600_000} h ago"
        diff < 7 * 86_400_000L -> "${diff / 86_400_000} d ago"
        else -> SimpleDateFormat("d MMM yyyy", Locale.getDefault()).format(Date(ms))
    }
}

fun docLine(d: Doc): String = listOfNotNull(human(d.size), if (d.pages > 0) "${d.pages} page${if (d.pages == 1) "" else "s"}" else null, whenText(d.addedAt)).joinToString("  ·  ")

@Composable
fun DocRow(doc: Doc, onClick: () -> Unit, modifier: Modifier = Modifier, trailing: @Composable (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        DocThumb(doc, width = 44.dp, height = 58.dp)
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(doc.name, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(docLine(doc), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
        if (doc.favourite) Icon(Icons.Outlined.Star, "Favourite", tint = Color(0xFFF59E0B), modifier = Modifier.size(18.dp))
        trailing?.invoke()
    }
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, action: String? = null, onAction: () -> Unit = {}) {
    Row(modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 18.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
        if (action != null) TextButton(onClick = onAction) { Text(action) }
    }
}

@Composable
fun SoftCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier, shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp, shadowElevation = 1.dp) { Column(content = content) }
}

@Composable
fun IconBadge(icon: ImageVector, tint: Color, size: Dp = 44.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(size / 3.2f)).background(tint.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
        Icon(icon, null, tint = tint, modifier = Modifier.size(size * 0.52f))
    }
}

@Composable
fun GradientButton(text: String, icon: ImageVector?, onClick: () -> Unit, modifier: Modifier = Modifier, brush: Brush = Brand.Accent, enabled: Boolean = true) {
    Row(modifier.clip(RoundedCornerShape(18.dp)).background(if (enabled) brush else Brush.linearGradient(listOf(Color.Gray, Color.Gray))).clickable(enabled = enabled, onClick = onClick)
        .heightIn(min = 52.dp).padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        if (icon != null) { Icon(icon, null, tint = Color.White); Spacer(Modifier.width(10.dp)) }
        Text(text, color = Color.White, style = MaterialTheme.typography.titleSmall)
    }
}

@Composable
fun EmptyState(icon: ImageVector, title: String, text: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(modifier.fillMaxWidth().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(34.dp))
        }
        Spacer(Modifier.height(14.dp))
        Text(title, style = MaterialTheme.typography.titleMedium)
        Spacer(Modifier.height(4.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
        if (action != null) { Spacer(Modifier.height(16.dp)); action() }
    }
}

@Composable
fun PasswordDialog(name: String, wrong: Boolean, onCancel: () -> Unit, onOk: (String) -> Unit) {
    var pw by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onCancel, icon = { Icon(Icons.Outlined.Lock, null) }, title = { Text("Password needed") },
        text = { Column {
            Text(if (wrong) "That password did not open $name. Try again." else "$name is protected. Type its password to continue.")
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(pw, { pw = it }, label = { Text("Password") }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Password), isError = wrong, modifier = Modifier.fillMaxWidth())
        } },
        confirmButton = { TextButton(onClick = { onOk(pw) }, enabled = pw.isNotEmpty()) { Text("Open") } }, dismissButton = { TextButton(onClick = onCancel) { Text("Cancel") } })
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onCancel: () -> Unit, onOk: () -> Unit, danger: Boolean = false) {
    AlertDialog(onDismissRequest = onCancel, title = { Text(title) }, text = { Text(text) },
        confirmButton = { TextButton(onClick = onOk, colors = if (danger) ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error) else ButtonDefaults.textButtonColors()) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onCancel) { Text("Cancel") } })
}

@Composable
fun TextDialog(title: String, label: String, initial: String, confirm: String, onCancel: () -> Unit, multiline: Boolean = false, onOk: (String) -> Unit) {
    var v by remember { mutableStateOf(initial) }
    AlertDialog(onDismissRequest = onCancel, title = { Text(title) },
        text = { OutlinedTextField(v, { v = it }, label = { Text(label) }, singleLine = !multiline, minLines = if (multiline) 3 else 1, modifier = Modifier.fillMaxWidth()) },
        confirmButton = { TextButton(onClick = { onOk(v) }, enabled = v.isNotBlank()) { Text(confirm) } }, dismissButton = { TextButton(onClick = onCancel) { Text("Cancel") } })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackBar(title: String, onBack: () -> Unit, subtitle: String? = null, actions: @Composable RowScope.() -> Unit = {}) {
    TopAppBar(title = { Column { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
        if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) } },
        navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.Outlined.ArrowBack, "Back") } }, actions = actions,
        colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background))
}
