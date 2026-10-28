package com.worldline.wlstore.ui.setup

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.bumptech.glide.Glide
import com.worldline.wlstore.R
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.AppInfo
import com.worldline.wlstore.service.InstallManager
import com.worldline.wlstore.service.TelemetryService
import com.worldline.wlstore.ui.catalog.CatalogActivity
import kotlinx.coroutines.launch

/**
 * First-run setup screen shown right after enrollment when the terminal's
 * customer/device has one or more apps assigned as "Default". Downloads and
 * installs them sequentially, showing a segmented "i / N" progress indicator
 * and a per-app status row, then hands off to the main catalog.
 */
class DefaultAppsSetupActivity : AppCompatActivity() {

    private lateinit var tvProgress: TextView
    private lateinit var progressBarOverall: ProgressBar
    private lateinit var container: LinearLayout
    private lateinit var btnContinue: Button
    private lateinit var tvSkip: TextView

    private var apps: List<AppInfo> = emptyList()
    private val rowStatusViews = mutableMapOf<String, TextView>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_default_apps_setup)

        apps = intent.getParcelableArrayListExtra<AppInfo>(EXTRA_APPS) ?: emptyList()

        tvProgress = findViewById(R.id.tv_progress)
        progressBarOverall = findViewById(R.id.progress_bar_overall)
        container = findViewById(R.id.ll_apps_list)
        btnContinue = findViewById(R.id.btn_continue)
        tvSkip = findViewById(R.id.tv_skip)

        btnContinue.setOnClickListener { goToCatalog() }
        tvSkip.setOnClickListener { goToCatalog() }

        if (apps.isEmpty()) {
            goToCatalog()
            return
        }

        progressBarOverall.max = apps.size
        tvProgress.text = "Installing 0 of ${apps.size} apps…"
        buildRows()

        lifecycleScope.launch { installAllSequentially() }
    }

    private fun buildRows() {
        for (a in apps) {
            val row = LayoutInflater.from(this).inflate(R.layout.item_default_app_row, container, false)
            row.findViewById<TextView>(R.id.tv_row_name).text = a.name
            val icon = row.findViewById<ImageView>(R.id.iv_row_icon)
            if (a.iconUrl != null) Glide.with(icon).load(a.iconUrl).into(icon)
            else icon.setImageResource(R.drawable.ic_default_app)
            rowStatusViews[a.id] = row.findViewById(R.id.tv_row_status)
            container.addView(row)
        }
    }

    private suspend fun installAllSequentially() {
        var completed = 0
        for (a in apps) {
            tvProgress.text = "Installing ${completed + 1} of ${apps.size} apps…"
            installOne(a)

            completed++
            progressBarOverall.progress = completed
            tvProgress.text = "Installed $completed of ${apps.size} apps"
        }

        tvProgress.text = "✅ Setup complete — $completed of ${apps.size} apps processed"
        btnContinue.visibility = View.VISIBLE
        tvSkip.visibility = View.GONE
    }

    /** Downloads, verifies, and installs a single default app, updating its row status. */
    private suspend fun installOne(a: AppInfo) {
        setRowStatus(a.id, "Requesting download…")
        try {
            val urlResponse = ApiClient.service.getDownloadUrl(a.id)
            if (!urlResponse.isSuccessful) {
                setRowStatus(a.id, "❌ Not available")
                return
            }
            val dlData = urlResponse.body()!!
            TelemetryService.reportDownloadEvent(this, dlData.eventId, a.id, a.version, "DOWNLOADING")

            setRowStatus(a.id, "Downloading 0%")
            val apkResult = InstallManager.downloadApk(
                context = this,
                downloadUrl = dlData.downloadUrl,
                fileName = "${a.packageName}-${a.version}.apk",
                onProgress = { pct -> runOnUiThread { setRowStatus(a.id, "Downloading $pct%") } }
            )
            val apkFile = apkResult.getOrNull()
            if (apkFile == null) {
                setRowStatus(a.id, "❌ Download failed")
                TelemetryService.reportDownloadEvent(this, dlData.eventId, a.id, a.version, "FAILED")
                return
            }

            setRowStatus(a.id, "Verifying…")
            if (!InstallManager.verifyChecksum(apkFile, a.checksum)) {
                apkFile.delete()
                setRowStatus(a.id, "❌ Checksum mismatch")
                TelemetryService.reportDownloadEvent(this, dlData.eventId, a.id, a.version, "FAILED")
                return
            }

            setRowStatus(a.id, "Installing…")
            var success = false
            var message = ""
            InstallManager.installApk(this, apkFile, a.packageName) { ok, msg -> success = ok; message = msg }
            TelemetryService.reportDownloadEvent(this, dlData.eventId, a.id, a.version, if (success) "SUCCESS" else "FAILED")
            setRowStatus(a.id, if (success) "✅ Installed" else "❌ $message")
        } catch (e: Exception) {
            setRowStatus(a.id, "❌ Error: ${e.message}")
        }
    }

    private fun setRowStatus(appId: String, text: String) {
        runOnUiThread { rowStatusViews[appId]?.text = text }
    }

    private fun goToCatalog() {
        startActivity(Intent(this, CatalogActivity::class.java))
        finish()
    }

    companion object {
        const val EXTRA_APPS = "default_apps"
    }
}
