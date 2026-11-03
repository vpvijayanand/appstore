import { Router, Request, Response } from 'express';
import { requireTerminal } from '../middleware/auth';
import { getIceServers } from '../services/turn';

const router = Router();

// Terminal-facing (X-Terminal-Key), mounted at /api/terminal/screen-share.
// The device doesn't need any other REST endpoint for screen share: it
// receives the session id via the START_SCREEN_SHARE DeviceCommand payload
// (see GET /api/terminal/commands/pending) and connects directly to the WS
// signaling endpoint (/ws/signaling?role=device&sessionId=...&apiKey=...).
router.get('/ice-servers', requireTerminal, (req: Request, res: Response) => {
  return res.json({ iceServers: getIceServers(`device:${req.terminal!.terminalId}`) });
});

export default router;
