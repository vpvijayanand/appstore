package com.worldline.wlstore.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.core.content.ContextCompat
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
     * Gets a single location fix, preferring Google Play Services' FusedLocationProviderClient
     * (best accuracy/power tradeoff) and falling back to the plain LocationManager API — which
     * works without Play Services — since many non-Google-certified POS terminals (e.g. Castles
     * CTOS devices) ship without GMS at all, where FusedLocationProviderClient can throw
     * NoClassDefFoundError (an Error, not an Exception) rather than failing gracefully.
     *
     * Bounded to 8s and resilient to ANY failure (missing permission, Play Services
     * unavailable/outdated/absent, no location fix available, etc.) via catching Throwable,
     * not just Exception, so a GPS problem never blocks network-type/status reporting below.
     */
    suspend fun getCurrentLocation(context: Context): GpsResult {
        val fused = try {
            withTimeoutOrNull(8_000) {
                suspendCancellableCoroutine<GpsResult?> { cont ->
                    try {
                        val fusedClient = LocationServices.getFusedLocationProviderClient(context)
                        val cts = CancellationTokenSource()

                        cont.invokeOnCancellation { cts.cancel() }

                        fusedClient.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cts.token)
                            .addOnSuccessListener { location ->
                                cont.resume(location?.let { GpsResult(it.latitude, it.longitude, it.accuracy) })
                            }
                            .addOnFailureListener { cont.resume(null) }
                    } catch (e: Throwable) {
                        cont.resume(null)
                    }
                }
            }
        } catch (e: Throwable) {
            null
        }
        if (fused?.latitude != null) return fused

        return try {
            getLastKnownLocationFallback(context)
        } catch (e: Throwable) {
            GpsResult(null, null, null)
        }
    }

    /** Non-GMS fallback: best of the last known fixes from any available location provider. */
    private fun getLastKnownLocationFallback(context: Context): GpsResult {
        val hasPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!hasPermission) return GpsResult(null, null, null)

        val locationManager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return GpsResult(null, null, null)

        val best = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)
            .mapNotNull { provider ->
                try { locationManager.getLastKnownLocation(provider) } catch (e: Exception) { null }
            }
            .maxByOrNull { it.time }

        return if (best != null) GpsResult(best.latitude, best.longitude, best.accuracy) else GpsResult(null, null, null)
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
            } catch (e: Throwable) {
                GpsResult(null, null, null)
            }
            val networkType = try {
                getNetworkType(context)
            } catch (e: Throwable) {
                "UNKNOWN"
            }

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
        } catch (e: Throwable) {
            Result.failure(if (e is Exception) e else Exception(e))
        }
    }
}
