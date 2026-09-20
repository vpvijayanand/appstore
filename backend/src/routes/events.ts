import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireTerminal } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── Report Download/Install Event ─────────────────────────────────────────────
const eventSchema = z.object({
  eventId: z.string().uuid().optional(), // update existing pending event
  appId: z.string().uuid(),
  version: z.string(),
  installStatus: z.enum(['PENDING', 'DOWNLOADING', 'SUCCESS', 'FAILED']),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracyMeters: z.number().optional(),
  networkType: z.string().optional(),
});

router.post('/', requireTerminal, async (req: Request, res: Response) => {
  try {
    const data = eventSchema.parse(req.body);
    const { dbId: terminalDbId } = req.terminal!;

    let event;

    if (data.eventId) {
      // Update existing event (e.g., PENDING → SUCCESS)
      event = await prisma.downloadEvent.update({
        where: { id: data.eventId },
        data: {
          installStatus: data.installStatus,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracyMeters: data.accuracyMeters,
          networkType: data.networkType,
          timestamp: new Date(),
        },
      });
    } else {
      // Create new event
      event = await prisma.downloadEvent.create({
        data: {
          terminalId: terminalDbId,
          appId: data.appId,
          version: data.version,
          installStatus: data.installStatus,
          latitude: data.latitude,
          longitude: data.longitude,
          accuracyMeters: data.accuracyMeters,
          networkType: data.networkType,
          ipAddress: req.ip,
        },
      });
    }

    // Update terminal last location if GPS provided
    if (data.latitude && data.longitude) {
      await prisma.terminal.update({
        where: { id: terminalDbId },
        data: {
          lastLatitude: data.latitude,
          lastLongitude: data.longitude,
          lastSeenAt: new Date(),
        },
      });
    }

    return res.json({ eventId: event.id, status: event.installStatus });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Failed to record event' });
  }
});

// ── Get Events for a Terminal ─────────────────────────────────────────────────
router.get('/mine', requireTerminal, async (req: Request, res: Response) => {
  const { dbId: terminalDbId } = req.terminal!;
  const limit = parseInt(req.query.limit as string) || 20;

  const events = await prisma.downloadEvent.findMany({
    where: { terminalId: terminalDbId },
    orderBy: { timestamp: 'desc' },
    take: limit,
    include: { app: { select: { name: true, packageName: true } } },
  });

  return res.json({ events });
});

export default router;
