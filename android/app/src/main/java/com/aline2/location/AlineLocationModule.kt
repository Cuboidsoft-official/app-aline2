package com.aline2.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AlineLocationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AlineLocationModule"

  private val locationManager: LocationManager?
    get() = reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager

  private fun hasLocationPermission(): Boolean {
    val context = reactApplicationContext
    val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
    return fine || coarse
  }

  private fun locationToMap(location: Location) =
    Arguments.createMap().apply {
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDouble("accuracy", location.accuracy.toDouble())
      putDouble("timestamp", location.time.toDouble())
      putString("provider", location.provider)
    }

  private fun getBestLastKnownLocation(manager: LocationManager): Location? {
    return manager.getProviders(true)
      .mapNotNull { provider ->
        try {
          manager.getLastKnownLocation(provider)
        } catch (_: SecurityException) {
          null
        }
      }
      .maxByOrNull { it.time }
  }

  @ReactMethod
  fun getCurrentPosition(timeoutMs: Double, promise: Promise) {
    if (!hasLocationPermission()) {
      promise.reject("LOCATION_PERMISSION_DENIED", "Location permission is not granted.")
      return
    }

    val manager = locationManager
    if (manager == null) {
      promise.reject("LOCATION_UNAVAILABLE", "Location service is unavailable.")
      return
    }

    val enabledProviders = manager.getProviders(true)
    if (enabledProviders.isEmpty()) {
      promise.reject("LOCATION_DISABLED", "Turn on device location and try again.")
      return
    }

    val lastKnown = getBestLastKnownLocation(manager)
    val lastKnownAgeMs = System.currentTimeMillis() - (lastKnown?.time ?: 0L)
    if (lastKnown != null && lastKnownAgeMs in 0..300000) {
      promise.resolve(locationToMap(lastKnown))
      return
    }

    val mainHandler = Handler(Looper.getMainLooper())
    var settled = false
    val provider = when {
      enabledProviders.contains(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
      enabledProviders.contains(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      else -> enabledProviders.first()
    }

    lateinit var listener: LocationListener

    fun finish(location: Location?, errorCode: String? = null, errorMessage: String? = null) {
      if (settled) {
        return
      }

      settled = true
      try {
        manager.removeUpdates(listener)
      } catch (_: Exception) {
      }

      if (location != null) {
        promise.resolve(locationToMap(location))
        return
      }

      val fallbackLocation = getBestLastKnownLocation(manager)
      if (fallbackLocation != null) {
        promise.resolve(locationToMap(fallbackLocation))
        return
      }

      promise.reject(errorCode ?: "LOCATION_TIMEOUT", errorMessage ?: "Could not detect current location.")
    }

    listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        finish(location)
      }

      @Deprecated("Deprecated in Android API")
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {
      }

      override fun onProviderEnabled(provider: String) {
      }

      override fun onProviderDisabled(provider: String) {
      }
    }

    try {
      manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
      mainHandler.postDelayed(
        { finish(null, "LOCATION_TIMEOUT", "Location detection timed out.") },
        timeoutMs.toLong().coerceIn(3000L, 20000L),
      )
    } catch (error: SecurityException) {
      finish(null, "LOCATION_PERMISSION_DENIED", error.message ?: "Location permission is not granted.")
    } catch (error: Exception) {
      finish(null, "LOCATION_UNAVAILABLE", error.message ?: "Could not detect current location.")
    }
  }
}
