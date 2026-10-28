package com.worldline.wlstore.service

import android.app.admin.DeviceAdminReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Device Admin receiver required for this app to be set as Android Device
 * Owner (via `adb shell dpm set-device-owner com.worldline.wlstore/.service.WLDeviceAdminReceiver`
 * on a device with no accounts configured, e.g. right after factory reset).
 *
 * Device Owner status is what allows [RemoteCommandExecutor] to call
 * DevicePolicyManager.reboot() for the RESTART_DEVICE remote command. Without
 * this provisioning step on a given terminal, that command will fail
 * gracefully (reported back to the admin portal as FAILED) rather than crash.
 */
class WLDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Log.i("WLStore-DeviceAdmin", "Device admin enabled")
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Log.i("WLStore-DeviceAdmin", "Device admin disabled")
    }

    companion object {
        fun componentName(context: Context): ComponentName =
            ComponentName(context.applicationContext, WLDeviceAdminReceiver::class.java)
    }
}
