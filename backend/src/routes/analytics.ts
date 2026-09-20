import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── Dashboard Stats ───────────────────────────────────────────────────────────
router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  const [totalApps, totalTerminals, totalCustomers, totalDownloads] = await Promise.all([
    prisma.app.count({ where: { isPublished: true } }),
    prisma.terminal.count({ where: { status: 'ACTIVE' } }),
    prisma.customer.count(),
    prisma.downloadEvent.count(),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [downloadsToday, successfulInstalls, failedInstalls] = await Promise.all([
    prisma.downloadEvent.count({ where: { timestamp: { gte: today } } }),
    prisma.downloadEvent.count({ where: { installStatus: 'SUCCESS' } }),
    prisma.downloadEvent.count({ where: { installStatus: 'FAILED' } }),
  ]);

  return res.json({
    totalApps,
    totalTerminals,
    totalCustomers,
    totalDownloads,
    downloadsToday,
    successfulInstalls,
    failedInstalls,
    successRate: totalDownloads > 0 ? ((successfulInstalls / totalDownloads) * 100).toFixed(1) : '0',
  });
});

// ── Download Events (paginated) ───────────────────────────────────────────────
router.get('/events', requireAdmin, async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const customerId = req.query.customerId as string;
  const appId = req.query.appId as string;
  const status = req.query.status as string;
  const from = req.query.from ? new Date(req.query.from as string) : undefined;
  const to = req.query.to ? new Date(req.query.to as string) : undefined;

  const where: any = {};
  if (appId) where.appId = appId;
  if (status) where.installStatus = status;
  if (from || to) where.timestamp = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (customerId) where.terminal = { customerId };

  const [events, total] = await Promise.all([
    prisma.downloadEvent.findMany({
      where,
      include: {
        terminal: { select: { terminalId: true, site: true, model: true, customer: { select: { name: true } } } },
        app: { select: { name: true, packageName: true, version: true } },
      },
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.downloadEvent.count({ where }),
  ]);

  return res.json({ events, total, page, pages: Math.ceil(total / limit) });
});

// ── GPS Map Data ──────────────────────────────────────────────────────────────
router.get('/map', requireAdmin, async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;
  const since = new Date(Date.now() - days * 86400000);

  const events = await prisma.downloadEvent.findMany({
    where: {
      timestamp: { gte: since },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      latitude: true,
      longitude: true,
      installStatus: true,
      timestamp: true,
      terminal: { select: { terminalId: true, site: true, customer: { select: { name: true } } } },
      app: { select: { name: true } },
    },
    orderBy: { timestamp: 'desc' },
    take: 500,
  });

  const mapPoints = events.map(e => ({
    id: e.id,
    lat: Number(e.latitude),
    lng: Number(e.longitude),
    status: e.installStatus,
    timestamp: e.timestamp,
    terminalId: e.terminal.terminalId,
    site: e.terminal.site,
    customerName: e.terminal.customer.name,
    appName: e.app.name,
  }));

  return res.json({ points: mapPoints });
});

// ── Downloads Per App ─────────────────────────────────────────────────────────
router.get('/top-apps', requireAdmin, async (_req: Request, res: Response) => {
  const results = await prisma.downloadEvent.groupBy({
    by: ['appId'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 10,
  });

  const appIds = results.map(r => r.appId);
  const apps = await prisma.app.findMany({ where: { id: { in: appIds } }, select: { id: true, name: true, packageName: true } });

  const topApps = results.map(r => ({
    appId: r.appId,
    count: r._count.id,
    name: apps.find(a => a.id === r.appId)?.name || 'Unknown',
    packageName: apps.find(a => a.id === r.appId)?.packageName || '',
  }));

  return res.json({ topApps });
});

// ── Downloads Over Time ───────────────────────────────────────────────────────
router.get('/trend', requireAdmin, async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30;

  // Get daily counts for last N days
  const dailyData: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - i);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const count = await prisma.downloadEvent.count({
      where: { timestamp: { gte: dayStart, lte: dayEnd } },
    });
    dailyData.push({ date: dayStart.toISOString().split('T')[0], count });
  }

  return res.json({ trend: dailyData });
});

// ── Terminal Activity ─────────────────────────────────────────────────────────
router.get('/terminals', requireAdmin, async (_req: Request, res: Response) => {
  const terminals = await prisma.terminal.findMany({
    include: {
      customer: { select: { name: true } },
      _count: { select: { downloadEvents: true } },
    },
    orderBy: { lastSeenAt: 'desc' },
  });

  return res.json({ terminals: terminals.map(t => ({
    ...t,
    lastLatitude: t.lastLatitude ? Number(t.lastLatitude) : null,
    lastLongitude: t.lastLongitude ? Number(t.lastLongitude) : null,
  })) });
});

export default router;
