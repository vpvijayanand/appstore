import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MonitorX, AlertTriangle } from 'lucide-react';
import { screenShareApi, terminalsApi, BASE_URL } from '../api';

type Status = 'starting' | 'waiting_for_device' | 'connecting' | 'connected' | 'ended' | 'error';

interface ControlTapMessage {
  type: 'tap';
  x: number; // normalized 0..1, relative to the device's full screen
  y: number;
}

interface ControlSwipeMessage {
  type: 'swipe';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  durationMs: number;
}

const STATUS_LABEL: Record<Status, string> = {
  starting: 'Requesting session…',
  waiting_for_device: 'Waiting for the terminal to accept…',
  connecting: 'Connecting…',
  connected: 'Connected',
  ended: 'Session ended',
  error: 'Error',
};

// Tap vs. swipe heuristic: pointer movement/time below these thresholds is a tap.
const TAP_MAX_MOVE_PX = 12;
const TAP_MAX_DURATION_MS = 350;

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

  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const sessionRef = useRef<{ id: string } | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const endedRef = useRef(false);

  const cleanup = useCallback((markEnded: boolean) => {
    if (markEnded) endedRef.current = true;
    wsRef.current?.close();
    wsRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    dataChannelRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

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
        const { session, iceServers } = res.data;
        sessionRef.current = { id: session.id };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const sendControl = (msg: ControlTapMessage | ControlSwipeMessage) => {
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
    pointerDownRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };

  const onPointerUp = (e: React.PointerEvent<HTMLVideoElement>) => {
    if (!controlEnabled || !pointerDownRef.current) return;
    const start = pointerDownRef.current;
    pointerDownRef.current = null;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const dist = Math.hypot(dx, dy);
    const duration = Date.now() - start.t;

    if (dist <= TAP_MAX_MOVE_PX && duration <= TAP_MAX_DURATION_MS) {
      const norm = toNormalized(e.clientX, e.clientY);
      if (norm) sendControl({ type: 'tap', x: norm.x, y: norm.y });
    } else {
      const startNorm = toNormalized(start.x, start.y);
      const endNorm = toNormalized(e.clientX, e.clientY);
      if (startNorm && endNorm) {
        sendControl({
          type: 'swipe',
          x1: startNorm.x, y1: startNorm.y,
          x2: endNorm.x, y2: endNorm.y,
          durationMs: Math.min(Math.max(duration, 100), 2000),
        });
      }
    }
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
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Remote Screen — {terminalLabel || id}</h2>
          <p className="page-subtitle">{STATUS_LABEL[status]}{errorMsg ? `: ${errorMsg}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/terminals')}>
            <ArrowLeft size={14} />
            Back
          </button>
          <button className="btn btn-danger" onClick={stopSession}>
            <MonitorX size={14} />
            Stop Session
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '480px',
          background: '#0b0d12',
          position: 'relative',
        }}
      >
        {status !== 'connected' && status !== 'ended' && status !== 'error' && (
          <div style={{ color: '#9aa0ad', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <Loader2 size={32} className="spinner" />
            <span>{STATUS_LABEL[status]}</span>
          </div>
        )}

        {status === 'error' && (
          <div style={{ color: '#ea4335', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={32} />
            <span>{errorMsg || 'Something went wrong'}</span>
          </div>
        )}

        {status === 'ended' && (
          <div style={{ color: '#9aa0ad', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <MonitorX size={32} />
            <span>Session ended</span>
          </div>
        )}

        {/* Kept mounted (not conditionally rendered) so srcObject assignment on
            connect always has a live element to attach to. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          style={{
            display: status === 'connected' ? 'block' : 'none',
            maxWidth: '100%',
            maxHeight: '75vh',
            cursor: controlEnabled ? 'pointer' : 'default',
          }}
        />
      </div>

      {status === 'connected' && (
        <p className="page-subtitle" style={{ marginTop: '10px' }}>
          {controlEnabled
            ? 'Click/drag on the screen to tap/swipe on the terminal.'
            : 'View-only — remote control channel not yet available.'}
        </p>
      )}
    </div>
  );
}
