import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireTerminal } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// All catalog routes require terminal authentication

// ── Get Entitled Catalog ─────────────────────────────────────────────────────
// Returns categories with apps that this terminal's customer is entitled to
router.get('/', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { customerId } = req.terminal!;

    // Fetch entitlements for this customer
    const entitlements = await prisma.customerEntitlement.findMany({
      where: { customerId },
      include: {
        category: {
          include: {
            apps: {
              where: { isPublished: true },
              orderBy: { name: 'asc' },
              select: {
                id: true,
                name: true,
                packageName: true,
                description: true,
                developer: true,
                version: true,
                versionCode: true,
                sizeBytes: true,
                minOsApi: true,
                iconUrl: true,
                checksum: true,
                updatedAt: true,
              },
            },
          },
        },
      },
      orderBy: { category: { sortOrder: 'asc' } },
    });

    const catalog = entitlements.map(e => ({
      categoryId: e.category.id,
      categoryName: e.category.name,
      categoryIcon: e.category.iconName,
      apps: e.category.apps.map(app => ({
        ...app,
        sizeBytes: app.sizeBytes.toString(),
      })),
    }));

    return res.json({ catalog, customerId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch catalog' });
  }
});

// ── Get App Download URL ──────────────────────────────────────────────────────
// Generates a short-lived signed URL for APK download
router.get('/download/:appId', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const { customerId, dbId: terminalDbId } = req.terminal!;

    // Verify app exists and customer is entitled
    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: { category: true },
    });

    if (!app || !app.isPublished) {
      return res.status(404).json({ error: 'App not found' });
    }

    const entitled = await prisma.customerEntitlement.findUnique({
      where: { customerId_categoryId: { customerId, categoryId: app.categoryId } },
    });

    if (!entitled) {
      return res.status(403).json({ error: 'Not entitled to this app' });
    }

    // Generate pre-signed URL via MinIO service
    const { getPresignedUrl } = await import('../services/minio');
    const downloadUrl = await getPresignedUrl(app.apkObjectName);

    // Create pending download event
    const event = await prisma.downloadEvent.create({
      data: {
        terminalId: terminalDbId,
        appId: app.id,
        version: app.version,
        installStatus: 'PENDING',
        ipAddress: req.ip,
      },
    });

    return res.json({
      downloadUrl,
      eventId: event.id,
      app: {
        id: app.id,
        name: app.name,
        version: app.version,
        checksum: app.checksum,
        sizeBytes: app.sizeBytes.toString(),
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to generate download URL' });
  }
});

export default router;
