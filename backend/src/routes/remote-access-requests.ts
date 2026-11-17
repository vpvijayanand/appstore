import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const updateStatusSchema = z.object({
  reason: z.string().trim().min(1).max(300).optional(),
});

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const status = ((req.query.status as string) || 'PENDING').toUpperCase();
  const takeRaw = Number(req.query.take || 100);
  const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(200, takeRaw)) : 100;

  const where: any = {};
  if (['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(status)) {
    where.status = status;
  }

  const requests = await prisma.remoteAccessRequest.findMany({
    where,
    include: {
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
    },
    orderBy: { requestedAt: 'desc' },
    take,
  });

  return res.json({ requests });
});

router.post('/:id/approve', requireAdmin, async (req: Request, res: Response) => {
  const existing = await prisma.remoteAccessRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Remote access request not found' });
  if (existing.status !== 'PENDING') {
    return res.status(400).json({ error: `Request is already ${existing.status.toLowerCase()}` });
  }

  const approved = await prisma.remoteAccessRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'APPROVED',
      approvedById: req.admin!.adminId,
      approvedAt: new Date(),
    },
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

  const existing = await prisma.remoteAccessRequest.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'Remote access request not found' });
  if (existing.status !== 'PENDING') {
    return res.status(400).json({ error: `Request is already ${existing.status.toLowerCase()}` });
  }

  const rejected = await prisma.remoteAccessRequest.update({
    where: { id: req.params.id },
    data: {
      status: 'REJECTED',
      rejectedById: req.admin!.adminId,
      rejectedAt: new Date(),
      rejectionReason: parsed.data.reason || null,
    },
  });

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
