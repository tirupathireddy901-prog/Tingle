package com.tingle.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tingle.app.ui.theme.StatusError
import com.tingle.app.ui.theme.Violet
import com.tingle.app.viewmodel.AuthViewModel
import kotlinx.coroutines.launch

@Composable
fun VerifyEmailScreen(authViewModel: AuthViewModel, email: String, onBackToLogin: () -> Unit) {
    var sent by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Verify your email", fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(
            "We sent a verification link to $email. Click it to activate your account, then log in again.",
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = {
                sending = true
                scope.launch {
                    authViewModel.resendVerification(email)
                    sending = false
                    sent = true
                }
            },
            enabled = !sending,
            colors = ButtonDefaults.buttonColors(containerColor = Violet),
        ) {
            Text(if (sent) "Sent — resend again" else "Resend verification email")
        }
        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onBackToLogin) { Text("Back to login") }
    }
}

@Composable
fun RestrictedScreen(authViewModel: AuthViewModel, onLoggedOut: () -> Unit) {
    val state by authViewModel.state.collectAsState()
    var message by remember { mutableStateOf("") }
    var submitted by remember { mutableStateOf(false) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            "Your account has been restricted.",
            fontSize = 20.sp,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            if (state.user?.accountStatus == "banned") "This account has been permanently banned."
            else "This account currently can't match or make calls.",
        )
        Spacer(Modifier.height(24.dp))

        if (submitted) {
            Text("Your appeal has been submitted for review.")
        } else {
            OutlinedTextField(
                value = message,
                onValueChange = { message = it },
                label = { Text("Explain what happened") },
                minLines = 4,
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = {
                    submitting = true
                    scope.launch {
                        authViewModel.submitAppeal(message)
                        submitting = false
                        submitted = true
                    }
                },
                enabled = !submitting && message.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Violet),
            ) {
                Text(if (submitting) "Submitting…" else "Submit appeal")
            }
        }

        Spacer(Modifier.height(24.dp))
        TextButton(onClick = { authViewModel.logout(); onLoggedOut() }) { Text("Log out") }
    }
}
