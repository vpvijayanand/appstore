package com.worldline.wlstore.ui.catalog

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.worldline.wlstore.R
import com.worldline.wlstore.data.model.AppInfo
import com.worldline.wlstore.service.InstalledAppsHelper

class AppGridAdapter(
    private val apps: List<AppInfo>,
    private val onClick: (AppInfo) -> Unit
) : RecyclerView.Adapter<AppGridAdapter.ViewHolder>() {

    class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val icon: ImageView = view.findViewById(R.id.iv_app_icon)
        val name: TextView = view.findViewById(R.id.tv_app_name)
        val developer: TextView = view.findViewById(R.id.tv_app_developer)
        val badge: TextView = view.findViewById(R.id.tv_installed_badge)
        val statusChip: TextView = view.findViewById(R.id.tv_status_chip)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_app_grid, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val app = apps[position]
        holder.name.text = app.name
        holder.developer.text = app.developer

        if (app.iconUrl != null) {
            Glide.with(holder.icon).load(app.iconUrl).into(holder.icon)
        } else {
            holder.icon.setImageResource(R.drawable.ic_default_app)
        }

        val context = holder.itemView.context
        when (InstalledAppsHelper.resolveState(context, app.packageName, app.versionCode)) {
            InstalledAppsHelper.InstallState.INSTALLED -> {
                holder.badge.visibility = View.VISIBLE
                holder.badge.text = "✓"
                holder.badge.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_pill)
                holder.badge.backgroundTintList = android.content.res.ColorStateList.valueOf(ContextCompat.getColor(context, R.color.wl_green))

                holder.statusChip.visibility = View.VISIBLE
                holder.statusChip.text = "✓ Installed"
                holder.statusChip.backgroundTintList = android.content.res.ColorStateList.valueOf(ContextCompat.getColor(context, R.color.wl_green))
            }
            InstalledAppsHelper.InstallState.UPDATE_AVAILABLE -> {
                holder.badge.visibility = View.VISIBLE
                holder.badge.text = "↑"
                holder.badge.background = ContextCompat.getDrawable(context, R.drawable.bg_badge_pill)
                holder.badge.backgroundTintList = android.content.res.ColorStateList.valueOf(ContextCompat.getColor(context, R.color.wl_amber))

                holder.statusChip.visibility = View.VISIBLE
                holder.statusChip.text = "↑ Update"
                holder.statusChip.backgroundTintList = android.content.res.ColorStateList.valueOf(ContextCompat.getColor(context, R.color.wl_amber))
            }
            InstalledAppsHelper.InstallState.NOT_INSTALLED -> {
                holder.badge.visibility = View.GONE
                holder.statusChip.visibility = View.GONE
            }
        }

        holder.itemView.setOnClickListener { onClick(app) }
    }

    override fun getItemCount() = apps.size
}


