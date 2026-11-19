import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireTerminal } from '../middleware/auth';
import { expireStaleRemoteAccessRequests, computeExpiresAt } from '../services/remote-access-requests';

const router = Router();
const prisma = new PrismaClient();

const createRequestSchema = z.object({
  message: z.string().trim().min(1).max(300).optional(),
});

router.post('/request', requireTerminal, async (req: Request, res: Response) => {
  const parsed = createRequestSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await expireStaleRemoteAccessRequests(prisma);

  const pending = await prisma.remoteAccessRequest.findFirst({
    where: { terminalId: req.terminal!.dbId, status: 'PENDING' },
    orderBy: { requestedAt: 'desc' },
  });

  if (pending) {
    return res.json({ request: pending, alreadyPending: true, expiresAt: computeExpiresAt(pending.requestedAt) });
  }

  try {
    const request = await prisma.remoteAccessRequest.create({
      data: {
        terminalId: req.terminal!.dbId,
        requestedBy: req.terminal!.terminalId,
        message: parsed.data.message || null,
      },
    });

    return res.json({ request, alreadyPending: false, expiresAt: computeExpiresAt(request.requestedAt) });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      const existingPending = await prisma.remoteAccessRequest.findFirst({
        where: { terminalId: req.terminal!.dbId, status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
      });
      if (existingPending) {
        return res.json({ request: existingPending, alreadyPending: true, expiresAt: computeExpiresAt(existingPending.requestedAt) });
      }
    }
    console.error(e);
    return res.status(500).json({ error: 'Failed to create remote access request' });
  }
});

router.get('/latest', requireTerminal, async (req: Request, res: Response) => {
  const latest = await prisma.remoteAccessRequest.findFirst({
    where: { terminalId: req.terminal!.dbId },
    orderBy: { requestedAt: 'desc' },
  });
  return res.json({
    request: latest || null,
    expiresAt: latest && latest.status === 'PENDING' ? computeExpiresAt(latest.requestedAt) : null,
  });
});

// Lets the terminal give up on its own pending request instead of waiting out the
// expiry window — unblocks the one-pending-per-terminal dedupe lock immediately.
router.post('/request/:id/cancel', requireTerminal, async (req: Request, res: Response) => {
  const changed = await prisma.remoteAccessRequest.updateMany({
    where: { id: req.params.id, terminalId: req.terminal!.dbId, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      rejectionReason: 'Cancelled by terminal',
      rejectedAt: new Date(),
    },
  });

  if (changed.count === 0) {
    const existing = await prisma.remoteAccessRequest.findFirst({
      where: { id: req.params.id, terminalId: req.terminal!.dbId },
    });
    if (!existing) return res.status(404).json({ error: 'Remote access request not found' });
    return res.status(409).json({ error: `Request is already ${existing.status.toLowerCase()}` });
  }

  const cancelled = await prisma.remoteAccessRequest.findUnique({ where: { id: req.params.id } });
  return res.json({ request: cancelled });
});

export default router;
