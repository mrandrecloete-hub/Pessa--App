package com.example.aicamerastudio.navigation

import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.example.aicamerastudio.aistudio.AiStudioScreen
import com.example.aicamerastudio.camera.CameraScreen
import com.example.aicamerastudio.core.permissions.CameraPermissionGate
import com.example.aicamerastudio.data.preferences.UserPreferences
import com.example.aicamerastudio.editor.StudioScreen
import com.example.aicamerastudio.editor.photo.PhotoEditorScreen
import com.example.aicamerastudio.editor.video.VideoTrimScreen
import com.example.aicamerastudio.gallery.GalleryScreen
import com.example.aicamerastudio.gallery.MediaViewer
import com.example.aicamerastudio.settings.*

private enum class Top(val route: String, val label: String, val icon: ImageVector) {
    CAMERA("camera", "Camera", Icons.Default.CameraAlt),
    GALLERY("gallery", "Gallery", Icons.Default.PhotoLibrary),
    STUDIO("studio", "Studio", Icons.Default.AutoFixHigh),
    SETTINGS("settings", "Settings", Icons.Default.Settings),
}

private fun enc(u: Uri) = Uri.encode(u.toString())

@Composable
fun AppNav(prefs: UserPreferences, nav: NavHostController = rememberNavController()) {
    val backStack by nav.currentBackStackEntryAsState()
    val route = backStack?.destination?.route
    val showBar = Top.values().any { it.route == route }
    val wide = LocalConfiguration.current.screenWidthDp >= 600

    fun goTop(t: Top) = nav.navigate(t.route) {
        popUpTo(nav.graph.startDestinationId) { saveState = true }; launchSingleTop = true; restoreState = true
    }

    Row(Modifier.fillMaxSize()) {
        if (showBar && wide) NavigationRail {
            Spacer(Modifier.weight(1f))
            Top.values().forEach { t -> NavigationRailItem(route == t.route, { goTop(t) }, { Icon(t.icon, null) }, label = { Text(t.label) }) }
            Spacer(Modifier.weight(1f))
        }
        Scaffold(
            modifier = Modifier.weight(1f),
            bottomBar = {
                if (showBar && !wide) NavigationBar {
                    Top.values().forEach { t -> NavigationBarItem(route == t.route, { goTop(t) }, { Icon(t.icon, null) }, label = { Text(t.label) }) }
                }
            },
        ) { pad ->
            NavHost(nav, startDestination = Top.CAMERA.route, modifier = Modifier.padding(pad)) {
                composable(Top.CAMERA.route) { CameraPermissionGate { audio -> CameraScreen(audio, androidx.compose.ui.unit.Dp(0f), prefs) } }
                composable(Top.GALLERY.route) {
                    GalleryScreen { item -> nav.navigate("viewer?uri=${enc(item.uri)}&video=${item.isVideo}") }
                }
                composable(Top.STUDIO.route) {
                    StudioScreen(onEditPhoto = { nav.navigate("editor?uri=${enc(it)}") }, onTrimVideo = { nav.navigate("trim?uri=${enc(it)}") }, onCreate = { nav.navigate("create") }, onComposite = { nav.navigate("composite") })
                }
                composable(Top.SETTINGS.route) {
                    SettingsScreen(prefs, { nav.navigate("capabilities") }, { nav.navigate("privacy") }, { nav.navigate("about") })
                }
                composable("viewer?uri={uri}&video={video}", listOf(navArgument("uri") { type = NavType.StringType }, navArgument("video") { type = NavType.BoolType })) { e ->
                    val uri = Uri.parse(e.arguments!!.getString("uri")!!)
                    MediaViewer(uri, e.arguments!!.getBoolean("video"), prefs, { nav.popBackStack() },
                        { nav.navigate("editor?uri=${enc(it)}") }, { nav.navigate("trim?uri=${enc(it)}") },
                        { kind, pid -> nav.navigate("$kind?project=$pid") })
                }
                composable("editor?uri={uri}", listOf(navArgument("uri") { type = NavType.StringType })) { e ->
                    PhotoEditorScreen(Uri.parse(e.arguments!!.getString("uri")!!), { nav.popBackStack() }, { })
                }
                composable("trim?uri={uri}", listOf(navArgument("uri") { type = NavType.StringType })) { e ->
                    VideoTrimScreen(Uri.parse(e.arguments!!.getString("uri")!!), { nav.popBackStack() }, { })
                }
                composable("create") { AiStudioScreen({ nav.popBackStack() }, { nav.navigate("editor?uri=${enc(it)}") }) }
                composable("composite") {
                    com.example.aicamerastudio.editor.composite.CompositeHubScreen({ nav.popBackStack() },
                        { id -> nav.navigate("remove?project=${id ?: ""}") }, { id -> nav.navigate("place?project=${id ?: ""}") })
                }
                composable("remove?project={project}", listOf(navArgument("project") { type = NavType.StringType; defaultValue = "" })) { e ->
                    com.example.aicamerastudio.editor.composite.RemovePersonScreen(e.arguments?.getString("project")?.ifBlank { null }, { nav.popBackStack() },
                        { nav.navigate("viewer?uri=${enc(it)}&video=false") })
                }
                composable("place?project={project}", listOf(navArgument("project") { type = NavType.StringType; defaultValue = "" })) { e ->
                    com.example.aicamerastudio.editor.composite.PlacePersonScreen(e.arguments?.getString("project")?.ifBlank { null }, { nav.popBackStack() },
                        { nav.navigate("viewer?uri=${enc(it)}&video=false") })
                }
                composable("capabilities") { CapabilitiesScreen { nav.popBackStack() } }
                composable("privacy") { InfoScreen("Privacy", PRIVACY_SECTIONS) { nav.popBackStack() } }
                composable("about") { InfoScreen("What works and what does not yet", ABOUT_SECTIONS) { nav.popBackStack() } }
            }
        }
    }
}
