package com.example.aicamerastudio.editor

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Movie
import androidx.compose.material.icons.filled.PersonAddAlt
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.aicamerastudio.core.design.Tokens
import com.example.aicamerastudio.core.design.reducedMotion
import kotlinx.coroutines.delay

private val Charcoal = Color(0xFF121418)
private val CharcoalPressed = Color(0xFF1A1D23)
private val Hairline = Color(0xFF23272F)
private val Muted = Color(0xFF9AA1AD)

private data class Tool(val icon: ImageVector, val title: String, val line: String, val onClick: () -> Unit)
private data class Group(val label: String, val tools: List<Tool>)

/**
 * Studio: compact list of creative tools. Each row opens the same screen or picker as before;
 * Remove and Place open directly, and saved composite projects are one row away.
 */
@Composable
fun StudioScreen(
    onEditPhoto: (Uri) -> Unit,
    onTrimVideo: (Uri) -> Unit,
    onCreate: () -> Unit,
    onComposite: () -> Unit,
    onRemovePerson: () -> Unit = onComposite,
    onPlacePerson: () -> Unit = onComposite,
) {
    val photo = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { it?.let(onEditPhoto) }
    val video = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { it?.let(onTrimVideo) }
    val groups = listOf(
        Group("CREATE", listOf(
            Tool(Icons.Default.AutoAwesome, "AI Image Creator", "Describe an image and create it, on device or online", onCreate),
        )),
        Group("EDIT", listOf(
            Tool(Icons.Default.Tune, "Photo Editor", "Light, colour, detail, filters, crop and rotate", { photo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }),
            Tool(Icons.Default.Movie, "Video Editor", "Trim clips and remove sound, saved as a new video", { video.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) }),
        )),
        Group("AI COMPOSITE", listOf(
            Tool(Icons.Default.PersonRemove, "Remove a Person", "Select someone and rebuild the background", onRemovePerson),
            Tool(Icons.Default.PersonAddAlt, "Place a Person", "Blend a person into another photo with shadows", onPlacePerson),
            Tool(Icons.Default.FolderOpen, "Composite Projects", "Reopen and continue saved compositions", onComposite),
        )),
    )

    Column(
        Modifier.fillMaxSize().background(Tokens.black).windowInsetsPadding(WindowInsets.statusBars)
            .verticalScroll(rememberScrollState()).padding(horizontal = 14.dp),
    ) {
        Spacer(Modifier.height(14.dp))
        Text("Studio", color = Color.White, fontFamily = FontFamily.Serif, fontWeight = FontWeight.SemiBold, fontSize = 26.sp,
            modifier = Modifier.semantics { heading() })
        Text("Create · Edit · Compose", color = Tokens.gold.copy(alpha = 0.85f), fontSize = 12.sp, letterSpacing = 1.2.sp)
        var index = 0
        groups.forEach { g ->
            Text(g.label, color = Tokens.gold.copy(alpha = 0.7f), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, letterSpacing = 1.6.sp,
                modifier = Modifier.padding(top = 18.dp, bottom = 6.dp, start = 2.dp).semantics { heading() })
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                g.tools.forEach { t -> ToolRow(t, index++) }
            }
        }
        Text("Picked photos and videos are opened only for editing. Results are saved as new files; originals are never changed.",
            color = Muted.copy(alpha = 0.8f), fontSize = 11.sp, lineHeight = 15.sp, modifier = Modifier.padding(top = 18.dp, bottom = 16.dp, start = 2.dp, end = 2.dp))
    }
}

@Composable
private fun ToolRow(t: Tool, index: Int) {
    val reduced = reducedMotion()
    // Rows rise in one after another the first time the page opens.
    val appear = remember { Animatable(if (reduced) 1f else 0f) }
    LaunchedEffect(Unit) { if (!reduced) { delay(40L * index); appear.animateTo(1f, tween(260, easing = FastOutSlowInEasing)) } }
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed && !reduced) 0.98f else 1f, tween(120), label = "press")
    val shape = RoundedCornerShape(14.dp)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 60.dp)
            .alpha(appear.value).offset(y = (8 * (1 - appear.value)).dp).scale(scale)
            .clip(shape).background(if (pressed) CharcoalPressed else Charcoal).border(1.dp, Hairline, shape)
            .clickable(source, indication = null, role = Role.Button, onClick = t.onClick)
            .semantics(mergeDescendants = true) { contentDescription = "${t.title}. ${t.line}" }
            .padding(horizontal = 12.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(36.dp).clip(CircleShape).background(Color(0xFF1A1D23)).border(1.dp, Tokens.gold.copy(alpha = 0.45f), CircleShape),
            contentAlignment = Alignment.Center) {
            Icon(t.icon, null, tint = Tokens.gold, modifier = Modifier.size(18.dp))
        }
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(t.title, color = Color.White, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(t.line, color = Muted, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, null, tint = Tokens.gold.copy(alpha = 0.8f), modifier = Modifier.size(18.dp))
    }
}
