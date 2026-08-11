package com.tingle.app.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.tingle.app.signaling.CallMode
import com.tingle.app.ui.theme.Charcoal
import com.tingle.app.ui.theme.Violet
import com.tingle.app.viewmodel.AuthUiState

@Composable
fun HomeScreen(authState: AuthUiState, onLogout: () -> Unit, onStartCall: (CallMode) -> Unit) {
    val context = LocalContext.current
    var pendingMode by remember { mutableStateOf<CallMode?>(null) }
    var showRationale by remember { mutableStateOf<CallMode?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { results ->
        val mode = pendingMode
        pendingMode = null
        if (mode == null) return@rememberLauncherForActivityResult
        val micGranted = results[Manifest.permission.RECORD_AUDIO] == true
        val cameraGranted = mode != CallMode.VIDEO || results[Manifest.permission.CAMERA] == true
        // Spec section 39: if camera is denied, voice calling should still
        // work rather than blocking the whole flow — only mic is a hard
        // requirement for either mode.
        if (micGranted) {
            onStartCall(if (mode == CallMode.VIDEO && !cameraGranted) CallMode.VOICE else mode)
        }
    }

    fun requestAndStart(mode: CallMode) {
        val needsCamera = mode == CallMode.VIDEO
        val micGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val cameraGranted = !needsCamera || ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        if (micGranted && cameraGranted) {
            onStartCall(mode)
        } else {
            showRationale = mode
        }
    }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Tingle", fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
            Row {
                Text(authState.user?.displayName ?: "", fontSize = 13.sp, modifier = Modifier.padding(end = 12.dp))
                TextButton(onClick = onLogout) { Text("Log out") }
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Ready to meet someone?", fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
            Spacer(Modifier.height(32.dp))

            ModeCard("VIDEO TINGLE", "Meet someone through video.") { requestAndStart(CallMode.VIDEO) }
            Spacer(Modifier.height(12.dp))
            ModeCard("VOICE TINGLE", "Talk without video.") { requestAndStart(CallMode.VOICE) }
        }
    }

    showRationale?.let { mode ->
        AlertDialog(
            onDismissRequest = { showRationale = null },
            title = { Text(if (mode == CallMode.VIDEO) "Camera & microphone access" else "Microphone access") },
            text = {
                Text(
                    if (mode == CallMode.VIDEO)
                        "Camera and microphone access lets you participate in video Tingle calls."
                    else
                        "Microphone access lets you participate in voice Tingle calls."
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showRationale = null
                    pendingMode = mode
                    val perms = if (mode == CallMode.VIDEO)
                        arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO)
                    else
                        arrayOf(Manifest.permission.RECORD_AUDIO)
                    permissionLauncher.launch(perms)
                }) { Text("Allow") }
            },
            dismissButton = {
                TextButton(onClick = { showRationale = null }) { Text("Not Now") }
            },
        )
    }
}

@Composable
private fun ModeCard(title: String, subtitle: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        color = Charcoal,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(20.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = Violet)
            Spacer(Modifier.height(4.dp))
            Text(subtitle, fontSize = 13.sp)
        }
    }
}
