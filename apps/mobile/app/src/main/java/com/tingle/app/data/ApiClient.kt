package com.tingle.app.data

import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.tingle.app.BuildConfig
import com.tingle.app.data.models.RefreshRequest
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import org.json.JSONObject
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory

object ApiClient {
    private val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()

    fun create(tokenStore: TokenStore): TingleApi {
        val client = OkHttpClient.Builder()
            .apply {
                if (BuildConfig.DEBUG) {
                    addInterceptor(HttpLoggingInterceptor().setLevel(HttpLoggingInterceptor.Level.BASIC))
                }
            }
            // On a 401, try exactly once to refresh the access token and
            // retry the original request with it. If refresh itself
            // fails, give up — the caller (AuthRepository) surfaces this
            // as "logged out" rather than retrying forever.
            .authenticator(RefreshAuthenticator(tokenStore))
            .build()

        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
            .create(TingleApi::class.java)
    }
}

private class RefreshAuthenticator(private val tokenStore: TokenStore) : Authenticator {
    override fun authenticate(route: Route?, response: okhttp3.Response): Request? {
        // Avoid infinite retry loops: if this request already carries our
        // refreshed-token attempt, give up.
        if (response.request.header("X-Tingle-Retry") != null) return null

        val refreshToken = runBlocking { tokenStore.currentRefreshToken() } ?: return null

        val plainClient = OkHttpClient()
        val moshi = Moshi.Builder().add(KotlinJsonAdapterFactory()).build()
        val adapter = moshi.adapter(RefreshRequest::class.java)
        val bodyJson = adapter.toJson(RefreshRequest(refreshToken))

        val refreshRequest = Request.Builder()
            .url("${BuildConfig.API_BASE_URL}/auth/refresh")
            .post(bodyJson.toRequestBody("application/json".toMediaTypeOrNull()))
            .build()

        return try {
            plainClient.newCall(refreshRequest).execute().use { refreshResponse ->
                if (!refreshResponse.isSuccessful) return null
                val respBody = refreshResponse.body?.string() ?: return null
                val newAccessToken = JSONObject(respBody).optString("accessToken").ifBlank { null }
                    ?: return null
                runBlocking { tokenStore.updateAccessToken(newAccessToken) }
                response.request.newBuilder()
                    .header("Authorization", "Bearer $newAccessToken")
                    .header("X-Tingle-Retry", "1")
                    .build()
            }
        } catch (e: Exception) {
            null
        }
    }
}
