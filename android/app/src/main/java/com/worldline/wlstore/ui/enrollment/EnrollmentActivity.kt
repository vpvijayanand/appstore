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
import com.worldline.wlstore.data.model.EnrollmentRequest
import com.worldline.wlstore.ui.catalog.CatalogActivity
import com.worldline.wlstore.ui.setup.DefaultAppsSetupActivity
import kotlinx.coroutines.launch

/**
 * First-launch enrollment screen.
 * On subsequent launches, reads the stored API key and navigates directly to the catalog.
 *
 * Stores Terminal ID + API key in EncryptedSharedPreferences (AES256 + API 23+).
 */
class EnrollmentActivity : AppCompatActivity() {

    private lateinit var etTerminalId: EditText
    private lateinit var etCustomerId: EditText
    private lateinit var etSite: EditText
    private lateinit var btnEnroll: Button
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
                navigateToCatalog()
                return
            }
        } catch (e: Exception) {
            // Keystore not ready yet — fall through to show enrollment screen.
            // The user will need to re-enroll; stored key (if any) is inaccessible.
            Log.w("WLStore", "EncryptedSharedPreferences unavailable on startup: ${e.message}")
        }

        setContentView(R.layout.activity_enrollment)
        etTerminalId = findViewById(R.id.et_terminal_id)
        etCustomerId = findViewById(R.id.et_customer_id)
        etSite = findViewById(R.id.et_site)
        btnEnroll = findViewById(R.id.btn_enroll)
        progressBar = findViewById(R.id.progress_bar)
        tvStatus = findViewById(R.id.tv_status)

        // Pre-fill terminal ID with device model + Android ID
        val androidId = android.provider.Settings.Secure.getString(
            contentResolver, android.provider.Settings.Secure.ANDROID_ID
        )
        etTerminalId.setText("WL-TRM-$androidId".uppercase().take(20))

        btnEnroll.setOnClickListener { startEnrollment() }
    }

    private fun startEnrollment() {
        val terminalId = etTerminalId.text.toString().trim()
        val customerId = etCustomerId.text.toString().trim()
        val site = etSite.text.toString().trim()

        if (terminalId.isEmpty() || customerId.isEmpty()) {
            Toast.makeText(this, "Terminal ID and Customer ID are required", Toast.LENGTH_SHORT).show()
            return
        }

        btnEnroll.isEnabled = false
        progressBar.visibility = View.VISIBLE
        tvStatus.text = "Enrolling terminal..."

        lifecycleScope.launch {
            try {
                val response = ApiClient.service.enrollTerminal(
                    EnrollmentRequest(
                        terminalId = terminalId,
                        customerId = customerId,
                        site = site.ifEmpty { null },
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
                            .apply()
                    } catch (e: Exception) {
                        Log.e("WLStore", "Could not save API key to EncryptedSharedPreferences: ${e.message}")
                        // Non-fatal: API key is still set in memory for this session
                    }

                    ApiClient.setApiKey(data.apiKey)
                    tvStatus.text = "✅ Enrolled! Launching store..."
                    navigateAfterEnrollment()
                } else {
                    val error = response.errorBody()?.string() ?: "Unknown error"
                    tvStatus.text = "❌ Enrollment failed: $error"
                    btnEnroll.isEnabled = true
                }
            } catch (e: Exception) {
                tvStatus.text = "❌ Network error: ${e.message}"
                btnEnroll.isEnabled = true
            } finally {
                progressBar.visibility = View.GONE
            }
        }
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
    }
}
