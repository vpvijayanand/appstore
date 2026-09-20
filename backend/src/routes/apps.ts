import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import crypto from 'crypto';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { uploadApk, getPresignedUrl, deleteObject } from '../services/minio';

const router = Router();
const prisma = new PrismaClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } }); // 200MB

// ── List All Apps (Admin) ─────────────────────────────────────────────────────
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const categoryId = req.query.categoryId as string;
  const search = req.query.search as string;

  const where: any = {};
  if (categoryId) where.categoryId = categoryId;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const [apps, total] = await Promise.all([
    prisma.app.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.app.count({ where }),
  ]);

  return res.json({
    apps: apps.map(a => ({ ...a, sizeBytes: a.sizeBytes.toString() })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
});

// ── Get Single App ────────────────────────────────────────────────────────────
router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const app = await prisma.app.findUnique({
    where: { id: req.params.id },
    include: { category: true, _count: { select: { downloadEvents: true } } },
  });
  if (!app) return res.status(404).json({ error: 'App not found' });
  return res.json({ ...app, sizeBytes: app.sizeBytes.toString() });
});

// ── Upload New App (with APK) ─────────────────────────────────────────────────
router.post('/upload', requireAdmin, upload.single('apk'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'APK file required' });

    const schema = z.object({
      categoryId: z.string().uuid(),
      name: z.string().min(1),
      packageName: z.string().regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/),
      description: z.string().optional(),
      developer: z.string().optional(),
      version: z.string().min(1),
      versionCode: z.string().transform(Number),
      minOsApi: z.string().transform(Number).optional(),
    });

    const data = schema.parse(req.body);

    // Compute checksum
    const checksum = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const objectName = `${data.packageName}-${data.version}.apk`;

    // Upload to MinIO
    const apkUrl = await uploadApk(objectName, req.file.buffer, req.file.mimetype || 'application/vnd.android.package-archive');

    const app = await prisma.app.create({
      data: {
        categoryId: data.categoryId,
        name: data.name,
        packageName: data.packageName,
        description: data.description,
        developer: data.developer || 'Worldline Global Services',
        version: data.version,
        versionCode: data.versionCode,
        apkUrl,
        apkObjectName: objectName,
        checksum,
        sizeBytes: BigInt(req.file.size),
        minOsApi: data.minOsApi || 26,
        isPublished: false,
      },
    });

    // Audit log
    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin!.adminId,
        action: 'UPLOAD_APP',
        entityType: 'App',
        entityId: app.id,
        details: { name: app.name, version: app.version, size: req.file.size },
      },
    });

    return res.status(201).json({ ...app, sizeBytes: app.sizeBytes.toString() });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// ── Update App Metadata ───────────────────────────────────────────────────────
router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { isPublished, description, categoryId, iconUrl } = req.body;
    const app = await prisma.app.update({
      where: { id: req.params.id },
      data: { isPublished, description, categoryId, iconUrl },
    });

    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin!.adminId,
        action: 'UPDATE_APP',
        entityType: 'App',
        entityId: app.id,
        details: req.body,
      },
    });

    return res.json({ ...app, sizeBytes: app.sizeBytes.toString() });
  } catch {
    return res.status(500).json({ error: 'Update failed' });
  }
});

// ── Delete App ────────────────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const app = await prisma.app.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: 'App not found' });

    await deleteObject(app.apkObjectName);
    await prisma.app.delete({ where: { id: req.params.id } });

    await prisma.adminAuditLog.create({
      data: {
        adminId: req.admin!.adminId,
        action: 'DELETE_APP',
        entityType: 'App',
        entityId: req.params.id,
        details: { name: app.name },
      },
    });

    return res.json({ message: 'App deleted' });
  } catch {
    return res.status(500).json({ error: 'Delete failed' });
  }
});

// ── Get App Download URL (Admin preview) ──────────────────────────────────────
router.get('/:id/download-url', requireAdmin, async (req: Request, res: Response) => {
  const app = await prisma.app.findUnique({ where: { id: req.params.id } });
  if (!app) return res.status(404).json({ error: 'App not found' });
  const url = await getPresignedUrl(app.apkObjectName);
  return res.json({ url });
});

export default router;
