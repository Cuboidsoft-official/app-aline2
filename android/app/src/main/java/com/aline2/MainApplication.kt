package com.aline2

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Application
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import com.aline2.arfilters.AlineArProcessorRegistry
import com.aline2.arfilters.ArFilterPackage
import com.aline2.callaudio.CallAudioPackage
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(ArFilterPackage())
          add(CallAudioPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    AlineArProcessorRegistry.register(applicationContext)
    createNotificationChannels()
    loadReactNative(this)
  }

  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val notificationManager =
      getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
    val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    val soundAttributes =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    val defaultChannel =
      NotificationChannel(
        "default",
        "Default",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "General app notifications"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 200, 120, 200)
        setSound(defaultSoundUri, soundAttributes)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }

    val socialChannel =
      NotificationChannel(
        "social",
        "Social Updates",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Follows, likes, comments, mentions, and story activity"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 180, 120, 180)
        setSound(defaultSoundUri, soundAttributes)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }

    val chatChannel =
      NotificationChannel(
        "chat",
        "Chat Messages",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Direct and group chat messages"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 150, 100, 150)
        setSound(defaultSoundUri, soundAttributes)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }

    val callsChannel =
      NotificationChannel(
        "calls",
        "Calls",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Incoming call alerts"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 300, 160, 300, 160, 300)
        setSound(defaultSoundUri, soundAttributes)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }

    notificationManager.createNotificationChannels(
      listOf(defaultChannel, socialChannel, chatChannel, callsChannel),
    )
  }
}
