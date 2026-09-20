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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_catalog)

        tabLayout = findViewById(R.id.tab_layout)
        viewPager = findViewById(R.id.view_pager)
        progressBar = findViewById(R.id.progress_bar)
        tvEmpty = findViewById(R.id.tv_empty)

        supportActionBar?.title = "WL App Store"

        loadCatalog()
    }

    private fun loadCatalog() {
        progressBar.visibility = View.VISIBLE
        tvEmpty.visibility = View.GONE

        lifecycleScope.launch {
            try {
                val response = ApiClient.service.getCatalog()
                if (response.isSuccessful) {
                    val catalog = response.body()?.catalog ?: emptyList()
                    if (catalog.isEmpty()) {
                        tvEmpty.visibility = View.VISIBLE
                        tvEmpty.text = "No apps available for your device."
                    } else {
                        setupTabs(catalog)
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
