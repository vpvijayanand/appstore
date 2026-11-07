package com.worldline.wlstore.screenshare

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.CompleteCommandRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Invisible (translucent) activity that requests the MediaProjection
 * consent dialog, then hands the result off to [ScreenShareForegroundService]
 * and finishes.
 *
 * Uses plain [android.app.Activity] (not AppCompatActivity) so it works cleanly
 * with `@android:style/Theme.Translucent.NoTitleBar`.
 */
class ScreenShareConsentActivity : Activity() {

    private var sessionId: String? = null
    private var commandId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionId = intent?.getStringExtra(EXTRA_SESSION_ID)
        commandId = intent?.getStringExtra(EXTRA_COMMAND_ID)
        if (sessionId == null) {
            finish()
            return
        }
        try {
            awaitingConsent = true
            val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            @Suppress("DEPRECATION")
            startActivityForResult(manager.createScreenCaptureIntent(), REQ_MEDIA_PROJECTION)
        } catch (e: Exception) {
            awaitingConsent = false
            Log.e(TAG, "Failed to launch screen capture intent: ${e.message}", e)
            reportDenied("Failed to launch screen capture dialog: ${e.message}")
            finish()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_MEDIA_PROJECTION) return
        awaitingConsent = false
        val sid = sessionId
        if (resultCode == RESULT_OK && data != null && sid != null) {
            Log.i(TAG, "MediaProjection consent granted for session $sid")
            ScreenShareForegroundService.start(applicationContext, sid, resultCode, data, commandId)
        } else {
            Log.w(TAG, "MediaProjection consent denied (resultCode=$resultCode)")
            Toast.makeText(applicationContext, "Screen share permission denied", Toast.LENGTH_SHORT).show()
            reportDenied("MediaProjection consent was denied on the terminal")
        }
        finish()
    }

    override fun onDestroy() {
        awaitingConsent = false
        super.onDestroy()
    }

    private fun reportDenied(reason: String) {
        val cid = commandId ?: return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                ApiClient.service.completeCommand(cid, CompleteCommandRequest("FAILED", reason, stage = "FAILED", detail = reason))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to report consent failure: ${e.message}")
            }
        }
    }

    companion object {
        private const val TAG = "WLStore-ScreenConsent"
        private const val REQ_MEDIA_PROJECTION = 9401
        const val EXTRA_SESSION_ID = "session_id"
        const val EXTRA_COMMAND_ID = "command_id"

        @Volatile
        var awaitingConsent: Boolean = false

        fun start(context: Context, sessionId: String, commandId: String?) {
            val intent = Intent(context, ScreenShareConsentActivity::class.java).apply {
                putExtra(EXTRA_SESSION_ID, sessionId)
                putExtra(EXTRA_COMMAND_ID, commandId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        }
    }
}
