package com.aline2.callaudio

import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class CallAudioModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  private var ringtone: Ringtone? = null

  override fun getName(): String = "CallAudioModule"

  @ReactMethod
  fun startRingtone(promise: Promise) {
    try {
      if (ringtone?.isPlaying == true) {
        promise.resolve(true)
        return
      }

      val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

      if (ringtoneUri == null) {
        promise.resolve(false)
        return
      }

      ringtone = RingtoneManager.getRingtone(reactApplicationContext, ringtoneUri)?.apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        } else {
          @Suppress("DEPRECATION")
          streamType = android.media.AudioManager.STREAM_RING
        }

        play()
      }

      promise.resolve(ringtone?.isPlaying == true)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_START_FAILED", error)
    }
  }

  @ReactMethod
  fun stopRingtone(promise: Promise) {
    try {
      ringtone?.stop()
      ringtone = null
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_STOP_FAILED", error)
    }
  }
}
