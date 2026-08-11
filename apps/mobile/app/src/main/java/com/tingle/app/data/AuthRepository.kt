package com.tingle.app.data

import com.tingle.app.data.models.*
import kotlinx.coroutines.flow.first

sealed class ApiResult<out T> {
    data class Success<T>(val value: T) : ApiResult<T>()
    data class Failure(val status: Int, val message: String) : ApiResult<Nothing>()
}

class AuthRepository(private val api: TingleApi, private val tokenStore: TokenStore) {

    suspend fun signup(request: SignupRequest): ApiResult<MessageResponse> =
        safeCall { api.signup(request) }

    /** Returns whether the freshly-logged-in account still needs email verification. */
    suspend fun login(email: String, password: String): ApiResult<LoginResponse> {
        val result = safeCall { api.login(LoginRequest(email, password)) }
        if (result is ApiResult.Success) {
            tokenStore.save(result.value.accessToken, result.value.refreshToken)
        }
        return result
    }

    suspend fun logout() {
        val access = tokenStore.currentAccessToken()
        val refresh = tokenStore.currentRefreshToken()
        if (access != null && refresh != null) {
            runCatching { api.logout("Bearer $access", LogoutRequest(refresh)) }
        }
        tokenStore.clear()
    }

    suspend fun verifyEmail(token: String): ApiResult<MessageResponse> =
        safeCall { api.verifyEmail(VerifyEmailRequest(token)) }

    suspend fun resendVerification(email: String): ApiResult<MessageResponse> =
        safeCall { api.resendVerification(EmailRequest(email)) }

    suspend fun requestPasswordReset(email: String): ApiResult<MessageResponse> =
        safeCall { api.requestPasswordReset(EmailRequest(email)) }

    suspend fun resetPassword(token: String, newPassword: String): ApiResult<MessageResponse> =
        safeCall { api.resetPassword(ResetPasswordRequest(token, newPassword)) }

    suspend fun currentUser(): ApiResult<CurrentUser>? {
        val token = tokenStore.currentAccessToken() ?: return null
        return safeCall { api.me("Bearer $token") }
    }

    suspend fun isLoggedIn(): Boolean = tokenStore.accessTokenFlow.first() != null

    suspend fun blockUser(userId: String): ApiResult<MessageResponse> = withAuth { token ->
        api.blockUser(token, BlockRequest(userId))
    }

    suspend fun reportUser(
        reportedUserId: String,
        category: ReportCategory,
        callSessionId: String?,
        description: String?,
    ): ApiResult<ReportResponse> = withAuth { token ->
        api.reportUser(token, ReportRequest(reportedUserId, callSessionId, category.value, description))
    }

    suspend fun submitAppeal(message: String): ApiResult<MessageResponse> = withAuth { token ->
        api.submitAppeal(token, AppealRequest(message))
    }

    suspend fun iceServers(): ApiResult<IceServersResponse> = withAuth { token -> api.iceServers(token) }

    private suspend fun <T> withAuth(
        block: suspend (bearer: String) -> retrofit2.Response<T>
    ): ApiResult<T> {
        val token = tokenStore.currentAccessToken()
            ?: return ApiResult.Failure(401, "Not logged in")
        return safeCall { block("Bearer $token") }
    }

    private suspend fun <T> safeCall(block: suspend () -> retrofit2.Response<T>): ApiResult<T> =
        try {
            val response = block()
            val body = response.body()
            if (response.isSuccessful && body != null) {
                ApiResult.Success(body)
            } else {
                val errorMessage = response.errorBody()?.string()?.let {
                    runCatching { org.json.JSONObject(it).optString("error") }.getOrNull()
                } ?: "Request failed"
                ApiResult.Failure(response.code(), errorMessage.ifBlank { "Request failed" })
            }
        } catch (e: Exception) {
            ApiResult.Failure(-1, e.message ?: "Network error")
        }
}
