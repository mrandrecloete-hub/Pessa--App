package com.pdfmaster.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class PdfMasterApp : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        PDFBoxResourceLoader.init(this)
        runCatching { com.pdfmaster.app.data.TempCleanupWorker.schedule(this) }
        runCatching { com.pdfmaster.app.update.UpdateWorker.schedule(this, com.pdfmaster.app.update.Updater.get(this).autoCheck) }
    }
}
