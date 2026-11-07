package com.worldline.wlstore.service

import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.util.Log
import CTOS.CtSystem
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.CommandProgressRequest
import com.worldline.wlstore.data.model.CompleteCommandRequest
import com.worldline.wlstore.data.model.DeviceCommandDto
import com.worldline.wlstore.screenshare.ScreenShareConsentActivity
import com.worldline.wlstore.screenshare.ScreenShareForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex

/**
 * Executes remote commands queued by the admin portal for this terminal
 * (see GET /terminal/commands/pending). Kept generic so new command types can
 * be added later without touching the polling/scheduling plumbing.
 *
 * Every command reports step-by-step progress (POST /terminal/commands/{id}/progress)
 * so the admin portal can show a live timeline: received -> executing -> done.
 * Commands that kill the process (app restart / device reboot) can't report their own
 * final outcome, so they persist a marker and the NEXT process start confirms it via
 * [resolvePendingOutcome] ("back online").
 */
object RemoteCommandExecutor {

    private const val TAG = "WLStore-RemoteCmd"
    private const val STATE_PREFS = "wl_store_cmd_state"
    private const val KEY_CMD_ID = "pending_cmd_id"
    private const val KEY_CMD_TYPE = "pending_cmd_type"
    private const val KEY_REQUESTED_WALL = "pending_cmd_requested_wall"

    /** Give up waiting for a reboot to be confirmed after this long. */
    private const val REBOOT_CONFIRM_TIMEOUT_MS = 10 * 60_000L
    /** If the reboot call was accepted but the OS is still up after this long, it didn't happen. */
    private const val REBOOT_NOT_HAPPENING_AFTER_MS = 90_000L

    private val pollMutex = Mutex()
    private val bgScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    suspend fun checkAndExecutePendingCommands(context: Context) {
        ApiClient.ensureApiKeyLoaded(context)
        if (!ApiClient.hasApiKey()) return // not enrolled yet, nothing to do

        // Several pollers exist (foreground service, activity resume, WorkManager);
        // never run two polling passes at once on this device.
        if (!pollMutex.tryLock()) return
        try {
            val response = ApiClient.service.getPendingCommands()
            if (!response.isSuccessful) return
            val commands = response.body()?.commands ?: return

            for (command in commands) {
                executeOne(context, command)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to poll for remote commands: ${e.message}")
        } finally {
            pollMutex.unlock()
        }
    }

    private suspend fun executeOne(context: Context, command: DeviceCommandDto) {
        when (command.type) {
            "RESTART_APP" -> restartApp(context, command.id)
            "RESTART_DEVICE" -> restartDevice(context, command.id)
            "START_SCREEN_SHARE" -> startScreenShare(context, command)
            "STOP_SCREEN_SHARE" -> {
                ScreenShareForegroundService.stop(context)
                reportOutcome(command.id, "COMPLETED", stage = "STOPPED")
            }
            else -> {
                Log.w(TAG, "Unsupported command type: ${command.type}")
                reportOutcome(command.id, "FAILED", "Unsupported command type on this app version")
            }
        }
    }

    // ── Screen share ─────────────────────────────────────────────────────────

    /**
     * Launches [ScreenShareConsentActivity] to request the one-time MediaProjection
     * "Start now" consent dialog. The command isn't reported COMPLETED/FAILED here —
     * [ScreenShareForegroundService] reports the final outcome once the WebRTC peer
     * connection actually reaches CONNECTED, or if consent is denied/the connection fails.
     */
    private suspend fun startScreenShare(context: Context, command: DeviceCommandDto) {
        val sessionId = command.payload?.get("sessionId") as? String
        if (sessionId == null) {
            reportOutcome(command.id, "FAILED", "Missing sessionId in command payload")
            return
        }
        reportProgress(command.id, "CONSENT_PENDING", "Waiting for someone at the terminal to tap \"Start now\"")
        try {
            ScreenShareConsentActivity.start(context, sessionId, command.id)
        } catch (e: Exception) {
            reportOutcome(command.id, "FAILED", "Could not open the screen-capture prompt: ${e.message}")
        }
    }

    // ── Restart the app ──────────────────────────────────────────────────────

    /**
     * Relaunches the app's own launcher activity, then kills this process. The final
     * COMPLETED is reported by [resolvePendingOutcome] from the NEW process, which
     * proves the app genuinely came back (not just that we asked it to restart).
     */
    private suspend fun restartApp(context: Context, commandId: String) {
        val appContext = context.applicationContext
        reportProgress(commandId, "RESTARTING", "Closing and relaunching WL BizStore")
        savePendingOutcome(appContext, commandId, "RESTART_APP")

        val launchIntent = appContext.packageManager.getLaunchIntentForPackage(appContext.packageName)
        if (launchIntent == null) {
            clearPendingOutcome(appContext)
            reportOutcome(commandId, "FAILED", "Launcher activity not found")
            return
        }
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        appContext.startActivity(launchIntent)
        // Small grace period so the progress call above is flushed before we die.
        delay(400)
        Runtime.getRuntime().exit(0)
    }

    // ── Reboot the whole terminal ────────────────────────────────────────────

    /**
     * Reboots the whole physical terminal. Tried in order:
     *  1. Android Device Owner  -> DevicePolicyManager.reboot()  (standard Android API)
     *  2. Castles CTOS vendor SDK -> CtSystem.shutdown(d_PWR_REBOOT), then securityReboot()
     *     (see docs/POS_SUPPORT.md; works on Castles SATURN terminals without Device Owner)
     * If none works the command FAILS with the reason from each method.
     * On success the process dies with the OS; the next boot confirms via [resolvePendingOutcome].
     */
    private suspend fun restartDevice(context: Context, commandId: String) {
        val appContext = context.applicationContext
        val failures = mutableListOf<String>()

        reportProgress(commandId, "REBOOTING", "Sending reboot request to the operating system")
        savePendingOutcome(appContext, commandId, "RESTART_DEVICE")

        // 1) Device Owner
        val dpm = appContext.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        if (dpm.isDeviceOwnerApp(appContext.packageName)) {
            try {
                dpm.reboot(WLDeviceAdminReceiver.componentName(appContext))
                scheduleNotRebootedCheck(appContext, commandId, "Device Owner API")
                return
            } catch (e: Throwable) {
                failures += "Device Owner reboot failed: ${e.message}"
                Log.e(TAG, "dpm.reboot() failed: ${e.message}")
            }
        } else {
            failures += "App is not provisioned as Device Owner"
        }

        // 2) Castles CTOS vendor SDK
        reportProgress(commandId, "REBOOTING", "Trying the Castles CTOS reboot API")
        try {
            val ctSystem = CtSystem()
            val rc = ctSystem.shutdown(CtSystem.d_PWR_REBOOT)
            Log.i(TAG, "CtSystem.shutdown(d_PWR_REBOOT) returned $rc")
            if (rc == 0) {
                scheduleNotRebootedCheck(appContext, commandId, "Castles CTOS")
                return
            }
            failures += "CTOS shutdown(REBOOT) returned code $rc"
            val rc2 = ctSystem.securityReboot()
            Log.i(TAG, "CtSystem.securityReboot() returned $rc2")
            if (rc2 == 0) {
                scheduleNotRebootedCheck(appContext, commandId, "Castles CTOS secure reboot")
                return
            }
            failures += "CTOS securityReboot returned code $rc2"
        } catch (e: Throwable) {
            failures += "CTOS API unavailable (${e.javaClass.simpleName}: ${e.message})"
            Log.w(TAG, "CTOS reboot failed: ${e.message}")
        }

        clearPendingOutcome(appContext)
        reportOutcome(commandId, "FAILED", failures.joinToString("; "))
    }

    /** Reboot was accepted; if the OS is somehow still running well after, report that honestly. */
    private fun scheduleNotRebootedCheck(appContext: Context, commandId: String, method: String) {
        bgScope.launch {
            delay(REBOOT_NOT_HAPPENING_AFTER_MS)
            // Still alive => the device did not actually reboot.
            if (pendingCommandId(appContext) == commandId) {
                clearPendingOutcome(appContext)
                reportOutcome(commandId, "FAILED", "Reboot request ($method) was accepted but the terminal did not restart")
            }
        }
    }

    // ── Post-restart confirmation ────────────────────────────────────────────

    /**
     * Called from every fresh process start / poll loop. If a restart/reboot command is
     * awaiting confirmation, report it as COMPLETED ("back online") once we can prove it
     * happened. For a reboot, proof is: device uptime is shorter than the time elapsed
     * since the request (i.e. the OS booted after we asked).
     */
    suspend fun resolvePendingOutcome(context: Context) {
        val appContext = context.applicationContext
        val prefs = appContext.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE)
        val id = prefs.getString(KEY_CMD_ID, null) ?: return
        val type = prefs.getString(KEY_CMD_TYPE, null) ?: return
        val requestedWall = prefs.getLong(KEY_REQUESTED_WALL, 0L)
        val sinceRequest = System.currentTimeMillis() - requestedWall

        ApiClient.ensureApiKeyLoaded(appContext)
        if (!ApiClient.hasApiKey()) return

        when (type) {
            "RESTART_APP" -> {
                if (reportOutcome(id, "COMPLETED", stage = "BACK_ONLINE", detail = "WL BizStore relaunched")) clearPendingOutcome(appContext)
            }
            "RESTART_DEVICE" -> {
                val uptime = SystemClock.elapsedRealtime()
                val rebooted = requestedWall > 0 && uptime < sinceRequest
                if (rebooted) {
                    val detail = "Terminal booted ${uptime / 1000}s ago"
                    if (reportOutcome(id, "COMPLETED", stage = "BACK_ONLINE", detail = detail)) clearPendingOutcome(appContext)
                } else if (sinceRequest > REBOOT_CONFIRM_TIMEOUT_MS) {
                    if (reportOutcome(id, "FAILED", "No reboot detected within ${REBOOT_CONFIRM_TIMEOUT_MS / 60_000} minutes")) clearPendingOutcome(appContext)
                }
                // else: still waiting for the reboot to happen
            }
            else -> clearPendingOutcome(appContext)
        }
    }

    private fun savePendingOutcome(context: Context, id: String, type: String) {
        context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_CMD_ID, id)
            .putString(KEY_CMD_TYPE, type)
            .putLong(KEY_REQUESTED_WALL, System.currentTimeMillis())
            .commit() // commit(), not apply(): the process may die right after
    }

    private fun clearPendingOutcome(context: Context) {
        context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).edit().clear().commit()
    }

    private fun pendingCommandId(context: Context): String? =
        context.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).getString(KEY_CMD_ID, null)

    // ── Reporting helpers ────────────────────────────────────────────────────

    suspend fun reportProgress(commandId: String, stage: String, detail: String? = null) {
        try {
            ApiClient.service.reportCommandProgress(commandId, CommandProgressRequest(stage, detail))
        } catch (e: Exception) {
            Log.w(TAG, "Failed to report progress ($stage): ${e.message}")
        }
    }

    /** Returns true if the backend accepted the outcome (so callers can safely clear markers). */
    suspend fun reportOutcome(
        commandId: String,
        status: String,
        errorMessage: String? = null,
        stage: String? = null,
        detail: String? = null,
    ): Boolean {
        return try {
            ApiClient.service.completeCommand(commandId, CompleteCommandRequest(status, errorMessage, stage, detail)).isSuccessful
        } catch (e: Exception) {
            Log.w(TAG, "Failed to report command outcome: ${e.message}")
            false
        }
    }
}
