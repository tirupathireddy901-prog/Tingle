package com.tingle.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tingle.app.data.AuthRepository
import com.tingle.app.data.ApiResult
import com.tingle.app.signaling.*
import com.tingle.app.webrtc.PeerConnectionUiState
import com.tingle.app.webrtc.WebRtcManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.webrtc.VideoTrack

enum class CallScreenState {
    IDLE, SEARCHING, CONNECTING, CONNECTED, POOR_CONNECTION,
    RECONNECTING, REMOTE_DISCONNECTED, ENDED, FAILED,
}

data class CallUiState(
    val screenState: CallScreenState = CallScreenState.IDLE,
    val mode: CallMode? = null,
    val matchId: String? = null,
    val callSessionId: String? = null,
    val peerId: String? = null,
    val micEnabled: Boolean = true,
    val cameraEnabled: Boolean = true,
    val callDurationSeconds: Int = 0,
    val remoteVideoTrack: VideoTrack? = null,
    val localVideoTrack: VideoTrack? = null,
)

class CallViewModel(
    application: Application,
    private val authRepository: AuthRepository,
    private val selfUserId: String,
    private val accessToken: String,
) : AndroidViewModel(application) {

    private val _uiState = MutableStateFlow(CallUiState())
    val uiState: StateFlow<CallUiState> = _uiState.asStateFlow()

    private var signalingClient: SignalingClient? = null
    private var webRtcManager: WebRtcManager? = null
    private var durationTimerJob: kotlinx.coroutines.Job? = null

    fun connectSignaling(initialMode: CallMode) {
        val client = SignalingClient(accessToken)
        signalingClient = client
        viewModelScope.launch {
            client.events().collect { event ->
                when (event) {
                    is ConnectionEvent.Open -> startSearching(initialMode)
                    is ConnectionEvent.Message -> handleSignal(event.signal)
                    is ConnectionEvent.Closed, is ConnectionEvent.Failed -> {
                        if (_uiState.value.screenState in
                            setOf(CallScreenState.CONNECTING, CallScreenState.CONNECTED, CallScreenState.POOR_CONNECTION)
                        ) {
                            _uiState.value = _uiState.value.copy(screenState = CallScreenState.REMOTE_DISCONNECTED)
                        }
                    }
                }
            }
        }
    }

    fun startSearching(mode: CallMode) {
        _uiState.value = _uiState.value.copy(screenState = CallScreenState.SEARCHING, mode = mode)
        signalingClient?.send(OutgoingSignal.JoinQueue(mode))
    }

    fun cancelSearching() {
        signalingClient?.send(OutgoingSignal.CancelQueue)
        _uiState.value = _uiState.value.copy(screenState = CallScreenState.IDLE)
    }

    fun nextUser() {
        teardownPeerConnection()
        signalingClient?.send(OutgoingSignal.Next)
        _uiState.value = _uiState.value.copy(screenState = CallScreenState.SEARCHING)
    }

    fun endCall() {
        val matchId = _uiState.value.matchId ?: return
        signalingClient?.send(OutgoingSignal.EndCall(matchId))
        teardownPeerConnection()
        _uiState.value = _uiState.value.copy(screenState = CallScreenState.ENDED)
    }

    fun toggleMic() {
        val enabled = !_uiState.value.micEnabled
        webRtcManager?.setMicEnabled(enabled)
        _uiState.value = _uiState.value.copy(micEnabled = enabled)
    }

    fun toggleCamera() {
        val enabled = !_uiState.value.cameraEnabled
        webRtcManager?.setCameraEnabled(enabled)
        _uiState.value = _uiState.value.copy(cameraEnabled = enabled)
    }

    fun switchCamera() {
        webRtcManager?.switchCamera()
    }

    val eglBaseContext: org.webrtc.EglBase.Context?
        get() = webRtcManager?.eglBaseContext

    suspend fun reportPeer(category: com.tingle.app.data.models.ReportCategory, description: String?): ApiResult<com.tingle.app.data.models.ReportResponse>? {
        val peerId = _uiState.value.peerId ?: return null
        return authRepository.reportUser(peerId, category, _uiState.value.callSessionId, description)
    }

    suspend fun blockPeer(): ApiResult<com.tingle.app.data.models.MessageResponse>? {
        val peerId = _uiState.value.peerId ?: return null
        return authRepository.blockUser(peerId)
    }

    /** Fire-and-forget wrappers for UI call sites that don't need the result. */
    fun reportPeerAsync(category: com.tingle.app.data.models.ReportCategory, description: String?) {
        viewModelScope.launch { reportPeer(category, description) }
    }

    fun blockPeerAndEndCall() {
        viewModelScope.launch { blockPeer() }
        endCall()
    }

    private suspend fun handleSignal(signal: IncomingSignal) {
        when (signal) {
            is IncomingSignal.MatchFound -> {
                _uiState.value = _uiState.value.copy(
                    screenState = CallScreenState.CONNECTING,
                    matchId = signal.matchId,
                    callSessionId = signal.callSessionId,
                    mode = signal.mode,
                    peerId = signal.peerId,
                )
                setupPeerConnection(signal.mode, signal.peerId, signal.matchId)
            }
            is IncomingSignal.WebRtcOffer -> {
                if (signal.matchId != _uiState.value.matchId) return // not our call — ignore
                webRtcManager?.handleRemoteOffer(signal.sdp) { answerSdp ->
                    signalingClient?.send(OutgoingSignal.WebRtcAnswer(signal.matchId, answerSdp))
                }
            }
            is IncomingSignal.WebRtcAnswer -> {
                if (signal.matchId != _uiState.value.matchId) return
                webRtcManager?.handleRemoteAnswer(signal.sdp)
            }
            is IncomingSignal.IceCandidate -> {
                if (signal.matchId != _uiState.value.matchId) return
                webRtcManager?.addRemoteIceCandidate(signal.candidateJson)
            }
            is IncomingSignal.CallEnded -> {
                if (signal.matchId != _uiState.value.matchId) return
                teardownPeerConnection()
                _uiState.value = _uiState.value.copy(screenState = CallScreenState.ENDED)
            }
            IncomingSignal.QueueStatusSearching, is IncomingSignal.Unknown -> {}
        }
    }

    private suspend fun setupPeerConnection(mode: CallMode, peerId: String, matchId: String) {
        val iceResult = authRepository.iceServers()
        val iceServers = (iceResult as? ApiResult.Success)?.value?.iceServers ?: emptyList()

        val manager = WebRtcManager(
            context = getApplication(),
            iceServers = iceServers,
            videoEnabled = mode == CallMode.VIDEO,
            onLocalIceCandidate = { candidateJson ->
                signalingClient?.send(OutgoingSignal.IceCandidate(matchId, candidateJson))
            },
            onRemoteTrack = { isVideo ->
                if (isVideo) {
                    _uiState.value = _uiState.value.copy(remoteVideoTrack = webRtcManager?.remoteVideoTrack)
                }
            },
            onLocalTrack = { isVideo ->
                if (isVideo) {
                    _uiState.value = _uiState.value.copy(localVideoTrack = webRtcManager?.getLocalVideoTrack())
                }
            },
            onStateChange = { state -> onPeerConnectionStateChange(state, matchId) },
        )
        webRtcManager = manager

        // Deterministic initiator (see CallContext.tsx / WebRtcManager kdoc):
        // whichever side has the lexicographically lower user id offers.
        if (manager.isOfferInitiator(selfUserId, peerId)) {
            manager.createOffer { sdp -> signalingClient?.send(OutgoingSignal.WebRtcOffer(matchId, sdp)) }
        }
    }

    private fun onPeerConnectionStateChange(state: PeerConnectionUiState, matchId: String) {
        if (_uiState.value.matchId != matchId) return
        when (state) {
            PeerConnectionUiState.CONNECTED -> {
                _uiState.value = _uiState.value.copy(screenState = CallScreenState.CONNECTED)
                startDurationTimer()
                com.tingle.app.call.CallForegroundService.start(getApplication())
            }
            PeerConnectionUiState.RECONNECTING -> {
                _uiState.value = _uiState.value.copy(screenState = CallScreenState.RECONNECTING)
            }
            PeerConnectionUiState.FAILED -> {
                // Try one ICE restart before giving up on the call entirely
                // (spec section 24/25).
                webRtcManager?.restartIce { sdp ->
                    signalingClient?.send(OutgoingSignal.WebRtcOffer(matchId, sdp))
                }
            }
            PeerConnectionUiState.CLOSED, PeerConnectionUiState.DISCONNECTED -> {}
            PeerConnectionUiState.NEW, PeerConnectionUiState.CONNECTING -> {}
        }
    }

    private fun startDurationTimer() {
        durationTimerJob?.cancel()
        durationTimerJob = viewModelScope.launch {
            while (true) {
                kotlinx.coroutines.delay(1000)
                _uiState.value = _uiState.value.copy(callDurationSeconds = _uiState.value.callDurationSeconds + 1)
            }
        }
    }

    private fun teardownPeerConnection() {
        durationTimerJob?.cancel()
        webRtcManager?.close()
        webRtcManager = null
        com.tingle.app.call.CallForegroundService.stop(getApplication())
        _uiState.value = _uiState.value.copy(
            remoteVideoTrack = null,
            localVideoTrack = null,
            callDurationSeconds = 0,
        )
    }

    override fun onCleared() {
        teardownPeerConnection()
        signalingClient?.disconnect()
        super.onCleared()
    }

    class Factory(
        private val application: Application,
        private val authRepository: AuthRepository,
        private val selfUserId: String,
        private val accessToken: String,
    ) : androidx.lifecycle.ViewModelProvider.Factory {
        override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T {
            @Suppress("UNCHECKED_CAST")
            return CallViewModel(application, authRepository, selfUserId, accessToken) as T
        }
    }
}
