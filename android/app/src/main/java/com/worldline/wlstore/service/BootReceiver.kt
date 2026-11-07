package com.worldline.wlstore.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Restores remote reachability after the terminal reboots or WL BizStore is updated:
 * re-arms the WorkManager safety-net poll and restarts [CommandPollService], which in turn
 * confirms any pending "Restart Device" command as back online.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        Log.i("WLStore-Boot", "Received $action — restoring command polling")
        CommandPollWorker.schedule(context)
        CommandPollService.start(context)
    }
}

