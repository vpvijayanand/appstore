package com.worldline.wlstore.ui.detail

import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.worldline.wlstore.R
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.AppInfo
import com.worldline.wlstore.service.InstallManager
import com.worldline.wlstore.service.TelemetryService
import kotlinx.coroutines.launch

/**
 * App detail screen — shown when user taps an app in the catalog grid.
 * Shows app info, download progress, and handles the full install flow:
 *
 * 1. Request download URL from backend (entitlement check happens here)
 * 2. Capture GPS fix (single, at moment of download)
 * 3. Download APK with progress
 * 4. Verify SHA-256 checksum
 * 5. Install (silent if Device Owner, dialog fallback otherwise)
 * 6. Report telemetry event to backend
 */
class AppDetailActivity : AppCompatActivity() {

    private lateinit var ivIcon: ImageView
    private lateinit var tvName: TextView
    private lateinit var tvDeveloper: TextView
    private lateinit var tvVersion: TextView
    private lateinit var tvSize: TextView
    private lateinit var tvDescription: TextView
    private lateinit var btnInstall: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvStatus: TextView

    private var app: AppInfo? = null
    private var isInstalling = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_app_detail)

        app = intent.getParcelableExtra(EXTRA_APP)
        if (app == null) { finish(); return }

        bindViews()
        populateUi()
        setupInstallButton()
    }

    private fun bindViews() {
        ivIcon = findViewById(R.id.iv_icon)
        tvName = findViewById(R.id.tv_name)
        tvDeveloper = findViewById(R.id.tv_developer)
        tvVersion = findViewById(R.id.tv_version)
        tvSize = findViewById(R.id.tv_size)
        tvDescription = findViewById(R.id.tv_description)
        btnInstall = findViewById(R.id.btn_install)
        progressBar = findViewById(R.id.progress_bar)
        tvStatus = findViewById(R.id.tv_status)
    }

    private fun populateUi() {
        val a = app!!
        tvName.text = a.name
        tvDeveloper.text = a.developer
        tvVersion.text = "Version ${a.version} (${a.versionCode})"
        tvSize.text = a.sizeMb
        tvDescription.text = a.description ?: "No description available."
        supportActionBar?.title = a.name
    }

    private fun setupInstallButton() {
        btnInstall.setOnClickListener {
            if (!isInstalling) startInstallFlow()
        }
    }

    private fun startInstallFlow() {
        isInstalling = true
        btnInstall.isEnabled = false
        btnInstall.text = "Preparing..."
        progressBar.visibility = View.VISIBLE
        progressBar.isIndeterminate = true
        tvStatus.visibility = View.VISIBLE

        lifecycleScope.launch {
            val a = app!!

            try {
                // Step 1: Get download URL (backend checks entitlement)
                updateStatus("Getting download URL...")
                val urlResponse = ApiClient.service.getDownloadUrl(a.id)
                if (!urlResponse.isSuccessful) {
                    showError("Access denied or app unavailable")
                    return@launch
                }
                val dlData = urlResponse.body()!!

                // Step 2: Report DOWNLOADING event with GPS
                updateStatus("Capturing location...")
                TelemetryService.reportDownloadEvent(
                    context = this@AppDetailActivity,
                    eventId = dlData.eventId,
                    appId = a.id,
                    version = a.version,
                    installStatus = "DOWNLOADING"
                )

                // Step 3: Download APK
                updateStatus("Downloading ${a.name}...")
                progressBar.isIndeterminate = false
                val apkResult = InstallManager.downloadApk(
                    context = this@AppDetailActivity,
                    downloadUrl = dlData.downloadUrl,
                    fileName = "${a.packageName}-${a.version}.apk",
                    onProgress = { pct ->
                        runOnUiThread {
                            progressBar.progress = pct
                            btnInstall.text = "Downloading... $pct%"
                        }
                    }
                )

                val apkFile = apkResult.getOrElse {
                    reportResult(dlData.eventId, a, "FAILED")
                    showError("Download failed: ${it.message}")
                    return@launch
                }

                // Step 4: Verify checksum
                updateStatus("Verifying integrity...")
                val checksumOk = InstallManager.verifyChecksum(apkFile, a.checksum)
                if (!checksumOk) {
                    apkFile.delete()
                    reportResult(dlData.eventId, a, "FAILED")
                    showError("Checksum verification failed — APK may be tampered")
                    return@launch
                }

                // Step 5: Install
                updateStatus("Installing...")
                InstallManager.installApk(
                    context = this@AppDetailActivity,
                    apkFile = apkFile,
                    packageName = a.packageName
                ) { success, message ->
                    lifecycleScope.launch {
                        reportResult(dlData.eventId, a, if (success) "SUCCESS" else "FAILED")
                        if (success) {
                            btnInstall.text = "Installed ✓"
                            tvStatus.text = "✅ ${a.name} installed successfully"
                        } else {
                            showError(message)
                        }
                    }
                }

            } catch (e: Exception) {
                showError("Error: ${e.message}")
            }
        }
    }

    private suspend fun reportResult(eventId: String, app: AppInfo, status: String) {
        TelemetryService.reportDownloadEvent(
            context = this@AppDetailActivity,
            eventId = eventId,
            appId = app.id,
            version = app.version,
            installStatus = status
        )
    }

    private fun updateStatus(msg: String) {
        runOnUiThread {
            tvStatus.text = msg
            btnInstall.text = msg
        }
    }

    private fun showError(msg: String) {
        runOnUiThread {
            progressBar.visibility = View.GONE
            tvStatus.text = "❌ $msg"
            btnInstall.text = "Retry"
            btnInstall.isEnabled = true
            isInstalling = false
            Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
        }
    }

    companion object {
        const val EXTRA_APP = "app_info"
    }
}
