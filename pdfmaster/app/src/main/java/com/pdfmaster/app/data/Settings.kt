package com.pdfmaster.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.inject.Inject
import javax.inject.Singleton

private val Context.store by preferencesDataStore("settings")

data class Settings(
    val userName: String = "",
    val theme: String = "dark",              // system, light, dark
    val exportFormat: String = "docx",       // default "convert PDF to" choice
    val compress: String = "BALANCED",
    val imageDpi: Int = 150,
    val ocrAfterScan: Boolean = true,
    val aiCloud: Boolean = false,            // off until the user turns it on and agrees
    val aiProvider: String = "anthropic",    // anthropic or openai (OpenAI compatible)
    val aiBaseUrl: String = "",
    val aiModel: String = "",
    val aiKeyEnc: String = "",               // API key, encrypted with a key in the Android Keystore
    val notifyDone: Boolean = true
)

@Singleton
class SettingsStore @Inject constructor(@ApplicationContext private val context: Context) {
    private object K {
        val userName = stringPreferencesKey("userName"); val theme = stringPreferencesKey("theme"); val exportFormat = stringPreferencesKey("exportFormat")
        val compress = stringPreferencesKey("compress"); val imageDpi = intPreferencesKey("imageDpi"); val ocrAfterScan = booleanPreferencesKey("ocrAfterScan")
        val aiCloud = booleanPreferencesKey("aiCloud"); val aiProvider = stringPreferencesKey("aiProvider"); val aiBaseUrl = stringPreferencesKey("aiBaseUrl")
        val aiModel = stringPreferencesKey("aiModel"); val aiKeyEnc = stringPreferencesKey("aiKeyEnc"); val notifyDone = booleanPreferencesKey("notifyDone")
    }

    val flow: Flow<Settings> = context.store.data.map { p ->
        Settings(p[K.userName] ?: "", p[K.theme] ?: "dark", p[K.exportFormat] ?: "docx", p[K.compress] ?: "BALANCED", p[K.imageDpi] ?: 150,
            p[K.ocrAfterScan] ?: true, p[K.aiCloud] ?: false, p[K.aiProvider] ?: "anthropic", p[K.aiBaseUrl] ?: "", p[K.aiModel] ?: "", p[K.aiKeyEnc] ?: "", p[K.notifyDone] ?: true)
    }

    suspend fun get(): Settings = flow.first()

    suspend fun update(s: Settings) {
        context.store.edit { p ->
            p[K.userName] = s.userName; p[K.theme] = s.theme; p[K.exportFormat] = s.exportFormat; p[K.compress] = s.compress; p[K.imageDpi] = s.imageDpi
            p[K.ocrAfterScan] = s.ocrAfterScan; p[K.aiCloud] = s.aiCloud; p[K.aiProvider] = s.aiProvider; p[K.aiBaseUrl] = s.aiBaseUrl; p[K.aiModel] = s.aiModel
            p[K.aiKeyEnc] = s.aiKeyEnc; p[K.notifyDone] = s.notifyDone
        }
    }
}

/** Encrypts small secrets (the user's own AI key) with a key that never leaves the Android Keystore. */
object Secrets {
    private const val ALIAS = "pdfmaster.secrets"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return gen.generateKey()
    }

    fun encrypt(plain: String): String {
        if (plain.isEmpty()) return ""
        val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key())
        return Base64.encodeToString(c.iv + c.doFinal(plain.toByteArray()), Base64.NO_WRAP)
    }

    fun decrypt(enc: String): String = try {
        if (enc.isEmpty()) "" else {
            val raw = Base64.decode(enc, Base64.NO_WRAP)
            val c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw, 0, 12))
            String(c.doFinal(raw, 12, raw.size - 12))
        }
    } catch (e: Exception) { "" }
}
