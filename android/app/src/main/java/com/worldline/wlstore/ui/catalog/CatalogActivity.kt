package com.worldline.wlstore.ui.catalog

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.viewpager2.widget.ViewPager2
import com.google.android.material.tabs.TabLayout
import com.google.android.material.tabs.TabLayoutMediator
import com.worldline.wlstore.R
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.AppInfo
import com.worldline.wlstore.data.model.CategoryWithApps
import com.worldline.wlstore.service.InstalledAppsHelper
import com.worldline.wlstore.service.RemoteCommandExecutor
import com.worldline.wlstore.ui.setup.DefaultAppsSetupActivity
import kotlinx.coroutines.launch

class CatalogActivity : AppCompatActivity() {

    private lateinit var tabLayout: TabLayout
    private lateinit var viewPager: ViewPager2
    private lateinit var progressBar: ProgressBar
    private lateinit var tvEmpty: TextView
    private lateinit var tvTabForYou: TextView
    private lateinit var tvTabAllApps: TextView
    private lateinit var bannerContainer: View
    private lateinit var tvBannerText: TextView
    private lateinit var btnBannerInstall: Button

    private var fullCatalog: List<CategoryWithApps> = emptyList()
    private var showForYouOnly = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_catalog)

        tabLayout = findViewById(R.id.tab_layout)
        viewPager = findViewById(R.id.view_pager)
        progressBar = findViewById(R.id.progress_bar)
        tvEmpty = findViewById(R.id.tv_empty)
        tvTabForYou = findViewById(R.id.tv_tab_for_you)
        tvTabAllApps = findViewById(R.id.tv_tab_all_apps)
        bannerContainer = findViewById(R.id.ll_default_apps_banner)
        tvBannerText = findViewById(R.id.tv_banner_text)
        btnBannerInstall = findViewById(R.id.btn_banner_install)

        supportActionBar?.title = "WL BizStore"

        tvTabForYou.setOnClickListener { selectTopTab(true) }
        tvTabAllApps.setOnClickListener { selectTopTab(false) }
        tvTabForYou.setBackgroundResource(R.drawable.bg_badge_pill)
        tvTabForYou.setTextColor(0xFFFFFFFF.toInt())

        loadCatalog()
    }

    override fun onResume() {
        super.onResume()
        // Refresh installed/update badges + pending-default-apps banner when
        // returning from an install flow.
        if (fullCatalog.isNotEmpty()) {
            applyFilterAndRender()
            checkPendingDefaultApps()
        }
        // Check for remote commands (e.g. force restart) immediately while the
        // app is actively being used, rather than waiting for the next
        // background poll (CommandPollWorker, every 15 min).
        lifecycleScope.launch { RemoteCommandExecutor.checkAndExecutePendingCommands(this@CatalogActivity) }
    }

    private fun selectTopTab(forYou: Boolean) {
        if (showForYouOnly == forYou) return
        showForYouOnly = forYou
        tvTabForYou.setBackgroundResource(if (forYou) R.drawable.bg_badge_pill else 0)
        tvTabForYou.setTextColor(if (forYou) 0xFFFFFFFF.toInt() else 0xFF9AA0AD.toInt())
        tvTabAllApps.setBackgroundResource(if (!forYou) R.drawable.bg_badge_pill else 0)
        tvTabAllApps.setTextColor(if (!forYou) 0xFFFFFFFF.toInt() else 0xFF9AA0AD.toInt())

        // Gentle crossfade instead of an abrupt swap when switching tabs.
        viewPager.animate().alpha(0f).setDuration(120).withEndAction {
            applyFilterAndRender()
            viewPager.animate().alpha(1f).setDuration(180).start()
        }.start()
    }

    private fun loadCatalog() {
        progressBar.visibility = View.VISIBLE
        tvEmpty.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val response = ApiClient.service.getCatalog()
                if (response.isSuccessful) {
                    fullCatalog = response.body()?.catalog ?: emptyList()
                    if (fullCatalog.isEmpty()) {
                        tvEmpty.visibility = View.VISIBLE
                        tvEmpty.text = "No apps available for your device."
                    } else {
                        applyFilterAndRender()
                        checkPendingDefaultApps()
                    }
                } else {
                    showError("Failed to load catalog: ${response.code()}")
                }
            } catch (e: Exception) {
                showError("Network error: ${e.message}")
            } finally {
                progressBar.visibility = View.GONE
            }
        }
    }

    private fun applyFilterAndRender() {
        val filtered = if (showForYouOnly) {
            fullCatalog
                .map { it.copy(apps = it.apps.filter { app -> app.isAssigned }) }
                .filter { it.apps.isNotEmpty() }
        } else {
            fullCatalog
        }

        if (filtered.isEmpty()) {
            viewPager.visibility = View.GONE
            tabLayout.visibility = View.GONE
            tvEmpty.visibility = View.VISIBLE
            tvEmpty.text = if (showForYouOnly) "No apps assigned to you yet. Check \"All Apps\"." else "No apps available."
        } else {
            viewPager.visibility = View.VISIBLE
            tabLayout.visibility = View.VISIBLE
            tvEmpty.visibility = View.GONE
            setupTabs(filtered)
        }
    }

    private fun setupTabs(catalog: List<CategoryWithApps>) {
        val adapter = CatalogPagerAdapter(this, catalog)
        viewPager.adapter = adapter

        TabLayoutMediator(tabLayout, viewPager) { tab, position ->
            val category = catalog[position]
            tab.text = "${getCategoryEmoji(category.categoryIcon)} ${category.categoryName}"
        }.attach()
    }

    /**
     * Shows a dismiss-free banner prompting the user to install any "Default"
     * assigned apps that aren't on the device yet — lets the auto-download
     * flow be re-run after enrollment (e.g. if it was skipped) without needing
     * to re-enroll the terminal.
     */
    private fun checkPendingDefaultApps() {
        val pending = fullCatalog.flatMap { it.apps }
            .filter { it.isAssigned && it.assignmentMode == "DEFAULT" && !InstalledAppsHelper.isInstalled(this, it.packageName) }
            .distinctBy { it.id }

        if (pending.isEmpty()) {
            bannerContainer.visibility = View.GONE
            return
        }

        tvBannerText.text = if (pending.size == 1) "1 app recommended for this device" else "${pending.size} apps recommended for this device"
        bannerContainer.alpha = 0f
        bannerContainer.visibility = View.VISIBLE
        bannerContainer.animate().alpha(1f).setDuration(220).start()

        btnBannerInstall.setOnClickListener {
            val intent = Intent(this, DefaultAppsSetupActivity::class.java)
            intent.putParcelableArrayListExtra(DefaultAppsSetupActivity.EXTRA_APPS, ArrayList(pending))
            startActivity(intent)
            overridePendingTransition(R.anim.slide_in_right, R.anim.slide_out_left)
        }
    }

    private fun getCategoryEmoji(iconName: String): String = when (iconName) {
        "payment" -> "💳"
        "build" -> "🔧"
        "bar_chart" -> "📊"
        "security" -> "🔒"
        "cloud" -> "☁️"
        else -> "📦"
    }

    private fun showError(msg: String) {
        tvEmpty.visibility = View.VISIBLE
        tvEmpty.text = msg
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
    }
}

