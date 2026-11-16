package com.pdfmaster.app.ui

import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.tools.ToolSpec

/** Navigation helpers shared by every screen. */
class Nav(val c: NavHostController, private val askDoc: (ToolSpec) -> Unit) {
    fun back() { c.popBackStack() }
    fun open(d: Doc) { if (d.isPdf) c.navigate("viewer/${d.id}") }
    /** Starts a tool. Tools with their own screen need a document first, so a picker opens when none is given. */
    fun tool(id: String, doc: Doc? = null) {
        val spec = com.pdfmaster.app.tools.tool(id)
        when {
            spec.screen == "scan" -> c.navigate("scan")
            spec.screen != null -> if (doc != null) screen(spec, doc) else askDoc(spec)
            else -> c.navigate("tool/$id?doc=${doc?.id ?: ""}")
        }
    }
    fun screen(spec: ToolSpec, doc: Doc) {
        val s = spec.screen!!
        c.navigate(s.substringBefore('?') + "/" + doc.id + (if (s.contains('?')) "?" + s.substringAfter('?') else ""))
    }
    fun go(route: String) = c.navigate(route)
}

@Composable
fun PdfMasterRoot(incoming: Uri?, consumed: () -> Unit) {
    val vm: AppViewModel = hiltViewModel()
    val settings by vm.settings.collectAsStateWithLifecycle()
    PdfMasterTheme(settings.theme) {
        val nc = rememberNavController()
        var pickFor by remember { mutableStateOf<ToolSpec?>(null) }
        val nav = remember(nc) { Nav(nc) { pickFor = it } }
        val snack = remember { SnackbarHostState() }
        LaunchedEffect(Unit) { vm.messages.collect { snack.showSnackbar(it, withDismissAction = true) } }
        LaunchedEffect(incoming) {
            if (incoming != null) { vm.import(listOf(incoming)) { docs -> docs.firstOrNull()?.let { vm.opened(it); nav.open(it) } }; consumed() }
        }
        UpdateDialog()
        Scaffold(snackbarHost = { SnackbarHost(snack) }, contentWindowInsets = WindowInsets(0)) { pad ->
            Box(Modifier.fillMaxSize().padding(pad)) {
                NavHost(nc, startDestination = "main") {
                    composable("main") { MainTabs(vm, nav) }
                    composable("viewer/{id}") { ViewerScreen(vm, nav, it.arguments?.getString("id").orEmpty()) }
                    composable("tool/{tool}?doc={doc}", arguments = listOf(navArgument("doc") { type = NavType.StringType; defaultValue = "" })) {
                        ToolRunScreen(vm, nav, it.arguments?.getString("tool").orEmpty(), it.arguments?.getString("doc").orEmpty())
                    }
                    composable("editor/{id}?start={start}", arguments = listOf(navArgument("start") { type = NavType.StringType; defaultValue = "" })) {
                        EditorScreen(vm, nav, it.arguments?.getString("id").orEmpty(), it.arguments?.getString("start").orEmpty())
                    }
                    composable("form/{id}") { FormScreen(vm, nav, it.arguments?.getString("id").orEmpty()) }
                    composable("pages/{id}") { PagesScreen(vm, nav, it.arguments?.getString("id").orEmpty()) }
                    composable("scan") { ScanScreen(vm, nav) }
                    composable("signatures") { SignaturesScreen(vm, nav) }
                    composable("history") { HistoryScreen(vm, nav) }
                    composable("settings/{page}") { SettingsPage(vm, nav, it.arguments?.getString("page").orEmpty()) }
                }
                pickFor?.let { spec ->
                    DocPickerSheet(vm, title = spec.title, accept = { it.isPdf }, multi = false, onDismiss = { pickFor = null }) { docs ->
                        pickFor = null; docs.firstOrNull()?.let { nav.screen(spec, it) }
                    }
                }
            }
        }
    }
}

private data class Tab(val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector, val selected: androidx.compose.ui.graphics.vector.ImageVector)

@Composable
fun MainTabs(vm: AppViewModel, nav: Nav) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var docFilter by rememberSaveable { mutableStateOf("all") }
    val tabs = listOf(Tab("Home", Icons.Outlined.Home, Icons.Filled.Home), Tab("Tools", Icons.Outlined.Widgets, Icons.Filled.Widgets),
        Tab("Documents", Icons.Outlined.Folder, Icons.Filled.Folder), Tab("AI Assistant", Icons.Outlined.AutoAwesome, Icons.Filled.AutoAwesome), Tab("Profile", Icons.Outlined.Person, Icons.Filled.Person))
    Scaffold(bottomBar = {
        NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dpValue()) {
            tabs.forEachIndexed { i, t ->
                NavigationBarItem(selected = tab == i, onClick = { tab = i }, icon = { Icon(if (tab == i) t.selected else t.icon, t.label) },
                    label = { Text(t.label, maxLines = 1, style = MaterialTheme.typography.labelSmall) },
                    colors = NavigationBarItemDefaults.colors(selectedIconColor = Color.White, selectedTextColor = MaterialTheme.colorScheme.onSurface, indicatorColor = MaterialTheme.colorScheme.primary))
            }
        }
    }) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            when (tab) {
                0 -> HomeScreen(vm, nav, seeAll = { f -> docFilter = f; tab = 2 }, toTools = { tab = 1 }, toProfile = { tab = 4 })
                1 -> ToolsScreen(nav)
                2 -> DocumentsScreen(vm, nav, docFilter) { docFilter = it }
                3 -> AiScreen(vm, nav)
                else -> ProfileScreen(vm, nav)
            }
        }
    }
}

private fun Int.dpValue() = androidx.compose.ui.unit.Dp(this.toFloat())
