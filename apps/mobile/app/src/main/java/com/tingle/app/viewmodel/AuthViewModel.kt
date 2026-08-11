package com.tingle.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.tingle.app.data.ApiResult
import com.tingle.app.data.AuthRepository
import com.tingle.app.data.models.CurrentUser
import com.tingle.app.data.models.LoginResponse
import com.tingle.app.data.models.MessageResponse
import com.tingle.app.data.models.SignupRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val loading: Boolean = true,
    val user: CurrentUser? = null,
    val accessToken: String? = null,
)

/**
 * Session state shared across Splash/Login/Signup/Home — mirrors what
 * apps/web/src/lib/AuthContext.tsx does for the web app. `user` is null
 * both while loading and when genuinely logged out; check `loading`
 * first before treating a null user as "not logged in".
 */
class AuthViewModel(
    application: Application,
    private val repository: AuthRepository,
) : AndroidViewModel(application) {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        refreshSession()
    }

    fun refreshSession() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            if (!repository.isLoggedIn()) {
                _state.value = AuthUiState(loading = false, user = null)
                return@launch
            }
            when (val result = repository.currentUser()) {
                is ApiResult.Success -> _state.value = AuthUiState(
                    loading = false,
                    user = result.value,
                    accessToken = accessTokenOrNull(),
                )
                else -> _state.value = AuthUiState(loading = false, user = null)
            }
        }
    }

    suspend fun login(email: String, password: String): ApiResult<LoginResponse> {
        val result = repository.login(email, password)
        if (result is ApiResult.Success) refreshSession()
        return result
    }

    suspend fun signup(request: SignupRequest): ApiResult<MessageResponse> = repository.signup(request)

    suspend fun resendVerification(email: String): ApiResult<MessageResponse> =
        repository.resendVerification(email)

    suspend fun submitAppeal(message: String): ApiResult<MessageResponse> =
        repository.submitAppeal(message)

    fun logout() {
        viewModelScope.launch {
            repository.logout()
            _state.value = AuthUiState(loading = false, user = null)
        }
    }

    private suspend fun accessTokenOrNull(): String? =
        (getApplication<android.app.Application>() as? com.tingle.app.TingleApplication)
            ?.tokenStore?.currentAccessToken()

    class Factory(private val application: Application, private val repository: AuthRepository) :
        ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return AuthViewModel(application, repository) as T
        }
    }
}
