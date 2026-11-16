package com.pdfmaster.app.data

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.pdfmaster.app.engine.Progress
import dagger.Module
import dagger.Provides
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.coroutineContext

enum class JobState { RUNNING, DONE, FAILED, CANCELLED }

data class JobInfo(
    val id: Long, val title: String, val state: JobState = JobState.RUNNING,
    val done: Int = 0, val total: Int = 0, val step: String = "",
    val error: String? = null, val result: Any? = null
)

/**
 * Runs heavy document work off the main thread in a scope that outlives screens, so leaving a screen
 * does not stop a conversion. Jobs report progress and can be cancelled between steps.
 */
@Singleton
class JobRunner @Inject constructor() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val handles = HashMap<Long, Job>()
    private var next = 1L
    private val _jobs = MutableStateFlow<List<JobInfo>>(emptyList())
    val jobs: StateFlow<List<JobInfo>> = _jobs

    private fun set(id: Long, f: (JobInfo) -> JobInfo) = _jobs.update { l -> l.map { if (it.id == id) f(it) else it } }

    /** Scope passed to the work so it can report steps. */
    class Ctx(private val update: (Int, Int, String?) -> Unit, private val active: () -> Unit) {
        val progress = Progress { d, t -> active(); update(d, t, null) }
        fun step(text: String) { active(); update(0, 0, text) }
    }

    @Synchronized fun start(title: String, work: suspend (Ctx) -> Any?): Long {
        val id = next++
        _jobs.update { it + JobInfo(id, title) }
        handles[id] = scope.launch {
            try {
                val ctx = coroutineContext
                val c = Ctx({ d, t, s -> set(id) { j -> if (s != null) j.copy(step = s, done = 0, total = 0) else j.copy(done = d, total = t) } }, { ctx.ensureActive() })
                val r = work(c)
                set(id) { it.copy(state = JobState.DONE, result = r) }
            } catch (e: CancellationException) {
                set(id) { it.copy(state = JobState.CANCELLED) }
            } catch (e: OutOfMemoryError) {
                set(id) { it.copy(state = JobState.FAILED, error = "This document is too large for the memory of this phone. Try fewer pages or a lower quality.") }
            } catch (e: Throwable) {
                set(id) { it.copy(state = JobState.FAILED, error = e.message?.takeIf { m -> m.isNotBlank() } ?: e.javaClass.simpleName) }
            }
        }
        return id
    }

    @Synchronized fun cancel(id: Long) { handles[id]?.cancel() }
    fun dismiss(id: Long) = _jobs.update { l -> l.filterNot { it.id == id && it.state != JobState.RUNNING } }
}

/** Removes stale working files once a day, in the background, without waking the phone specially for it. */
@HiltWorker
class TempCleanupWorker @AssistedInject constructor(@Assisted ctx: Context, @Assisted params: WorkerParameters, private val library: Library) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result { library.clearTemp(olderThanMs = TimeUnit.HOURS.toMillis(12)); return Result.success() }

    companion object {
        fun schedule(context: Context) = WorkManager.getInstance(context).enqueueUniquePeriodicWork("temp-cleanup", ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<TempCleanupWorker>(1, TimeUnit.DAYS).build())
    }
}

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Singleton fun db(@ApplicationContext c: Context): AppDb =
        androidx.room.Room.databaseBuilder(c, AppDb::class.java, "pdfmaster.db").build()
    @Provides fun dao(db: AppDb): DocDao = db.dao()
}
