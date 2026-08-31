package com.aline2

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "Aline2"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  // Launching the native Camera app (Photo/Video capture) backgrounds this
  // Activity, and Android can kill it to reclaim memory on low/mid RAM
  // devices. When the user returns after confirming the photo, Android tries
  // to recreate MainActivity and restore its saved fragment state, but
  // react-native-screens fragments cannot be restored this way and crash
  // with "Screen fragments should never be restored". Passing null skips
  // that restore. See:
  // https://github.com/software-mansion/react-native-screens/issues/17#issuecomment-424704067
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(null)
  }
}
