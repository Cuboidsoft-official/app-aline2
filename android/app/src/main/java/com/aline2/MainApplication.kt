package com.aline2

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Application
import android.content.ContentResolver
import android.content.Context
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import com.aline2.arfilters.AlineArProcessorRegistry
import com.aline2.arfilters.ArFilterPackage
import com.aline2.callaudio.CallAudioPackage
import com.aline2.location.AlineLocationPackage
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
          add(AlineLocationPackage())
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
    val callSoundUri =
      Uri.parse("${ContentResolver.SCHEME_ANDROID_RESOURCE}://$packageName/${R.raw.call_ringing}")
    val soundAttributes =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    val callSoundAttributes =
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
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
        "calls_v3",
        "Calls",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Incoming call alerts"
        enableVibration(true)
        vibrationPattern = longArrayOf(0, 300, 160, 300, 160, 300)
        setSound(callSoundUri, callSoundAttributes)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      }

    notificationManager.createNotificationChannels(
      listOf(defaultChannel, socialChannel, chatChannel, callsChannel),
    )
  }
}
