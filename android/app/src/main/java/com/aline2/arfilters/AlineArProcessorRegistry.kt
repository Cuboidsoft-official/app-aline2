package com.aline2.arfilters

import android.content.Context
import com.oney.WebRTCModule.videoEffects.ProcessorProvider

object AlineArProcessorRegistry {
  const val DOG_FILTER_EFFECT_ID = "aline2_dog_face_filter"

  @Volatile
  private var registered = false

  fun register(context: Context) {
    if (registered) {
      return
    }

    synchronized(this) {
      if (registered) {
        return
      }

      ProcessorProvider.addProcessor(
        DOG_FILTER_EFFECT_ID,
        DogFaceFilterProcessorFactory(context.applicationContext),
      )

      registered = true
    }
  }
}
