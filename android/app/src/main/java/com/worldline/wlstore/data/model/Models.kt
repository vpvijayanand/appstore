package com.worldline.wlstore.data.model

import android.os.Parcelable
import kotlinx.parcelize.Parcelize

// ── Catalog Models ───────────────────────────────────────────────────────────

data class CatalogResponse(
    val catalog: List<CategoryWithApps>,
    val customerId: String
)

data class CategoryWithApps(
    val categoryId: String,
    val categoryName: String,
    val categoryIcon: String,
    val apps: List<AppInfo>
)

@Parcelize
data class AppInfo(
    val id: String,
    val name: String,
    val packageName: String,
    val description: String?,
    val developer: String,
    val version: String,
    val versionCode: Int,
    val sizeBytes: String,
    val minOsApi: Int,
    val iconUrl: String?,
    val checksum: String,
    val updatedAt: String,
    val categoryId: String? = null,
    val categoryName: String? = null,
    val visibility: String? = null,          // PUBLIC | PRIVATE
    val isAssigned: Boolean = false,
    val assignmentMode: String? = null,      // DEFAULT | ON_REQUEST
    val assignmentSource: String? = null     // CUSTOMER | TERMINAL
) : Parcelable {
    val sizeMb: String get() = "%.1f MB".format(sizeBytes.toLong() / 1024.0 / 1024.0)
}

// ── Default Apps (auto-download on first run) ────────────────────────────────

data class DefaultAppsResponse(
    val apps: List<AppInfo>,
    val count: Int
)


// ── Download Models ──────────────────────────────────────────────────────────

data class DownloadUrlResponse(
    val downloadUrl: String,
    val eventId: String,
    val app: AppDownloadInfo
)

data class AppDownloadInfo(
    val id: String,
    val name: String,
    val version: String,
    val checksum: String,
    val sizeBytes: String
)

// ── Event Models ─────────────────────────────────────────────────────────────

data class DownloadEventRequest(
    val eventId: String? = null,
    val appId: String,
    val version: String,
    val installStatus: String,      // PENDING, DOWNLOADING, SUCCESS, FAILED
    val latitude: Double? = null,
    val longitude: Double? = null,
    val accuracyMeters: Float? = null,
    val networkType: String? = null
)

data class EventResponse(
    val eventId: String,
    val status: String
)

// ── Auth Models ──────────────────────────────────────────────────────────────

data class EnrollmentRequest(
    val terminalId: String,
    val customerId: String,
    val serialNo: String? = null,
    val imei: String? = null,
    val model: String? = null,
    val site: String? = null,
    val branchCode: String? = null
)

data class EnrollmentResponse(
    val terminalId: String,
    val apiKey: String,
    val customerId: String,
    val message: String
)

data class VerifyResponse(
    val terminalId: String,
    val customer: CustomerInfo,
    val site: String?,
    val model: String?,
    val status: String
)

data class CustomerInfo(
    val id: String,
    val name: String,
    val code: String
)
