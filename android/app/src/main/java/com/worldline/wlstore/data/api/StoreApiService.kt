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
}

// ── Singleton Client ──────────────────────────────────────────────────────────

object ApiClient {

    private var apiKey: String = ""

    fun setApiKey(key: String) {
        apiKey = key
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
