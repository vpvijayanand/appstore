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
      entitlements: { include: { category: { select: { id: true, name: true, iconName: true } } } },
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
      entitlements: { include: { category: true } },
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
  const { categoryIds } = req.body as { categoryIds: string[] };
  if (!Array.isArray(categoryIds)) return res.status(400).json({ error: 'categoryIds array required' });

  // Remove old, add new
  await prisma.customerEntitlement.deleteMany({ where: { customerId: req.params.id } });
  await prisma.customerEntitlement.createMany({
    data: categoryIds.map(catId => ({ customerId: req.params.id, categoryId: catId })),
    skipDuplicates: true,
  });

  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'UPDATE_ENTITLEMENTS', entityType: 'Customer', entityId: req.params.id, details: { categoryIds } },
  });

  return res.json({ message: 'Entitlements updated' });
});

export default router;
