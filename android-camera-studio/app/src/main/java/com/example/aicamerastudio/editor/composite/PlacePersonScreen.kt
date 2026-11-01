package com.example.aicamerastudio.editor.composite

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Redo
import androidx.compose.material.icons.automirrored.filled.Undo
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.example.aicamerastudio.app.App
import com.example.aicamerastudio.core.common.JobState
import com.example.aicamerastudio.core.design.*
import com.example.aicamerastudio.core.errors.AppError
import com.example.aicamerastudio.core.errors.ErrorCode
import com.example.aicamerastudio.core.errors.ErrorMapper
import com.example.aicamerastudio.core.errors.Errors
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.database.CompositeProject
import com.example.aicamerastudio.data.database.MediaAsset
import com.example.aicamerastudio.editor.masks.AlphaMask
import com.example.aicamerastudio.editor.masks.MaskOps
import com.example.aicamerastudio.editor.photo.EditHistory
import com.example.aicamerastudio.photo.ai.ModelNames
import com.example.aicamerastudio.photo.ai.ModelUnavailable
import com.example.aicamerastudio.photo.compositing.*
import com.example.aicamerastudio.photo.enhancement.ExifCopy
import com.example.aicamerastudio.photo.imaging.Resample
import com.example.aicamerastudio.photo.segmentation.DetectedPerson
import com.example.aicamerastudio.photo.segmentation.PeopleFinder
import com.example.aicamerastudio.photo.segmentation.PersonSegmenter
import com.example.aicamerastudio.photo.segmentation.TapSegmenter
import kotlinx.coroutines.*
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

private enum class Step(val label: String) { PERSON("Person"), SCENE("Scene"), ARRANGE("Arrange"), MATCH("Light & colour"), SHADOWS("Shadows"), FOREGROUND("In front") }

/** The cut out person: pixels and alpha cropped to the selection, plus its normalised box in the source. */
private class Layer(val px: IntArray, val alpha: FloatArray, val w: Int, val h: Int, val box: FloatArray, val cutEdges: List<String>)

private fun makeLayer(src: WorkImage, m: AlphaMask): Layer? {
    val b = m.bounds(0.02f) ?: return null
    val pad = (max(b.w, b.h) * 0.02f).toInt() + 2
    val x0 = max(0, b.x - pad); val y0 = max(0, b.y - pad); val x1 = min(src.w, b.x + b.w + pad); val y1 = min(src.h, b.y + b.h + pad)
    val w = x1 - x0; val h = y1 - y0
    // Is the person cut off by the source photo's frame? Then a straight edge would show in the composite.
    fun rowCov(y: Int) = (0 until src.w).count { m.data[y * src.w + it] > 0.5f }
    fun colCov(x: Int) = (0 until src.h).count { m.data[it * src.w + x] > 0.5f }
    val cut = buildList {
        if (rowCov(src.h - 1) > src.w / 50) add("bottom"); if (rowCov(0) > src.w / 50) add("top")
        if (colCov(0) > src.h / 50) add("left"); if (colCov(src.w - 1) > src.h / 50) add("right")
    }
    return Layer(Resample.crop(src.px, src.w, x0, y0, w, h), Resample.cropF(m.data, src.w, x0, y0, w, h), w, h,
        floatArrayOf(x0.toFloat() / src.w, y0.toFloat() / src.h, w.toFloat() / src.w, h.toFloat() / src.h), cut)
}

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun PlacePersonScreen(projectId: String?, onBack: () -> Unit, onOpenResult: (Uri) -> Unit) {
    val context = LocalContext.current
    val graph = (context.applicationContext as App).graph
    val scope = rememberCoroutineScope()
    val id = remember { projectId ?: UUID.randomUUID().toString() }

    var step by remember { mutableStateOf(Step.PERSON) }
    var src by remember { mutableStateOf<WorkImage?>(null) }
    var dst by remember { mutableStateOf<WorkImage?>(null) }
    var person by remember { mutableStateOf<AlphaMask?>(null) }
    var personV by remember { mutableIntStateOf(0) }
    var occ by remember { mutableStateOf<AlphaMask?>(null) }
    var occV by remember { mutableIntStateOf(0) }
    val personHist = remember { MaskHistory() }; val occHist = remember { MaskHistory() }
    var people by remember { mutableStateOf<List<DetectedPerson>>(emptyList()) }
    val hist = remember { EditHistory(LayerParams()) }
    var params by remember { mutableStateOf(LayerParams()) }
    var mode by remember { mutableStateOf(CanvasMode.TAP) }
    var brush by remember { mutableFloatStateOf(30f) }
    var cutoutView by remember { mutableStateOf(false) }
    var rendered by remember { mutableStateOf<IntArray?>(null) }
    var showBefore by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf<String?>(null) }
    var progress by remember { mutableStateOf<Float?>(null) }
    var job by remember { mutableStateOf<Job?>(null) }
    var error by remember { mutableStateOf<AppError?>(null) }
    var info by remember { mutableStateOf<String?>(null) }
    var strokeOpen by remember { mutableStateOf(false) }
    val tSrc = remember { CanvasTransform() }; val tDst = remember { CanvasTransform() }
    val layer = remember(personV, src) { val s = src; val m = person; if (s != null && m != null) makeLayer(s, m) else null }

    fun persist() {
        val s = src ?: return
        scope.launch(Dispatchers.IO) {
            val now = System.currentTimeMillis()
            val pf = person?.let { graph.projectFiles.saveMask(id, "person", it) }
            val of = occ?.let { graph.projectFiles.saveMask(id, "occluder", it) }
            val old = graph.database.projects().get(id)
            graph.database.projects().upsert(CompositeProject(id, "place", s.uri.toString(), dst?.uri?.toString(), LayerCodec.encode(params),
                hist.snapshot().let { (list, pos) -> val start = max(0, list.size - 40); (listOf("pos=${max(0, pos - start)}") + list.drop(start).map { LayerCodec.encode(it) }).joinToString("\n") }, pf, of,
                layer?.box?.joinToString(","), old?.createdAt ?: now, now, old?.lastExportUri))
        }
    }
    fun commit(p: LayerParams) { params = p.validated(); hist.push(params); persist() }
    fun commitPerson(m: AlphaMask) { person = m; personV++; persist() }
    fun commitOcc(m: AlphaMask) { occ = m; occV++; persist() }

    suspend fun loadSource(uri: Uri, saved: AlphaMask?) {
        busy = "Opening photo"; error = null
        try {
            val w = withContext(Dispatchers.IO) { WorkImage.load(context, uri, 1600) }
            src = w
            busy = "Finding people"
            val found = withContext(Dispatchers.Default) {
                try { PeopleFinder.find(PersonSegmenter(graph.models.get(ModelNames.PERSON_SEG)).segment(w.px, w.w, w.h)) } catch (e: ModelUnavailable) { error = e.toAppError(); emptyList() }
            }
            people = found
            val m = saved?.takeIf { it.width == w.w && it.height == w.h }
                ?: found.firstOrNull()?.let { p -> AlphaMask(w.w, w.h, withContext(Dispatchers.Default) { MaskOps.refine(p.mask, Resample.luma(w.px), w.w, w.h) }) }
                ?: AlphaMask(w.w, w.h)
            person = m; personV++
            if (found.isEmpty() && saved == null) error = AppError(ErrorCode.INFERENCE_FAILED, "No person was found automatically.", "Tap the person, or paint them with Brush add.", true, false)
            else if (found.size > 1 && saved == null) info = "${found.size} people found. Person 1 is selected; tap a chip to choose another."
        } catch (t: Throwable) { if (t is CancellationException) throw t; error = ErrorMapper.map(t) } finally { busy = null }
    }
    suspend fun loadDest(uri: Uri, saved: AlphaMask?) {
        busy = "Opening scene"; error = null
        try {
            val w = withContext(Dispatchers.IO) { WorkImage.load(context, uri, 1280) }
            dst = w
            occ = saved?.takeIf { it.width == w.w && it.height == w.h } ?: AlphaMask(w.w, w.h); occV++
            val lay = layer
            if (lay != null && params == LayerParams()) {
                // Start with the person standing on the lower part of the scene at a moderate size.
                commit(LayerParams(cx = 0.5f, cy = 0.62f, heightFrac = 0.5f))
            }
        } catch (t: Throwable) { if (t is CancellationException) throw t; error = ErrorMapper.map(t) } finally { busy = null }
    }

    LaunchedEffect(projectId) {
        val p = projectId?.let { graph.database.projects().get(it) } ?: return@LaunchedEffect
        loadSource(Uri.parse(p.sourceUri), graph.projectFiles.loadMask(projectId, p.maskFile))
        LayerCodec.decode(p.params)?.let { hist.reset(it); params = it }
        p.history?.lines()?.let { lines ->
            val pos = lines.firstOrNull()?.removePrefix("pos=")?.toIntOrNull()
            val states = lines.drop(1).mapNotNull { LayerCodec.decode(it) }
            if (pos != null && states.isNotEmpty()) { hist.restore(states, pos); params = hist.current }
        }
        p.destUri?.let { loadDest(Uri.parse(it), graph.projectFiles.loadMask(projectId, p.occluderFile)) }
        step = if (p.destUri != null) Step.ARRANGE else Step.PERSON
    }
    val pickSource = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) scope.launch { loadSource(u, null) } }
    val pickDest = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { u -> if (u != null) scope.launch { loadDest(u, null); step = Step.ARRANGE } }

    // Live preview of the composite at working resolution.
    LaunchedEffect(params, layer, occV, dst, step) {
        val d = dst ?: return@LaunchedEffect; val l = layer ?: return@LaunchedEffect
        delay(16)
        rendered = withContext(Dispatchers.Default) {
            // Shrink the cut out to about its on screen size so dragging stays responsive.
            val targetH = (params.heightFrac * d.h * 1.2f).toInt().coerceAtLeast(16)
            val (cp, ca, cw, ch) = if (l.h > targetH) {
                val nw = max(4, l.w * targetH / l.h)
                listOf(Resample.area(l.px, l.w, l.h, nw, targetH), Resample.bilinear(l.alpha, l.w, l.h, nw, targetH), nw, targetH)
            } else listOf(l.px, l.alpha, l.w, l.h)
            @Suppress("UNCHECKED_CAST")
            val out = Compositor.render(d.px, d.w, d.h, cp as IntArray, ca as FloatArray, cw as Int, ch as Int, params, occ?.data).pixels
            if (params.keepScaleWithDepth && step == Step.ARRANGE) { // show the horizon guide in the preview only
                val y = (params.horizonY * d.h).roundToInt()
                if (y in 0 until d.h) for (x in 0 until d.w) if ((x / 8) % 2 == 0) out[y * d.w + x] = 0xFFFFD54F.toInt()
            }
            out
        }
    }

    fun tapSelect(img: WorkImage, target: AlphaMask, x: Float, y: Float, isPerson: Boolean) {
        job = scope.launch {
            busy = "Selecting"
            try {
                val sel = withContext(Dispatchers.Default) {
                    (if (isPerson) people.firstOrNull { p -> p.mask[y.toInt().coerceIn(0, img.h - 1) * img.w + x.toInt().coerceIn(0, img.w - 1)] > 0.5f }?.mask else null)
                        ?: TapSegmenter(graph.models.get(ModelNames.TAP_SELECT)).select(img.px, img.w, img.h, x, y)
                }
                if (isPerson) personHist.record(target) else occHist.record(target)
                val n = target.copy(); n.union(AlphaMask(img.w, img.h, sel))
                if (isPerson) commitPerson(n) else commitOcc(n)
            } catch (e: ModelUnavailable) { error = e.toAppError() } finally { busy = null }
        }
    }

    fun autoMatch() {
        val d = dst ?: return; val l = layer ?: return
        scope.launch {
            busy = "Analysing both photos"
            val s = withContext(Dispatchers.Default) {
                val corners = LayerGeometry.corners(params, l.w, l.h, d.w, d.h)
                val bx0 = max(0, corners.minOf { it.first }.toInt()); val bx1 = min(d.w, corners.maxOf { it.first }.toInt())
                val by0 = max(0, corners.minOf { it.second }.toInt()); val by1 = min(d.h, corners.maxOf { it.second }.toInt())
                // Destination area around the person (1.5x box), excluding the box itself.
                val ex = (bx1 - bx0) / 2; val ey = (by1 - by0) / 2
                val wgt = FloatArray(d.w * d.h) { i -> val x = i % d.w; val y = i / d.w
                    val inOuter = x in bx0 - ex until bx1 + ex && y in by0 - ey until by1 + ey
                    val inBox = x in bx0 until bx1 && y in by0 until by1
                    if (inOuter && !inBox) 1f else 0f }
                val ds = SceneAnalysis.stats(d.px, d.w, d.h, if (wgt.any { it > 0f }) wgt else null)
                val ps = SceneAnalysis.stats(l.px, l.w, l.h, l.alpha)
                val colour = SceneAnalysis.suggestColour(ps, ds)
                // Blur: compare sharpness at the size the person will appear.
                val th = max(16, (params.heightFrac * d.h).toInt()); val tw = max(4, l.w * th / l.h)
                val small = Resample.resize(l.px, l.w, l.h, tw, th); val sa = Resample.bilinear(l.alpha, l.w, l.h, tw, th)
                val sigma = BlurMatch.suggestSigma(small, sa, tw, th, ds.sharpness)
                val light = SceneAnalysis.estimateLight(d.px, d.w, d.h)
                Triple(colour, sigma / (d.h / 300f), light)
            }
            val (c, blur, light) = s
            commit(params.copy(exposure = c.exposure, contrast = c.contrast, temperature = c.temperature, blur = blur.coerceIn(0f, 1f)))
            info = "Matched brightness, contrast, colour temperature and sharpness to the scene. These are estimates: adjust the sliders if needed." +
                if (light.confidence > 0.25f) " The scene looks brighter on one side, so the shadow direction can follow it (Shadows tab)." else ""
            busy = null
        }
    }

    fun export() {
        val s = src ?: return; val d = dst ?: return; val l = layer ?: return
        job = scope.launch {
            busy = "Exporting at full resolution"; progress = null; error = null
            try {
                val res = withContext(Dispatchers.Default) {
                    graph.media.requireFree(MediaStoreRepository.MIN_PHOTO_FREE)
                    val notes = ArrayList<String>()
                    var (dpx, dw, dh) = WorkImage.full(context, d.uri)
                    if (dw.toLong() * dh > 16_000_000L) {
                        val sc = kotlin.math.sqrt(16_000_000.0 / (dw.toLong() * dh)); val nw = (dw * sc).toInt(); val nh = (dh * sc).toInt()
                        dpx = Resample.area(dpx, dw, dh, nw, nh); dw = nw; dh = nh; notes += "The scene was reduced to 16 MP to fit in memory."
                    }
                    val (spx, sw, sh) = WorkImage.full(context, s.uri)
                    val cx0 = (l.box[0] * sw).toInt().coerceIn(0, sw - 1); val cy0 = (l.box[1] * sh).toInt().coerceIn(0, sh - 1)
                    val cw = (l.box[2] * sw).toInt().coerceIn(1, sw - cx0); val ch = (l.box[3] * sh).toInt().coerceIn(1, sh - cy0)
                    // Only keep the source resolution that the placement can use.
                    val needH = min(ch, (params.heightFrac * dh * 1.1f).toInt().coerceAtLeast(16)); val needW = max(4, cw * needH / ch)
                    val crop = Resample.resize(Resample.crop(spx, sw, cx0, cy0, cw, ch), cw, ch, needW, needH)
                    // Selection was made at working resolution: enlarge it, then snap it to the full resolution edges.
                    val coarse = Resample.bilinear(l.alpha, l.w, l.h, needW, needH)
                    val alpha = MaskOps.refine(coarse, Resample.luma(crop), needW, needH, strength = 0.6f)
                    val occFull = occ?.let { Resample.bilinear(it.data, it.width, it.height, dw, dh) }
                    val out = Compositor.render(dpx, dw, dh, crop, alpha, needW, needH, params, occFull).pixels
                    val bmp = bitmapOf(out, dw, dh)
                    val uri = graph.media.saveJpeg(MediaStoreRepository.timestampName("AICS_", "_composite"), bmp, 95) { u -> ExifCopy.copy(context, d.uri, u, "BlazeCam (composite of two photos)") }
                    bmp.recycle()
                    graph.database.assets().upsert(MediaAsset(UUID.randomUUID().toString(), "composite", d.uri.toString(), uri.toString(), System.currentTimeMillis(),
                        dw, dh, 0, JobState.SUCCEEDED.name, null, (notes + "Composite of two photos. The person was not regenerated; only cut out, transformed and blended.").joinToString(" "), 0, id))
                    graph.database.projects().get(id)?.let { p -> graph.database.projects().upsert(p.copy(updatedAt = System.currentTimeMillis(), lastExportUri = uri.toString())) }
                    uri
                }
                onOpenResult(res)
            } catch (e: OutOfMemoryError) { error = Errors.lowMemory() } catch (e: CancellationException) { error = Errors.interrupted() }
            catch (t: Throwable) { error = ErrorMapper.map(t) } finally { busy = null }
        }
    }

    Column(Modifier.fillMaxSize()) {
        TopAppBar(title = { Text("Place a person") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, "Back") } }, actions = {
            val maskStep = step == Step.PERSON || step == Step.FOREGROUND
            IconButton({
                if (step == Step.PERSON) person?.let { c -> personHist.undo(c)?.let { commitPerson(it) } }
                else if (step == Step.FOREGROUND) occ?.let { c -> occHist.undo(c)?.let { commitOcc(it) } }
                else { params = hist.undo(); persist() }
            }, enabled = busy == null && (if (step == Step.PERSON) personHist.canUndo else if (step == Step.FOREGROUND) occHist.canUndo else hist.canUndo)) { Icon(Icons.AutoMirrored.Filled.Undo, "Undo") }
            IconButton({
                if (step == Step.PERSON) person?.let { c -> personHist.redo(c)?.let { commitPerson(it) } }
                else if (step == Step.FOREGROUND) occ?.let { c -> occHist.redo(c)?.let { commitOcc(it) } }
                else { params = hist.redo(); persist() }
            }, enabled = busy == null && (if (maskStep) (if (step == Step.PERSON) personHist.canRedo else occHist.canRedo) else hist.canRedo)) { Icon(Icons.AutoMirrored.Filled.Redo, "Redo") }
        })
        ScrollableTabRow(step.ordinal, edgePadding = 8.dp) {
            Step.values().forEach { s -> Tab(step == s, { step = s }, enabled = s.ordinal <= 1 || (layer != null && dst != null), text = { Text(s.label) }) }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            val sImg = src; val dImg = dst
            when (step) {
                Step.PERSON -> if (sImg == null || person == null) {
                    if (busy == null) EmptyState("Choose the photo with the person", "The person is cut out from this photo. Their face and body are kept exactly as photographed.",
                        action = { AppButton("Choose photo", { pickSource.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) })
                } else {
                    val m = person!!
                    val base = remember(sImg, personV, cutoutView) { if (cutoutView) cutout(sImg.px, m) else pixelsToImage(sImg.px, sImg.w, sImg.h) }
                    val ov = remember(personV, cutoutView) { if (cutoutView) null else maskOverlay(m) }
                    ImageCanvas(base, ov, mode, tSrc, Modifier.fillMaxSize(), checker = cutoutView, brushRadiusScreen = brush, description = "Source photo with selected person",
                        onTap = { x, y -> if (mode == CanvasMode.TAP) tapSelect(sImg, m, x, y, true) },
                        onStroke = { x0, y0, x1, y1, r -> if (!strokeOpen) { personHist.record(m); strokeOpen = true }; m.stroke(x0, y0, x1, y1, r, mode == CanvasMode.BRUSH_ADD); personV++ },
                        onStrokeEnd = { strokeOpen = false; commitPerson(m) })
                }
                Step.SCENE -> if (dImg == null) {
                    if (busy == null) EmptyState("Choose the scene", "Pick the photo to place the person into.",
                        action = { AppButton("Choose scene photo", { pickDest.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) })
                } else ImageCanvas(remember(dImg) { pixelsToImage(dImg.px, dImg.w, dImg.h) }, null, CanvasMode.VIEW, tDst, Modifier.fillMaxSize(), description = "Scene photo")
                Step.FOREGROUND -> if (dImg != null && occ != null) {
                    val m = occ!!
                    val base = remember(rendered, showBefore) { pixelsToImage(if (showBefore || rendered == null) dImg.px else rendered!!, dImg.w, dImg.h) }
                    val ov = remember(occV) { maskOverlay(m, 0xFF40A0FF.toInt()) }
                    ImageCanvas(base, ov, mode, tDst, Modifier.fillMaxSize(), brushRadiusScreen = brush, description = "Scene with foreground objects marked in blue",
                        onTap = { x, y -> if (mode == CanvasMode.TAP) tapSelect(dImg, m, x, y, false) },
                        onStroke = { x0, y0, x1, y1, r -> if (!strokeOpen) { occHist.record(m); strokeOpen = true }; m.stroke(x0, y0, x1, y1, r, mode == CanvasMode.BRUSH_ADD); occV++ },
                        onStrokeEnd = { strokeOpen = false; commitOcc(m) })
                }
                else -> if (dImg != null) {
                    val base = remember(rendered, showBefore) { pixelsToImage(if (showBefore || rendered == null) dImg.px else rendered!!, dImg.w, dImg.h) }
                    ImageCanvas(base, null, if (step == Step.ARRANGE) CanvasMode.MOVE else CanvasMode.VIEW, tDst, Modifier.fillMaxSize(), description = "Composite preview",
                        onDrag = { dx, dy -> params = LayerGeometry.scaledForMove(params, params.cx + dx / dImg.w, params.cy + dy / dImg.h) },
                        onLayerTransform = { z, rot -> params = params.copy(heightFrac = (params.heightFrac * z).coerceIn(0.02f, 3f), rotation = params.rotation + rot).validated() },
                        onMoveEnd = { commit(params) })
                }
            }
        }
        Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState()).padding(Tokens.spaceSm), verticalArrangement = Arrangement.spacedBy(Tokens.spaceXs)) {
            error?.let { ErrorCard(it, onDismiss = { error = null }) }
            info?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            if (busy != null) { LoadingIndicator(busy, progress = progress); TextButton({ job?.cancel() }) { Text("Cancel") } }
            fun set(p: LayerParams) { params = p.validated() }
            @Composable fun slider(label: String, v: Float, r: ClosedFloatingPointRange<Float>, fmt: String, f: (Float) -> LayerParams) =
                LabeledSlider(label, v, r, fmt, { set(f(it)) }, { commit(params) })
            when (step) {
                Step.PERSON -> if (src != null && person != null) {
                    if (people.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        people.forEach { p -> AssistChip({ val s = src!!; personHist.record(person!!)
                            scope.launch { val r = withContext(Dispatchers.Default) { MaskOps.refine(p.mask, Resample.luma(s.px), s.w, s.h) }; commitPerson(AlphaMask(s.w, s.h, r)) } }, { Text("Person ${p.index}") }) }
                        AssistChip({ personHist.record(person!!); commitPerson(AlphaMask(src!!.w, src!!.h)) }, { Text("Clear") })
                    }
                    SelectionTools(mode, { mode = it }, brush, { brush = it }) {
                        FilterChip(cutoutView, { cutoutView = !cutoutView }, { Text("Cut out preview") })
                        AssistChip({ val s = src!!; val m = person!!; personHist.record(m)
                            scope.launch { busy = "Refining edges"; val r = withContext(Dispatchers.Default) { MaskOps.refine(m.data, Resample.luma(s.px), s.w, s.h) }; commitPerson(AlphaMask(s.w, s.h, r)); busy = null } }, { Text("Refine edges") })
                    }
                    AppButton("Next: choose the scene", { step = Step.SCENE }, Modifier.fillMaxWidth(), enabled = layer != null)
                }
                Step.SCENE -> if (dst != null) Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                    OutlinedButton({ pickDest.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) { Text("Change scene") }
                    Button({ step = Step.ARRANGE }) { Text("Next: arrange") }
                }
                Step.ARRANGE -> {
                    Text("Drag to move. Pinch to resize and twist to rotate.", style = MaterialTheme.typography.bodySmall)
                    layer?.cutEdges?.takeIf { it.isNotEmpty() }?.let { edges ->
                        Text("The person is cut off at the ${edges.joinToString(" and ")} of the source photo, so that edge will look straight. " +
                            "Place that side at the edge of the scene, or behind an object marked in the In front tab.", color = Tokens.warning, style = MaterialTheme.typography.bodySmall)
                    }
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                        FilterChip(params.flip, { commit(params.copy(flip = !params.flip)) }, { Text("Flip") })
                        FilterChip(params.behindOccluders, { commit(params.copy(behindOccluders = true)) }, { Text("Behind marked objects") })
                        FilterChip(!params.behindOccluders, { commit(params.copy(behindOccluders = false)) }, { Text("In front of everything") })
                        FilterChip(params.keepScaleWithDepth, { commit(params.copy(keepScaleWithDepth = !params.keepScaleWithDepth)) }, { Text("Keep size consistent with distance") })
                        AssistChip({ commit(params.copy(cx = 0.5f, cy = 0.62f, heightFrac = 0.5f, rotation = 0f, perspTop = 0f, perspSkew = 0f)) }, { Text("Reset position") })
                    }
                    if (params.keepScaleWithDepth) {
                        slider("Horizon height (yellow line)", params.horizonY, 0f..1f, "${(params.horizonY * 100).toInt()}%") { params.copy(horizonY = it) }
                        Text("Moving the person up toward the horizon makes them smaller, as if walking away. This assumes a level camera and flat ground; it is a guide, not a measurement.", style = MaterialTheme.typography.bodySmall)
                    }
                    slider("Size", params.heightFrac, 0.05f..1.5f, "${(params.heightFrac * 100).toInt()}% of scene height") { params.copy(heightFrac = it) }
                    slider("Rotation", if (params.rotation > 180f) params.rotation - 360f else params.rotation, -45f..45f, "%.0f°".format(if (params.rotation > 180f) params.rotation - 360f else params.rotation)) { params.copy(rotation = it) }
                    slider("Perspective (top width)", params.perspTop, -0.5f..0.5f, "%+.2f".format(params.perspTop)) { params.copy(perspTop = it) }
                    slider("Lean", params.perspSkew, -0.3f..0.3f, "%+.2f".format(params.perspSkew)) { params.copy(perspSkew = it) }
                    slider("Opacity", params.opacity, 0f..1f, "${(params.opacity * 100).toInt()}%") { params.copy(opacity = it) }
                }
                Step.MATCH -> {
                    AppButton("Auto match to scene", { autoMatch() }, Modifier.fillMaxWidth(), enabled = busy == null)
                    slider("Brightness", params.exposure, -2f..2f, "%+.1f EV".format(params.exposure)) { params.copy(exposure = it) }
                    slider("Contrast", params.contrast, -0.6f..0.6f, "%+.2f".format(params.contrast)) { params.copy(contrast = it) }
                    slider("Saturation", params.saturation, 0f..1.6f, "%.2f".format(params.saturation)) { params.copy(saturation = it) }
                    slider("Colour temperature", params.temperature, -1f..1f, "%+.2f".format(params.temperature)) { params.copy(temperature = it) }
                    slider("Sharpness", params.sharpen, 0f..1f, "%.2f".format(params.sharpen)) { params.copy(sharpen = it) }
                    slider("Blur (match background focus)", params.blur, 0f..1f, "%.2f".format(params.blur)) { params.copy(blur = it) }
                    slider("Edge shrink or grow", params.edgeChoke, -1f..1f, "%+.2f".format(params.edgeChoke)) { params.copy(edgeChoke = it) }
                    slider("Edge softness", params.edgeFeather, 0f..1f, "%.2f".format(params.edgeFeather)) { params.copy(edgeFeather = it) }
                    Text("Adjustments change light and colour only. The face is never reshaped, smoothed or replaced.", style = MaterialTheme.typography.bodySmall)
                }
                Step.SHADOWS -> {
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) { Text("Shadows", Modifier.weight(1f)); Switch(params.shadows, { commit(params.copy(shadows = it)) }) }
                    if (params.shadows) {
                        AssistChip({
                            val d = dst!!
                            scope.launch {
                                val l = withContext(Dispatchers.Default) { SceneAnalysis.estimateLight(d.px, d.w, d.h) }
                                if (l.confidence > 0.25f) { commit(params.copy(shadowAngle = l.shadowAngle)); info = "Shadow pointed away from the brighter side of the scene (confidence ${(l.confidence * 100).toInt()}%). Check it against visible shadows." }
                                else info = "No clear light direction found in this scene. Set the direction to match shadows you can see, or use a soft contact shadow only."
                            }
                        }, { Text("Estimate from scene") })
                        slider("Contact shadow", params.contactOpacity, 0f..1f, "${(params.contactOpacity * 100).toInt()}%") { params.copy(contactOpacity = it) }
                        slider("Cast shadow", params.castOpacity, 0f..1f, "${(params.castOpacity * 100).toInt()}%") { params.copy(castOpacity = it) }
                        slider("Direction", params.shadowAngle, 0f..359f, "%.0f°".format(params.shadowAngle)) { params.copy(shadowAngle = it) }
                        slider("Length", params.shadowLength, 0.05f..1.5f, "%.2f".format(params.shadowLength)) { params.copy(shadowLength = it) }
                        slider("Softness", params.shadowSoftness, 0f..1f, "%.2f".format(params.shadowSoftness)) { params.copy(shadowSoftness = it) }
                    }
                }
                Step.FOREGROUND -> {
                    Text("Mark objects that should be in front of the person, such as a table or a railing. Tap an object or paint it.", style = MaterialTheme.typography.bodySmall)
                    SelectionTools(mode, { mode = it }, brush, { brush = it }) {
                        AssistChip({ occ?.let { occHist.record(it) }; commitOcc(AlphaMask(dst!!.w, dst!!.h)) }, { Text("Clear") })
                    }
                    if (!params.behindOccluders) Text("The person is set to be in front of everything (Arrange tab), so marked objects are not used.", color = Tokens.warning, style = MaterialTheme.typography.bodySmall)
                }
            }
            if (dst != null && layer != null && step.ordinal >= Step.ARRANGE.ordinal) Row(horizontalArrangement = Arrangement.spacedBy(Tokens.spaceSm)) {
                OutlinedButton({}, Modifier.pointerInput(Unit) { detectTapGestures(onPress = { showBefore = true; tryAwaitRelease(); showBefore = false }) }) { Text("Hold: before") }
                Button({ export() }, enabled = busy == null) { Text("Export new photo") }
            }
        }
    }
}
