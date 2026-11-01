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
}

class AppGraph(app: Application) {
    val database: AppDatabase by lazy { AppDatabase.create(app) }
    val preferences = PreferencesRepository(app)
    val media = MediaStoreRepository(app)
}
