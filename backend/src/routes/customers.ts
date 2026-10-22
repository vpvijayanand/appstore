import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAdmin, async (_req, res) => {
  const customers = await prisma.customer.findMany({
    include: {
      _count: { select: { terminals: true } },
      entitlements: { include: { app: { select: { id: true, name: true, iconUrl: true } } } },
    },
    orderBy: { name: 'asc' },
  });
  return res.json({ customers });
});

router.get('/:id', requireAdmin, async (req, res) => {
  const customer = await prisma.customer.findUnique({
    where: { id: req.params.id },
    include: {
      terminals: { orderBy: { enrolledAt: 'desc' } },
      entitlements: { include: { app: { include: { category: true } } } },
    },
  });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  return res.json({ customer });
});

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string(), code: z.string(), contactEmail: z.string().email().optional() });
  try {
    const data = schema.parse(req.body);
    const customer = await prisma.customer.create({ data });
    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'CREATE_CUSTOMER', entityType: 'Customer', entityId: customer.id, details: data },
    });
    return res.status(201).json({ customer });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Create failed' });
  }
});

router.put('/:id/entitlements', requireAdmin, async (req: Request, res: Response) => {
  const { appIds } = req.body as { appIds: string[] };
  if (!Array.isArray(appIds)) return res.status(400).json({ error: 'appIds array required' });

  // Remove old, add new
  await prisma.customerEntitlement.deleteMany({ where: { customerId: req.params.id } });
  await prisma.customerEntitlement.createMany({
    data: appIds.map(appId => ({ customerId: req.params.id, appId })),
    skipDuplicates: true,
  });

  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'UPDATE_ENTITLEMENTS', entityType: 'Customer', entityId: req.params.id, details: { appIds } },
  });

  return res.json({ message: 'Entitlements updated' });
});

router.get('/:id/downloads', requireAdmin, async (req: Request, res: Response) => {
  try {
    const downloads = await prisma.downloadEvent.findMany({
      where: { terminal: { customerId: req.params.id } },
      include: {
        app: { select: { name: true, version: true, iconUrl: true } },
        terminal: { select: { terminalId: true } }
      },
      orderBy: { timestamp: 'desc' },
      take: 50
    });
    return res.json({ downloads });
  } catch {
    return res.status(500).json({ error: 'Failed to fetch customer downloads' });
  }
});

export default router;
