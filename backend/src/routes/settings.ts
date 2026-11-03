import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── Global App Settings (singleton row, id=1) ─────────────────────────────────
// Currently just the minimum gap between advertisement popups on the Android
// app (configurable from the admin portal instead of being hardcoded).
async function getOrCreateSettings() {
  return prisma.appSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
}

router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  const settings = await getOrCreateSettings();
  return res.json({ settings });
});

const updateSchema = z.object({
  popupIntervalHours: z.number().min(0).max(168),
});

router.patch('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const settings = await prisma.appSettings.upsert({
      where: { id: 1 },
      update: data,
      create: { id: 1, ...data },
    });
    return res.json({ settings });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Update failed' });
  }
});

export default router;
