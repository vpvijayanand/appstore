package com.worldline.wlstore.ui.advertisement

import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.webkit.WebView
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.VideoView
import androidx.appcompat.app.AppCompatActivity
import com.bumptech.glide.Glide
import com.bumptech.glide.load.DataSource
import com.bumptech.glide.load.engine.GlideException
import com.bumptech.glide.request.RequestListener
import com.bumptech.glide.request.target.Target
import com.worldline.wlstore.R
import com.worldline.wlstore.data.model.AdvertisementDto

/**
 * Full-screen display for a queue of advertisements pushed from the admin
 * portal (see AdvertisementManager). Renders IMAGE (Glide), VIDEO (VideoView)
 * or HTML (WebView) content, then either auto-advances/dismisses after the
 * configured duration (POPUP) or dismisses immediately on any tap
 * (SCREENSAVER — classic "touch to wake" behavior).
 */
class AdvertisementActivity : AppCompatActivity() {

    private lateinit var imageView: ImageView
    private lateinit var videoView: VideoView
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var titleView: TextView
    private lateinit var closeButton: ImageButton
    private lateinit var root: View

    private var ads: List<AdvertisementDto> = emptyList()
    private var index = 0
    private val handler = Handler(Looper.getMainLooper())
    private var dismissRunnable: Runnable? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_advertisement)

        root = findViewById(android.R.id.content)
        imageView = findViewById(R.id.iv_ad_image)
        videoView = findViewById(R.id.vv_ad_video)
        webView = findViewById(R.id.wv_ad_html)
        progressBar = findViewById(R.id.progress_ad)
        titleView = findViewById(R.id.tv_ad_title)
        closeButton = findViewById(R.id.btn_ad_close)

        closeButton.setOnClickListener { finish() }

        @Suppress("DEPRECATION")
        ads = intent.getParcelableArrayListExtra(EXTRA_ADS) ?: emptyList()
        if (ads.isEmpty()) {
            finish()
            return
        }

        showAd(0)
    }

    private fun showAd(i: Int) {
        if (i >= ads.size) {
            finish()
            return
        }
        index = i
        val ad = ads[i]
        cancelScheduledDismiss()

        imageView.visibility = View.GONE
        videoView.visibility = View.GONE
        webView.visibility = View.GONE
        progressBar.visibility = View.VISIBLE
        titleView.text = ad.title

        // Screensaver ads dismiss on any touch — mimics a classic screensaver.
        root.setOnClickListener {
            if (ad.displayMode == "SCREENSAVER") finish()
        }

        when (ad.type) {
            "IMAGE" -> {
                imageView.visibility = View.VISIBLE
                Glide.with(this)
                    .load(ad.mediaUrl)
                    .listener(object : RequestListener<android.graphics.drawable.Drawable> {
                        override fun onLoadFailed(e: GlideException?, model: Any?, target: Target<android.graphics.drawable.Drawable>, isFirstResource: Boolean): Boolean {
                            progressBar.visibility = View.GONE
                            return false
                        }
                        override fun onResourceReady(resource: android.graphics.drawable.Drawable, model: Any, target: Target<android.graphics.drawable.Drawable>?, dataSource: DataSource, isFirstResource: Boolean): Boolean {
                            progressBar.visibility = View.GONE
                            return false
                        }
                    })
                    .into(imageView)
                scheduleDismiss(ad.durationSeconds)
            }
            "VIDEO" -> {
                videoView.visibility = View.VISIBLE
                videoView.setVideoURI(Uri.parse(ad.mediaUrl))
                videoView.setOnPreparedListener {
                    progressBar.visibility = View.GONE
                    it.start()
                }
                videoView.setOnCompletionListener { advanceOrFinish() }
                videoView.setOnErrorListener { _, _, _ ->
                    progressBar.visibility = View.GONE
                    advanceOrFinish()
                    true
                }
            }
            "HTML" -> {
                webView.visibility = View.VISIBLE
                webView.settings.javaScriptEnabled = true
                webView.loadDataWithBaseURL(null, ad.htmlContent ?: "", "text/html", "utf-8", null)
                progressBar.visibility = View.GONE
                scheduleDismiss(ad.durationSeconds)
            }
            else -> advanceOrFinish()
        }
    }

    private fun scheduleDismiss(durationSeconds: Int) {
        val runnable = Runnable { advanceOrFinish() }
        dismissRunnable = runnable
        handler.postDelayed(runnable, durationSeconds.coerceAtLeast(3) * 1000L)
    }

    private fun cancelScheduledDismiss() {
        dismissRunnable?.let { handler.removeCallbacks(it) }
        dismissRunnable = null
        videoView.stopPlayback()
    }

    private fun advanceOrFinish() {
        cancelScheduledDismiss()
        showAd(index + 1)
    }

    override fun onDestroy() {
        cancelScheduledDismiss()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        const val EXTRA_ADS = "extra_ads"
    }
}
