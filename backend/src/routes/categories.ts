import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.get('/', requireAdmin, async (_req, res) => {
  const categories = await prisma.category.findMany({
    include: { _count: { select: { apps: true } } },
    orderBy: { sortOrder: 'asc' },
  });
  return res.json({ categories });
});

router.post('/', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string(), iconName: z.string().optional(), sortOrder: z.number().optional() });
  try {
    const data = schema.parse(req.body);
    const category = await prisma.category.create({ data });
    return res.status(201).json({ category });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Create failed' });
  }
});

router.put('/:id', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ name: z.string().optional(), iconName: z.string().optional(), sortOrder: z.number().optional() });
  try {
    const data = schema.parse(req.body);
    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    return res.json({ category });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    return res.json({ message: 'Category deleted' });
  } catch {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
