import { IncomingMessage } from 'http';
import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { AdminJwtPayload } from '../middleware/auth';

const prisma = new PrismaClient();

const SIGNALING_PATH = '/ws/signaling';
const ALLOWED_MESSAGE_TYPES = new Set(['offer', 'answer', 'ice-candidate', 'bye']);
const HEARTBEAT_INTERVAL_MS = 30_000;

type Role = 'admin' | 'device';

interface SessionPeers {
  admin?: WebSocket;
  device?: WebSocket;
}

// sessionId -> currently connected admin/device sockets for that screen-share session.
const sessions = new Map<string, SessionPeers>();

/**
 * Relays WebRTC signaling (SDP offer/answer + ICE candidates) between exactly
 * one admin-portal viewer and one Android device for a given ScreenShareSession.
 * Does not inspect/store SDP content — pure pass-through, scoped by sessionId,
 * with both sides independently authenticated before being allowed to join.
 * The actual video + remote-control data channel travel peer-to-peer (via
 * STUN/TURN) once negotiated here, never through this server.
 */
export function attachSignalingServer(httpServer: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', 'http://internal');
    if (url.pathname !== SIGNALING_PATH) {
      socket.destroy();
      return;
    }

    authenticate(req, url).then((auth) => {
      if (!auth) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        onConnection(ws, auth.sessionId, auth.role);
      });
    }).catch(() => {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    });
  });

  // Periodic liveness check — terminate sockets that stopped responding to pings
  // (e.g. the Android device lost connectivity without a clean close).
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const extWs = ws as WebSocket & { isAlive?: boolean };
      if (extWs.isAlive === false) {
        ws.terminate();
        return;
      }
      extWs.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(interval));
}

async function authenticate(
  req: IncomingMessage,
  url: URL
): Promise<{ sessionId: string; role: Role } | null> {
  const sessionId = url.searchParams.get('sessionId');
  const role = url.searchParams.get('role');
  if (!sessionId || (role !== 'admin' && role !== 'device')) return null;

  const session = await prisma.screenShareSession.findUnique({ where: { id: sessionId } });
  if (!session || session.status === 'ENDED') return null;

  if (role === 'admin') {
    const token = url.searchParams.get('token');
    if (!token) return null;
    try {
      jwt.verify(token, process.env.JWT_SECRET!) as AdminJwtPayload;
    } catch {
      return null;
    }
    return { sessionId, role };
  }

  // role === 'device'
  const apiKey = url.searchParams.get('apiKey');
  if (!apiKey) return null;
  const terminal = await prisma.terminal.findUnique({ where: { apiKey } });
  if (!terminal || terminal.id !== session.terminalId || terminal.status !== 'ACTIVE') return null;
  return { sessionId, role };
}

function onConnection(ws: WebSocket, sessionId: string, role: Role): void {
  const extWs = ws as WebSocket & { isAlive?: boolean };
  extWs.isAlive = true;
  ws.on('pong', () => { extWs.isAlive = true; });

  let peers = sessions.get(sessionId);
  if (!peers) {
    peers = {};
    sessions.set(sessionId, peers);
  }

  // Only one connection per role per session — a reconnect replaces the old one.
  peers[role]?.close(4000, 'Replaced by a new connection');
  peers[role] = ws;

  const other = role === 'admin' ? peers.device : peers.admin;
  if (other && other.readyState === WebSocket.OPEN) {
    void prisma.screenShareSession.update({
      where: { id: sessionId },
      data: { status: 'ACTIVE', connectedAt: new Date() },
    }).catch(() => {});
    send(other, { type: 'peer-joined' });
    send(ws, { type: 'peer-joined' });
  }

  ws.on('message', (data) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return; // ignore malformed payloads
    }
    if (!msg || typeof msg.type !== 'string' || !ALLOWED_MESSAGE_TYPES.has(msg.type)) return;

    const currentPeers = sessions.get(sessionId);
    const target = role === 'admin' ? currentPeers?.device : currentPeers?.admin;
    if (target && target.readyState === WebSocket.OPEN) {
      send(target, msg);
    }
  });

  ws.on('close', () => {
    const currentPeers = sessions.get(sessionId);
    if (!currentPeers) return;
    if (currentPeers[role] === ws) currentPeers[role] = undefined;

    const remaining = role === 'admin' ? currentPeers.device : currentPeers.admin;
    if (remaining && remaining.readyState === WebSocket.OPEN) {
      send(remaining, { type: 'peer-left' });
    }

    if (!currentPeers.admin && !currentPeers.device) {
      sessions.delete(sessionId);
      void prisma.screenShareSession.update({
        where: { id: sessionId },
        data: { status: 'ENDED', endedAt: new Date() },
      }).catch(() => {});
    }
  });
}

function send(ws: WebSocket, msg: unknown): void {
  ws.send(JSON.stringify(msg));
}
