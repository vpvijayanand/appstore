package com.worldline.wlstore.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.worldline.wlstore.R
import com.worldline.wlstore.data.api.ApiClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Keeps the terminal reachable by the admin portal: while running it polls for remote
 * commands every [POLL_INTERVAL_MS] (instead of waiting up to 15 minutes for WorkManager),
 * which is what makes "Remote Screen", "Force Restart" and "Restart Device" react within
 * seconds. It also confirms restart/reboot commands once the app is back
 * ([RemoteCommandExecutor.resolvePendingOutcome]).
 *
 * Started when the app is opened/resumed, after boot ([BootReceiver]) and after an app
 * update. It stops itself when the terminal isn't enrolled. WorkManager
 * ([CommandPollWorker], every 15 min) remains as the safety net if this service is killed.
 */
class CommandPollService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var loop: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startInForeground()
        if (loop?.isActive != true) {
            loop = scope.launch {
                while (isActive) {
                    ApiClient.ensureApiKeyLoaded(applicationContext)
                    if (!ApiClient.hasApiKey()) {
                        // Not enrolled (or logged out) — nothing to poll for.
                        stopSelf()
                        return@launch
                    }
                    try {
                        RemoteCommandExecutor.resolvePendingOutcome(applicationContext)
                        RemoteCommandExecutor.checkAndExecutePendingCommands(applicationContext)
                    } catch (e: Exception) {
                        Log.w(TAG, "Poll iteration failed: ${e.message}")
                    }
                    delay(POLL_INTERVAL_MS)
                }
            }
        }
        return START_STICKY
    }

    private fun startInForeground() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "WL BizStore connection", NotificationManager.IMPORTANCE_MIN)
            channel.setShowBadge(false)
            manager.createNotificationChannel(channel)
        }
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("WL BizStore connected")
            .setContentText("Listening for remote support and management requests")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "WLStore-PollService"
        private const val CHANNEL_ID = "wl_store_connection"
        private const val NOTIFICATION_ID = 4822
        /** Must match FOREGROUND_POLL_SEC in backend/src/services/command-timeline.ts. */
        const val POLL_INTERVAL_MS = 10_000L

        /** Safe to call repeatedly; never throws (e.g. when started from a restricted background state). */
        fun start(context: Context) {
            try {
                ContextCompat.startForegroundService(context, Intent(context, CommandPollService::class.java))
            } catch (e: Exception) {
                Log.w(TAG, "Could not start poll service: ${e.message}")
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, CommandPollService::class.java))
        }
    }
}

