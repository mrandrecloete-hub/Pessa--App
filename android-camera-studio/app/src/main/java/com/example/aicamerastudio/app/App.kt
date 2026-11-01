package com.example.aicamerastudio.app

import android.app.Application
import com.example.aicamerastudio.core.storage.MediaStoreRepository
import com.example.aicamerastudio.data.database.AppDatabase
import com.example.aicamerastudio.data.preferences.PreferencesRepository

/** Small manual dependency container. Replace with DI if the app grows. */
class App : Application() {
    lateinit var graph: AppGraph
        private set

    override fun onCreate() {
        super.onCreate()
        graph = AppGraph(this)
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        // Free the AI models (tens of MB) when Android asks for memory; they reload on next use.
        if (level >= android.content.ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) graph.models.release()
    }
}

class AppGraph(app: Application) {
    val database: AppDatabase by lazy { AppDatabase.create(app) }
    val preferences = PreferencesRepository(app)
    val media = MediaStoreRepository(app)
    val models = com.example.aicamerastudio.photo.ai.AiModels(app)
    val projectFiles = com.example.aicamerastudio.editor.history.ProjectFiles(app.filesDir)
}
