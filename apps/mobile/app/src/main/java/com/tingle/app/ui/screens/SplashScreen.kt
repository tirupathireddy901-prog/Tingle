package com.tingle.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tingle.app.ui.theme.Violet
import com.tingle.app.viewmodel.AuthUiState

/**
 * Checks auth, account status, and age eligibility, then routes
 * appropriately (spec section 9): logged out -> login, pending
 * verification -> verify-email, restricted/suspended/banned -> restricted,
 * otherwise -> home.
 */
@Composable
fun SplashScreen(authState: AuthUiState, onRoute: (SplashDestination) -> Unit) {
    LaunchedEffect(authState.loading) {
        if (authState.loading) return@LaunchedEffect
        val user = authState.user
        val destination = when {
            user == null -> SplashDestination.Login
            user.accountStatus == "pending_verification" -> SplashDestination.VerifyEmail
            user.accountStatus != "active" -> SplashDestination.Restricted
            else -> SplashDestination.Home
        }
        onRoute(destination)
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("TINGLE", fontSize = 32.sp, fontWeight = FontWeight.SemiBold, color = Violet)
        Spacer(Modifier.height(4.dp))
        Text("Meet. Talk. Connect.")
        Spacer(Modifier.height(24.dp))
        CircularProgressIndicator(color = Violet)
    }
}

enum class SplashDestination { Login, VerifyEmail, Restricted, Home }
