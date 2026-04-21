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
      if (normalizedPreset == "dog") {
        val effects =
          WritableNativeArray().apply {
            pushString(AlineArProcessorRegistry.DOG_FILTER_EFFECT_ID)
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
          },
        )
      }
    promise.resolve(result)
  }
}
