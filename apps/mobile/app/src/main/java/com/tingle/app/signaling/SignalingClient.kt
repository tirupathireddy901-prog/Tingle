package com.tingle.app.signaling

import com.tingle.app.BuildConfig
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

sealed class ConnectionEvent {
    object Open : ConnectionEvent()
    data class Message(val signal: IncomingSignal) : ConnectionEvent()
    data class Closed(val code: Int, val reason: String) : ConnectionEvent()
    data class Failed(val throwable: Throwable) : ConnectionEvent()
}

/**
 * Thin wrapper around an OkHttp WebSocket connected to /ws/signal. One
 * instance per active session — connect() when entering the call flow
 * (Home screen onward), disconnect() when leaving it. The server enforces
 * everything security-relevant (see services/api/src/ws/signaling.ts):
 * this client just sends/receives — it never trusts its own local state
 * over what the server tells it (e.g. match_found's matchId is the only
 * matchId ever used for subsequent signaling on that call).
 */
class SignalingClient(private val accessToken: String) {
    private val client = OkHttpClient()
    private var socket: WebSocket? = null

    fun events(): Flow<ConnectionEvent> = callbackFlow {
        val request = Request.Builder()
            .url("${BuildConfig.WS_BASE_URL}/ws/signal?token=$accessToken")
            .build()

        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                trySend(ConnectionEvent.Open)
            }
            override fun onMessage(webSocket: WebSocket, text: String) {
                trySend(ConnectionEvent.Message(IncomingSignal.parse(text)))
            }
            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                trySend(ConnectionEvent.Closed(code, reason))
                close()
            }
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                trySend(ConnectionEvent.Failed(t))
                close()
            }
        }

        socket = client.newWebSocket(request, listener)
        awaitClose { socket?.close(1000, "Client closed"); socket = null }
    }

    fun send(signal: OutgoingSignal) {
        socket?.send(signal.toJson())
    }

    fun disconnect() {
        socket?.close(1000, "Client closed")
        socket = null
    }
}
