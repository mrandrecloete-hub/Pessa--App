package com.pdfmaster.app.engine

import kotlin.math.ln

/** A piece of text found in a document, with the page it came from. */
data class Passage(val page: Int, val text: String, val score: Double = 0.0)
data class Found(val kind: String, val value: String, val page: Int)

/**
 * Document analysis that runs fully on the phone. This is classic text analysis (word statistics and
 * patterns), not a language model: it picks out and ranks sentences that are already in the document.
 */
object LocalAi {
    private val STOP = ("a an and are as at be been but by can could did do does for from had has have he her his i if in into is it its may more most must my no not of on or our she should so some such than that the their them then there these they this to was we were what when where which who will with would you your about above after all also am any because before being between both each few how just only other out over own same too under until up very via per " +
        "die en van het een is dat op te in met voor niet aan er om ook als bij der den das und ist nicht mit auf für").split(' ').toHashSet()

    private fun words(s: String) = Regex("[\\p{L}][\\p{L}'\\-]+").findAll(s.lowercase()).map { it.value }.filter { it.length > 2 && it !in STOP }.toList()

    fun sentences(pages: List<String>): List<Passage> {
        val out = ArrayList<Passage>()
        pages.forEachIndexed { i, t ->
            val flat = t.replace(Regex("-\\n(?=\\p{Ll})"), "").replace(Regex("[ \\t]*\\n[ \\t]*"), " ").replace(Regex("\\s{2,}"), " ")
            for (s in flat.split(Regex("(?<=[.!?])\\s+(?=[\\p{Lu}\\d\"(])"))) { val x = s.trim(); if (x.length >= 25 && x.count { it.isLetter() } > x.length / 2) out.add(Passage(i + 1, x)) }
        }
        return out
    }

    /** The most representative sentences, in document order. */
    fun summarise(pages: List<String>, maxSentences: Int = 6): List<Passage> {
        val all = sentences(pages)
        if (all.size <= maxSentences) return all
        val freq = HashMap<String, Int>()
        all.forEach { p -> words(p.text).forEach { freq[it] = (freq[it] ?: 0) + 1 } }
        val scored = all.mapIndexed { idx, p ->
            val w = words(p.text)
            val base = if (w.isEmpty()) 0.0 else w.sumOf { ln(1.0 + (freq[it] ?: 0)) } / (w.size + 6.0)
            // Sentences near the start of the document and of each page usually introduce the topic.
            val boost = (if (idx < 3) 1.25 else 1.0) * (if (p.text.length in 60..320) 1.1 else 0.85)
            idx to p.copy(score = base * boost)
        }
        val keep = scored.sortedByDescending { it.second.score }.take(maxSentences).map { it.first }.toSortedSet()
        return keep.map { scored[it].second }
    }

    /** Best matching passages for a question, by shared important words. */
    fun answer(pages: List<String>, question: String, max: Int = 3): List<Passage> {
        val q = words(question).toSet()
        if (q.isEmpty()) return emptyList()
        val all = sentences(pages)
        val df = HashMap<String, Int>()
        all.forEach { p -> words(p.text).toSet().forEach { df[it] = (df[it] ?: 0) + 1 } }
        return all.mapIndexed { i, p ->
            val w = words(p.text)
            var score = 0.0
            for (t in q) {
                val hit = w.count { it == t || (t.length > 4 && it.startsWith(t.take(t.length - 2))) }
                if (hit > 0) score += (1 + ln(hit.toDouble())) * ln(1.0 + all.size.toDouble() / (1 + (df[t] ?: 0)))
            }
            // Include the following sentence for context.
            val ctx = if (i + 1 < all.size && all[i + 1].page == p.page) p.text + " " + all[i + 1].text else p.text
            Passage(p.page, ctx, score)
        }.filter { it.score > 0 }.sortedByDescending { it.score }.distinctBy { it.text.take(60) }.take(max)
    }

    private val MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
    private val DATE = Regex("\\b(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+$MONTH\\.?,?\\s+\\d{4}|$MONTH\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}|$MONTH\\s+\\d{4})\\b", RegexOption.IGNORE_CASE)
    private val MONEY = Regex("(?:(?:N\\$|NAD|ZAR|USD|EUR|GBP|US\\$|R|\\$|€|£)\\s?\\d[\\d,. ]*\\d(?:\\.\\d{2})?|\\d[\\d,. ]*\\d\\s?(?:NAD|ZAR|USD|EUR|GBP|dollars|rand|euros))(?![\\w])")
    private val EMAIL = Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
    private val PHONE = Regex("(?<![\\d.])\\+?\\d[\\d ()-]{7,16}\\d(?![\\d.])")
    private val URL = Regex("\\b(?:https?://|www\\.)[^\\s<>\"]+", RegexOption.IGNORE_CASE)
    private val NAME = Regex("\\b(?:Mr|Mrs|Ms|Dr|Prof|Adv|Hon)\\.?\\s+\\p{Lu}\\p{Ll}+(?:\\s+\\p{Lu}\\p{Ll}+){0,2}|\\b\\p{Lu}\\p{Ll}{2,}\\s+\\p{Lu}\\p{Ll}{2,}(?:\\s+\\p{Lu}\\p{Ll}{2,})?\\b")

    /** Dates, amounts of money, email addresses, phone numbers, links and likely names of people. */
    fun extract(pages: List<String>): List<Found> {
        val out = LinkedHashSet<Found>()
        pages.forEachIndexed { i, t ->
            val p = i + 1
            DATE.findAll(t).forEach { out.add(Found("Date", it.value.trim().replace(Regex("\\s+"), " "), p)) }
            MONEY.findAll(t).forEach { out.add(Found("Amount", it.value.trim().trimEnd('.', ',').replace(Regex("\\s+"), " "), p)) }
            EMAIL.findAll(t).forEach { out.add(Found("Email", it.value, p)) }
            val dates = DATE.findAll(t).map { it.range }.toList()
            PHONE.findAll(t).filter { m -> m.value.count { it.isDigit() } in 9..15 && dates.none { it.first <= m.range.last && m.range.first <= it.last } }.forEach { out.add(Found("Phone", it.value.trim(), p)) }
            URL.findAll(t).forEach { out.add(Found("Link", it.value.trimEnd('.', ',', ')'), p)) }
            for (line in t.lines()) NAME.findAll(line).forEach { m ->
                var v = m.value
                val titled = v.matches(Regex("^(?:Mr|Mrs|Ms|Dr|Prof|Adv|Hon).*"))
                // Without a title, the first word of a line is usually an ordinary capitalised word, so drop it.
                if (!titled && m.range.first == 0) { val w = v.split(' '); if (w.size < 3) return@forEach; v = w.drop(1).joinToString(" ") }
                if (titled || v.split(' ').none { it.lowercase() in STOP }) out.add(Found("Possible name", v, p))
            }
        }
        return out.toList()
    }

    /** The document text cut to a size a cloud model can take, with page markers so answers can cite pages. */
    fun promptText(pages: List<String>, maxChars: Int = 60_000): Pair<String, Boolean> {
        val sb = StringBuilder(); var cut = false
        for ((i, t) in pages.withIndex()) {
            val part = "[Page ${i + 1}]\n" + t.trim() + "\n\n"
            if (sb.length + part.length > maxChars) { sb.append(part.take(maxOf(0, maxChars - sb.length))); cut = true; break }
            sb.append(part)
        }
        return sb.toString() to cut
    }
}
