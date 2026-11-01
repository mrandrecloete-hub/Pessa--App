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
        // Remove captured burst frames older than a day (left behind if the app was force stopped mid job).
        Thread {
            val cutoff = System.currentTimeMillis() - 24L * 3600_000
            java.io.File(cacheDir, "zoom").listFiles()?.filter { it.lastModified() < cutoff }?.forEach { it.deleteRecursively() }
        }.start()
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
    val updater = com.example.aicamerastudio.core.update.Updater(app)
}
