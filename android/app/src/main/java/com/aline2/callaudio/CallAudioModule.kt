package com.aline2.callaudio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import com.aline2.R
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CallAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var ringtonePlayer: MediaPlayer? = null
  private val audioManager: AudioManager? =
    reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  override fun getName(): String = "CallAudioModule"

  private fun releaseRingtonePlayer() {
    val player = ringtonePlayer ?: return

    try {
      if (player.isPlaying) {
        player.stop()
      }
    } catch (_: Exception) {
    }

    try {
      player.reset()
    } catch (_: Exception) {
    }

    player.release()
    ringtonePlayer = null
  }

  @ReactMethod
  fun startRingtone(promise: Promise) {
    try {
      if (ringtonePlayer?.isPlaying == true) {
        promise.resolve(true)
        return
      }

      releaseRingtonePlayer()

      val player = MediaPlayer.create(reactApplicationContext, R.raw.ringtone_default)
      if (player == null) {
        promise.resolve(false)
        return
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        player.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
      } else {
        @Suppress("DEPRECATION")
        player.setAudioStreamType(AudioManager.STREAM_RING)
      }

      player.isLooping = true
      player.setOnErrorListener { failedPlayer, _, _ ->
        try {
          failedPlayer.reset()
        } catch (_: Exception) {
        }

        failedPlayer.release()
        if (ringtonePlayer === failedPlayer) {
          ringtonePlayer = null
        }
        true
      }
      player.start()
      ringtonePlayer = player

      promise.resolve(player.isPlaying)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopRingtone(promise: Promise) {
    try {
      releaseRingtonePlayer()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_STOP_FAILED", error)
    }
  }

  @ReactMethod
  fun setSpeakerEnabled(enabled: Boolean, promise: Promise) {
    try {
      audioManager?.mode = AudioManager.MODE_IN_COMMUNICATION
      audioManager?.isSpeakerphoneOn = enabled
      promise.resolve(audioManager?.isSpeakerphoneOn == enabled)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_ROUTE_FAILED", error)
    }
  }

  @ReactMethod
  fun resetAudioRoute(promise: Promise) {
    try {
      audioManager?.isSpeakerphoneOn = false
      audioManager?.mode = AudioManager.MODE_NORMAL
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_RESET_FAILED", error)
    }
  }
}
