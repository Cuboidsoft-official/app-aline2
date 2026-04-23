package com.aline2.callaudio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
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
  private var audioFocusRequest: AudioFocusRequest? = null
  private var didCaptureAudioState = false
  private var previousMode: Int = AudioManager.MODE_NORMAL
  private var previousSpeakerphoneOn = false
  private var previousMicrophoneMute = false
  private var previousVoiceCallVolume: Int? = null
  private var previousMusicVolume: Int? = null
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

  private fun captureCurrentAudioState() {
    val manager = audioManager ?: return
    if (didCaptureAudioState) {
      return
    }

    previousMode = manager.mode
    previousSpeakerphoneOn = manager.isSpeakerphoneOn
    previousMicrophoneMute = manager.isMicrophoneMute
    previousVoiceCallVolume = manager.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
    previousMusicVolume = manager.getStreamVolume(AudioManager.STREAM_MUSIC)
    didCaptureAudioState = true
  }

  private fun requestCommunicationAudioFocus() {
    val manager = audioManager ?: return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request =
        audioFocusRequest
          ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
            .setAudioAttributes(
              AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
            )
            .build()

      audioFocusRequest = request
      manager.requestAudioFocus(request)
      return
    }

    @Suppress("DEPRECATION")
    manager.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
  }

  private fun boostStreamVolume(streamType: Int, minimumRatio: Double) {
    val manager = audioManager ?: return
    val maxVolume = manager.getStreamMaxVolume(streamType)
    val currentVolume = manager.getStreamVolume(streamType)
    if (maxVolume <= 0) {
      return
    }

    val targetVolume = maxOf(currentVolume, kotlin.math.ceil(maxVolume * minimumRatio).toInt())
    if (targetVolume != currentVolume) {
      manager.setStreamVolume(streamType, targetVolume.coerceAtMost(maxVolume), 0)
    }
  }

  private fun applyCommunicationAudioState(useSpeaker: Boolean) {
    val manager = audioManager ?: return

    captureCurrentAudioState()
    requestCommunicationAudioFocus()
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    manager.isMicrophoneMute = false
    manager.isSpeakerphoneOn = useSpeaker

    boostStreamVolume(AudioManager.STREAM_VOICE_CALL, 1.0)
    if (useSpeaker) {
      boostStreamVolume(AudioManager.STREAM_MUSIC, 0.82)
    }
  }

  @ReactMethod
  fun startRingtone(promise: Promise) {
    try {
      if (ringtonePlayer?.isPlaying == true) {
        promise.resolve(true)
        return
      }

      releaseRingtonePlayer()

      val player = MediaPlayer.create(reactApplicationContext, R.raw.call_ringing)
      if (player == null) {
        promise.resolve(false)
        return
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
        player.setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
      } else {
        @Suppress("DEPRECATION")
        player.setAudioStreamType(AudioManager.STREAM_MUSIC)
      }

      player.setVolume(0.62f, 0.62f)
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
      applyCommunicationAudioState(enabled)
      promise.resolve(audioManager?.isSpeakerphoneOn == enabled)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_ROUTE_FAILED", error)
    }
  }

  @ReactMethod
  fun activateCommunicationAudio(useSpeaker: Boolean, promise: Promise) {
    try {
      applyCommunicationAudioState(useSpeaker)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_ACTIVATE_FAILED", error)
    }
  }

  @ReactMethod
  fun resetAudioRoute(promise: Promise) {
    try {
      audioManager?.let { manager ->
        manager.isSpeakerphoneOn = previousSpeakerphoneOn
        manager.isMicrophoneMute = previousMicrophoneMute
        manager.mode = previousMode

        previousVoiceCallVolume?.let { manager.setStreamVolume(AudioManager.STREAM_VOICE_CALL, it, 0) }
        previousMusicVolume?.let { manager.setStreamVolume(AudioManager.STREAM_MUSIC, it, 0) }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          audioFocusRequest?.let(manager::abandonAudioFocusRequest)
        } else {
          @Suppress("DEPRECATION")
          manager.abandonAudioFocus(null)
        }
      }

      didCaptureAudioState = false
      previousVoiceCallVolume = null
      previousMusicVolume = null
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("CALL_AUDIO_RESET_FAILED", error)
    }
  }
}
