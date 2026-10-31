import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { uploadApk, getPresignedUrl, deleteObject } from '../services/minio';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB (video ads)

// ── List All Advertisements (Admin) ───────────────────────────────────────────
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const where: any = {};
  if (type) where.type = type;

  const ads = await prisma.advertisement.findMany({
    where,
    include: { _count: { select: { assignments: true } } },
    orderBy: { createdAt: 'desc' },
  });

  // Attach a short-lived preview URL for IMAGE/VIDEO ads so the table can
  // render a thumbnail/preview without a second round-trip per row.
  const withPreview = await Promise.all(
    ads.map(async (ad) => ({
      ...ad,
      previewUrl: ad.mediaObjectName ? await getPresignedUrl(ad.mediaObjectName, 900) : null,
      assignmentCount: ad._count.assignments,
    }))
  );

  return res.json({ advertisements: withPreview });
});

// ── Get Single Advertisement ──────────────────────────────────────────────────
router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const ad = await prisma.advertisement.findUnique({ where: { id: req.params.id } });
  if (!ad) return res.status(404).json({ error: 'Advertisement not found' });
  const previewUrl = ad.mediaObjectName ? await getPresignedUrl(ad.mediaObjectName, 900) : null;
  return res.json({ ...ad, previewUrl });
});

// ── Create Advertisement (optional media upload) ──────────────────────────────
const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(['IMAGE', 'VIDEO', 'HTML']),
  htmlContent: z.string().optional(),
  displayMode: z.enum(['POPUP', 'SCREENSAVER']).optional(),
  durationSeconds: z.string().transform(Number).optional(),
  startAt: z.string(),
  endAt: z.string(),
});

router.post('/', requireAdmin, upload.single('media'), async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);

    if (data.type === 'HTML') {
      if (!data.htmlContent?.trim()) {
        return res.status(400).json({ error: 'htmlContent is required for HTML advertisements' });
      }
    } else if (!req.file) {
      return res.status(400).json({ error: 'A media file is required for IMAGE/VIDEO advertisements' });
    }

    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      return res.status(400).json({ error: 'startAt/endAt must be valid dates' });
    }
    if (endAt <= startAt) {
      return res.status(400).json({ error: 'endAt must be after startAt' });
    }

    let mediaUrl: string | undefined;
    let mediaObjectName: string | undefined;
    if (req.file) {
      const ext = (req.file.originalname.split('.').pop() || 'bin').toLowerCase();
      mediaObjectName = `ads/${crypto.randomUUID()}.${ext}`;
      mediaUrl = await uploadApk(mediaObjectName, req.file.buffer, req.file.mimetype || 'application/octet-stream');
    }

    const ad = await prisma.advertisement.create({
      data: {
        title: data.title,
        description: data.description,
        type: data.type,
        mediaUrl,
        mediaObjectName,
        htmlContent: data.type === 'HTML' ? data.htmlContent : undefined,
        displayMode: data.displayMode || 'POPUP',
        durationSeconds: data.durationSeconds || 10,
        startAt,
        endAt,
        createdById: req.admin!.adminId,
      },
    });

    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin!.adminId,
        action: 'CREATE_ADVERTISEMENT',
        entityType: 'Advertisement',
        entityId: ad.id,
        details: { title: ad.title, type: ad.type },
      },
    });

    return res.status(201).json(ad);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Failed to create advertisement' });
  }
});

// ── Update Advertisement Metadata/Schedule ────────────────────────────────────
router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { title, description, displayMode, durationSeconds, startAt, endAt, isActive, htmlContent } = req.body;
    const data: any = { title, description, displayMode, durationSeconds, isActive, htmlContent };
    if (startAt) data.startAt = new Date(startAt);
    if (endAt) data.endAt = new Date(endAt);

    const ad = await prisma.advertisement.update({ where: { id: req.params.id }, data });

    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin!.adminId,
        action: 'UPDATE_ADVERTISEMENT',
        entityType: 'Advertisement',
        entityId: ad.id,
        details: req.body,
      },
    });

    return res.json(ad);
  } catch {
    return res.status(500).json({ error: 'Update failed' });
  }
});

// ── Delete Advertisement ───────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const ad = await prisma.advertisement.findUnique({ where: { id: req.params.id } });
    if (!ad) return res.status(404).json({ error: 'Advertisement not found' });

    if (ad.mediaObjectName) await deleteObject(ad.mediaObjectName);
    await prisma.advertisement.delete({ where: { id: req.params.id } });

    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin!.adminId,
        action: 'DELETE_ADVERTISEMENT',
        entityType: 'Advertisement',
        entityId: req.params.id,
        details: { title: ad.title },
      },
    });

    return res.json({ message: 'Advertisement deleted' });
  } catch {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

export default router;
