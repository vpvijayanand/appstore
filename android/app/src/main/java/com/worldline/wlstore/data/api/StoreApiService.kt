package com.worldline.wlstore.data.api

import com.worldline.wlstore.BuildConfig
import com.worldline.wlstore.data.model.*
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

// ── API Interface ─────────────────────────────────────────────────────────────

interface StoreApiService {

    // Catalog — requires X-Terminal-Key header
    @GET("catalog")
    suspend fun getCatalog(): Response<CatalogResponse>

    @GET("catalog/default-apps")
    suspend fun getDefaultApps(): Response<DefaultAppsResponse>

    @GET("catalog/download/{appId}")
    suspend fun getDownloadUrl(@Path("appId") appId: String): Response<DownloadUrlResponse>

    // Events (telemetry)
    @POST("events")
    suspend fun reportEvent(@Body event: DownloadEventRequest): Response<EventResponse>

    // Auth — enrollment
    @POST("auth/terminal/enroll")
    suspend fun enrollTerminal(@Body request: EnrollmentRequest): Response<EnrollmentResponse>

    @POST("auth/terminal/verify")
    suspend fun verifyTerminal(): Response<VerifyResponse>

    // Remote commands (admin -> device), e.g. force restart
    @GET("terminal/commands/pending")
    suspend fun getPendingCommands(): Response<PendingCommandsResponse>

    @POST("terminal/commands/{id}/complete")
    suspend fun completeCommand(@Path("id") id: String, @Body body: CompleteCommandRequest): Response<Unit>

    // Advertisements (admin -> device): image/video/HTML promos with a schedule
    @GET("terminal/advertisements/pending")
    suspend fun getPendingAdvertisements(): Response<PendingAdvertisementsResponse>
}

// ── Singleton Client ──────────────────────────────────────────────────────────

object ApiClient {

    private var apiKey: String = ""

    fun setApiKey(key: String) {
        apiKey = key
    }

    /** Clears the in-memory API key — used on logout, before returning to enrollment. */
    fun clearApiKey() {
        apiKey = ""
    }

    fun hasApiKey(): Boolean = apiKey.isNotBlank()

    /**
     * Ensures [apiKey] is populated before making a request. Needed because this is an
     * in-memory singleton: if the process was started fresh for a background task (e.g. a
     * WorkManager worker) rather than through EnrollmentActivity, the key would otherwise
     * still be blank even though the device is already enrolled. Reads the same
     * EncryptedSharedPreferences entry that EnrollmentActivity writes on enrollment.
     */
    fun ensureApiKeyLoaded(context: android.content.Context) {
        if (apiKey.isNotBlank()) return
        try {
            val masterKeyAlias = androidx.security.crypto.MasterKeys.getOrCreate(androidx.security.crypto.MasterKeys.AES256_GCM_SPEC)
            val prefs = androidx.security.crypto.EncryptedSharedPreferences.create(
                "wl_store_prefs",
                masterKeyAlias,
                context,
                androidx.security.crypto.EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                androidx.security.crypto.EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
            val storedKey = prefs.getString("api_key", null)
            if (storedKey != null) apiKey = storedKey
        } catch (e: Exception) {
            // Keystore unavailable — leave apiKey blank, caller's request will simply 401.
        }
    }

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
        else HttpLoggingInterceptor.Level.NONE
    }

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .addInterceptor { chain ->
                val request = chain.request().newBuilder()
                    .addHeader("X-Terminal-Key", apiKey)
                    .addHeader("Content-Type", "application/json")
                    .build()
                chain.proceed(request)
            }
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    val service: StoreApiService by lazy {
        Retrofit.Builder()
            .baseUrl("${BuildConfig.API_BASE_URL}/")
            .client(httpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(StoreApiService::class.java)
    }
}
