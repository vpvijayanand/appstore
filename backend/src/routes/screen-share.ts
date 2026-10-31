import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/auth';
import { getIceServers } from '../services/turn';

const router = Router();
const prisma = new PrismaClient();

// All routes here are admin-facing (JWT), mounted at /api/terminals.

// STUN/TURN server list for the admin portal's RTCPeerConnection (viewer side).
router.get('/screen-share/ice-servers', requireAdmin, (req: Request, res: Response) => {
  return res.json({ iceServers: getIceServers(`admin:${req.admin!.adminId}`) });
});

// Start a remote screen-share session for a terminal: creates a session record
// and queues a START_SCREEN_SHARE command carrying the session id. The device
// picks the command up via the normal poll flow, requests on-device
// MediaProjection consent, then connects to the WS signaling endpoint using
// this session id to pair up with the admin's own signaling connection.
router.post('/:id/screen-share/sessions', requireAdmin, async (req: Request, res: Response) => {
  const terminal = await prisma.terminal.findUnique({ where: { id: req.params.id } });
  if (!terminal) return res.status(404).json({ error: 'Terminal not found' });
  if (terminal.status !== 'ACTIVE') return res.status(400).json({ error: 'Terminal is not active' });

  const session = await prisma.screenShareSession.create({
    data: { terminalId: terminal.id, createdById: req.admin!.adminId },
  });
  await prisma.deviceCommand.create({
    data: {
      terminalId: terminal.id,
      type: 'START_SCREEN_SHARE',
      createdById: req.admin!.adminId,
      payload: { sessionId: session.id },
    },
  });
  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'START_SCREEN_SHARE', entityType: 'Terminal', entityId: terminal.id, details: { sessionId: session.id } },
  });

  return res.json({ session, iceServers: getIceServers(`admin:${req.admin!.adminId}`) });
});

// Poll session status (PENDING until the device connects to signaling, ACTIVE
// once both sides are connected, ENDED once either side disconnects/stops).
router.get('/:id/screen-share/sessions/:sessionId', requireAdmin, async (req: Request, res: Response) => {
  const session = await prisma.screenShareSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session || session.terminalId !== req.params.id) return res.status(404).json({ error: 'Session not found' });
  return res.json({ session });
});

router.post('/:id/screen-share/sessions/:sessionId/stop', requireAdmin, async (req: Request, res: Response) => {
  const session = await prisma.screenShareSession.findUnique({ where: { id: req.params.sessionId } });
  if (!session || session.terminalId !== req.params.id) return res.status(404).json({ error: 'Session not found' });

  if (session.status !== 'ENDED') {
    await prisma.screenShareSession.update({ where: { id: session.id }, data: { status: 'ENDED', endedAt: new Date() } });
  }
  await prisma.deviceCommand.create({
    data: {
      terminalId: req.params.id,
      type: 'STOP_SCREEN_SHARE',
      createdById: req.admin!.adminId,
      payload: { sessionId: session.id },
    },
  });

  return res.json({ message: 'Screen share session stopped' });
});

export default router;
