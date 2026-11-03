package com.worldline.wlstore

import android.app.Activity
import android.app.Application
import android.os.Bundle
import androidx.lifecycle.lifecycleScope
import androidx.appcompat.app.AppCompatActivity
import com.worldline.wlstore.service.AdvertisementManager
import com.worldline.wlstore.ui.advertisement.AdvertisementActivity
import com.worldline.wlstore.ui.enrollment.EnrollmentActivity
import kotlinx.coroutines.launch

/**
 * App-wide Activity lifecycle observer. Its sole purpose is requirement:
 * "popup should come once any screen is changed in the android app" — rather
 * than wiring an advertisement-popup check into every single Activity's
 * onResume individually, this centralizes the trigger so ANY screen change
 * (navigating to app details, setup, catalog, etc.) is covered.
 *
 * AdvertisementManager.checkAndMaybeShowPopups() is itself throttled by a
 * single global, admin-configurable cooldown (popupIntervalHours, default 4h),
 * so firing it on every resume is safe/cheap — it only actually shows a popup
 * and launches AdvertisementActivity once the cooldown has elapsed.
 */
class WLStoreApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityResumed(activity: Activity) {
                // Don't trigger from the login screen (not enrolled yet) or from the
                // advertisement popup itself (would immediately re-check on its own resume).
                if (activity is EnrollmentActivity || activity is AdvertisementActivity) return
                if (activity is AppCompatActivity) {
                    activity.lifecycleScope.launch {
                        AdvertisementManager.checkAndMaybeShowPopups(activity)
                    }
                }
            }

            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityStarted(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivityStopped(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })
    }
}
