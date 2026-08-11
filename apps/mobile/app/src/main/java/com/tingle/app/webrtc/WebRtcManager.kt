package com.tingle.app.webrtc

import android.content.Context
import com.tingle.app.data.models.IceServer
import org.json.JSONObject
import org.webrtc.*

enum class PeerConnectionUiState { NEW, CONNECTING, CONNECTED, RECONNECTING, FAILED, DISCONNECTED, CLOSED }

/**
 * Wraps a single call's RTCPeerConnection. One instance per call — create
 * fresh for each match, tear down on end_call/next/disconnect. Mirrors
 * the same offer/answer/ICE flow as apps/web/src/lib/CallContext.tsx:
 * whichever participant has the lexicographically lower user id creates
 * the offer, so both peers agree on a single initiator without a
 * separate negotiation round-trip.
 */
class WebRtcManager(
    context: Context,
    iceServers: List<IceServer>,
    private val videoEnabled: Boolean,
    private val onLocalIceCandidate: (JSONObject) -> Unit,
    private val onRemoteTrack: (isVideo: Boolean) -> Unit,
    private val onLocalTrack: (isVideo: Boolean) -> Unit,
    private val onStateChange: (PeerConnectionUiState) -> Unit,
) {
    private val eglBase: EglBase = EglBase.create()
    val eglBaseContext: EglBase.Context get() = eglBase.eglBaseContext

    private val factory: PeerConnectionFactory
    private var peerConnection: PeerConnection? = null
    private var localVideoTrack: VideoTrack? = null
    private var localAudioTrack: AudioTrack? = null
    private var videoCapturer: CameraVideoCapturer? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null

    var remoteVideoTrack: VideoTrack? = null
        private set

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        )
        val encoderFactory = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()

        val rtcIceServers = iceServers.map { s ->
            val builder = PeerConnection.IceServer.builder(s.urlList())
            s.username?.let { builder.setUsername(it) }
            s.credential?.let { builder.setPassword(it) }
            builder.createIceServer()
        }

        val rtcConfig = PeerConnection.RTCConfiguration(rtcIceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = factory.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                onLocalIceCandidate(
                    JSONObject()
                        .put("candidate", candidate.sdp)
                        .put("sdpMid", candidate.sdpMid)
                        .put("sdpMLineIndex", candidate.sdpMLineIndex)
                )
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                onStateChange(
                    when (newState) {
                        PeerConnection.PeerConnectionState.NEW -> PeerConnectionUiState.NEW
                        PeerConnection.PeerConnectionState.CONNECTING -> PeerConnectionUiState.CONNECTING
                        PeerConnection.PeerConnectionState.CONNECTED -> PeerConnectionUiState.CONNECTED
                        PeerConnection.PeerConnectionState.DISCONNECTED -> PeerConnectionUiState.RECONNECTING
                        PeerConnection.PeerConnectionState.FAILED -> PeerConnectionUiState.FAILED
                        PeerConnection.PeerConnectionState.CLOSED -> PeerConnectionUiState.CLOSED
                    }
                )
            }

            override fun onTrack(transceiver: RtpTransceiver) {
                val track = transceiver.receiver.track()
                when (track) {
                    is VideoTrack -> {
                        remoteVideoTrack = track
                        onRemoteTrack(true)
                    }
                    is AudioTrack -> onRemoteTrack(false)
                }
            }

            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                // ICE restart is triggered explicitly by the caller (see
                // restartIce()) on FAILED rather than here, so a single
                // transient blip doesn't retrigger renegotiation storms.
            }

            // Unused observer callbacks required by the interface.
            override fun onSignalingChange(p0: PeerConnection.SignalingState) {}
            override fun onIceConnectionReceivingChange(p0: Boolean) {}
            override fun onIceGatheringChange(p0: PeerConnection.IceGatheringState) {}
            override fun onIceCandidatesRemoved(p0: Array<out IceCandidate>) {}
            override fun onAddStream(p0: MediaStream) {}
            override fun onRemoveStream(p0: MediaStream) {}
            override fun onDataChannel(p0: DataChannel) {}
            override fun onRenegotiationNeeded() {}
        })

        setupLocalMedia(context)
    }

    private fun setupLocalMedia(context: Context) {
        val audioSource = factory.createAudioSource(MediaConstraints())
        localAudioTrack = factory.createAudioTrack("audio0", audioSource)
        peerConnection?.addTrack(localAudioTrack)
        onLocalTrack(false)

        if (videoEnabled) {
            val capturer = createCameraCapturer(context) ?: return
            videoCapturer = capturer
            surfaceTextureHelper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
            val videoSource = factory.createVideoSource(capturer.isScreencast)
            capturer.initialize(surfaceTextureHelper, context, videoSource.capturerObserver)
            capturer.startCapture(1280, 720, 30)
            localVideoTrack = factory.createVideoTrack("video0", videoSource)
            peerConnection?.addTrack(localVideoTrack)
            onLocalTrack(true)
        }
    }

    private fun createCameraCapturer(context: Context): CameraVideoCapturer? {
        val enumerator = Camera2Enumerator(context)
        // Prefer front-facing for a "you're on a call" default, matching
        // the web app's default getUserMedia({ video: { facingMode: 'user' } }).
        val deviceNames = enumerator.deviceNames
        val front = deviceNames.firstOrNull { enumerator.isFrontFacing(it) }
        val target = front ?: deviceNames.firstOrNull() ?: return null
        return enumerator.createCapturer(target, null)
    }

    fun getLocalVideoTrack(): VideoTrack? = localVideoTrack

    /** true if we should be the one to send the initial offer for this match. */
    fun isOfferInitiator(selfUserId: String, peerUserId: String): Boolean = selfUserId < peerUserId

    fun createOffer(onSdp: (String) -> Unit) {
        val constraints = MediaConstraints()
        peerConnection?.createOffer(object : SdpObserverAdapter() {
            override fun onCreateSuccess(desc: SessionDescription) {
                peerConnection?.setLocalDescription(SdpObserverAdapter(), desc)
                onSdp(desc.description)
            }
        }, constraints)
    }

    fun handleRemoteOffer(sdp: String, onAnswerSdp: (String) -> Unit) {
        peerConnection?.setRemoteDescription(
            SdpObserverAdapter(),
            SessionDescription(SessionDescription.Type.OFFER, sdp)
        )
        peerConnection?.createAnswer(object : SdpObserverAdapter() {
            override fun onCreateSuccess(desc: SessionDescription) {
                peerConnection?.setLocalDescription(SdpObserverAdapter(), desc)
                onAnswerSdp(desc.description)
            }
        }, MediaConstraints())
    }

    fun handleRemoteAnswer(sdp: String) {
        peerConnection?.setRemoteDescription(
            SdpObserverAdapter(),
            SessionDescription(SessionDescription.Type.ANSWER, sdp)
        )
    }

    fun addRemoteIceCandidate(json: JSONObject) {
        peerConnection?.addIceCandidate(
            IceCandidate(json.optString("sdpMid"), json.optInt("sdpMLineIndex"), json.getString("candidate"))
        )
    }

    /**
     * Spec section 24/25: recover from a network blip rather than dropping
     * the call. Renegotiates with the IceRestart flag set and hands the
     * resulting offer SDP to the caller, which sends it over signaling
     * exactly like the initial offer (the peer's handleRemoteOffer path
     * handles a mid-call renegotiation offer the same way as the first one).
     */
    fun restartIce(onSdp: (String) -> Unit) {
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("IceRestart", "true"))
        }
        peerConnection?.createOffer(object : SdpObserverAdapter() {
            override fun onCreateSuccess(desc: SessionDescription) {
                peerConnection?.setLocalDescription(SdpObserverAdapter(), desc)
                onSdp(desc.description)
            }
        }, constraints)
    }

    fun setMicEnabled(enabled: Boolean) {
        localAudioTrack?.setEnabled(enabled)
    }

    fun setCameraEnabled(enabled: Boolean) {
        localVideoTrack?.setEnabled(enabled)
    }

    fun switchCamera() {
        videoCapturer?.switchCamera(null)
    }

    fun close() {
        videoCapturer?.stopCapture()
        videoCapturer?.dispose()
        surfaceTextureHelper?.dispose()
        localVideoTrack?.dispose()
        localAudioTrack?.dispose()
        peerConnection?.close()
        peerConnection?.dispose()
        factory.dispose()
        eglBase.release()
    }
}

private open class SdpObserverAdapter : SdpObserver {
    override fun onCreateSuccess(p0: SessionDescription) {}
    override fun onSetSuccess() {}
    override fun onCreateFailure(p0: String?) {}
    override fun onSetFailure(p0: String?) {}
}
