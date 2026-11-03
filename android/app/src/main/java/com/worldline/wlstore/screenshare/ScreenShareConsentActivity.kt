package com.worldline.wlstore.screenshare

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Invisible (translucent) activity that requests the one-time MediaProjection
 * "Start now" consent dialog, then hands the result off to
 * [ScreenShareForegroundService] and finishes. Android requires this exact
 * system dialog tap for every new capture session — there is no API to
 * silently bypass it, even for Device Owner apps — so on a kiosk device
 * someone physically present needs to tap it once per session.
 */
class ScreenShareConsentActivity : AppCompatActivity() {

    private var sessionId: String? = null
    private var commandId: String? = null

    private val launcher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val sid = sessionId
        if (result.resultCode == Activity.RESULT_OK && result.data != null && sid != null) {
            ScreenShareForegroundService.start(this, sid, result.resultCode, result.data!!, commandId)
        } else {
            Toast.makeText(this, "Screen share permission denied", Toast.LENGTH_SHORT).show()
        }
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sessionId = intent.getStringExtra(EXTRA_SESSION_ID)
        commandId = intent.getStringExtra(EXTRA_COMMAND_ID)
        if (sessionId == null) {
            finish()
            return
        }
        val manager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        launcher.launch(manager.createScreenCaptureIntent())
    }

    companion object {
        const val EXTRA_SESSION_ID = "session_id"
        const val EXTRA_COMMAND_ID = "command_id"

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
