import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireTerminal } from '../middleware/auth';
import { expireStaleRemoteAccessRequests } from '../services/remote-access-requests';

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
    return res.json({ request: pending, alreadyPending: true });
  }

  try {
    const request = await prisma.remoteAccessRequest.create({
      data: {
        terminalId: req.terminal!.dbId,
        requestedBy: req.terminal!.terminalId,
        message: parsed.data.message || null,
      },
    });

    return res.json({ request, alreadyPending: false });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      const existingPending = await prisma.remoteAccessRequest.findFirst({
        where: { terminalId: req.terminal!.dbId, status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
      });
      if (existingPending) {
        return res.json({ request: existingPending, alreadyPending: true });
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
  return res.json({ request: latest || null });
});

export default router;
