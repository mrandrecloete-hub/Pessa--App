package com.pdfmaster.app.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color as AColor
import android.graphics.Paint
import android.graphics.Path as APath
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.pdfmaster.app.data.Signature
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

/** Turns drawn strokes into a tightly cropped PNG with a transparent background. */
fun strokesToPng(strokes: List<List<Offset>>, color: Int, width: Float): ByteArray? {
    val pts = strokes.flatten(); if (pts.size < 2) return null
    val pad = width * 2
    val minX = pts.minOf { it.x } - pad; val minY = pts.minOf { it.y } - pad
    val w = (pts.maxOf { it.x } + pad - minX).toInt().coerceAtLeast(8); val h = (pts.maxOf { it.y } + pad - minY).toInt().coerceAtLeast(8)
    val s = minOf(1f, 1400f / maxOf(w, h)).let { if (maxOf(w, h) < 700) 700f / maxOf(w, h) else it }
    val bmp = Bitmap.createBitmap((w * s).toInt().coerceAtLeast(8), (h * s).toInt().coerceAtLeast(8), Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp); c.drawColor(AColor.TRANSPARENT)
    val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color or (0xFF shl 24); style = Paint.Style.STROKE; strokeWidth = width * s; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
    for (st in strokes) { if (st.isEmpty()) continue; val path = APath(); path.moveTo((st[0].x - minX) * s, (st[0].y - minY) * s)
        if (st.size == 1) path.lineTo((st[0].x - minX) * s + 0.5f, (st[0].y - minY) * s) else st.drop(1).forEach { path.lineTo((it.x - minX) * s, (it.y - minY) * s) }
        c.drawPath(path, p) }
    return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }.toByteArray()
}

/** Full width pad for drawing a signature or initials with a finger or stylus. */
@Composable
fun SignaturePad(title: String, onCancel: () -> Unit, onDone: (ByteArray) -> Unit) {
    val strokes = remember { mutableStateListOf<List<Offset>>() }
    var live by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var color by remember { mutableIntStateOf(0x111111) }
    Dialog(onDismissRequest = onCancel, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxWidth().padding(12.dp), shape = MaterialTheme.shapes.large) {
            Column(Modifier.padding(16.dp)) {
                Text(title, style = MaterialTheme.typography.titleLarge)
                Text("Sign inside the box", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Box(Modifier.fillMaxWidth().height(220.dp).clip(RoundedCornerShape(14.dp)).background(Color.White).border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(14.dp))
                    .pointerInput(Unit) { detectDragGestures(onDragStart = { live = listOf(it) }, onDrag = { ch, _ -> ch.consume(); live = live + ch.position }, onDragEnd = { strokes.add(live); live = emptyList() }, onDragCancel = { live = emptyList() }) }) {
                    Canvas(Modifier.fillMaxSize()) {
                        drawLine(Color(0xFFCBD5E1), Offset(24f, size.height * 0.78f), Offset(size.width - 24f, size.height * 0.78f), 2f)
                        for (st in strokes + listOf(live)) { if (st.size < 2) continue; val p = Path().apply { moveTo(st[0].x, st[0].y); st.drop(1).forEach { lineTo(it.x, it.y) } }
                            drawPath(p, Color(color or (0xFF shl 24)), style = Stroke(6f, cap = StrokeCap.Round, join = StrokeJoin.Round)) }
                    }
                }
                Row(Modifier.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    listOf(0x111111, 0x1D4ED8, 0x0F766E).forEach { c -> Box(Modifier.size(30.dp).clip(CircleShape).background(Color(c or (0xFF shl 24))).border(if (color == c) 3.dp else 0.dp, MaterialTheme.colorScheme.primary, CircleShape).clickable { color = c }) }
                    Spacer(Modifier.weight(1f))
                    TextButton(onClick = { strokes.clear() }) { Text("Clear") }
                }
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onCancel) { Text("Cancel") }
                    Button(onClick = { strokesToPng(strokes.toList(), color, 6f)?.let(onDone) }, enabled = strokes.isNotEmpty()) { Text("Use") }
                }
            }
        }
    }
}

/** Reads a picked picture, shrinks it if it is very large and returns PNG (keeps transparency) or JPG bytes. */
suspend fun readPicture(context: android.content.Context, uri: android.net.Uri, maxSide: Int = 1600): ByteArray? = withContext(Dispatchers.IO) {
    try {
        val raw = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@withContext null
        val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
        android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.size, o)
        if (o.outWidth <= 0) return@withContext null
        var s = 1; while (maxOf(o.outWidth, o.outHeight) / (s * 2) >= maxSide) s *= 2
        val bmp = android.graphics.BitmapFactory.decodeByteArray(raw, 0, raw.size, android.graphics.BitmapFactory.Options().apply { inSampleSize = s }) ?: return@withContext null
        ByteArrayOutputStream().also { bmp.compress(if (bmp.hasAlpha()) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, 90, it) }.toByteArray()
    } catch (e: Throwable) { null }
}

/** Saves a signature picture privately and records it so it can be reused. */
suspend fun saveSignature(vm: AppViewModel, bytes: ByteArray, kind: String): Signature = withContext(Dispatchers.IO) {
    val id = UUID.randomUUID().toString()
    val f = File(vm.library.signaturesDir, "$id.png"); f.writeBytes(bytes)
    Signature(id, if (kind == "initials") "Initials" else "Signature", f.absolutePath, kind).also { vm.dao.putSignature(it) }
}

@Composable
fun SignatureImage(sig: Signature, modifier: Modifier = Modifier) {
    val bmp = remember(sig.id) { runCatching { android.graphics.BitmapFactory.decodeFile(sig.path) }.getOrNull() }
    Box(modifier.clip(RoundedCornerShape(12.dp)).background(Color.White).border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(12.dp)).padding(8.dp), contentAlignment = Alignment.Center) {
        if (bmp != null) Image(bmp.asImageBitmap(), sig.name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
    }
}

/** Signature studio: draw, import, reuse and delete signatures and initials. With [onPick] it works as a chooser. */
@Composable
fun SignatureList(vm: AppViewModel, onPick: ((Signature) -> Unit)? = null) {
    val sigs by vm.signatures.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope(); val context = LocalContext.current
    var pad by remember { mutableStateOf("") }
    var del by remember { mutableStateOf<Signature?>(null) }
    val pickImage = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) scope.launch { val b = readPicture(context, uri, 1200); if (b == null) vm.say("That picture could not be read") else { val s = saveSignature(vm, b, "signature"); onPick?.invoke(s) } }
    }
    Column {
        Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = { pad = "signature" }, modifier = Modifier.weight(1f)) { Icon(Icons.Outlined.Draw, null); Text("  Draw") }
            OutlinedButton(onClick = { pad = "initials" }, modifier = Modifier.weight(1f)) { Text("Initials") }
            OutlinedButton(onClick = { pickImage.launch("image/*") }, modifier = Modifier.weight(1f)) { Text("Picture") }
        }
        if (sigs.isEmpty()) Text("No saved signatures yet. Draw one, or import a photo of your signature (a transparent PNG looks best).", Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
        LazyColumn(Modifier.heightIn(max = 420.dp), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(sigs, key = { it.id }) { s ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    SignatureImage(s, Modifier.weight(1f).height(84.dp).clickable(enabled = onPick != null) { onPick?.invoke(s) })
                    Column(Modifier.padding(start = 10.dp)) { Text(s.name, style = MaterialTheme.typography.labelMedium); IconButton(onClick = { del = s }) { Icon(Icons.Outlined.Delete, "Delete") } }
                }
            }
        }
    }
    if (pad.isNotEmpty()) SignaturePad(if (pad == "initials") "Draw your initials" else "Draw your signature", { pad = "" }) { bytes -> val kind = pad; pad = ""; scope.launch { val s = saveSignature(vm, bytes, kind); onPick?.invoke(s) } }
    del?.let { s -> ConfirmDialog("Delete this signature?", "It is removed from this phone. Documents you already signed keep it.", "Delete", { del = null }, { scope.launch { withContext(Dispatchers.IO) { File(s.path).delete() }; vm.dao.deleteSignature(s.id) }; del = null }, danger = true) }
}

@Composable
fun SignaturesScreen(vm: AppViewModel, nav: Nav) {
    Scaffold(topBar = { BackBar("Signatures", { nav.back() }) }) { pad ->
        Column(Modifier.padding(pad).padding(top = 8.dp)) {
            Surface(color = MaterialTheme.colorScheme.secondaryContainer, shape = MaterialTheme.shapes.medium, modifier = Modifier.padding(16.dp)) {
                Text("These are electronic signature pictures that you place on a page. They are stored only on this phone. They are not certificate based digital signatures, which prove who signed; that is planned for a later version.",
                    Modifier.padding(14.dp), style = MaterialTheme.typography.bodySmall)
            }
            SignatureList(vm)
        }
    }
}
