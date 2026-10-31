package com.worldline.wlstore.screenshare

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.util.Log
import android.view.accessibility.AccessibilityEvent

/**
 * Dispatches admin-initiated tap/swipe gestures during a remote screen-share
 * session. Must be manually enabled once per device (Settings > Accessibility
 * > WL BizStore Remote Control) — this is a one-time, silent-afterward grant,
 * unlike MediaProjection's per-session consent dialog (see
 * ScreenShareConsentActivity), which is why remote *control* only needs this
 * one-time setup while remote *viewing* needs a tap every new session.
 *
 * View-only screen sharing works without this service being enabled at all;
 * [ScreenShareForegroundService] simply logs a warning and drops control
 * messages if it's not running.
 */
class RemoteControlAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "Remote control accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Not used — this service only dispatches gestures, it doesn't react to events.
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    /** Taps at normalized [xNorm]/[yNorm] (0..1) relative to the full device screen. */
    fun performTap(xNorm: Float, yNorm: Float) {
        val metrics = resources.displayMetrics
        val x = (xNorm * metrics.widthPixels).coerceIn(0f, metrics.widthPixels - 1f)
        val y = (yNorm * metrics.heightPixels).coerceIn(0f, metrics.heightPixels - 1f)
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, TAP_DURATION_MS))
            .build()
        dispatchGesture(gesture, null, null)
    }

    /** Swipes from normalized (x1,y1) to (x2,y2), both 0..1 relative to the full device screen. */
    fun performSwipe(x1Norm: Float, y1Norm: Float, x2Norm: Float, y2Norm: Float, durationMs: Long) {
        val metrics = resources.displayMetrics
        val x1 = x1Norm * metrics.widthPixels
        val y1 = y1Norm * metrics.heightPixels
        val x2 = x2Norm * metrics.widthPixels
        val y2 = y2Norm * metrics.heightPixels
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        val clampedDuration = durationMs.coerceIn(MIN_SWIPE_DURATION_MS, MAX_SWIPE_DURATION_MS)
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, clampedDuration))
            .build()
        dispatchGesture(gesture, null, null)
    }

    companion object {
        private const val TAG = "WLStore-RemoteControl"
        private const val TAP_DURATION_MS = 60L
        private const val MIN_SWIPE_DURATION_MS = 100L
        private const val MAX_SWIPE_DURATION_MS = 2000L

        @Volatile
        var instance: RemoteControlAccessibilityService? = null
            private set
    }
}
