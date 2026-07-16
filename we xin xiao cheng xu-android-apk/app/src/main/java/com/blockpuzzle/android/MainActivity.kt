package com.blockpuzzle.android

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewAssetLoader.AssetsPathHandler
import com.blockpuzzle.android.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
  private lateinit var binding: ActivityMainBinding
  private var timersPaused = false

  private val webView: WebView
    get() = binding.webView

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    binding = ActivityMainBinding.inflate(layoutInflater)
    setContentView(binding.root)

    val assetLoader = WebViewAssetLoader.Builder()
      .addPathHandler("/assets/", AssetsPathHandler(this))
      .build()

    webView.settings.javaScriptEnabled = true
    webView.settings.domStorageEnabled = true
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
