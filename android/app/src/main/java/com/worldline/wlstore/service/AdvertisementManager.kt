package com.worldline.wlstore.service

import android.content.Context
import android.content.Intent
import android.util.Log
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.AdvertisementDto
import com.worldline.wlstore.data.model.PendingAdvertisementsResponse
import com.worldline.wlstore.ui.advertisement.AdvertisementActivity

/**
 * Fetches currently-active advertisements (see GET /terminal/advertisements/pending)
 * and decides when to show them on top of CatalogActivity (and any other foreground
 * screen — see WLStoreApplication's ActivityLifecycleCallbacks):
 *   - POPUP ads: shown on screen changes (any activity resuming), throttled by a
 *     single GLOBAL cooldown — not per-ad — so popups appear at most once per
 *     `popupIntervalHours` (admin-configurable; defaults to 4 hours if the backend
 *     doesn't return a value).
 *   - SCREENSAVER ads: shown only when CatalogActivity reports the device has been
 *     idle (no touch interaction) for IDLE_THRESHOLD_MS.
 * Kept entirely foreground-triggered (called from activity lifecycle callbacks)
 * rather than from a background WorkManager job, since Android 10+ blocks starting
 * Activities from background services/workers without special exemptions.
 */
object AdvertisementManager {

    private const val TAG = "WLStore-Ads"
    private const val PREFS_NAME = "wl_store_ads_prefs"
    private const val KEY_LAST_SHOWN_GLOBAL = "last_shown_global"
    private const val DEFAULT_POPUP_INTERVAL_HOURS = 4

    /** How long CatalogActivity should wait with no touch interaction before treating the device as idle. */
    const val IDLE_THRESHOLD_MS = 60_000L

    suspend fun checkAndMaybeShowPopups(context: Context) {
        val pending = fetchPending(context) ?: return
        val due = pending.advertisements.filter { it.displayMode == "POPUP" }
        if (due.isEmpty()) return
        if (!isCooldownElapsed(context, pending.popupIntervalHours)) return
        markShownGlobal(context)
        launch(context, due)
    }

    suspend fun checkAndMaybeShowScreensaver(context: Context) {
        val pending = fetchPending(context) ?: return
        val due = pending.advertisements.filter { it.displayMode == "SCREENSAVER" }
        if (due.isEmpty()) return
        launch(context, due)
    }

    private suspend fun fetchPending(context: Context): PendingAdvertisementsResponse? {
        ApiClient.ensureApiKeyLoaded(context)
        if (!ApiClient.hasApiKey()) return null
        return try {
            val response = ApiClient.service.getPendingAdvertisements()
            if (!response.isSuccessful) null else response.body()
        } catch (e: Exception) {
            Log.w(TAG, "Failed to poll advertisements: ${e.message}")
            null
        }
    }

    /** Global popup cooldown — at most one popup across ALL ads per `intervalHours`. */
    private fun isCooldownElapsed(context: Context, intervalHours: Int): Boolean {
        val hours = if (intervalHours > 0) intervalHours else DEFAULT_POPUP_INTERVAL_HOURS
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastShown = prefs.getLong(KEY_LAST_SHOWN_GLOBAL, 0L)
        return System.currentTimeMillis() - lastShown > hours * 60 * 60 * 1000L
    }

    private fun markShownGlobal(context: Context) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putLong(KEY_LAST_SHOWN_GLOBAL, System.currentTimeMillis()).apply()
    }

    private fun launch(context: Context, ads: List<AdvertisementDto>) {
        val intent = Intent(context, AdvertisementActivity::class.java).apply {
            putParcelableArrayListExtra(AdvertisementActivity.EXTRA_ADS, ArrayList(ads))
        }
        context.startActivity(intent)
    }
}
