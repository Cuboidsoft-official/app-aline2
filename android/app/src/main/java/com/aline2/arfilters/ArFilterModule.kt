package com.aline2.arfilters

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeArray
import com.facebook.react.bridge.WritableNativeMap
import com.oney.WebRTCModule.WebRTCModule

class ArFilterModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val effectIdByPreset =
    mapOf(
      "dog" to AlineArProcessorRegistry.DOG_FILTER_EFFECT_ID,
      "cat" to AlineArProcessorRegistry.CAT_FILTER_EFFECT_ID,
      "crown" to AlineArProcessorRegistry.CROWN_FILTER_EFFECT_ID,
      "shades" to AlineArProcessorRegistry.SHADES_FILTER_EFFECT_ID,
    )

  override fun getName(): String = "ArFilterModule"

  @ReactMethod
  fun applyPreset(trackId: String, preset: String?, promise: Promise) {
    try {
      val webRtcModule = reactApplicationContext.getNativeModule(WebRTCModule::class.java)
      if (webRtcModule == null) {
        promise.resolve(false)
        return
      }

      val normalizedPreset = preset?.trim()?.lowercase() ?: "none"
      val effectId = effectIdByPreset[normalizedPreset]
      if (effectId != null) {
        val effects =
          WritableNativeArray().apply {
            pushString(effectId)
          }
        webRtcModule.mediaStreamTrackSetVideoEffects(trackId, effects)
      } else {
        webRtcModule.mediaStreamTrackSetVideoEffects(trackId, null)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("AR_FILTER_APPLY_FAILED", error)
    }
  }

  @ReactMethod
  fun getAvailablePresets(promise: Promise) {
    val result =
      WritableNativeMap().apply {
        putBoolean("supported", true)
        putArray(
          "presets",
          WritableNativeArray().apply {
            pushString("none")
            pushString("dog")
            pushString("cat")
            pushString("crown")
            pushString("shades")
          },
        )
      }
    promise.resolve(result)
  }
}
