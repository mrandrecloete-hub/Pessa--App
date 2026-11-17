package com.pdfmaster.app.ui

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.pdfmaster.app.data.*
import com.pdfmaster.app.engine.PasswordRequiredException
import com.pdfmaster.app.engine.needsPassword
import com.pdfmaster.app.tools.*
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/** What a finished tool run hands back to the screen. */
class RunResult(val docs: List<Doc> = emptyList(), val notes: List<String> = emptyList(), val report: String? = null,
                val needPassword: Doc? = null, val wrongPassword: Boolean = false, val failures: List<String> = emptyList())

@HiltViewModel
class AppViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    val library: Library, val dao: DocDao, private val settingsStore: SettingsStore, val jobs: JobRunner
) : ViewModel() {
    val docs: StateFlow<List<Doc>> = dao.all().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val settings: StateFlow<Settings> = settingsStore.flow.stateIn(viewModelScope, SharingStarted.Eagerly, Settings())
    val history: StateFlow<List<History>> = dao.history().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val signatures: StateFlow<List<Signature>> = dao.signatures().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val templates: StateFlow<List<FormTemplate>> = dao.templates().stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    val messages = _messages.asSharedFlow()
    fun say(text: String) { _messages.tryEmit(text) }

    fun save(s: Settings) = viewModelScope.launch { settingsStore.update(s) }

    /** Copies picked files into the library and reports what happened. */
    fun import(uris: List<Uri>, category: String = Category.IMPORTED, done: (List<Doc>) -> Unit = {}) = viewModelScope.launch {
        val ok = ArrayList<Doc>()
        for (u in uris) try { ok.add(library.import(u, category)) } catch (e: Exception) { say(e.message ?: "A file could not be imported") }
        if (ok.isNotEmpty() && uris.size > 1) say("${ok.size} files added")
        done(ok)
    }

    fun favourite(d: Doc) = viewModelScope.launch { dao.setFavourite(d.id, !d.favourite) }
    fun opened(d: Doc) = viewModelScope.launch { dao.touch(d.id, System.currentTimeMillis()) }
    fun delete(d: Doc) = viewModelScope.launch { library.delete(d); say("${d.name} deleted") }
    fun rename(d: Doc, name: String) = viewModelScope.launch { try { library.rename(d, name) } catch (e: Exception) { say(e.message ?: "Could not rename") } }
    fun duplicate(d: Doc) = viewModelScope.launch { try { library.duplicate(d); say("Copy made") } catch (e: Exception) { say(e.message ?: "Could not copy") } }
    fun share(d: List<Doc>) = viewModelScope.launch { try { library.share(d) } catch (e: Exception) { say("No app could share this file") } }
    fun exportTo(d: Doc, target: Uri) = viewModelScope.launch { try { library.exportTo(d, target); say("Saved to your device") } catch (e: Exception) { say(e.message ?: "Could not save") } }

    /**
     * Runs a tool as a background job. For batch tools every chosen file is processed on its own and one
     * failure does not stop the others. Results are moved into the library and written to the history.
     */
    fun runTool(spec: ToolSpec, inputs: List<Doc>, opts: Map<String, String>, passwords: Map<String, String>): Long =
        jobs.start(spec.title) { ctx ->
            val s = settingsStore.get()
            val groups: List<List<Doc>> = if (spec.batch || (spec.input == InputKind.ONE_PDF)) inputs.map { listOf(it) } else listOf(inputs)
            val outDocs = ArrayList<Doc>(); val notes = LinkedHashSet<String>(); val failures = ArrayList<String>(); var report: String? = null
            for ((n, g) in groups.withIndex()) {
                if (groups.size > 1) ctx.step("File ${n + 1} of ${groups.size}: ${g[0].name}")
                val env = ToolEnv(context, library, ctx, passwords, s)
                try {
                    val out = spec.run(env, g, opts)
                    for (p in out.files) outDocs.add(library.adopt(p.file, p.name, p.category))
                    notes.addAll(out.notes); if (out.report != null) report = if (groups.size > 1) listOfNotNull(report, "${g[0].name}\n${out.report}").joinToString("\n\n") else out.report
                } catch (e: PasswordRequiredException) {
                    env.work.deleteRecursively()
                    // Which file needs a password? Either the tool named it or it is the first protected input without a working one.
                    val doc = g.firstOrNull { it.id == e.message } ?: g.firstOrNull { needsPassword(library.file(it)) } ?: g[0]
                    return@start RunResult(needPassword = doc, wrongPassword = passwords.containsKey(doc.id))
                } catch (e: kotlinx.coroutines.CancellationException) { env.work.deleteRecursively(); throw e
                } catch (e: OutOfMemoryError) {
                    failures.add("${g[0].name}: too large for the memory of this phone")
                } catch (e: Exception) {
                    if (groups.size == 1) { env.work.deleteRecursively(); recordHistory(spec, inputs, opts, emptyList(), false, e.message ?: "Failed"); throw e }
                    failures.add("${g[0].name}: ${e.message ?: "failed"}")
                } finally { env.work.deleteRecursively() }
            }
            recordHistory(spec, inputs, opts, outDocs, failures.isEmpty(), when {
                failures.isNotEmpty() -> "${failures.size} of ${groups.size} failed"
                outDocs.isEmpty() -> inputs.joinToString { it.name }
                outDocs.size == 1 -> outDocs[0].name
                else -> "${outDocs.size} files from ${inputs.firstOrNull()?.name ?: ""}"
            })
            notifyDone(spec.title, s)
            RunResult(outDocs, notes.toList(), report, failures = failures)
        }

    private suspend fun recordHistory(spec: ToolSpec, inputs: List<Doc>, opts: Map<String, String>, outs: List<Doc>, ok: Boolean, detail: String) {
        // Passwords are never written to the history.
        val safe = opts.filterKeys { k -> spec.opts.none { it.key == k && it is TextOpt && it.password } }
        dao.addHistory(History(tool = spec.id, title = spec.title, detail = detail, ok = ok, outputIds = outs.joinToString(",") { it.id },
            inputIds = inputs.joinToString(",") { it.id }, options = safe.entries.joinToString("\n") { "${it.key}=${it.value}" }))
    }

    /** Records work done by the dedicated screens (editor, forms, pages, scanner) in the same history. */
    fun record(toolId: String, title: String, out: Doc?, ok: Boolean = true, detail: String = out?.name ?: "") = viewModelScope.launch {
        dao.addHistory(History(tool = toolId, title = title, detail = detail, ok = ok, outputIds = out?.id ?: ""))
    }

    fun clearHistory() = viewModelScope.launch { dao.clearHistory() }

    private fun notifyDone(title: String, s: Settings) {
        if (!s.notifyDone || AppState.foreground) return
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val nm = context.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("jobs", "Finished work", NotificationManager.IMPORTANCE_DEFAULT))
        val open = android.app.PendingIntent.getActivity(context, 0, context.packageManager.getLaunchIntentForPackage(context.packageName), android.app.PendingIntent.FLAG_IMMUTABLE)
        nm.notify(title.hashCode(), NotificationCompat.Builder(context, "jobs").setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("$title finished").setContentText("Open PDFMASTER to see the result").setContentIntent(open).setAutoCancel(true).build())
    }
}

/** Whether the app is on screen, so finished-work notifications are only shown when it is not. */
object AppState { @Volatile var foreground = false }
