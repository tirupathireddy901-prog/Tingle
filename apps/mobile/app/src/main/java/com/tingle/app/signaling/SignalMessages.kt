package com.tingle.app.signaling

import org.json.JSONObject

enum class CallMode(val value: String) { VIDEO("video"), VOICE("voice"), BOTH("both") }

/** Outgoing — mirrors packages/types ClientToServerSignal exactly. */
sealed class OutgoingSignal {
    abstract fun toJson(): String

    data class JoinQueue(val mode: CallMode) : OutgoingSignal() {
        override fun toJson() = JSONObject().put("type", "join_queue").put("mode", mode.value).toString()
    }
    object CancelQueue : OutgoingSignal() {
        override fun toJson() = JSONObject().put("type", "cancel_queue").toString()
    }
    data class WebRtcOffer(val matchId: String, val sdp: String) : OutgoingSignal() {
        override fun toJson() =
            JSONObject().put("type", "webrtc_offer").put("matchId", matchId).put("sdp", sdp).toString()
    }
    data class WebRtcAnswer(val matchId: String, val sdp: String) : OutgoingSignal() {
        override fun toJson() =
            JSONObject().put("type", "webrtc_answer").put("matchId", matchId).put("sdp", sdp).toString()
    }
    data class IceCandidate(val matchId: String, val candidateJson: JSONObject) : OutgoingSignal() {
        override fun toJson() =
            JSONObject().put("type", "ice_candidate").put("matchId", matchId).put("candidate", candidateJson)
                .toString()
    }
    object Next : OutgoingSignal() {
        override fun toJson() = JSONObject().put("type", "next").toString()
    }
    data class EndCall(val matchId: String) : OutgoingSignal() {
        override fun toJson() = JSONObject().put("type", "end_call").put("matchId", matchId).toString()
    }
}

/** Incoming — mirrors packages/types ServerToClientSignal exactly. */
sealed class IncomingSignal {
    object QueueStatusSearching : IncomingSignal()
    data class MatchFound(val matchId: String, val callSessionId: String, val mode: CallMode, val peerId: String) :
        IncomingSignal()
    data class WebRtcOffer(val matchId: String, val sdp: String) : IncomingSignal()
    data class WebRtcAnswer(val matchId: String, val sdp: String) : IncomingSignal()
    data class IceCandidate(val matchId: String, val candidateJson: JSONObject) : IncomingSignal()
    data class CallEnded(val matchId: String, val reason: String?) : IncomingSignal()
    data class Unknown(val raw: String) : IncomingSignal()

    companion object {
        fun parse(raw: String): IncomingSignal {
            val json = JSONObject(raw)
            return when (json.optString("type")) {
                "queue_status" -> QueueStatusSearching
                "match_found" -> MatchFound(
                    matchId = json.getString("matchId"),
                    callSessionId = json.getString("callSessionId"),
                    mode = CallMode.entries.first { it.value == json.getString("mode") },
                    peerId = json.getString("peerId"),
                )
                "webrtc_offer" -> WebRtcOffer(json.getString("matchId"), json.getString("sdp"))
                "webrtc_answer" -> WebRtcAnswer(json.getString("matchId"), json.getString("sdp"))
                "ice_candidate" -> IceCandidate(json.getString("matchId"), json.getJSONObject("candidate"))
                "call_ended" -> CallEnded(json.getString("matchId"), json.optString("reason", null))
                else -> Unknown(raw)
            }
        }
    }
}
