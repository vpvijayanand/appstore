import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const customerId = req.query.customerId as string;
  const status = req.query.status as string;
  const where: any = {};
  if (customerId) where.customerId = customerId;
  if (status) where.status = status;

  const terminals = await prisma.terminal.findMany({
    where,
    include: { customer: { select: { name: true, code: true } }, _count: { select: { downloadEvents: true } } },
    orderBy: { enrolledAt: 'desc' },
  });

  return res.json({ terminals: terminals.map(t => ({
    ...t,
    apiKey: t.apiKey.substring(0, 8) + '...',  // mask
    lastLatitude: t.lastLatitude ? Number(t.lastLatitude) : null,
    lastLongitude: t.lastLongitude ? Number(t.lastLongitude) : null,
  })) });
});

router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const terminal = await prisma.terminal.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      downloadEvents: {
        include: { app: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
        take: 20,
      },
    },
  });
  if (!terminal) return res.status(404).json({ error: 'Terminal not found' });
  return res.json({ terminal: {
    ...terminal,
    apiKey: terminal.apiKey.substring(0, 8) + '...',
    lastLatitude: terminal.lastLatitude ? Number(terminal.lastLatitude) : null,
    lastLongitude: terminal.lastLongitude ? Number(terminal.lastLongitude) : null,
  } });
});

// Revoke & regenerate API key
router.post('/:id/rotate-key', requireAdmin, async (req: Request, res: Response) => {
  const newKey = 'wl_' + crypto.randomBytes(24).toString('hex');
  await prisma.terminal.update({ where: { id: req.params.id }, data: { apiKey: newKey } });
  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'ROTATE_API_KEY', entityType: 'Terminal', entityId: req.params.id, details: {} },
  });
  return res.json({ message: 'API key rotated', newKey });
});

// Retire / wipe terminal
router.patch('/:id/status', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'RETIRED', 'WIPED']) });
  try {
    const { status } = schema.parse(req.body);
    const terminal = await prisma.terminal.update({ where: { id: req.params.id }, data: { status } });
    return res.json({ terminal });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Update failed' });
  }
});

export default router;
