import { Router, Request, Response } from 'express';
import { PrismaClient, AssignmentScope, AssignmentMode } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── List Assignments ──────────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const { scope, customerId, terminalMasterId, appId } = req.query as Record<string, string>;
  const where: any = {};
  if (scope) where.scope = scope;
  if (customerId) where.customerId = customerId;
  if (terminalMasterId) where.terminalMasterId = terminalMasterId;
  if (appId) where.appId = appId;

  const assignments = await prisma.appAssignment.findMany({
    where,
    include: {
      app: { select: { id: true, name: true, iconUrl: true, categoryId: true } },
      customer: { select: { id: true, name: true, code: true } },
      terminalMaster: { select: { id: true, tid: true, serialNo: true } },
    },
    orderBy: { grantedAt: 'desc' },
  });

  return res.json({ assignments });
});

// ── Bulk Assign ───────────────────────────────────────────────────────────────
// targets.scope = CUSTOMER -> targets.customerIds[]
// targets.scope = TERMINAL -> targets.terminalMasterIds[]
const bulkSchema = z.object({
  appIds: z.array(z.string()).min(1),
  targets: z.union([
    z.object({ scope: z.literal('CUSTOMER'), customerIds: z.array(z.string()).min(1) }),
    z.object({ scope: z.literal('TERMINAL'), terminalMasterIds: z.array(z.string()).min(1) }),
  ]),
  mode: z.nativeEnum(AssignmentMode).default(AssignmentMode.ON_REQUEST),
  replaceExisting: z.boolean().optional().default(false),
  // Only meaningful when mode=DEFAULT: appId -> install/download sequence
  // number (1, 2, 3…), so the Android client can auto-install defaults in
  // the order the admin configured ("Default 1", "Default 2", …).
  orders: z.record(z.string(), z.number().int().min(0)).optional(),
});

router.post('/bulk', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { appIds, targets, mode, replaceExisting, orders } = bulkSchema.parse(req.body);
    const scope: AssignmentScope = targets.scope === 'CUSTOMER' ? AssignmentScope.CUSTOMER : AssignmentScope.TERMINAL;
    const targetIds = targets.scope === 'CUSTOMER' ? targets.customerIds : targets.terminalMasterIds;

    let created = 0;
    let updated = 0;
    let removed = 0;

    for (const targetId of targetIds) {
      const whereTarget = scope === AssignmentScope.CUSTOMER ? { customerId: targetId } : { terminalMasterId: targetId };

      if (replaceExisting) {
        const existing = await prisma.appAssignment.findMany({ where: { scope, ...whereTarget } });
        const toRemove = existing.filter(e => !appIds.includes(e.appId));
        if (toRemove.length) {
          await prisma.appAssignment.deleteMany({ where: { id: { in: toRemove.map(e => e.id) } } });
          removed += toRemove.length;
        }
      }

      for (const appId of appIds) {
        const uniqueWhere = scope === AssignmentScope.CUSTOMER
          ? { appId_customerId: { appId, customerId: targetId } }
          : { appId_terminalMasterId: { appId, terminalMasterId: targetId } };
        const order = orders?.[appId] ?? 0;

        const existing = await (prisma.appAssignment as any).findUnique({ where: uniqueWhere });
        if (existing) {
          if (existing.mode !== mode || existing.order !== order) {
            await (prisma.appAssignment as any).update({ where: uniqueWhere, data: { mode, order } });
            updated++;
          }
        } else {
          await prisma.appAssignment.create({
            data: {
              appId,
              scope,
              mode,
              order,
              grantedById: req.admin!.adminId,
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
        action: 'BULK_ASSIGN_APPS',
        entityType: 'AppAssignment',
        entityId: 'bulk',
        details: { appIds, targets, mode, replaceExisting, orders, created, updated, removed },
      },
    });

    return res.json({ created, updated, removed });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Bulk assignment failed' });
  }
});

// ── Update a single assignment's default order ────────────────────────────────
const updateSchema = z.object({ order: z.number().int().min(0) });

router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { order } = updateSchema.parse(req.body);
    const assignment = await prisma.appAssignment.update({ where: { id: req.params.id }, data: { order } });
    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'UPDATE_ASSIGNMENT_ORDER', entityType: 'AppAssignment', entityId: assignment.id, details: { order } },
    });
    return res.json({ assignment });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.appAssignment.delete({ where: { id: req.params.id } });
    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'DELETE_ASSIGNMENT', entityType: 'AppAssignment', entityId: req.params.id, details: {} },
    });
    return res.json({ message: 'Assignment removed' });
  } catch {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
