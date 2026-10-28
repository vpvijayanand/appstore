package com.worldline.wlstore.service

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.DownloadEventRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.coroutines.resume

/**
 * Captures GPS location once at download time using FusedLocationProviderClient,
 * then reports the download event to the backend API.
 *
 * Per the architecture document: "Location is captured once, at the moment of
 * download/install — not continuously — to minimize battery impact."
 */
object TelemetryService {

    data class GpsResult(
        val latitude: Double?,
        val longitude: Double?,
        val accuracyMeters: Float?,
    )

    /**
     * Gets a single GPS fix using FusedLocationProviderClient.
     * Falls back to network location if GPS signal is weak (common for indoor POS).
     *
     * Bounded to 8s and resilient to ANY failure (missing permission, Play
     * Services unavailable/outdated on an emulator, no location fix available,
     * etc.) so a GPS problem never blocks network-type/status reporting below.
     */
    suspend fun getCurrentLocation(context: Context): GpsResult {
        return withTimeoutOrNull(8_000) {
            suspendCancellableCoroutine { cont ->
                try {
                    val fusedClient = LocationServices.getFusedLocationProviderClient(context)
                    val cts = CancellationTokenSource()

                    cont.invokeOnCancellation { cts.cancel() }

                    fusedClient.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cts.token)
                        .addOnSuccessListener { location ->
                            if (location != null) {
                                cont.resume(GpsResult(location.latitude, location.longitude, location.accuracy))
                            } else {
                                cont.resume(GpsResult(null, null, null))
                            }
                        }
                        .addOnFailureListener {
                            cont.resume(GpsResult(null, null, null))
                        }
                } catch (e: Exception) {
                    // Permission not granted, Play Services unavailable/outdated, or any
                    // other GMS failure — never let this block telemetry reporting.
                    cont.resume(GpsResult(null, null, null))
                }
            }
        } ?: GpsResult(null, null, null)
    }

    /**
     * Detects current network type for telemetry.
     */
    fun getNetworkType(context: Context): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return "UNKNOWN"
        val caps = cm.getNetworkCapabilities(network) ?: return "UNKNOWN"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "LTE"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ETHERNET"
            else -> "UNKNOWN"
        }
    }

    /**
     * Reports a download event with GPS coordinates and install status.
     */
    suspend fun reportDownloadEvent(
        context: Context,
        eventId: String?,
        appId: String,
        version: String,
        installStatus: String,
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            val gps = try {
                getCurrentLocation(context)
            } catch (e: Exception) {
                GpsResult(null, null, null)
            }
            val networkType = getNetworkType(context)

            val request = DownloadEventRequest(
                eventId = eventId,
                appId = appId,
                version = version,
                installStatus = installStatus,
                latitude = gps.latitude,
                longitude = gps.longitude,
                accuracyMeters = gps.accuracyMeters,
                networkType = networkType,
            )

            val response = ApiClient.service.reportEvent(request)
            if (response.isSuccessful) {
                Result.success(response.body()?.eventId ?: "")
            } else {
                Result.failure(Exception("Event report failed: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
