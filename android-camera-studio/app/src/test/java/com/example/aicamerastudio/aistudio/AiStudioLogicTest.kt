package com.example.aicamerastudio.aistudio

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.util.Base64

class AiStudioLogicTest {
    private val png = byteArrayOf(0x89.toByte(), 'P'.code.toByte(), 'N'.code.toByte(), 'G'.code.toByte(), 1, 2, 3)
    private fun ok(vararg images: ByteArray) = HttpResponse(200, JSONObject().put("data",
        org.json.JSONArray(images.map { JSONObject().put("b64_json", Base64.getEncoder().encodeToString(it)) })).toString())
    private fun err(code: Int, errCode: String = "", type: String = "", msg: String = "m") =
        HttpResponse(code, """{"error":{"message":"$msg","type":"$type","code":"$errCode"}}""")
    private fun kindOf(r: HttpResponse) = try { OpenAiImageClient.parse(r); null } catch (e: GenException) { e.kind }

    @Test fun bodyForGptImageHasQualityAndNoResponseFormat() {
        val o = JSONObject(OpenAiImageClient.buildBody(OnlineRequest("a cat", "gpt-image-1", OnlineSize.LANDSCAPE, OnlineQuality.HIGH, 9)))
        assertEquals("gpt-image-1", o.getString("model")); assertEquals("a cat", o.getString("prompt"))
        assertEquals("1536x1024", o.getString("size")); assertEquals("high", o.getString("quality"))
        assertEquals(4, o.getInt("n")); assertFalse(o.has("response_format"))
    }
    @Test fun bodyForDallEAsksForInlineData() {
        val o = JSONObject(OpenAiImageClient.buildBody(OnlineRequest("x y z", "dall-e-3", OnlineSize.SQUARE, OnlineQuality.LOW, 1)))
        assertEquals("b64_json", o.getString("response_format")); assertFalse(o.has("quality"))
    }
    @Test fun blankModelFallsBackToDefault() {
        assertEquals(OpenAiImageClient.DEFAULT_MODEL, JSONObject(OpenAiImageClient.buildBody(OnlineRequest("abc", "  ", OnlineSize.SQUARE, OnlineQuality.LOW, 1))).getString("model"))
    }
    @Test fun promptIsJsonEscaped() {
        val p = "quote \" backslash \\ newline \n unicode é"
        assertEquals(p, JSONObject(OpenAiImageClient.buildBody(OnlineRequest(p, "gpt-image-1", OnlineSize.SQUARE, OnlineQuality.LOW, 1))).getString("prompt"))
    }
    @Test fun successDecodesAllImages() {
        val out = OpenAiImageClient.parse(ok(png, png))
        assertEquals(2, out.size); assertArrayEquals(png, out[0])
    }
    @Test fun errorsAreClassified() {
        assertEquals(GenException.Kind.AUTH, kindOf(err(401)))
        assertEquals(GenException.Kind.QUOTA, kindOf(err(429, "insufficient_quota")))
        assertEquals(GenException.Kind.RATE_LIMIT, kindOf(err(429, "rate_limit_exceeded")))
        assertEquals(GenException.Kind.POLICY, kindOf(err(400, "moderation_blocked")))
        assertEquals(GenException.Kind.BAD_REQUEST, kindOf(err(400, "invalid_value")))
        assertEquals(GenException.Kind.SERVER, kindOf(HttpResponse(503, "<html>down</html>")))
        assertEquals(GenException.Kind.BAD_RESPONSE, kindOf(HttpResponse(200, "not json")))
        assertEquals(GenException.Kind.BAD_RESPONSE, kindOf(HttpResponse(200, """{"data":[]}""")))
        assertEquals(GenException.Kind.BAD_RESPONSE, kindOf(HttpResponse(200, """{"data":[{"b64_json":"%%%"}]}""")))
    }
    @Test fun clientSendsKeyAndMapsNetworkFailures() {
        var seen: Map<String, String> = emptyMap()
        val c = OpenAiImageClient({ _, h, _ -> seen = h; ok(png) })
        c.generate(" sk-test ", OnlineRequest("abc", "gpt-image-1", OnlineSize.SQUARE, OnlineQuality.LOW, 1))
        assertEquals("Bearer sk-test", seen["Authorization"])
        val down = OpenAiImageClient({ _, _, _ -> throw IOException("no route") })
        val e = assertThrows(GenException::class.java) { down.generate("k", OnlineRequest("abc", "m", OnlineSize.SQUARE, OnlineQuality.LOW, 1)) }
        assertEquals(GenException.Kind.NETWORK, e.kind)
        val noKey = assertThrows(GenException::class.java) { down.generate(" ", OnlineRequest("abc", "m", OnlineSize.SQUARE, OnlineQuality.LOW, 1)) }
        assertEquals(GenException.Kind.NO_KEY, noKey.kind)
    }
    @Test fun promptRules() {
        assertEquals("a boat, ${StylePreset.PHOTO.words}", PromptRules.compose("  a   boat ", StylePreset.PHOTO))
        assertEquals("", PromptRules.compose("  ", StylePreset.PHOTO))
        assertNotNull(PromptRules.validate("", GenEngine.ONLINE))
        assertNotNull(PromptRules.validate("ab", GenEngine.ON_DEVICE))
        assertNotNull(PromptRules.validate("a".repeat(4001), GenEngine.ONLINE))
        assertNull(PromptRules.validate("a".repeat(4001), GenEngine.ON_DEVICE))
        assertNotNull(PromptRules.warning("a".repeat(400), GenEngine.ON_DEVICE))
        assertNull(PromptRules.warning("a".repeat(400), GenEngine.ONLINE))
        assertEquals(5, PromptRules.clampSteps(1)); assertEquals(50, PromptRules.clampSteps(99))
    }
    @Test fun modelFolderCheck() {
        val big = 900L * 1024 * 1024
        assertNotNull(ModelFolderCheck.problems(emptyList()))
        assertNotNull(ModelFolderCheck.problems(listOf(ModelFolderCheck.Entry("readme.txt", 10))))
        assertNotNull(ModelFolderCheck.problems(listOf(ModelFolderCheck.Entry("a.bin", 0), ModelFolderCheck.Entry("b.bin", big))))
        assertNotNull(ModelFolderCheck.problems(listOf(ModelFolderCheck.Entry("a.bin", 1024))))
        assertNotNull(ModelFolderCheck.problems(listOf(ModelFolderCheck.Entry("../x.bin", big))))
        assertNull(ModelFolderCheck.problems(listOf(ModelFolderCheck.Entry("a.bin", big), ModelFolderCheck.Entry("b.bin", big), ModelFolderCheck.Entry("notes.txt", 1))))
        assertEquals(2 * big, ModelFolderCheck.totalBytes(listOf(ModelFolderCheck.Entry("a.bin", big), ModelFolderCheck.Entry("b.BIN", big), ModelFolderCheck.Entry("n.txt", 5))))
    }
}
