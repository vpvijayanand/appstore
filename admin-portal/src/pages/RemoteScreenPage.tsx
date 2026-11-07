import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  MonitorX,
  AlertTriangle,
  RotateCcw,
  Home,
  Square,
  Bell,
  Power,
  Sliders,
  Send,
  Delete,
  CornerDownLeft,
  Keyboard,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { screenShareApi, terminalsApi, BASE_URL } from '../api';

type Status =
  | 'starting'
  | 'waiting_for_device'
  | 'consent_pending'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'error';

type ControlMessage =
  | { type: 'tap'; x: number; y: number }
  | { type: 'long_press'; x: number; y: number; durationMs: number }
  | { type: 'swipe'; x1: number; y1: number; x2: number; y2: number; durationMs: number }
  | { type: 'nav'; action: 'back' | 'home' | 'recents' | 'notifications' | 'quick_settings' | 'power' }
  | { type: 'text'; text: string; append?: boolean }
  | { type: 'key'; key: 'backspace' | 'enter' | 'clear' };

const STATUS_LABEL: Record<Status, string> = {
  starting: 'Requesting remote session…',
  waiting_for_device: 'Waiting for terminal to pick up command…',
  consent_pending: 'Consent prompt active — please tap "Start now" on the terminal',
  connecting: 'Establishing peer video connection…',
  connected: 'Connected — Live Control Active',
  ended: 'Session ended',
  error: 'Session error',
};

const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_DURATION_MS = 350;
const LONG_PRESS_MS = 450;

function getSignalingWsUrl(sessionId: string, token: string): string {
  const httpBase = BASE_URL.replace(/\/api\/?$/, '');
  const wsBase = httpBase.replace(/^http/, 'ws');
  return `${wsBase}/ws/signaling?role=admin&sessionId=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(token)}`;
}

export default function RemoteScreenPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>('starting');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [terminalLabel, setTerminalLabel] = useState<string>('');
  const [controlEnabled, setControlEnabled] = useState(false);
  const [inputText, setInputText] = useState('');
  const [commandStage, setCommandStage] = useState<string>('');
  const [commandHint, setCommandHint] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const sessionRef = useRef<{ id: string } | null>(null);
  const commandIdRef = useRef<string | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; t: number; longPressTimer?: any } | null>(null);
  const endedRef = useRef(false);

  const cleanup = useCallback((markEnded: boolean) => {
    if (markEnded) endedRef.current = true;
    if (pointerDownRef.current?.longPressTimer) {
      clearTimeout(pointerDownRef.current.longPressTimer);
    }
    wsRef.current?.close();
    wsRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    dataChannelRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Poll command progress for fine-grained device stage (e.g. CONSENT_PENDING)
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const interval = setInterval(async () => {
      const cid = commandIdRef.current;
      if (!cid || status === 'connected' || status === 'ended' || status === 'error') return;
      try {
        const res = await terminalsApi.getCommand(id, cid);
        if (cancelled) return;
        const cmd = res.data.command;
        if (cmd) {
          setCommandStage(cmd.stage || '');
          setCommandHint(cmd.hint || '');
          if (cmd.stage === 'CONSENT_PENDING') {
            setStatus('consent_pending');
          } else if (cmd.stage === 'CONNECTING' || cmd.stage === 'CAPTURING') {
            setStatus('connecting');
          } else if (cmd.status === 'FAILED') {
            setStatus('error');
            setErrorMsg(cmd.errorMessage || 'Device failed to start screen share');
          }
        }
      } catch {
        // silent poll error
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, status]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    terminalsApi.get(id).then((res) => {
      if (!cancelled) setTerminalLabel(res.data.terminal.terminalId);
    }).catch(() => {});

    (async () => {
      try {
        const res = await screenShareApi.start(id);
        if (cancelled) return;
        const { session, commandId, iceServers } = res.data;
        sessionRef.current = { id: session.id };
        commandIdRef.current = commandId || null;
        setStatus('waiting_for_device');

        const token = localStorage.getItem('wl_admin_token') || '';
        const ws = new WebSocket(getSignalingWsUrl(session.id, token));
        wsRef.current = ws;

        const pc = new RTCPeerConnection({ iceServers });
        pcRef.current = pc;

        pc.ontrack = (event) => {
          if (videoRef.current) videoRef.current.srcObject = event.streams[0];
          setStatus('connected');
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ice-candidate', candidate: event.candidate }));
          }
        };

        pc.ondatachannel = (event) => {
          dataChannelRef.current = event.channel;
          event.channel.onopen = () => setControlEnabled(true);
          event.channel.onclose = () => setControlEnabled(false);
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            if (!endedRef.current) setStatus('ended');
          }
        };

        ws.onmessage = async (event) => {
          const msg = JSON.parse(event.data);
          if (msg.type === 'peer-joined') {
            setStatus('connecting');
          } else if (msg.type === 'offer') {
            await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }));
          } else if (msg.type === 'ice-candidate' && msg.candidate) {
            try {
              await pc.addIceCandidate(msg.candidate);
            } catch {
              // ignore late/duplicate candidates
            }
          } else if (msg.type === 'peer-left') {
            if (!endedRef.current) setStatus('ended');
          }
        };

        ws.onerror = () => {
          if (!endedRef.current) {
            setStatus('error');
            setErrorMsg('Signaling connection failed');
          }
        };

        ws.onclose = () => {
          if (!endedRef.current && status !== 'connected') {
            setStatus('ended');
          }
        };
      } catch (e: any) {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(e.response?.data?.error || 'Failed to start screen-share session');
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup(false);
      const terminalId = id;
      const sid = sessionRef.current?.id;
      if (terminalId && sid) {
        screenShareApi.stop(terminalId, sid).catch(() => {});
      }
    };
  }, [id, cleanup]);

  const sendControl = (msg: ControlMessage) => {
    const channel = dataChannelRef.current;
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(msg));
    }
  };

  const toNormalized = (clientX: number, clientY: number) => {
    const video = videoRef.current;
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (!controlEnabled) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    const timer = setTimeout(() => {
      const norm = toNormalized(clientX, clientY);
      if (norm) {
        sendControl({ type: 'long_press', x: norm.x, y: norm.y, durationMs: 600 });
      }
      pointerDownRef.current = null;
    }, LONG_PRESS_MS);

    pointerDownRef.current = { x: clientX, y: clientY, t: Date.now(), longPressTimer: timer };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (!pointerDownRef.current) return;
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    if (Math.hypot(dx, dy) > TAP_MAX_MOVE_PX && pointerDownRef.current.longPressTimer) {
      clearTimeout(pointerDownRef.current.longPressTimer);
      pointerDownRef.current.longPressTimer = undefined;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (!controlEnabled || !pointerDownRef.current) return;
    const start = pointerDownRef.current;
    if (start.longPressTimer) clearTimeout(start.longPressTimer);
    pointerDownRef.current = null;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    const duration = Date.now() - start.t;

    if (dist <= TAP_MAX_MOVE_PX && duration <= TAP_MAX_DURATION_MS) {
      const norm = toNormalized(e.clientX, e.clientY);
      if (norm) sendControl({ type: 'tap', x: norm.x, y: norm.y });
    } else if (dist > TAP_MAX_MOVE_PX) {
      const startNorm = toNormalized(start.x, start.y);
      const endNorm = toNormalized(e.clientX, e.clientY);
      if (startNorm && endNorm) {
        sendControl({
          type: 'swipe',
          x1: startNorm.x,
          y1: startNorm.y,
          x2: endNorm.x,
          y2: endNorm.y,
          durationMs: Math.min(Math.max(duration, 120), 2000),
        });
      }
    }
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendControl({ type: 'text', text: inputText, append: true });
    setInputText('');
  };

  const stopSession = () => {
    if (!id || !sessionRef.current) {
      navigate('/terminals');
      return;
    }
    cleanup(true);
    screenShareApi.stop(id, sessionRef.current.id).finally(() => navigate('/terminals'));
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h2 className="page-title">Remote Screen — {terminalLabel || id}</h2>
            <span
              className={`badge badge-${
                status === 'connected' ? 'success' : status === 'error' ? 'danger' : 'warning'
              }`}
            >
              {status === 'connected' ? 'LIVE' : status.toUpperCase()}
            </span>
          </div>
          <p className="page-subtitle">
            {STATUS_LABEL[status]}
            {commandHint && status !== 'connected' ? ` • ${commandHint}` : ''}
            {errorMsg ? `: ${errorMsg}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/terminals')}>
            <ArrowLeft size={14} />
            Back to Terminals
          </button>
          <button className="btn btn-danger" onClick={stopSession}>
            <MonitorX size={14} />
            End Session
          </button>
        </div>
      </div>

      {status === 'consent_pending' && (
        <div
          className="alert alert-warning"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: '#fff3cd',
            borderColor: '#ffeeba',
            color: '#856404',
            padding: '14px 18px',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          <Info size={24} />
          <div>
            <strong>Terminal Operator Action Required:</strong>
            <div>
              The Android security dialog "Start recording or casting with WL BizStore?" is displayed on
              the terminal. Please instruct the merchant or operator to tap <strong>"Start now"</strong> on
              the terminal screen to allow remote view.
            </div>
          </div>
        </div>
      )}

      {/* Main Terminal Frame */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 480px) 1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Terminal Screen & Virtual Frame */}
        <div
          className="card"
          style={{
            background: '#0f131a',
            borderRadius: '24px',
            padding: '16px',
            border: '2px solid #232b38',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {/* Virtual Device Header */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '4px 12px 10px',
              borderBottom: '1px solid #1a2230',
              marginBottom: '12px',
              fontSize: '11px',
              color: '#718096',
            }}
          >
            <span>WL BizStore Terminal Display</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: controlEnabled ? '#10b981' : '#f59e0b',
                }}
              />
              {controlEnabled ? 'Touch Input Active' : 'Connecting Input…'}
            </span>
          </div>

          {/* Screen Content Container */}
          <div
            style={{
              width: '100%',
              minHeight: '520px',
              background: '#000',
              borderRadius: '12px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {status !== 'connected' && status !== 'ended' && status !== 'error' && (
              <div
                style={{
                  color: '#9aa0ad',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '24px',
                  textAlign: 'center',
                }}
              >
                <Loader2 size={36} className="spinner" />
                <span style={{ fontWeight: 500, color: '#e2e8f0' }}>{STATUS_LABEL[status]}</span>
                {commandStage && (
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                    Device Stage: <code>{commandStage}</code>
                  </span>
                )}
                {status === 'waiting_for_device' && (
                  <p style={{ fontSize: '11px', color: '#64748b', maxWidth: '260px' }}>
                    The terminal polls every 10 seconds. Once received, the screen capturer will start.
                  </p>
                )}
              </div>
            )}

            {status === 'error' && (
              <div
                style={{
                  color: '#ea4335',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '24px',
                  textAlign: 'center',
                }}
              >
                <AlertTriangle size={36} />
                <span style={{ fontWeight: 600 }}>Connection Error</span>
                <span style={{ fontSize: '12px', color: '#cbd5e1' }}>{errorMsg || 'Something went wrong'}</span>
              </div>
            )}

            {status === 'ended' && (
              <div
                style={{
                  color: '#9aa0ad',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '24px',
                  textAlign: 'center',
                }}
              >
                <MonitorX size={36} />
                <span style={{ fontWeight: 600 }}>Session Ended</span>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  The remote screen session was closed by user or terminal.
                </span>
              </div>
            )}

            {/* Video Canvas for WebRTC */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{
                display: status === 'connected' ? 'block' : 'none',
                width: '100%',
                height: 'auto',
                maxHeight: '68vh',
                objectFit: 'contain',
                cursor: controlEnabled ? 'pointer' : 'default',
                userSelect: 'none',
                touchAction: 'none',
              }}
            />
          </div>

          {/* Android Soft Navigation Bar */}
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-around',
              alignItems: 'center',
              background: '#090c10',
              marginTop: '12px',
              padding: '10px 8px',
              borderRadius: '14px',
              border: '1px solid #1a2230',
            }}
          >
            <button
              className="btn btn-secondary"
              title="Back"
              disabled={!controlEnabled}
              onClick={() => sendControl({ type: 'nav', action: 'back' })}
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={16} />
              <span style={{ fontSize: '11px' }}>Back</span>
            </button>
            <button
              className="btn btn-secondary"
              title="Home"
              disabled={!controlEnabled}
              onClick={() => sendControl({ type: 'nav', action: 'home' })}
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Home size={16} />
              <span style={{ fontSize: '11px' }}>Home</span>
            </button>
            <button
              className="btn btn-secondary"
              title="Recents / App Switcher"
              disabled={!controlEnabled}
              onClick={() => sendControl({ type: 'nav', action: 'recents' })}
              style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Square size={16} />
              <span style={{ fontSize: '11px' }}>Recents</span>
            </button>
          </div>
        </div>

        {/* Remote Control Panel & Quick Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Direct Input & Text Injection */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Keyboard size={18} />
              Remote Keyboard / Text Input
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              Type text and send it directly to the active input field on the terminal screen.
            </p>
            <form onSubmit={handleSendText} style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input
                type="text"
                className="input"
                placeholder="Type text to send to terminal…"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={!controlEnabled}
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!controlEnabled || !inputText.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Send size={14} />
                Send
              </button>
            </form>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!controlEnabled}
                onClick={() => sendControl({ type: 'key', key: 'enter' })}
                style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <CornerDownLeft size={14} />
                Enter Key
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!controlEnabled}
                onClick={() => sendControl({ type: 'key', key: 'backspace' })}
                style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Delete size={14} />
                Backspace
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!controlEnabled}
                onClick={() => sendControl({ type: 'key', key: 'clear' })}
                style={{ fontSize: '12px', padding: '6px 12px' }}
              >
                Clear Field
              </button>
            </div>
          </div>

          {/* Quick System Actions */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <Sliders size={18} />
              System Navigation & Shortcuts
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
              Dispatch Android system actions directly to the terminal's OS.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!controlEnabled}
                onClick={() => sendControl({ type: 'nav', action: 'notifications' })}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <Bell size={16} />
                Pull Notifications
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!controlEnabled}
                onClick={() => sendControl({ type: 'nav', action: 'quick_settings' })}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <Sliders size={16} />
                Quick Settings
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={!controlEnabled}
                onClick={() => sendControl({ type: 'nav', action: 'power' })}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
              >
                <Power size={16} />
                Power Dialog
              </button>
            </div>
          </div>

          {/* Guidance card */}
          <div className="card" style={{ padding: '20px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CheckCircle2 size={16} color="#10b981" />
              Gestures & Interaction Guide
            </h4>
            <ul style={{ fontSize: '12px', color: '#64748b', paddingLeft: '18px', margin: 0, lineHeight: '1.8' }}>
              <li><strong>Click:</strong> Sends a real touch tap at that exact pixel coordinate.</li>
              <li><strong>Click & Drag:</strong> Performs a swipe or scroll gesture in that direction.</li>
              <li><strong>Hold (450ms+):</strong> Performs an Android long-press gesture (e.g. for context menus).</li>
              <li><strong>Accessibility Service:</strong> Gestures are executed directly by the WL BizStore background accessibility service.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
