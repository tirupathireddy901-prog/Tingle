package com.tingle.app

import android.app.Application
import com.tingle.app.data.ApiClient
import com.tingle.app.data.AuthRepository
import com.tingle.app.data.TokenStore

/**
 * Holds the app-wide singletons (TokenStore, Retrofit client, repository).
 * No DI framework here to keep this scaffold easy to read — swap in
 * Hilt/Koin if the app grows past a handful of screens.
 */
class TingleApplication : Application() {
    lateinit var tokenStore: TokenStore
        private set
    lateinit var authRepository: AuthRepository
        private set

    override fun onCreate() {
        super.onCreate()
        tokenStore = TokenStore(this)
        val api = ApiClient.create(tokenStore)
        authRepository = AuthRepository(api, tokenStore)
    }
}
