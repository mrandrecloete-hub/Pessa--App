package com.example.aicamerastudio.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import com.example.aicamerastudio.core.design.AppTheme
import com.example.aicamerastudio.data.preferences.UserPreferences
import com.example.aicamerastudio.navigation.AppNav

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val graph = (application as App).graph
        setContent {
            val prefs by graph.preferences.flow.collectAsState(initial = UserPreferences())
            graph.media.photoPath = prefs.saveLocation.photoPath
            var showIntro by androidx.compose.runtime.saveable.rememberSaveable { androidx.compose.runtime.mutableStateOf(true) }
            AppTheme(prefs.theme) {
                androidx.compose.foundation.layout.Box {
                    AppNav(prefs)
                    if (showIntro) com.example.aicamerastudio.core.design.StartupReveal { showIntro = false }
                }
            }
        }
    }
}
