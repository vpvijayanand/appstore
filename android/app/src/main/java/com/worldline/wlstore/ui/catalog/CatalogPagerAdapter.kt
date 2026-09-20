package com.worldline.wlstore.ui.catalog

import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.viewpager2.adapter.FragmentStateAdapter
import com.worldline.wlstore.data.model.CategoryWithApps

class CatalogPagerAdapter(
    activity: FragmentActivity,
    private val catalog: List<CategoryWithApps>
) : FragmentStateAdapter(activity) {

    override fun getItemCount() = catalog.size

    override fun createFragment(position: Int): Fragment {
        val cat = catalog[position]
        return CatalogCategoryFragment.newInstance(
            cat.categoryId,
            ArrayList(cat.apps)
        )
    }
}
