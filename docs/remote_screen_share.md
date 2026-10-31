# Remote Screen Share (AnyDesk-style) — Release Notes

## Summary

Adds live, interactive remote screen sharing: an admin can open a terminal's
**Remote Screen** page in the admin portal and see a real-time video feed of
that Android device's screen, plus send tap/swipe gestures back to it — similar
to AnyDesk/TeamViewer, built on WebRTC instead of a third-party remote-desktop
service.

This is **not** periodic screenshot polling. Video is a continuous
peer-to-peer WebRTC stream (device → admin browser), and control is a
peer-to-peer WebRTC data channel (admin → device). The backend only ever
relays the initial signaling handshake (SDP offer/answer + ICE candidates);
once connected, video and control traffic flow directly between the admin's
browser and the device (optionally via the TURN relay if a direct/NAT-punched
path isn't possible).

## Architecture

```
Admin Portal (browser)                Backend                      Android Terminal
──────────────────────               ─────────                    ──────────────────
1. POST /terminals/:id/screen-share/sessions
                                 → creates ScreenShareSession (PENDING)
                                 → queues DeviceCommand(START_SCREEN_SHARE, {sessionId})
                                                                   2. picks up command
                                                                      (foreground poll or
                                                                      15-min WorkManager)
                                                                   3. ScreenShareConsentActivity
                                                                      shows MediaProjection
                                                                      "Start now" dialog
                                                                      (needs a physical tap)
4. opens WebSocket to              5. relays {offer, answer,       6. opens WebSocket to
   /ws/signaling?role=admin           ice-candidate, bye}             /ws/signaling?role=device
   &sessionId=...                     between the admin+device        &sessionId=...&apiKey=...
                                       sockets for this session
                                       only
7. RTCPeerConnection:       ←──────── WebRTC media (P2P, via STUN/TURN) ────────→  8. ScreenCapturerAndroid
   renders video,                                                                    + PeerConnectionFactory
   sends tap/swipe over                                                              publish video track +
   "control" data channel                                                            "control" data channel
                                                                                    9. RemoteControlAccessibilityService
                                                                                       dispatches received
                                                                                       tap/swipe gestures
```

## What's New

- **Backend**
  - `ScreenShareSession` model + `ScreenShareStatus` enum (`PENDING` →
    `ACTIVE` → `ENDED`), `DeviceCommandType.START_SCREEN_SHARE` /
    `STOP_SCREEN_SHARE` (migration `20261031000000_add_screen_share_sessions`).
  - `services/turn.ts` — generates ephemeral STUN+TURN ICE server credentials
    (TURN REST API convention: HMAC-SHA1 time-limited username/credential).
  - `services/signaling.ts` — WebSocket relay at `/ws/signaling`, pairs exactly
    one admin + one device connection per `sessionId`; only forwards
    `offer`/`answer`/`ice-candidate`/`bye` messages, never inspects media.
  - `routes/screen-share.ts` (admin-facing, JWT-protected) and
    `routes/screen-share-device.ts` (terminal-facing, API-key-protected).
- **Infrastructure**
  - New `coturn` Docker service (STUN/TURN), with its own public port
    exposure (`3478/udp+tcp`, relay range `49160-49200/udp`) — **not**
    proxied through nginx, since TURN needs direct UDP reachability.
  - nginx configs updated with `/ws/signaling` WebSocket passthrough
    (`Upgrade`/`Connection` headers, long `proxy_read_timeout`).
- **Admin portal**
  - New **Remote Screen** page (`/terminals/:id/screen`), linked from a new
    button on the Terminals page. Handles the full WebRTC viewer lifecycle:
    connect → render video → send tap/swipe on pointer events → stop/cleanup.
- **Android**
  - New `com.worldline.wlstore.screenshare` package:
    - `ScreenShareConsentActivity` — invisible activity that triggers the
      MediaProjection consent dialog.
    - `ScreenShareForegroundService` — captures the screen
      (`ScreenCapturerAndroid`), builds the `RTCPeerConnection`, publishes the
      video track, opens the `control` data channel, drives the signaling
      WebSocket.
    - `SignalingClient` — thin OkHttp WebSocket wrapper for the signaling
      protocol above.
    - `RemoteControlAccessibilityService` — dispatches tap/swipe gestures
      received over the `control` data channel via
      `AccessibilityService.dispatchGesture()`.
  - `RemoteCommandExecutor` now handles `START_SCREEN_SHARE` (launches the
    consent activity) and `STOP_SCREEN_SHARE` (stops the foreground service).
  - WebRTC via `io.getstream:stream-webrtc-android:1.3.8` (the maintained
    Maven Central republish of Google's prebuilt libwebrtc AAR — the original
    `org.webrtc:google-webrtc` artifact was pulled from JCenter).

## Two Separate Consent/Setup Requirements

These are independent and often confused — screen *viewing* works without
remote *control* being set up at all:

### 1. MediaProjection consent (screen viewing) — required every session

Android requires a user to physically tap **"Start now"** on a system dialog
to begin screen capture, every single time a new capture session starts. This
**cannot be silently bypassed**, even by a Device Owner app — there is no
such API. On an unattended kiosk terminal, this means someone must be
physically present (or use an accessibility/input-injection workaround
outside the scope of this feature) to approve each screen-share session.

### 2. Accessibility Service (remote control) — one-time per device

Sending tap/swipe gestures requires `RemoteControlAccessibilityService` to be
enabled once, under **Settings → Accessibility → WL BizStore Remote
Control**. Unlike MediaProjection, this grant persists silently afterward —
no repeated prompts. If it's not enabled, screen sharing still works in
**view-only** mode; the Android service just logs a warning and drops
incoming control messages.

## Production Configuration: TURN Secret

Set these environment variables on the backend in production (see
`docker-compose.prod.yml`):

| Variable | Purpose |
|---|---|
| `TURN_SECRET` | Shared HMAC secret for ephemeral TURN credentials. **Must** match the `coturn` container's `--static-auth-secret`. Generate with e.g. `openssl rand -hex 32`. |
| `TURN_HOST` | Public hostname/IP clients use to reach the TURN server (e.g. `appstore.vijayanandpremnath.cloud`). |
| `TURN_PORT` | TURN port, default `3478`. |
| `TURN_CREDENTIAL_TTL_SECONDS` | How long each generated TURN credential is valid, default `3600`. |

Without `TURN_SECRET`/`TURN_HOST` set, `getIceServers()` falls back to
STUN-only, which works for most direct/NAT-friendly connections but will fail
behind symmetric NAT or restrictive firewalls — TURN is the fallback relay
for those cases.

## Known Limitations / Follow-ups

- Android screen-share code has been verified with a full `gradlew
  assembleDebug` compile, but has **not** been tested on a physical device —
  MediaProjection and Accessibility gestures are difficult to verify on an
  emulator. Test on a real device before relying on this in production.
- No session recording/audit trail of what an admin did during a control
  session beyond the `ScreenShareSession` start/end timestamps.
- Only one admin can view a given terminal's screen at a time (one session
  per `sessionId`, by design).
