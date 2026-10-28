package com.worldline.wlstore.service

import android.content.Context
import androidx.work.*
import java.util.concurrent.TimeUnit

/**
 * Periodically checks the backend for pending remote commands (e.g. force
 * restart) so they still get delivered even if the app isn't currently open.
 * 15 minutes is the minimum interval WorkManager allows for periodic work;
 * when the app itself is in the foreground, CatalogActivity also checks
 * immediately on every resume for a much faster response in that case.
 */
class CommandPollWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        RemoteCommandExecutor.checkAndExecutePendingCommands(applicationContext)
        return Result.success()
    }

    companion object {
        private const val WORK_NAME = "wl_store_command_poll"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<CommandPollWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request
            )
        }
    }
}
