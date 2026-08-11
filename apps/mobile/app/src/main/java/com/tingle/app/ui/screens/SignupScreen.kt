package com.tingle.app.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tingle.app.data.ApiResult
import com.tingle.app.data.models.SignupRequest
import com.tingle.app.ui.theme.StatusError
import com.tingle.app.ui.theme.Violet
import com.tingle.app.viewmodel.AuthViewModel
import kotlinx.coroutines.launch

@Composable
fun SignupScreen(authViewModel: AuthViewModel, onSignedUp: (email: String) -> Unit, onNavigateLogin: () -> Unit) {
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var dateOfBirth by remember { mutableStateOf("") } // YYYY-MM-DD
    var password by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var agreeAge18 by remember { mutableStateOf(false) }
    var agreeTerms by remember { mutableStateOf(false) }
    var agreePrivacy by remember { mutableStateOf(false) }
    var agreeCommunity by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val allAgreed = agreeAge18 && agreeTerms && agreePrivacy && agreeCommunity

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 24.dp, vertical = 32.dp),
    ) {
        Text(
            "Create your account",
            fontSize = 22.sp,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        Text(
            "Tingle is for users 18 and older.",
            fontSize = 13.sp,
            modifier = Modifier
                .align(Alignment.CenterHorizontally)
                .padding(top = 4.dp, bottom = 24.dp),
        )

        OutlinedTextField(displayName, { displayName = it }, label = { Text("Display name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            dateOfBirth, { dateOfBirth = it },
            label = { Text("Date of birth (YYYY-MM-DD)") },
            singleLine = true,
            placeholder = { Text("2000-05-14") },
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            password, { password = it }, label = { Text("Password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            confirmPassword, { confirmPassword = it }, label = { Text("Confirm password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
        )

        Spacer(Modifier.height(16.dp))
        AgreementRow(agreeAge18, { agreeAge18 = it }, "I confirm that I am 18 or older.")
        AgreementRow(agreeTerms, { agreeTerms = it }, "I agree to the Terms of Service.")
        AgreementRow(agreePrivacy, { agreePrivacy = it }, "I acknowledge the Privacy Policy.")
        AgreementRow(agreeCommunity, { agreeCommunity = it }, "I agree to the Community Guidelines.")

        error?.let {
            Spacer(Modifier.height(8.dp))
            Text(it, color = StatusError, fontSize = 13.sp)
        }

        Spacer(Modifier.height(20.dp))
        Button(
            onClick = {
                error = null
                if (password != confirmPassword) {
                    error = "Passwords do not match"
                    return@Button
                }
                if (!allAgreed) {
                    error = "Please confirm all agreements above to continue"
                    return@Button
                }
                submitting = true
                scope.launch {
                    val result = authViewModel.signup(
                        SignupRequest(
                            displayName = displayName,
                            email = email,
                            password = password,
                            confirmPassword = confirmPassword,
                            dateOfBirth = dateOfBirth,
                            agreeAge18 = true,
                            agreeTerms = true,
                            agreePrivacy = true,
                            agreeCommunityGuidelines = true,
                        )
                    )
                    when (result) {
                        is ApiResult.Success -> onSignedUp(email)
                        is ApiResult.Failure -> error = result.message
                    }
                    submitting = false
                }
            },
            enabled = !submitting,
            colors = ButtonDefaults.buttonColors(containerColor = Violet),
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp),
        ) {
            Text(if (submitting) "Creating account…" else "Create account")
        }

        Spacer(Modifier.height(16.dp))
        TextButton(onClick = onNavigateLogin, modifier = Modifier.align(Alignment.CenterHorizontally)) {
            Text("Already have an account? Log in")
        }
    }
}

@Composable
private fun AgreementRow(checked: Boolean, onChange: (Boolean) -> Unit, label: String) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 2.dp)) {
        Checkbox(checked = checked, onCheckedChange = onChange, colors = CheckboxDefaults.colors(checkedColor = Violet))
        Text(label, fontSize = 13.sp)
    }
}
