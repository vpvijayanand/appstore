import { Router, Request, Response } from 'express';
import { PrismaClient, AssignmentMode } from '@prisma/client';
import { requireTerminal } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// All catalog routes require terminal authentication

type ResolvedAssignment = { mode: AssignmentMode; source: 'TERMINAL' | 'CUSTOMER' };

// Resolve, for a given terminal, the full set of apps it can see and whether
// each one is "assigned" (and via what mode), applying TERMINAL > CUSTOMER precedence.
async function resolveAppsForTerminal(customerId: string, terminalMasterId: string | null) {
  const [publicApps, assignments] = await Promise.all([
    prisma.app.findMany({ where: { isPublished: true, visibility: 'PUBLIC' }, include: { category: true } }),
    prisma.appAssignment.findMany({
      where: {
        OR: [
          { scope: 'CUSTOMER', customerId },
          ...(terminalMasterId ? [{ scope: 'TERMINAL' as const, terminalMasterId }] : []),
        ],
      },
      include: { app: { include: { category: true } } },
    }),
  ]);

  // Build resolved-assignment map: appId -> { mode, source }, TERMINAL wins over CUSTOMER.
  const resolved = new Map<string, ResolvedAssignment>();
  for (const a of assignments) {
    if (a.scope === 'CUSTOMER' && !resolved.has(a.appId)) {
      resolved.set(a.appId, { mode: a.mode, source: 'CUSTOMER' });
    }
  }
  for (const a of assignments) {
    if (a.scope === 'TERMINAL') {
      resolved.set(a.appId, { mode: a.mode, source: 'TERMINAL' }); // always overrides
    }
  }

  // Union of public apps + assigned apps (assigned apps may be PRIVATE)
  const appMap = new Map<string, any>();
  for (const app of publicApps) appMap.set(app.id, app);
  for (const a of assignments) {
    if (a.app.isPublished) appMap.set(a.app.id, a.app);
  }

  return Array.from(appMap.values()).map((app) => {
    const assignment = resolved.get(app.id);
    return {
      app,
      visibility: app.visibility,
      isAssigned: !!assignment,
      assignmentMode: assignment?.mode ?? null,
      assignmentSource: assignment?.source ?? null,
    };
  });
}

function serializeApp(entry: { app: any; visibility: string; isAssigned: boolean; assignmentMode: string | null; assignmentSource: string | null }) {
  const { app } = entry;
  return {
    id: app.id,
    name: app.name,
    packageName: app.packageName,
    description: app.description,
    developer: app.developer,
    version: app.version,
    versionCode: app.versionCode,
    sizeBytes: app.sizeBytes.toString(),
    minOsApi: app.minOsApi,
    iconUrl: app.iconUrl,
    checksum: app.checksum,
    updatedAt: app.updatedAt,
    categoryId: app.categoryId,
    categoryName: app.category?.name,
    visibility: entry.visibility,
    isAssigned: entry.isAssigned,
    assignmentMode: entry.assignmentMode,
    assignmentSource: entry.assignmentSource,
  };
}

// ── Get Full Store Catalog ───────────────────────────────────────────────────
// Returns ALL published apps grouped by category (PUBLIC apps + apps assigned
// to this terminal's customer or device), each flagged with assignment info
// so the client can distinguish "For You" vs "All Apps".
router.get('/', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { customerId, terminalMasterId } = req.terminal!;
    const resolvedApps = await resolveAppsForTerminal(customerId, terminalMasterId);

    const categoriesMap = new Map<string, any>();
    for (const entry of resolvedApps) {
      const cat = entry.app.category;
      if (!categoriesMap.has(cat.id)) {
        categoriesMap.set(cat.id, {
          categoryId: cat.id,
          categoryName: cat.name,
          categoryIcon: cat.iconName,
          sortOrder: cat.sortOrder,
          apps: [],
        });
      }
      categoriesMap.get(cat.id).apps.push(serializeApp(entry));
    }

    const catalog = Array.from(categoriesMap.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    return res.json({ catalog, customerId });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch catalog' });
  }
});

// ── Get Default Apps ──────────────────────────────────────────────────────────
// Returns only the apps assigned with mode=DEFAULT (terminal overrides customer),
// used by the Android client to auto-download on first run.
router.get('/default-apps', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { customerId, terminalMasterId } = req.terminal!;
    const resolvedApps = await resolveAppsForTerminal(customerId, terminalMasterId);
    const defaults = resolvedApps.filter((e) => e.assignmentMode === 'DEFAULT').map(serializeApp);
    return res.json({ apps: defaults, count: defaults.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch default apps' });
  }
});

// ── Get App Download URL ──────────────────────────────────────────────────────
// Generates a short-lived signed URL for APK download
router.get('/download/:appId', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { appId } = req.params;
    const { customerId, terminalMasterId, dbId: terminalDbId } = req.terminal!;

    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: { category: true },
    });

    if (!app || !app.isPublished) {
      return res.status(404).json({ error: 'App not found' });
    }

    // Entitlement check: PUBLIC apps are downloadable by anyone on the store;
    // PRIVATE apps require an explicit CUSTOMER or TERMINAL assignment.
    if (app.visibility !== 'PUBLIC') {
      const assignment = await prisma.appAssignment.findFirst({
        where: {
          appId: app.id,
          OR: [
            { scope: 'CUSTOMER', customerId },
            ...(terminalMasterId ? [{ scope: 'TERMINAL' as const, terminalMasterId }] : []),
          ],
        },
      });
      if (!assignment) return res.status(403).json({ error: 'Not entitled to this app' });
    }

    const { getPresignedUrl } = await import('../services/minio');
    const downloadUrl = await getPresignedUrl(app.apkObjectName);

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
