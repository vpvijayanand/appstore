package com.worldline.wlstore.service

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.util.Log
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.CompleteCommandRequest
import com.worldline.wlstore.data.model.DeviceCommandDto

/**
 * Executes remote commands queued by the admin portal for this terminal
 * (see GET /terminal/commands/pending). Kept generic so new command types can
 * be added later without touching the polling/scheduling plumbing.
 */
object RemoteCommandExecutor {

    private const val TAG = "WLStore-RemoteCmd"

    suspend fun checkAndExecutePendingCommands(context: Context) {
        ApiClient.ensureApiKeyLoaded(context)
        if (!ApiClient.hasApiKey()) return // not enrolled yet, nothing to do

        try {
            val response = ApiClient.service.getPendingCommands()
            if (!response.isSuccessful) return
            val commands = response.body()?.commands ?: return

            for (command in commands) {
                executeOne(context, command)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to poll for remote commands: ${e.message}")
        }
    }

    private suspend fun executeOne(context: Context, command: DeviceCommandDto) {
        when (command.type) {
            "RESTART_APP" -> {
                // Report completion BEFORE killing the process — we won't get another
                // chance to call the network after Process.killProcess/exit below.
                reportOutcome(command.id, "COMPLETED")
                restartApp(context)
            }
            "RESTART_DEVICE" -> {
                restartDevice(context, command.id)
            }
            else -> {
                Log.w(TAG, "Unsupported command type: ${command.type}")
                reportOutcome(command.id, "FAILED", "Unsupported command type on this app version")
            }
        }
    }

    private suspend fun reportOutcome(commandId: String, status: String, errorMessage: String? = null) {
        try {
            ApiClient.service.completeCommand(commandId, CompleteCommandRequest(status, errorMessage))
        } catch (e: Exception) {
            Log.w(TAG, "Failed to report command outcome: ${e.message}")
        }
    }

    /** Relaunches the app's own launcher activity, then kills this process. */
    private fun restartApp(context: Context) {
        val appContext = context.applicationContext
        val launchIntent = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
        if (launchIntent != null) {
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            appContext.startActivity(launchIntent)
        }
        Runtime.getRuntime().exit(0)
    }

    /**
     * Reboots the whole physical device. Requires this app to be Android
     * Device Owner (see WLDeviceAdminReceiver) — if it isn't, this fails
     * gracefully and reports back to the admin portal rather than crashing,
     * since most terminals are not provisioned this way by default.
     */
    private suspend fun restartDevice(context: Context, commandId: String) {
        val appContext = context.applicationContext
        val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

        if (!dpm.isDeviceOwnerApp(appContext.packageName)) {
            Log.w(TAG, "RESTART_DEVICE requested but app is not Device Owner on this terminal")
            reportOutcome(commandId, "FAILED", "Device is not provisioned as Device Owner; cannot reboot OS")
            return
        }

        // Report completion before rebooting — the device goes down immediately after.
        reportOutcome(commandId, "COMPLETED")
        try {
            dpm.reboot(WLDeviceAdminReceiver.componentName(appContext))
        } catch (e: SecurityException) {
            Log.e(TAG, "dpm.reboot() failed: ${e.message}")
        }
    }
}
