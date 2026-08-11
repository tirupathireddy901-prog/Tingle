package com.tingle.app.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.tingle.app.data.models.ReportCategory
import com.tingle.app.signaling.CallMode
import com.tingle.app.ui.theme.*
import com.tingle.app.viewmodel.CallScreenState
import com.tingle.app.viewmodel.CallViewModel
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack

@Composable
fun CallScreen(
    callViewModel: CallViewModel,
    initialMode: CallMode,
    onExitToHome: () -> Unit,
) {
    val state by callViewModel.uiState.collectAsState()

    LaunchedEffect(Unit) { callViewModel.connectSignaling(initialMode) }

    var showReport by remember { mutableStateOf(false) }
    var showBlockConfirm by remember { mutableStateOf(false) }

    when (state.screenState) {
        CallScreenState.IDLE -> LaunchedEffect(Unit) { onExitToHome() }

        CallScreenState.SEARCHING -> SearchingView(onCancel = {
            callViewModel.cancelSearching()
            onExitToHome()
        })

        CallScreenState.FAILED, CallScreenState.REMOTE_DISCONNECTED -> FailedView(
            isFailed = state.screenState == CallScreenState.FAILED,
            onRetry = { state.mode?.let { callViewModel.startSearching(it) } },
            onHome = onExitToHome,
        )

        CallScreenState.ENDED -> EndedView(
            durationSeconds = state.callDurationSeconds,
            onMatchAgain = { state.mode?.let { callViewModel.startSearching(it) } },
            onReport = { showReport = true },
            onBlock = { showBlockConfirm = true },
            onHome = onExitToHome,
        )

        else -> InCallView(
            state = state,
            eglBaseContext = callViewModel.eglBaseContext,
            onToggleMic = callViewModel::toggleMic,
            onToggleCamera = callViewModel::toggleCamera,
            onSwitchCamera = callViewModel::switchCamera,
            onNext = callViewModel::nextUser,
            onEnd = callViewModel::endCall,
            onReport = { showReport = true },
            onBlock = { showBlockConfirm = true },
        )
    }

    if (showReport) {
        ReportDialog(
            onDismiss = { showReport = false },
            onSubmit = { category, description ->
                callViewModel.reportPeerAsync(category, description)
                showReport = false
            },
        )
    }
    if (showBlockConfirm) {
        BlockConfirmDialog(
            onDismiss = { showBlockConfirm = false },
            onConfirm = {
                callViewModel.blockPeerAndEndCall()
                showBlockConfirm = false
            },
        )
    }
}

@Composable
private fun SearchingView(onCancel: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Midnight),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        CircularProgressIndicator(color = Violet)
        Spacer(Modifier.height(16.dp))
        Text("Finding someone for you…", color = Color.White)
        Spacer(Modifier.height(24.dp))
        OutlinedButton(onClick = onCancel) { Text("Cancel") }
    }
}

@Composable
private fun FailedView(isFailed: Boolean, onRetry: () -> Unit, onHome: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Midnight)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            if (isFailed) "Something went wrong." else "Connection lost.",
            color = Color.White,
            fontSize = 18.sp,
        )
        Spacer(Modifier.height(24.dp))
        Row {
            Button(onClick = onRetry, colors = ButtonDefaults.buttonColors(containerColor = Violet)) { Text("Try Again") }
            Spacer(Modifier.width(12.dp))
            OutlinedButton(onClick = onHome) { Text("Home") }
        }
    }
}

@Composable
private fun EndedView(
    durationSeconds: Int,
    onMatchAgain: () -> Unit,
    onReport: () -> Unit,
    onBlock: () -> Unit,
    onHome: () -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Midnight)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("Conversation ended", color = Color.White, fontSize = 18.sp)
        Text("${durationSeconds / 60}:${(durationSeconds % 60).toString().padStart(2, '0')}", color = Color.Gray)
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onMatchAgain,
            colors = ButtonDefaults.buttonColors(containerColor = Violet),
            modifier = Modifier.fillMaxWidth(0.8f),
        ) { Text("Match Again") }
        Spacer(Modifier.height(8.dp))
        Row {
            OutlinedButton(onClick = onReport, modifier = Modifier.weight(1f)) { Text("Report") }
            Spacer(Modifier.width(8.dp))
            OutlinedButton(onClick = onBlock, modifier = Modifier.weight(1f)) { Text("Block") }
        }
        Spacer(Modifier.height(8.dp))
        TextButton(onClick = onHome) { Text("Home") }
    }
}

@Composable
private fun InCallView(
    state: com.tingle.app.viewmodel.CallUiState,
    eglBaseContext: org.webrtc.EglBase.Context?,
    onToggleMic: () -> Unit,
    onToggleCamera: () -> Unit,
    onSwitchCamera: () -> Unit,
    onNext: () -> Unit,
    onEnd: () -> Unit,
    onReport: () -> Unit,
    onBlock: () -> Unit,
) {
    Box(
        Modifier
            .fillMaxSize()
            .background(Color.Black)
    ) {
        if (state.mode == CallMode.VIDEO && eglBaseContext != null) {
            state.remoteVideoTrack?.let { track ->
                VideoRenderer(track, eglBaseContext, Modifier.fillMaxSize())
            } ?: Text("Waiting for video…", color = Color.Gray, modifier = Modifier.align(Alignment.Center))

            state.localVideoTrack?.let { track ->
                Box(
                    Modifier
                        .align(Alignment.BottomEnd)
                        .padding(bottom = 96.dp, end = 16.dp)
                        .size(112.dp, 160.dp)
                        .clip(RoundedCornerShapeSmall)
                ) {
                    VideoRenderer(track, eglBaseContext, Modifier.fillMaxSize())
                }
            }
        } else {
            Column(
                Modifier.align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Box(
                    Modifier
                        .size(96.dp)
                        .clip(CircleShape)
                        .background(Charcoal),
                    contentAlignment = Alignment.Center,
                ) { Text("🎙️", fontSize = 32.sp) }
                Spacer(Modifier.height(12.dp))
                Text("Someone new", color = Color.Gray)
            }
        }

        // Status bar
        Row(
            Modifier
                .align(Alignment.TopStart)
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val (label, color) = when (state.screenState) {
                CallScreenState.CONNECTED -> "Connected" to StatusConnected
                CallScreenState.RECONNECTING, CallScreenState.POOR_CONNECTION -> "Reconnecting…" to StatusConnecting
                else -> "Connecting…" to Color.Gray
            }
            Box(Modifier.size(8.dp).clip(CircleShape).background(color))
            Spacer(Modifier.width(6.dp))
            Text(label, color = Color.White, fontSize = 13.sp)
            Spacer(Modifier.weight(1f))
            if (state.screenState == CallScreenState.CONNECTED) {
                Text(
                    "${state.callDurationSeconds / 60}:${(state.callDurationSeconds % 60).toString().padStart(2, '0')}",
                    color = Color.White,
                    fontSize = 13.sp,
                )
            }
        }

        // Controls
        Row(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .padding(vertical = 20.dp),
            horizontalArrangement = Arrangement.Center,
        ) {
            CircleIconButton(if (state.micEnabled) "🎤" else "🔇", onToggleMic)
            if (state.mode == CallMode.VIDEO) {
                Spacer(Modifier.width(8.dp))
                CircleIconButton(if (state.cameraEnabled) "📷" else "📵", onToggleCamera)
                Spacer(Modifier.width(8.dp))
                CircleIconButton("🔄", onSwitchCamera)
            }
            Spacer(Modifier.width(8.dp))
            CircleIconButton("🚩", onReport)
            Spacer(Modifier.width(8.dp))
            CircleIconButton("🚫", onBlock)
            Spacer(Modifier.width(8.dp))
            Button(onClick = onNext, colors = ButtonDefaults.buttonColors(containerColor = Charcoal)) { Text("Next") }
            Spacer(Modifier.width(8.dp))
            Button(onClick = onEnd, colors = ButtonDefaults.buttonColors(containerColor = StatusError)) { Text("End") }
        }
    }
}

private val RoundedCornerShapeSmall = androidx.compose.foundation.shape.RoundedCornerShape(12.dp)

@Composable
private fun CircleIconButton(emoji: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = CircleShape,
        color = Charcoal,
        modifier = Modifier.size(48.dp),
    ) {
        Box(contentAlignment = Alignment.Center) { Text(emoji, fontSize = 18.sp) }
    }
}

/** Binds a WebRTC VideoTrack to a SurfaceViewRenderer via AndroidView. */
@Composable
private fun VideoRenderer(track: VideoTrack, eglBaseContext: org.webrtc.EglBase.Context, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val renderer = remember { SurfaceViewRenderer(context) }

    DisposableEffect(track, eglBaseContext) {
        renderer.init(eglBaseContext, null)
        renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
        track.addSink(renderer)
        onDispose {
            track.removeSink(renderer)
            renderer.release()
        }
    }

    AndroidView(factory = { renderer }, modifier = modifier)
}

@Composable
private fun ReportDialog(onDismiss: () -> Unit, onSubmit: (ReportCategory, String?) -> Unit) {
    var selected by remember { mutableStateOf(ReportCategory.HARASSMENT) }
    var description by remember { mutableStateOf("") }
    var expanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report this person") },
        text = {
            Column {
                Box {
                    OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(selected.label)
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        ReportCategory.entries.forEach { cat ->
                            DropdownMenuItem(text = { Text(cat.label) }, onClick = { selected = cat; expanded = false })
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Optional details") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            TextButton(onClick = { onSubmit(selected, description.ifBlank { null }) }) { Text("Submit report") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun BlockConfirmDialog(onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Block this person?") },
        text = { Text("You won't be matched with them again.") },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Block") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
