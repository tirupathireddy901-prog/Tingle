package com.tingle.app.data

import com.tingle.app.data.models.*
import retrofit2.Response
import retrofit2.http.*

interface TingleApi {
    @POST("/auth/signup")
    suspend fun signup(@Body body: SignupRequest): Response<MessageResponse>

    @POST("/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    @POST("/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): Response<RefreshResponse>

    @POST("/auth/logout")
    suspend fun logout(@Header("Authorization") auth: String, @Body body: LogoutRequest): Response<MessageResponse>

    @POST("/auth/verify-email")
    suspend fun verifyEmail(@Body body: VerifyEmailRequest): Response<MessageResponse>

    @POST("/auth/resend-verification")
    suspend fun resendVerification(@Body body: EmailRequest): Response<MessageResponse>

    @POST("/auth/request-password-reset")
    suspend fun requestPasswordReset(@Body body: EmailRequest): Response<MessageResponse>

    @POST("/auth/reset-password")
    suspend fun resetPassword(@Body body: ResetPasswordRequest): Response<MessageResponse>

    @GET("/auth/me")
    suspend fun me(@Header("Authorization") auth: String): Response<CurrentUser>

    @GET("/webrtc/ice-servers")
    suspend fun iceServers(@Header("Authorization") auth: String): Response<IceServersResponse>

    @POST("/blocks")
    suspend fun blockUser(@Header("Authorization") auth: String, @Body body: BlockRequest): Response<MessageResponse>

    @POST("/reports")
    suspend fun reportUser(@Header("Authorization") auth: String, @Body body: ReportRequest): Response<ReportResponse>

    @POST("/appeals")
    suspend fun submitAppeal(@Header("Authorization") auth: String, @Body body: AppealRequest): Response<MessageResponse>
}
