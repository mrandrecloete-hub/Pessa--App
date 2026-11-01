package com.example.aicamerastudio.camera.ui

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaActionSound
import android.media.SoundPool
import android.os.Build
import com.example.aicamerastudio.R

/**
 * BlazeCam's shutter click (res/raw/shutter_click.wav, trimmed from the sound file supplied by the owner;
 * see docs/SOUNDS.md). The earlier original sound can be rebuilt with tools/sound/make_shutter.py.
 * Like a phone camera should, it stays quiet when the phone is on silent or vibrate.
 * Where the law requires a shutter sound (Android reports this), Android's own sound is always played instead.
 */
class ShutterSound(context: Context) {
    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val pool = SoundPool.Builder().setMaxStreams(2).setAudioAttributes(
        AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),
    ).build()
    private val click = pool.load(context, R.raw.shutter_click, 1)
    private val system = MediaActionSound().apply { load(MediaActionSound.SHUTTER_CLICK) }

    val legallyRequired: Boolean get() = Build.VERSION.SDK_INT >= 33 && MediaActionSound.mustPlayShutterSound()

    fun play(enabled: Boolean) {
        when {
            legallyRequired -> system.play(MediaActionSound.SHUTTER_CLICK)
            !enabled -> {}
            audio.ringerMode != AudioManager.RINGER_MODE_NORMAL -> {} // silent or vibrate: no sound
            else -> pool.play(click, 1f, 1f, 1, 0, 1f)
        }
    }

    fun release() { pool.release(); system.release() }
}
