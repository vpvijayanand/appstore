import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { expireStaleRemoteAccessRequests, computeExpiresAt } from '../services/remote-access-requests';

const terminalInclude = {
  terminal: {
    select: {
      id: true,
      terminalId: true,
      serialNo: true,
      model: true,
      site: true,
      lastSeenAt: true,
      customer: { select: { name: true, code: true } },
      terminalMaster: { select: { tid: true } },
    },
  },
} as const;

const withExpiresAt = <T extends { status: string; requestedAt: Date }>(request: T) => ({
  ...request,
  expiresAt: request.status === 'PENDING' ? computeExpiresAt(request.requestedAt) : null,
});

const router = Router();
const prisma = new PrismaClient();

const updateStatusSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional(),
});

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  await expireStaleRemoteAccessRequests(prisma);

  const status = ((req.query.status as string) || 'PENDING').toUpperCase();
  const takeRaw = Number(req.query.take || 100);
  const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(200, takeRaw)) : 100;

  const where: any = {};
  if (['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(status)) {
    where.status = status;
  }

  const requests = await prisma.remoteAccessRequest.findMany({
    where,
    include: terminalInclude,
    orderBy: { requestedAt: 'desc' },
    take,
  });

  return res.json({ requests: requests.map(withExpiresAt) });
});

router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const request = await prisma.remoteAccessRequest.findUnique({
    where: { id: req.params.id },
    include: terminalInclude,
  });
  if (!request) return res.status(404).json({ error: 'Remote access request not found' });
  return res.json({ request: withExpiresAt(request) });
});

router.post('/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  await expireStaleRemoteAccessRequests(prisma);

  const now = new Date();
  const changed = await prisma.remoteAccessRequest.updateMany({
    where: { id: req.params.id, status: 'PENDING' },
    data: {
      status: 'APPROVED',
      approvedById: req.admin!.adminId,
      approvedAt: now,
    },
  });

  if (changed.count === 0) {
    const existing = await prisma.remoteAccessRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Remote access request not found' });
    return res.status(409).json({ error: `Request is already ${existing.status.toLowerCase()}` });
  }

  const approved = await prisma.remoteAccessRequest.findUnique({
    where: { id: req.params.id },
    include: {
      terminal: {
        select: {
          id: true,
          terminalId: true,
          serialNo: true,
          terminalMaster: { select: { tid: true } },
        },
      },
    },
  });
  if (!approved) return res.status(404).json({ error: 'Remote access request not found' });

  await prisma.adminAuditLog.create({
    data: {
      adminId: req.admin!.adminId,
      action: 'APPROVE_REMOTE_ACCESS_REQUEST',
      entityType: 'RemoteAccessRequest',
      entityId: approved.id,
      details: {
        terminalDbId: approved.terminal.id,
        terminalId: approved.terminal.terminalId,
      },
    },
  });

  return res.json({ request: approved });
});

router.post('/:id/reject', requireAdmin, async (req: Request, res: Response) => {
  const parsed = updateStatusSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  await expireStaleRemoteAccessRequests(prisma);

  const now = new Date();
  const changed = await prisma.remoteAccessRequest.updateMany({
    where: { id: req.params.id, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      rejectedById: req.admin!.adminId,
      rejectedAt: now,
      rejectionReason: parsed.data.reason || null,
    },
  });

  if (changed.count === 0) {
    const existing = await prisma.remoteAccessRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Remote access request not found' });
    return res.status(409).json({ error: `Request is already ${existing.status.toLowerCase()}` });
  }

  const rejected = await prisma.remoteAccessRequest.findUnique({ where: { id: req.params.id } });
  if (!rejected) return res.status(404).json({ error: 'Remote access request not found' });

  await prisma.adminAuditLog.create({
    data: {
      adminId: req.admin!.adminId,
      action: 'REJECT_REMOTE_ACCESS_REQUEST',
      entityType: 'RemoteAccessRequest',
      entityId: rejected.id,
      details: { reason: rejected.rejectionReason || null },
    },
  });

  return res.json({ request: rejected });
});

export default router;
