package com.example.aicamerastudio.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
            AppTheme(prefs.theme) { AppNav(prefs) }
        }
    }
}
