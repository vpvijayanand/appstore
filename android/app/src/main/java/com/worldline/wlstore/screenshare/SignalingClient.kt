package com.worldline.wlstore.screenshare

import android.util.Log
import com.google.gson.Gson
import com.google.gson.JsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit

/**
 * Minimal WebSocket signaling client for one screen-share session. Mirrors
 * the message shapes the backend's signaling relay (services/signaling.ts)
 * expects/forwards: {type: 'offer'|'answer'|'ice-candidate'|'bye', ...}.
 * Pure transport — SDP/ICE payloads are opaque strings passed through as-is;
 * this class never inspects or validates media content.
 */
class SignalingClient(
    private val wsUrl: String,
    private val listener: Listener,
) {
    interface Listener {
        fun onOpen()
        fun onPeerJoined()
        fun onPeerLeft()
        fun onAnswer(sdp: String)
        fun onIceCandidate(sdpMid: String?, sdpMLineIndex: Int, candidate: String)
        fun onClosed()
        fun onFailure(message: String)
    }

    private val gson = Gson()
    private var webSocket: WebSocket? = null

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // keep the socket open indefinitely
        .pingInterval(25, TimeUnit.SECONDS)
        .build()

    fun connect() {
        val request = Request.Builder().url(wsUrl).build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                listener.onOpen()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleMessage(text)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                listener.onClosed()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "Signaling socket failure", t)
                listener.onFailure(t.message ?: "WebSocket failure")
            }
        })
    }

    private fun handleMessage(text: String) {
        val json = try {
            gson.fromJson(text, JsonObject::class.java)
        } catch (e: Exception) {
            return
        }
        when (json.get("type")?.asString) {
            "peer-joined" -> listener.onPeerJoined()
            "peer-left" -> listener.onPeerLeft()
            "answer" -> json.get("sdp")?.asString?.let { listener.onAnswer(it) }
            "ice-candidate" -> {
                val candidate = json.getAsJsonObject("candidate") ?: return
                val sdp = candidate.get("candidate")?.asString ?: return
                listener.onIceCandidate(
                    candidate.get("sdpMid")?.takeIf { !it.isJsonNull }?.asString,
                    candidate.get("sdpMLineIndex")?.takeIf { !it.isJsonNull }?.asInt ?: 0,
                    sdp
                )
            }
        }
    }

    fun sendOffer(sdp: String) {
        send(JsonObject().apply {
            addProperty("type", "offer")
            addProperty("sdp", sdp)
        })
    }

    fun sendIceCandidate(sdpMid: String?, sdpMLineIndex: Int, candidate: String) {
        val candidateObj = JsonObject().apply {
            addProperty("sdpMid", sdpMid)
            addProperty("sdpMLineIndex", sdpMLineIndex)
            addProperty("candidate", candidate)
        }
        send(JsonObject().apply {
            addProperty("type", "ice-candidate")
            add("candidate", candidateObj)
        })
    }

    private fun send(obj: JsonObject) {
        webSocket?.send(gson.toJson(obj))
    }

    fun close() {
        webSocket?.close(1000, "done")
        webSocket = null
    }

    companion object {
        private const val TAG = "WLStore-Signaling"
    }
}
