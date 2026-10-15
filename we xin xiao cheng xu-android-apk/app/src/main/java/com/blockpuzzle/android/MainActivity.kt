package com.blockpuzzle.android

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import com.blockpuzzle.android.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
  private lateinit var binding: ActivityMainBinding

  private companion object {
    var timersPaused = false
  }

  private val webView: WebView
    get() = binding.webView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)
    WebView.setWebContentsDebuggingEnabled(
      (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
    )

    val assetLoader = WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", AssetsPathHandler(this))
      .build()

    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true
    webView.addJavascriptInterface(AndroidThemeStorageBridge(this), "AndroidThemeStorage")
    webView.settings.allowFileAccess = false
    webView.settings.allowContentAccess = false
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.settings.setSupportZoom(false)
    webView.isVerticalScrollBarEnabled = false
    webView.isHorizontalScrollBarEnabled = false
    webView.webChromeClient = WebChromeClient()
    webView.webViewClient = object : WebViewClientCompat() {
      override fun shouldInterceptRequest(
        view: WebView,
        request: android.webkit.WebResourceRequest
      ): android.webkit.WebResourceResponse? {
        return assetLoader.shouldInterceptRequest(request.url)
      }
    }

    webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")
  }

  override fun onPause() {
    webView.evaluateJavascript(
      "window.ANDROID_APP_BACKGROUND && window.ANDROID_APP_BACKGROUND();",
      null
    )
    webView.onPause()
    super.onPause()
  }

  override fun onStop() {
    super.onStop()
    if (!timersPaused) {
      webView.pauseTimers()
      timersPaused = true
    }
  }

  override fun onResume() {
    webView.onResume()
    if (timersPaused) {
      webView.resumeTimers()
      timersPaused = false
    }
    webView.evaluateJavascript(
      "window.ANDROID_APP_FOREGROUND && window.ANDROID_APP_FOREGROUND();",
      null
    )
    super.onResume()
  }

  override fun onBackPressed() {
    if (webView.canGoBack()) {
      webView.goBack()
      return
    }
    super.onBackPressed()
  }
}

private const val THEME_PREFERENCES_FILE = "theme_preferences"
private const val THEME_PREFERENCE_KEY = "block_puzzle_theme_v1"

class AndroidThemeStorageBridge(context: Context) {
  private val preferences = context.applicationContext.getSharedPreferences(
    THEME_PREFERENCES_FILE,
    Context.MODE_PRIVATE
  )

  @JavascriptInterface
  fun getTheme(): String = preferences.getString(THEME_PREFERENCE_KEY, "") ?: ""

  @JavascriptInterface
  fun setTheme(theme: String): Boolean {
    if (theme != "soft" && theme != "classic") return false
    return preferences.edit().putString(THEME_PREFERENCE_KEY, theme).commit()
  }
}
