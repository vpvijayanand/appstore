package com.worldline.wlstore.service

import android.content.Context
import android.content.pm.PackageInstaller
import android.content.Intent
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap

/**
 * Handles APK download, SHA-256 checksum verification, and silent install.
 *
 * Uses PackageInstaller API for silent install when running as Device Owner.
 * Falls back to standard install intent when not Device Owner.
 */
object InstallManager {

    private const val INSTALL_RESULT_TIMEOUT_MS = 5 * 60_000L
    private val installWaiters = ConcurrentHashMap<Int, CompletableDeferred<Pair<Boolean, String>>>()

    /** Downloads a package file from a signed URL into the app cache directory. */
    suspend fun downloadApk(
        context: Context,
        downloadUrl: String,
        fileName: String,
        onProgress: (Int) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            val cacheDir = File(context.cacheDir, "packages")
            cacheDir.mkdirs()
            val packageFile = File(cacheDir, fileName)

            val targetUrl = downloadUrl
                .replace("http://localhost:", "http://10.0.2.2:")
                .replace("https://localhost:", "https://10.0.2.2:")
                .replace("http://127.0.0.1:", "http://10.0.2.2:")
                .replace("https://127.0.0.1:", "https://10.0.2.2:")

            val connection = java.net.URL(targetUrl).openConnection() as java.net.HttpURLConnection
            connection.connect()
            val contentLength = connection.contentLengthLong

            packageFile.outputStream().use { output ->
                connection.inputStream.use { input ->
                    val buffer = ByteArray(8192)
                    var downloaded = 0L
                    var read: Int
                    while (input.read(buffer).also { read = it } != -1) {
                        output.write(buffer, 0, read)
                        downloaded += read
                        if (contentLength > 0) {
                            onProgress((downloaded * 100 / contentLength).toInt())
                        }
                    }
                }
            }
            connection.disconnect()
            Result.success(packageFile)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Verifies the SHA-256 checksum of a downloaded package file. */
    suspend fun verifyChecksum(file: File, expectedChecksum: String): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val digest = MessageDigest.getInstance("SHA-256")
                file.inputStream().use { stream ->
                    val buffer = ByteArray(8192)
                    var read: Int
                    while (stream.read(buffer).also { read = it } != -1) {
                        digest.update(buffer, 0, read)
                    }
                }
                val actual = digest.digest().joinToString("") { "%02x".format(it) }
                actual.equals(expectedChecksum, ignoreCase = true)
            } catch (e: Exception) {
                false
            }
        }

    /**
     * Installs a package using PackageInstaller API and waits for the final
     * PackageInstaller callback before returning success/failure.
     */
    suspend fun installApk(
        context: Context,
        apkFile: File,
        packageName: String
    ): Pair<Boolean, String> = withContext(Dispatchers.IO) {
        try {
            val packageInstaller = context.packageManager.packageInstaller
            val params = PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL
            ).apply {
                setAppPackageName(packageName)
                setSize(apkFile.length())
            }

            val sessionId = packageInstaller.createSession(params)
            val session = packageInstaller.openSession(sessionId)

            apkFile.inputStream().use { apkStream ->
                session.openWrite("package", 0, apkFile.length()).use { out ->
                    apkStream.copyTo(out)
                    session.fsync(out)
                }
            }

            val intent = Intent(context, InstallResultReceiver::class.java).apply {
                action = "com.worldline.wlstore.INSTALL_RESULT"
                putExtra("packageName", packageName)
            }

            val deferred = CompletableDeferred<Pair<Boolean, String>>()
            installWaiters[sessionId] = deferred

            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context, sessionId, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
            )

            session.commit(pendingIntent.intentSender)
            session.close()

            val outcome = withTimeoutOrNull(INSTALL_RESULT_TIMEOUT_MS) { deferred.await() }
                ?: (false to "Install confirmation timed out")
            installWaiters.remove(sessionId)
            outcome
        } catch (e: IOException) {
            // Non-Device-Owner flow cannot guarantee silent-result confirmation.
            installApkFallback(context, apkFile)
            false to "Interactive install required; silent confirmation unavailable"
        } catch (e: Exception) {
            false to (e.message ?: "Install failed")
        }
    }

    fun reportInstallResult(sessionId: Int, success: Boolean, message: String) {
        val deferred = installWaiters.remove(sessionId) ?: return
        if (!deferred.isCompleted) deferred.complete(success to message)
    }

    private fun installApkFallback(context: Context, apkFile: File) {
        val apkUri = androidx.core.content.FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )
        // Use ACTION_INSTALL_PACKAGE instead of ACTION_VIEW to avoid the
        // confusing "Keep Shopping" button that appears in the system
        // package installer when triggered via ACTION_VIEW.
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            data = apkUri
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            putExtra(Intent.EXTRA_RETURN_RESULT, true)
        }
        context.startActivity(intent)
    }
}
