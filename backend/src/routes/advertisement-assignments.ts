import { Router, Request, Response } from 'express';
import { PrismaClient, AssignmentScope } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── List Assignments ──────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const { scope, customerId, terminalMasterId, advertisementId } = req.query as Record<string, string>;
  const where: any = {};
  if (scope) where.scope = scope;
  if (customerId) where.customerId = customerId;
  if (terminalMasterId) where.terminalMasterId = terminalMasterId;
  if (advertisementId) where.advertisementId = advertisementId;

  const assignments = await prisma.advertisementAssignment.findMany({
    where,
    include: {
      advertisement: { select: { id: true, title: true, type: true, displayMode: true } },
      customer: { select: { id: true, name: true, code: true } },
      terminalMaster: { select: { id: true, tid: true, serialNo: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ assignments });
});

// ── Bulk Assign ───────────────────────────────────────────────────────────────
// targets.scope = CUSTOMER -> targets.customerIds[]
// targets.scope = TERMINAL -> targets.terminalMasterIds[]
const bulkSchema = z.object({
  advertisementIds: z.array(z.string()).min(1),
  targets: z.union([
    z.object({ scope: z.literal('CUSTOMER'), customerIds: z.array(z.string()).min(1) }),
    z.object({ scope: z.literal('TERMINAL'), terminalMasterIds: z.array(z.string()).min(1) }),
  ]),
  replaceExisting: z.boolean().optional().default(false),
});

router.post('/bulk', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { advertisementIds, targets, replaceExisting } = bulkSchema.parse(req.body);
    const scope: AssignmentScope = targets.scope === 'CUSTOMER' ? AssignmentScope.CUSTOMER : AssignmentScope.TERMINAL;
    const targetIds = targets.scope === 'CUSTOMER' ? targets.customerIds : targets.terminalMasterIds;

    let created = 0;
    let removed = 0;

    for (const targetId of targetIds) {
      const whereTarget = scope === AssignmentScope.CUSTOMER ? { customerId: targetId } : { terminalMasterId: targetId };

      if (replaceExisting) {
        const existing = await prisma.advertisementAssignment.findMany({ where: { scope, ...whereTarget } });
        const toRemove = existing.filter(e => !advertisementIds.includes(e.advertisementId));
        if (toRemove.length) {
          await prisma.advertisementAssignment.deleteMany({ where: { id: { in: toRemove.map(e => e.id) } } });
          removed += toRemove.length;
        }
      }

      for (const advertisementId of advertisementIds) {
        const uniqueWhere = scope === AssignmentScope.CUSTOMER
          ? { advertisementId_customerId: { advertisementId, customerId: targetId } }
          : { advertisementId_terminalMasterId: { advertisementId, terminalMasterId: targetId } };

        const existing = await (prisma.advertisementAssignment as any).findUnique({ where: uniqueWhere });
        if (!existing) {
          await prisma.advertisementAssignment.create({
            data: {
              advertisementId,
              scope,
              createdById: req.admin!.adminId,
              ...whereTarget,
            },
          });
          created++;
        }
      }
    }

    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin!.adminId,
        action: 'BULK_ASSIGN_ADVERTISEMENTS',
        entityType: 'AdvertisementAssignment',
        entityId: 'bulk',
        details: { advertisementIds, targets, replaceExisting, created, removed },
      },
    });

    return res.json({ created, removed });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Bulk assignment failed' });
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.advertisementAssignment.delete({ where: { id: req.params.id } });
    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'DELETE_ADVERTISEMENT_ASSIGNMENT', entityType: 'AdvertisementAssignment', entityId: req.params.id, details: {} },
    });
    return res.json({ message: 'Assignment removed' });
  } catch {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
