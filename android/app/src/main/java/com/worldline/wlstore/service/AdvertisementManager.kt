package com.worldline.wlstore.service

import android.content.Context
import android.content.Intent
import android.util.Log
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.AdvertisementDto
import com.worldline.wlstore.ui.advertisement.AdvertisementActivity

/**
 * Fetches currently-active advertisements (see GET /terminal/advertisements/pending)
 * and decides when to show them on top of CatalogActivity:
 *   - POPUP ads: shown on every app resume / foreground poll, but throttled per-ad
 *     so the same promo doesn't reappear every couple of minutes.
 *   - SCREENSAVER ads: shown only when CatalogActivity reports the device has been
 *     idle (no touch interaction) for IDLE_THRESHOLD_MS.
 * Kept entirely foreground-triggered (called from CatalogActivity) rather than from
 * a background WorkManager job, since Android 10+ blocks starting Activities from
 * background services/workers without special exemptions.
 */
object AdvertisementManager {

    private const val TAG = "WLStore-Ads"
    private const val PREFS_NAME = "wl_store_ads_prefs"
    private const val KEY_LAST_SHOWN_PREFIX = "last_shown_"
    private const val POPUP_COOLDOWN_MS = 30 * 60 * 1000L // don't reshow the same popup more than once per 30 min

    /** How long CatalogActivity should wait with no touch interaction before treating the device as idle. */
    const val IDLE_THRESHOLD_MS = 60_000L

    suspend fun checkAndMaybeShowPopups(context: Context) {
        val ads = fetchPending(context) ?: return
        val due = ads.filter { it.displayMode == "POPUP" && isCooldownElapsed(context, it.id) }
        if (due.isEmpty()) return
        due.forEach { markShown(context, it.id) }
        launch(context, due)
    }

    suspend fun checkAndMaybeShowScreensaver(context: Context) {
        val ads = fetchPending(context) ?: return
        val due = ads.filter { it.displayMode == "SCREENSAVER" }
        if (due.isEmpty()) return
        launch(context, due)
    }

    private suspend fun fetchPending(context: Context): List<AdvertisementDto>? {
        ApiClient.ensureApiKeyLoaded(context)
        if (!ApiClient.hasApiKey()) return null
        return try {
            val response = ApiClient.service.getPendingAdvertisements()
            if (!response.isSuccessful) null else response.body()?.advertisements
        } catch (e: Exception) {
            Log.w(TAG, "Failed to poll advertisements: ${e.message}")
            null
        }
    }

    private fun isCooldownElapsed(context: Context, adId: String): Boolean {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val lastShown = prefs.getLong(KEY_LAST_SHOWN_PREFIX + adId, 0L)
        return System.currentTimeMillis() - lastShown > POPUP_COOLDOWN_MS
    }

    private fun markShown(context: Context, adId: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putLong(KEY_LAST_SHOWN_PREFIX + adId, System.currentTimeMillis()).apply()
    }

    private fun launch(context: Context, ads: List<AdvertisementDto>) {
        val intent = Intent(context, AdvertisementActivity::class.java).apply {
            putParcelableArrayListExtra(AdvertisementActivity.EXTRA_ADS, ArrayList(ads))
        }
        context.startActivity(intent)
    }
}
