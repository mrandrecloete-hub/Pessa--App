package android.util

object Base64 {
    const val DEFAULT = 0
    @JvmStatic fun decode(s: String, flags: Int): ByteArray = java.util.Base64.getMimeDecoder().decode(s)
}
