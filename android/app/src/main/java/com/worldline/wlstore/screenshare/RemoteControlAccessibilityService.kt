package com.worldline.wlstore.screenshare

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.os.Build
import android.os.Bundle
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Executes admin-initiated control actions during a remote screen-share session:
 * tap, long-press, swipe/scroll, Back/Home/Recents/Notifications and typing text.
 * Must be enabled once per device (Settings > Accessibility > WL BizStore Remote Control) —
 * or automatically on Device Owner terminals, see [AccessibilityAutoEnabler].
 *
 * View-only screen sharing works without this service being enabled at all;
 * [ScreenShareForegroundService] simply tells the portal that control is unavailable.
 *
 * All coordinates arrive normalized (0..1) relative to the FULL physical screen — the same
 * surface the screen capture streams — so they're scaled with the real display size here
 * (not `resources.displayMetrics`, which excludes the navigation bar and would offset taps).
 */
class RemoteControlAccessibilityService : AccessibilityService() {

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "Remote control accessibility service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (!ScreenShareConsentActivity.awaitingConsent) return
        val pkg = event?.packageName?.toString() ?: return
        if (pkg.contains("systemui", ignoreCase = true) || pkg.contains("mediaprojection", ignoreCase = true)) {
            val root = rootInActiveWindow ?: return
            try {
                val byId = root.findAccessibilityNodeInfosByViewId("android:id/button1")
                val target = byId?.firstOrNull { it.isClickable }
                    ?: root.findAccessibilityNodeInfosByText("Start now")?.firstOrNull { it.isClickable }
                if (target != null) {
                    Log.i(TAG, "Auto-accepting MediaProjection consent dialog via AccessibilityService")
                    target.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                }
            } catch (e: Exception) {
                Log.w(TAG, "Auto-accept check failed: ${e.message}")
            }
        }
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    private fun realScreenSize(): Pair<Int, Int> {
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
        return metrics.widthPixels to metrics.heightPixels
    }

    private fun px(xNorm: Float, yNorm: Float): Pair<Float, Float> {
        val (w, h) = realScreenSize()
        return xNorm.coerceIn(0f, 1f).times(w).coerceIn(0f, w - 1f) to yNorm.coerceIn(0f, 1f).times(h).coerceIn(0f, h - 1f)
    }

    /** Taps at normalized [xNorm]/[yNorm] (0..1) relative to the full device screen. */
    fun performTap(xNorm: Float, yNorm: Float): Boolean {
        val (x, y) = px(xNorm, yNorm)
        val path = Path().apply { moveTo(x, y) }
        return dispatch(path, TAP_DURATION_MS)
    }

    /** Press-and-hold at the given point (context menus, drag handles, etc.). */
    fun performLongPress(xNorm: Float, yNorm: Float, durationMs: Long): Boolean {
        val (x, y) = px(xNorm, yNorm)
        val path = Path().apply { moveTo(x, y) }
        return dispatch(path, durationMs.coerceIn(LONG_PRESS_MIN_MS, LONG_PRESS_MAX_MS))
    }

    /** Swipes from normalized (x1,y1) to (x2,y2), both 0..1 relative to the full device screen. */
    fun performSwipe(x1Norm: Float, y1Norm: Float, x2Norm: Float, y2Norm: Float, durationMs: Long): Boolean {
        val (x1, y1) = px(x1Norm, y1Norm)
        val (x2, y2) = px(x2Norm, y2Norm)
        val path = Path().apply {
            moveTo(x1, y1)
            lineTo(x2, y2)
        }
        return dispatch(path, durationMs.coerceIn(MIN_SWIPE_DURATION_MS, MAX_SWIPE_DURATION_MS))
    }

    private fun dispatch(path: Path, durationMs: Long): Boolean {
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, durationMs))
            .build()
        return dispatchGesture(gesture, null, null)
    }

    /** System navigation: back, home, recents, notifications, quick_settings, power. */
    fun performNav(action: String): Boolean {
        val global = when (action) {
            "back" -> GLOBAL_ACTION_BACK
            "home" -> GLOBAL_ACTION_HOME
            "recents" -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            "quick_settings" -> GLOBAL_ACTION_QUICK_SETTINGS
            "power" -> GLOBAL_ACTION_POWER_DIALOG
            else -> return false
        }
        return performGlobalAction(global)
    }

    /**
     * Types into the currently focused input field. [append] adds to existing text;
     * otherwise it replaces it. Returns false if no editable field has focus.
     */
    fun inputText(text: String, append: Boolean): Boolean {
        val node = focusedEditable() ?: return false
        return try {
            val existing = if (append) (node.text?.toString() ?: "") else ""
            // Hint text is reported as text when the field is empty — don't append to a hint.
            val base = if (append && node.isShowingHintText) "" else existing
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, base + text)
            }
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        } finally {
            @Suppress("DEPRECATION")
            node.recycle()
        }
    }

    /** Special keys for the focused field: "backspace", "enter", "clear". */
    fun pressKey(key: String): Boolean {
        val node = focusedEditable() ?: return false
        return try {
            when (key) {
                "backspace" -> {
                    val cur = if (node.isShowingHintText) "" else (node.text?.toString() ?: "")
                    val args = Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, cur.dropLast(1))
                    }
                    node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                }
                "clear" -> {
                    val args = Bundle().apply {
                        putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
                    }
                    node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
                }
                "enter" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)
                } else false
                else -> false
            }
        } finally {
            @Suppress("DEPRECATION")
            node.recycle()
        }
    }

    private fun focusedEditable(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val focus = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focus != null && focus.isEditable) return focus
        return null
    }

    companion object {
        private const val TAG = "WLStore-RemoteControl"
        private const val TAP_DURATION_MS = 60L
        private const val LONG_PRESS_MIN_MS = 400L
        private const val LONG_PRESS_MAX_MS = 3000L
        private const val MIN_SWIPE_DURATION_MS = 100L
        private const val MAX_SWIPE_DURATION_MS = 2000L

        @Volatile
        var instance: RemoteControlAccessibilityService? = null
            private set
    }
}
