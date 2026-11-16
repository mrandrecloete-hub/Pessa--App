package com.pdfmaster.app

import android.net.Uri
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.ViewModelProvider
import com.pdfmaster.app.data.Category
import com.pdfmaster.app.data.Doc
import com.pdfmaster.app.data.JobState
import com.pdfmaster.app.engine.DocImport
import com.pdfmaster.app.engine.Para
import com.pdfmaster.app.engine.PdfOps
import com.pdfmaster.app.engine.needsPassword
import com.pdfmaster.app.engine.pageCount
import com.pdfmaster.app.tools.tool
import com.pdfmaster.app.ui.AppViewModel
import com.pdfmaster.app.ui.RunResult
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows
import org.robolectric.annotation.Config
import java.io.File

/** Runs real tools through the app's own library, job runner and history, the same path the screens use. */
@RunWith(RobolectricTestRunner::class)
@Config(application = PdfMasterApp::class, sdk = [34])
class AppFlowTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()
    private lateinit var vm: AppViewModel

    private fun idle() { Shadows.shadowOf(android.os.Looper.getMainLooper()).idle() }
    private fun <T> waitFor(what: String, f: () -> T?): T { repeat(600) { idle(); f()?.let { return it }; Thread.sleep(50) }; throw AssertionError("Timed out waiting for $what") }

    private fun import(f: File): Doc { var d: List<Doc>? = null; vm.import(listOf(Uri.fromFile(f))) { d = it }; return waitFor("import of ${f.name}") { d }.single() }
    private fun run(id: String, inputs: List<Doc>, opts: Map<String, String> = emptyMap(), pw: Map<String, String> = emptyMap()): RunResult {
        val spec = tool(id)
        val defaults = spec.opts.associate { o -> o.key to when (o) { is com.pdfmaster.app.tools.ChoiceOpt -> o.default; is com.pdfmaster.app.tools.TextOpt -> o.default; is com.pdfmaster.app.tools.ToggleOpt -> o.default.toString() } }
        val job = vm.runTool(spec, inputs, defaults + opts, pw)
        val j = waitFor("$id to finish") { vm.jobs.jobs.value.firstOrNull { it.id == job && it.state != JobState.RUNNING } }
        assertEquals("$id: ${j.error}", JobState.DONE, j.state)
        return j.result as RunResult
    }

    @Test fun importRunToolsPasswordsAndHistory() {
        rule.activityRule.scenario.onActivity { vm = ViewModelProvider(it)[AppViewModel::class.java] }
        val a = import(TestDocs.text("Flow A", 3)); val b = import(TestDocs.text("Flow B", 2))
        assertEquals(3, a.pages); assertEquals("Flow A.pdf", a.name); assertEquals(Category.IMPORTED, a.category)
        assertTrue("the library keeps its own copy", vm.library.file(a).absolutePath.contains("/files/library/"))

        val merged = run("merge", listOf(a, b)).docs.single()
        assertEquals(5, merged.pages); assertEquals("Flow A (merged).pdf", merged.name)

        val split = run("split", listOf(merged), mapOf("mode" to "every", "n" to "2")).docs
        assertEquals(listOf(2, 2, 1), split.map { it.pages })

        val word = run("to_docx", listOf(a))
        assertEquals("docx", word.docs.single().ext); assertEquals(Category.CONVERTED, word.docs.single().category); assertTrue(word.notes.isNotEmpty())
        assertTrue(DocImport.read(vm.library.file(word.docs.single())).blocks.filterIsInstance<Para>().any { it.plain.contains("Page 2 of sample Flow A") })

        // Batch: two files converted in one go.
        val batch = run("to_txt", listOf(a, b)); assertEquals(listOf("Flow A.txt", "Flow B.txt"), batch.docs.map { it.name })

        // Password protection, then the password prompt when the protected file is used.
        val prot = run("protect", listOf(a), mapOf("pw" to "hunter22", "pw2" to "hunter22")).docs.single()
        assertTrue(prot.locked); assertTrue(needsPassword(vm.library.file(prot)))
        val ask = run("to_txt", listOf(prot)); assertEquals(prot.id, ask.needPassword?.id); assertFalse(ask.wrongPassword)
        val wrong = run("to_txt", listOf(prot), pw = mapOf(prot.id to "nope")); assertEquals(prot.id, wrong.needPassword?.id); assertTrue(wrong.wrongPassword)
        val ok = run("to_txt", listOf(prot), pw = mapOf(prot.id to "hunter22"))
        assertTrue(vm.library.file(ok.docs.single()).readText().contains("Page 3 of sample Flow A"))
        val unlocked = run("unlock", listOf(prot), pw = mapOf(prot.id to "hunter22")).docs.single(); assertFalse(unlocked.locked); assertEquals(3, unlocked.pages)

        val meta = run("meta", listOf(a)); assertTrue(meta.docs.isEmpty()); assertTrue(meta.report!!.contains("Author: Test Author"))
        val cmp = run("compare", listOf(a, b)); assertTrue(cmp.report!!.contains("page(s) have different text"))
        val nums = run("numbers", listOf(a)).docs.single(); assertTrue(PdfOps.pageTexts(vm.library.file(nums))[2].contains("Page 3 of 3"))

        // A mistake in the options fails cleanly and saves nothing.
        val before = vm.docs.value.size
        val bad = vm.runTool(tool("extract"), listOf(a), mapOf("pages" to "9"), emptyMap())
        val j = waitFor("bad job") { vm.jobs.jobs.value.firstOrNull { it.id == bad && it.state != JobState.RUNNING } }
        assertEquals(JobState.FAILED, j.state); assertEquals("Page 9 is outside 1 to 3", j.error); idle(); assertEquals(before, vm.docs.value.size)

        // History records the work, without passwords.
        val h = waitFor("history") { vm.history.value.takeIf { it.size >= 11 } }
        assertTrue(h.any { it.tool == "merge" && it.ok }); assertTrue(h.any { it.tool == "extract" && !it.ok })
        assertFalse(h.any { it.options.contains("hunter22") })
        // Originals are untouched; delete removes the library copy; temporary folders are cleaned up.
        assertEquals(3, pageCount(vm.library.file(a)))
        vm.delete(merged); waitFor("delete") { true.takeIf { vm.docs.value.none { it.id == merged.id } } }; assertFalse(vm.library.file(merged).exists())
        val s = runBlocking { vm.library.storage() }; assertEquals(vm.docs.value.size, s.files)
        assertTrue("work folders removed", File(rule.activity.cacheDir, "work").listFiles().orEmpty().none { it.isDirectory })
    }
}
