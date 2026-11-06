package com.worldline.wlstore.ui.enrollment

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.worldline.wlstore.R
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.EnrollBySerialRequest
import com.worldline.wlstore.service.CommandPollWorker
import com.worldline.wlstore.service.TerminalSerialProvider
import com.worldline.wlstore.ui.catalog.CatalogActivity
import com.worldline.wlstore.ui.setup.DefaultAppsSetupActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * First-launch login screen for the customer Android app.
 *
 * Fully automatic: the device reads its own factory serial number from the
 * Castles CTOS vendor SDK (TerminalSerialProvider — see docs/POS_SUPPORT.md)
 * and sends only that to the backend. There is no manual Serial No / TID
 * entry — the TID and customer/site are resolved server-side from the
 * Serial No -> TerminalMaster mapping that an admin already pre-provisioned
 * (and assigned a TID to) in the Device Master page.
 *
 * On subsequent launches, reads the stored API key and navigates directly to the catalog.
 * Stores Serial No / TID / API key in EncryptedSharedPreferences (AES256 + API 23+).
 */
class EnrollmentActivity : AppCompatActivity() {

    private lateinit var tvSerialNo: TextView
    private lateinit var btnRetry: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var tvStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Check if already enrolled — wrap in try/catch because EncryptedSharedPreferences
        // can throw GeneralSecurityException / KeyStoreException on first boot or if the
        // Android Keystore is not yet available (seen on API 26-28 and some Android 12+ devices).
        try {
            val prefs = getSecurePrefs()
            val existingKey = prefs.getString(PREF_API_KEY, null)
            if (existingKey != null) {
                ApiClient.setApiKey(existingKey)
                CommandPollWorker.schedule(this)
                navigateToCatalog()
                return
            }
        } catch (e: Exception) {
            // Keystore not ready yet — fall through to show enrollment screen.
            // The user will need to re-enroll; stored key (if any) is inaccessible.
            Log.w("WLStore", "EncryptedSharedPreferences unavailable on startup: ${e.message}")
        }

        setContentView(R.layout.activity_enrollment)
        tvSerialNo = findViewById(R.id.tv_serial_no)
        btnRetry = findViewById(R.id.btn_retry)
        progressBar = findViewById(R.id.progress_bar)
        tvStatus = findViewById(R.id.tv_status)

        btnRetry.setOnClickListener { startAutoEnrollment() }

        startAutoEnrollment()
    }

    private fun startAutoEnrollment() {
        btnRetry.visibility = View.GONE
        progressBar.visibility = View.VISIBLE
        tvSerialNo.text = ""
        tvStatus.text = "Reading terminal serial number..."

        lifecycleScope.launch {
            val serialNo = withContext(Dispatchers.IO) {
                TerminalSerialProvider.readFactorySerialNumber()
            }

            if (serialNo.isNullOrBlank()) {
                showFailure("Unable to read terminal serial number. Contact support.")
                return@launch
            }

            tvSerialNo.text = "Serial No: $serialNo"
            tvStatus.text = "Logging in..."

            try {
                val response = ApiClient.service.enrollBySerial(
                    EnrollBySerialRequest(
                        serialNo = serialNo,
                        model = android.os.Build.MODEL,
                    )
                )

                if (response.isSuccessful) {
                    val data = response.body()!!

                    // Store API key securely
                    try {
                        getSecurePrefs().edit()
                            .putString(PREF_API_KEY, data.apiKey)
                            .putString(PREF_TERMINAL_ID, data.terminalId)
                            .putString(PREF_CUSTOMER_ID, data.customerId)
                            .putString(PREF_SERIAL_NO, data.serialNo)
                            .putString(PREF_TID, data.tid)
                            .putString(PREF_CUSTOMER_NAME, data.customerName)
                            .apply()
                    } catch (e: Exception) {
                        Log.e("WLStore", "Could not save API key to EncryptedSharedPreferences: ${e.message}")
                        // Non-fatal: API key is still set in memory for this session
                    }

                    ApiClient.setApiKey(data.apiKey)
                    CommandPollWorker.schedule(this@EnrollmentActivity)
                    tvStatus.text = "✅ Logged in! Launching store..."
                    navigateAfterEnrollment()
                } else {
                    val error = response.errorBody()?.string() ?: "Unknown error"
                    showFailure("Login failed: $error")
                }
            } catch (e: Exception) {
                showFailure("Network error: ${e.message}")
            }
        }
    }

    private fun showFailure(message: String) {
        tvStatus.text = "❌ $message"
        progressBar.visibility = View.GONE
        btnRetry.visibility = View.VISIBLE
    }

    private fun navigateToCatalog() {
        startActivity(Intent(this, CatalogActivity::class.java))
        overridePendingTransition(R.anim.slide_in_right, R.anim.slide_out_left)
        finish()
    }

    /**
     * After a fresh enrollment, checks whether the resolved customer/device has any
     * "Default" assigned apps; if so, routes through the auto-download setup screen
     * (showing "1/3, 2/3…" progress) before landing on the catalog. Any failure here
     * is non-fatal — enrollment itself already succeeded — so it falls back to the
     * catalog directly.
     */
    private fun navigateAfterEnrollment() {
        lifecycleScope.launch {
            try {
                val defaultsResponse = ApiClient.service.getDefaultApps()
                if (defaultsResponse.isSuccessful) {
                    val apps = defaultsResponse.body()?.apps ?: emptyList()
                    if (apps.isNotEmpty()) {
                        val intent = Intent(this@EnrollmentActivity, DefaultAppsSetupActivity::class.java)
                        intent.putParcelableArrayListExtra(DefaultAppsSetupActivity.EXTRA_APPS, ArrayList(apps))
                        startActivity(intent)
                        overridePendingTransition(R.anim.slide_in_right, R.anim.slide_out_left)
                        finish()
                        return@launch
                    }
                }
            } catch (e: Exception) {
                Log.w("WLStore", "Could not fetch default apps: ${e.message}")
            }
            navigateToCatalog()
        }
    }

    private fun getSecurePrefs(): android.content.SharedPreferences {
        val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        return EncryptedSharedPreferences.create(
            "wl_store_prefs",
            masterKeyAlias,
            this,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    companion object {
        const val PREF_API_KEY = "api_key"
        const val PREF_TERMINAL_ID = "terminal_id"
        const val PREF_CUSTOMER_ID = "customer_id"
        const val PREF_SERIAL_NO = "serial_no"
        const val PREF_TID = "tid"
        const val PREF_CUSTOMER_NAME = "customer_name"
    }
}
