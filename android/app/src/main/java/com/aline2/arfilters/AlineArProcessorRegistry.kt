package com.aline2.arfilters

import android.content.Context
import com.oney.WebRTCModule.videoEffects.ProcessorProvider

object AlineArProcessorRegistry {
  const val DOG_FILTER_EFFECT_ID = "aline2_dog_face_filter"
  const val CAT_FILTER_EFFECT_ID = "aline2_cat_face_filter"
  const val CROWN_FILTER_EFFECT_ID = "aline2_crown_face_filter"
  const val SHADES_FILTER_EFFECT_ID = "aline2_shades_face_filter"

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
      ProcessorProvider.addProcessor(
        CAT_FILTER_EFFECT_ID,
        CatFaceFilterProcessorFactory(context.applicationContext),
      )
      ProcessorProvider.addProcessor(
        CROWN_FILTER_EFFECT_ID,
        CrownFaceFilterProcessorFactory(context.applicationContext),
      )
      ProcessorProvider.addProcessor(
        SHADES_FILTER_EFFECT_ID,
        ShadesFaceFilterProcessorFactory(context.applicationContext),
      )

      registered = true
    }
  }
}
