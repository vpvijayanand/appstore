package com.worldline.wlstore.ui.catalog

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.AppInfo
import com.worldline.wlstore.ui.detail.AppDetailActivity
import kotlinx.coroutines.launch

class CatalogCategoryFragment : Fragment() {

    private var categoryId: String = ""
    private var apps: List<AppInfo> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        categoryId = arguments?.getString(ARG_CATEGORY_ID) ?: ""
        @Suppress("UNCHECKED_CAST")
        apps = arguments?.getParcelableArrayList(ARG_APPS) ?: emptyList()
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        val recycler = RecyclerView(requireContext()).apply {
            layoutManager = GridLayoutManager(requireContext(), 3)
            setPadding(16, 16, 16, 16)
            clipToPadding = false
            adapter = AppGridAdapter(apps) { app ->
                val intent = Intent(requireContext(), AppDetailActivity::class.java)
                intent.putExtra(AppDetailActivity.EXTRA_APP, app)
                startActivity(intent)
            }
        }
        return recycler
    }

    companion object {
        private const val ARG_CATEGORY_ID = "categoryId"
        private const val ARG_APPS = "apps"

        fun newInstance(categoryId: String, apps: ArrayList<AppInfo>) = CatalogCategoryFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_CATEGORY_ID, categoryId)
                putParcelableArrayList(ARG_APPS, apps)
            }
        }
    }
}
