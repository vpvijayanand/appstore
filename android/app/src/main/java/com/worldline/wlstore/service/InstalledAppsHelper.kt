package com.worldline.wlstore.service

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Resolves install state for a given package using PackageManager, so the
 * catalog grid / app detail screen can distinguish "Install" vs "Open" vs
 * "Update" without any backend round-trip.
 */
object InstalledAppsHelper {

    /** Returns the installed versionCode, or null if the package is not installed. */
    fun getInstalledVersionCode(context: Context, packageName: String): Long? {
        return try {
            val pm = context.packageManager
            val info = pm.getPackageInfo(packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.longVersionCode
            } else {
                @Suppress("DEPRECATION")
                info.versionCode.toLong()
            }
        } catch (e: PackageManager.NameNotFoundException) {
            null
        }
    }

    fun isInstalled(context: Context, packageName: String): Boolean =
        getInstalledVersionCode(context, packageName) != null

    /** True when the package is installed but the store's versionCode is newer. */
    fun isUpdateAvailable(context: Context, packageName: String, remoteVersionCode: Int): Boolean {
        val installed = getInstalledVersionCode(context, packageName) ?: return false
        return remoteVersionCode > installed
    }

    enum class InstallState { NOT_INSTALLED, INSTALLED, UPDATE_AVAILABLE }

    fun resolveState(context: Context, packageName: String, remoteVersionCode: Int): InstallState {
        val installed = getInstalledVersionCode(context, packageName) ?: return InstallState.NOT_INSTALLED
        return if (remoteVersionCode > installed) InstallState.UPDATE_AVAILABLE else InstallState.INSTALLED
    }

    fun getLaunchIntent(context: Context, packageName: String) =
        context.packageManager.getLaunchIntentForPackage(packageName)
}
