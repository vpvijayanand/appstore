package com.worldline.wlstore.ui.catalog

import android.os.Bundle
import android.view.View
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
import com.worldline.wlstore.data.model.CategoryWithApps
import kotlinx.coroutines.launch

class CatalogActivity : AppCompatActivity() {

    private lateinit var tabLayout: TabLayout
    private lateinit var viewPager: ViewPager2
    private lateinit var progressBar: ProgressBar
    private lateinit var tvEmpty: TextView
    private lateinit var tvTabForYou: TextView
    private lateinit var tvTabAllApps: TextView

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

        supportActionBar?.title = "WL BizStore"

        tvTabForYou.setOnClickListener { selectTopTab(true) }
        tvTabAllApps.setOnClickListener { selectTopTab(false) }
        tvTabForYou.setBackgroundResource(R.drawable.bg_badge_pill)
        tvTabForYou.setTextColor(0xFFFFFFFF.toInt())

        loadCatalog()
    }

    override fun onResume() {
        super.onResume()
        // Refresh installed/update badges when returning from an install flow.
        if (fullCatalog.isNotEmpty()) applyFilterAndRender()
    }

    private fun selectTopTab(forYou: Boolean) {
        showForYouOnly = forYou
        tvTabForYou.setBackgroundResource(if (forYou) R.drawable.bg_badge_pill else 0)
        tvTabForYou.setTextColor(if (forYou) 0xFFFFFFFF.toInt() else 0xFF9AA0AD.toInt())
        tvTabAllApps.setBackgroundResource(if (!forYou) R.drawable.bg_badge_pill else 0)
        tvTabAllApps.setTextColor(if (!forYou) 0xFFFFFFFF.toInt() else 0xFF9AA0AD.toInt())
        applyFilterAndRender()
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

