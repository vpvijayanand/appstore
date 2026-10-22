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

    // Fetch entitlements for this customer (which now point to specific apps)
    const entitlements = await prisma.customerEntitlement.findMany({
      where: { customerId },
      include: {
        app: {
          include: {
            category: true,
          }
        },
      },
    });

    // We need to return categories with their apps to keep the Android UI intact.
    // Group the entitled apps by their category.
    const categoriesMap = new Map<string, any>();

    for (const e of entitlements) {
      if (!e.app.isPublished) continue;
      
      const cat = e.app.category;
      if (!categoriesMap.has(cat.id)) {
        categoriesMap.set(cat.id, {
          categoryId: cat.id,
          categoryName: cat.name,
          categoryIcon: cat.iconName,
          sortOrder: cat.sortOrder,
          apps: [],
        });
      }
      
      const categoryEntry = categoriesMap.get(cat.id);
      categoryEntry.apps.push({
        id: e.app.id,
        name: e.app.name,
        packageName: e.app.packageName,
        description: e.app.description,
        developer: e.app.developer,
        version: e.app.version,
        versionCode: e.app.versionCode,
        sizeBytes: e.app.sizeBytes.toString(),
        minOsApi: e.app.minOsApi,
        iconUrl: e.app.iconUrl,
        checksum: e.app.checksum,
        updatedAt: e.app.updatedAt,
      });
    }

    const catalog = Array.from(categoriesMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

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
      where: { customerId_appId: { customerId, appId: app.id } },
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
