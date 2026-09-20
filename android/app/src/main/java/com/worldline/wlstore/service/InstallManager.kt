package com.worldline.wlstore.service

import android.content.Context
import android.content.pm.PackageInstaller
import android.content.Intent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.IOException
import java.security.MessageDigest

/**
 * Handles APK download, SHA-256 checksum verification, and silent install.
 *
 * Uses PackageInstaller API for silent install when running as Device Owner.
 * Falls back to standard install intent when not Device Owner.
 */
object InstallManager {

    /**
     * Downloads an APK from a signed URL into the app's cache directory.
     * Reports progress to the callback.
     */
    suspend fun downloadApk(
        context: Context,
        downloadUrl: String,
        fileName: String,
        onProgress: (Int) -> Unit
    ): Result<File> = withContext(Dispatchers.IO) {
        try {
            val cacheDir = File(context.cacheDir, "apks")
            cacheDir.mkdirs()
            val apkFile = File(cacheDir, fileName)

            val connection = java.net.URL(downloadUrl).openConnection() as java.net.HttpURLConnection
            connection.connect()
            val contentLength = connection.contentLengthLong

            apkFile.outputStream().use { output ->
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
            Result.success(apkFile)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Verifies the SHA-256 checksum of a downloaded APK.
     * Returns true if checksum matches.
     */
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
     * Silently installs an APK using PackageInstaller API.
     * This requires the app to be running as Device Owner (Android Enterprise).
     *
     * On non-Device-Owner devices, falls back to standard install intent.
     */
    suspend fun installApk(
        context: Context,
        apkFile: File,
        packageName: String,
        onResult: (success: Boolean, message: String) -> Unit
    ) = withContext(Dispatchers.IO) {
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

            val pendingIntent = android.app.PendingIntent.getBroadcast(
                context, sessionId, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_MUTABLE
            )

            session.commit(pendingIntent.intentSender)
            session.close()

            withContext(Dispatchers.Main) {
                onResult(true, "Install initiated for $packageName")
            }
        } catch (e: IOException) {
            // Fall back to standard install intent (non-Device-Owner)
            withContext(Dispatchers.Main) {
                installApkFallback(context, apkFile)
                onResult(true, "Standard install dialog opened")
            }
        } catch (e: Exception) {
            withContext(Dispatchers.Main) {
                onResult(false, e.message ?: "Install failed")
            }
        }
    }

    private fun installApkFallback(context: Context, apkFile: File) {
        val apkUri = androidx.core.content.FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            apkFile
        )
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(apkUri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(intent)
    }
}
