package com.worldline.wlstore.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log

class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)
        val packageName = intent.getStringExtra("packageName") ?: "unknown"

        when (status) {
            PackageInstaller.STATUS_SUCCESS ->
                Log.i("WLStore", "✅ Silent install successful: $packageName")
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                // Device is not Device Owner — show install dialog
                val confirmIntent = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                confirmIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(confirmIntent)
            }
            else -> {
                val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                Log.e("WLStore", "❌ Install failed for $packageName: $message")
            }
        }
    }
}
