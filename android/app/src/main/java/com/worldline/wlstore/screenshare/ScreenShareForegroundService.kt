package com.worldline.wlstore.screenshare

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.google.gson.Gson
import com.google.gson.JsonObject
import com.worldline.wlstore.BuildConfig
import com.worldline.wlstore.R
import com.worldline.wlstore.data.api.ApiClient
import com.worldline.wlstore.data.model.CompleteCommandRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

/**
 * Foreground service that captures the device screen (MediaProjection) and
 * publishes it as a WebRTC video track to the admin portal for exactly one
 * ScreenShareSession at a time. Also exposes an RTCDataChannel ("control")
 * the admin sends tap/swipe gestures over, dispatched via
 * [RemoteControlAccessibilityService].
 *
 * Only ever started via [start], after [ScreenShareConsentActivity] has
 * obtained the one-time MediaProjection consent.
 */
class ScreenShareForegroundService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private val gson = Gson()

    private var mediaProjection: MediaProjection? = null
    private var eglBase: EglBase? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var videoCapturer: VideoCapturer? = null
    private var videoSource: VideoSource? = null
    private var videoTrack: VideoTrack? = null
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var dataChannel: DataChannel? = null
    private var signalingClient: SignalingClient? = null
    private var commandId: String? = null

    override fun onCreate() {
        super.onCreate()
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(applicationContext)
                .setEnableInternalTracer(false)
                .createInitializationOptions()
        )
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val sessionId = intent?.getStringExtra(EXTRA_SESSION_ID)
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        @Suppress("DEPRECATION")
        val resultData = intent?.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
        commandId = intent?.getStringExtra(EXTRA_COMMAND_ID)

        if (sessionId == null || resultData == null || resultCode != Activity.RESULT_OK) {
            Log.w(TAG, "Missing session/consent data — stopping")
            reportCommandOutcome("FAILED", "MediaProjection consent was not granted")
            stopSelf()
            return START_NOT_STICKY
        }

        startForegroundNotification()
        startSharing(sessionId, resultCode, resultData)
        return START_NOT_STICKY
    }

    private fun startForegroundNotification() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(CHANNEL_ID, "Screen Sharing", NotificationManager.IMPORTANCE_LOW)
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Screen sharing active")
            .setContentText("An admin is viewing this terminal's screen")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(
                this, NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startSharing(sessionId: String, resultCode: Int, resultData: Intent) {
        val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val projection = projectionManager.getMediaProjection(resultCode, resultData)
        mediaProjection = projection
        projection.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                Log.i(TAG, "MediaProjection stopped")
                stopSelf()
            }
        }, null)

        val egl = EglBase.create()
        eglBase = egl

        val factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(egl.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(egl.eglBaseContext))
            .createPeerConnectionFactory()
        peerConnectionFactory = factory

        val source = factory.createVideoSource(true)
        videoSource = source

        val capturer = ScreenCapturerAndroid(resultData, object : MediaProjection.Callback() {
            override fun onStop() {
                Log.i(TAG, "Screen capture stopped")
            }
        })
        videoCapturer = capturer

        val helper = SurfaceTextureHelper.create("WLScreenCaptureThread", egl.eglBaseContext)
        surfaceTextureHelper = helper
        capturer.initialize(helper, applicationContext, source.capturerObserver)

        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        (getSystemService(WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(metrics)
        capturer.startCapture(metrics.widthPixels, metrics.heightPixels, SCREEN_FPS)

        val track = factory.createVideoTrack("wl_screen0", source)
        videoTrack = track

        serviceScope.launch {
            val iceServers = fetchIceServers()
            setupPeerConnection(factory, track, iceServers, sessionId)
        }
    }

    private suspend fun fetchIceServers(): List<PeerConnection.IceServer> {
        return try {
            val response = ApiClient.service.getScreenShareIceServers()
            val dtos = response.body()?.iceServers.orEmpty()
            dtos.map { dto ->
                val builder = PeerConnection.IceServer.builder(dto.urls)
                dto.username?.let { builder.setUsername(it) }
                dto.credential?.let { builder.setPassword(it) }
                builder.createIceServer()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to fetch ICE servers, falling back to public STUN only: ${e.message}")
            listOf(PeerConnection.IceServer.builder(listOf("stun:stun.l.google.com:19302")).createIceServer())
        }
    }

    private fun setupPeerConnection(
        factory: PeerConnectionFactory,
        track: VideoTrack,
        iceServers: List<PeerConnection.IceServer>,
        sessionId: String,
    ) {
        val client = SignalingClient(buildSignalingUrl(sessionId), object : SignalingClient.Listener {
            override fun onOpen() {
                Log.i(TAG, "Signaling connected")
            }

            override fun onPeerJoined() {
                createOffer()
            }

            override fun onPeerLeft() {
                stopSelf()
            }

            override fun onAnswer(sdp: String) {
                peerConnection?.setRemoteDescription(
                    NoopSdpObserver(),
                    SessionDescription(SessionDescription.Type.ANSWER, sdp)
                )
            }

            override fun onIceCandidate(sdpMid: String?, sdpMLineIndex: Int, candidate: String) {
                peerConnection?.addIceCandidate(IceCandidate(sdpMid ?: "", sdpMLineIndex, candidate))
            }

            override fun onClosed() {}

            override fun onFailure(message: String) {
                Log.w(TAG, "Signaling failure: $message")
                reportCommandOutcome("FAILED", message)
                stopSelf()
            }
        })
        signalingClient = client

        val rtcConfig = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        val pc = factory.createPeerConnection(rtcConfig, object : PeerConnection.Observer {
            override fun onIceCandidate(candidate: IceCandidate) {
                client.sendIceCandidate(candidate.sdpMid, candidate.sdpMLineIndex, candidate.sdp)
            }

            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
            override fun onSignalingChange(newState: PeerConnection.SignalingState?) {}
            override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState?) {}
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState?) {}
            override fun onAddStream(stream: MediaStream?) {}
            override fun onRemoveStream(stream: MediaStream?) {}
            override fun onDataChannel(channel: DataChannel?) {}
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver?, mediaStreams: Array<out MediaStream>?) {}

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState?) {
                Log.i(TAG, "Peer connection state: $newState")
                when (newState) {
                    PeerConnection.PeerConnectionState.CONNECTED -> reportCommandOutcome("COMPLETED")
                    PeerConnection.PeerConnectionState.FAILED -> {
                        reportCommandOutcome("FAILED", "WebRTC connection failed")
                        stopSelf()
                    }
                    else -> {}
                }
            }
        })
        peerConnection = pc

        pc?.addTrack(track, listOf("wl_screen_stream"))

        val dc = pc?.createDataChannel("control", DataChannel.Init())
        dataChannel = dc
        dc?.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) {}
            override fun onStateChange() {}
            override fun onMessage(buffer: DataChannel.Buffer?) {
                buffer ?: return
                val bytes = ByteArray(buffer.data.remaining())
                buffer.data.get(bytes)
                handleControlMessage(String(bytes, Charsets.UTF_8))
            }
        })

        client.connect()
    }

    private fun createOffer() {
        val pc = peerConnection ?: return
        pc.createOffer(object : SdpObserver {
            override fun onCreateSuccess(desc: SessionDescription?) {
                desc ?: return
                pc.setLocalDescription(NoopSdpObserver(), desc)
                signalingClient?.sendOffer(desc.description)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(error: String?) {
                Log.w(TAG, "createOffer failed: $error")
            }

            override fun onSetFailure(error: String?) {}
        }, MediaConstraints())
    }

    private fun handleControlMessage(json: String) {
        val obj = try {
            gson.fromJson(json, JsonObject::class.java)
        } catch (e: Exception) {
            return
        }
        val service = RemoteControlAccessibilityService.instance
        if (service == null) {
            Log.w(TAG, "Remote control requested but the Accessibility Service isn't enabled on this device")
            return
        }
        when (obj.get("type")?.asString) {
            "tap" -> service.performTap(
                obj.get("x")?.asFloat ?: return,
                obj.get("y")?.asFloat ?: return,
            )
            "swipe" -> service.performSwipe(
                obj.get("x1")?.asFloat ?: return,
                obj.get("y1")?.asFloat ?: return,
                obj.get("x2")?.asFloat ?: return,
                obj.get("y2")?.asFloat ?: return,
                obj.get("durationMs")?.asLong ?: 200L,
            )
        }
    }

    private fun reportCommandOutcome(status: String, errorMessage: String? = null) {
        val id = commandId ?: return
        serviceScope.launch {
            try {
                ApiClient.service.completeCommand(id, CompleteCommandRequest(status, errorMessage))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to report screen-share command outcome: ${e.message}")
            }
        }
    }

    private fun buildSignalingUrl(sessionId: String): String {
        val httpBase = BuildConfig.API_BASE_URL.removeSuffix("/api").removeSuffix("/")
        val wsBase = httpBase.replaceFirst("http", "ws")
        val apiKey = ApiClient.getApiKey()
        return "$wsBase/ws/signaling?role=device&sessionId=$sessionId&apiKey=$apiKey"
    }

    private fun teardown() {
        videoCapturer?.stopCapture()
        videoCapturer?.dispose()
        videoSource?.dispose()
        surfaceTextureHelper?.dispose()
        dataChannel?.close()
        peerConnection?.close()
        peerConnectionFactory?.dispose()
        eglBase?.release()
        signalingClient?.close()
        mediaProjection?.stop()
    }

    override fun onDestroy() {
        teardown()
        serviceScope.cancel()
        super.onDestroy()
    }

    /** No-op [SdpObserver] for fire-and-forget setLocalDescription/setRemoteDescription calls. */
    private class NoopSdpObserver : SdpObserver {
        override fun onCreateSuccess(p0: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(p0: String?) {}
        override fun onSetFailure(p0: String?) {
            Log.w(TAG, "setDescription failed: $p0")
        }
    }

    companion object {
        private const val TAG = "WLStore-ScreenShare"
        private const val CHANNEL_ID = "screen_share"
        private const val NOTIFICATION_ID = 4821
        private const val SCREEN_FPS = 12

        const val EXTRA_SESSION_ID = "session_id"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val EXTRA_COMMAND_ID = "command_id"

        fun start(context: Context, sessionId: String, resultCode: Int, resultData: Intent, commandId: String?) {
            val intent = Intent(context, ScreenShareForegroundService::class.java).apply {
                putExtra(EXTRA_SESSION_ID, sessionId)
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, resultData)
                putExtra(EXTRA_COMMAND_ID, commandId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ScreenShareForegroundService::class.java))
        }
    }
}
