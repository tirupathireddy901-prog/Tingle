package com.tingle.app.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore(name = "tingle_auth")

/**
 * Holds the access/refresh token pair. DataStore is used instead of plain
 * SharedPreferences for structured, coroutine-friendly access — this is
 * NOT encrypted-at-rest on its own. For a production build, wrap this
 * with Jetpack Security's EncryptedFile/Keystore-backed encryption; noted
 * here rather than silently assumed.
 */
class TokenStore(private val context: Context) {
    private object Keys {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
    }

    val accessTokenFlow: Flow<String?> = context.dataStore.data.map { it[Keys.ACCESS_TOKEN] }
    val refreshTokenFlow: Flow<String?> = context.dataStore.data.map { it[Keys.REFRESH_TOKEN] }

    suspend fun currentAccessToken(): String? = accessTokenFlow.first()
    suspend fun currentRefreshToken(): String? = refreshTokenFlow.first()

    suspend fun save(accessToken: String, refreshToken: String) {
        context.dataStore.edit {
            it[Keys.ACCESS_TOKEN] = accessToken
            it[Keys.REFRESH_TOKEN] = refreshToken
        }
    }

    suspend fun updateAccessToken(accessToken: String) {
        context.dataStore.edit { it[Keys.ACCESS_TOKEN] = accessToken }
    }

    suspend fun clear() {
        context.dataStore.edit {
            it.remove(Keys.ACCESS_TOKEN)
            it.remove(Keys.REFRESH_TOKEN)
        }
    }
}
