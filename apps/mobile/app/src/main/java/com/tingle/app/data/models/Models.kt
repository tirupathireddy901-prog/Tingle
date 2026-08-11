package com.tingle.app.data.models

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class SignupRequest(
    val displayName: String,
    val email: String,
    val password: String,
    val confirmPassword: String,
    val dateOfBirth: String, // ISO date, e.g. "2000-05-14" — server discards after age-checking it
    val agreeAge18: Boolean,
    val agreeTerms: Boolean,
    val agreePrivacy: Boolean,
    val agreeCommunityGuidelines: Boolean,
)

@JsonClass(generateAdapter = true)
data class MessageResponse(val message: String)

@JsonClass(generateAdapter = true)
data class LoginRequest(val email: String, val password: String)

@JsonClass(generateAdapter = true)
data class LoginResponse(
    val accessToken: String,
    val refreshToken: String,
    val requiresEmailVerification: Boolean,
)

@JsonClass(generateAdapter = true)
data class RefreshRequest(val refreshToken: String)

@JsonClass(generateAdapter = true)
data class RefreshResponse(val accessToken: String)

@JsonClass(generateAdapter = true)
data class LogoutRequest(val refreshToken: String)

@JsonClass(generateAdapter = true)
data class VerifyEmailRequest(val token: String)

@JsonClass(generateAdapter = true)
data class EmailRequest(val email: String)

@JsonClass(generateAdapter = true)
data class ResetPasswordRequest(val token: String, val newPassword: String)

@JsonClass(generateAdapter = true)
data class CurrentUser(
    val id: String,
    val displayName: String,
    val profilePhotoUrl: String?,
    val ageVerified: Boolean,
    val accountStatus: String,
    val createdAt: String,
    val lastActiveAt: String?,
)

@JsonClass(generateAdapter = true)
data class BlockRequest(val blockedUserId: String)

@JsonClass(generateAdapter = true)
data class ReportRequest(
    val reportedUserId: String,
    val callSessionId: String? = null,
    val category: String,
    val description: String? = null,
)

@JsonClass(generateAdapter = true)
data class ReportResponse(val message: String, val reportId: String)

@JsonClass(generateAdapter = true)
data class AppealRequest(val message: String)

@JsonClass(generateAdapter = true)
data class IceServer(
    val urls: List<String>? = null,
    @Json(name = "url") val urlSingle: String? = null,
    val username: String? = null,
    val credential: String? = null,
) {
    fun urlList(): List<String> = urls ?: urlSingle?.let { listOf(it) } ?: emptyList()
}

@JsonClass(generateAdapter = true)
data class IceServersResponse(val iceServers: List<IceServer>)

/** Category values must match reports.category in infra/postgres/init.sql. */
enum class ReportCategory(val value: String, val label: String) {
    HARASSMENT("harassment", "Harassment"),
    THREATS("threats", "Threats"),
    HATE("hate", "Hate"),
    SEXUAL_MISCONDUCT("sexual_misconduct", "Sexual misconduct"),
    SEXUAL_CONTENT("sexual_content", "Sexual content"),
    SCAM("scam", "Scam"),
    SPAM("spam", "Spam"),
    IMPERSONATION("impersonation", "Impersonation"),
    PRIVACY_VIOLATION("privacy_violation", "Privacy violation"),
    POSSIBLE_MINOR("possible_minor", "Possible minor"),
    OTHER("other", "Other"),
}
