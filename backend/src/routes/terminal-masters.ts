import { Router, Request, Response } from 'express';
import { PrismaClient, TerminalMasterStatus } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── List Terminal Masters (Device Provisioning) ──────────────────────────────
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const customerId = req.query.customerId as string;
  const status = req.query.status as string;
  const search = (req.query.search as string) || '';

  const where: any = {};
  if (customerId) where.customerId = customerId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { tid: { contains: search, mode: 'insensitive' } },
      { serialNo: { contains: search, mode: 'insensitive' } },
    ];
  }

  const masters = await prisma.terminalMaster.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, code: true } },
      terminal: { select: { id: true, status: true, lastSeenAt: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ terminalMasters: masters });
});

router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const master = await prisma.terminalMaster.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      terminal: true,
      assignments: { include: { app: { select: { id: true, name: true, iconUrl: true } } } },
    },
  });
  if (!master) return res.status(404).json({ error: 'Terminal master not found' });
  return res.json({ terminalMaster: master });
});

const createSchema = z.object({
  tid: z.string().min(3).optional().or(z.literal('')),
  serialNo: z.string().min(1),
  customerId: z.string().min(1),
  model: z.string().optional(),
  branchCode: z.string().optional(),
  site: z.string().optional(),
  notes: z.string().optional(),
});

async function resolveCustomer(customerId: string) {
  const isUuid = z.string().uuid().safeParse(customerId).success;
  return prisma.customer.findUnique({
    where: isUuid ? { id: customerId } : { code: customerId.toUpperCase() },
  });
}

// ── Create a single Terminal Master ───────────────────────────────────────────
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const customer = await resolveCustomer(data.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const master = await prisma.terminalMaster.create({
      data: {
        tid: data.tid ? data.tid : null,
        serialNo: data.serialNo,
        customerId: customer.id,
        model: data.model,
        branchCode: data.branchCode,
        site: data.site,
        notes: data.notes,
        createdById: req.admin!.adminId,
      },
    });

    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'CREATE_TERMINAL_MASTER', entityType: 'TerminalMaster', entityId: master.id, details: data },
    });

    return res.status(201).json({ terminalMaster: master });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    if ((e as any)?.code === 'P2002') return res.status(409).json({ error: 'TID or Serial No already registered' });
    return res.status(500).json({ error: 'Create failed' });
  }
});

// ── Bulk Import (rows pre-parsed from CSV/XLSX on the client) ────────────────
const bulkRowSchema = z.object({
  tid: z.string().min(3).optional().or(z.literal('')),
  serialNo: z.string().min(1),
  customerCode: z.string().min(1),
  model: z.string().optional(),
  branchCode: z.string().optional(),
  site: z.string().optional(),
});

router.post('/bulk-import', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ rows: z.array(bulkRowSchema).min(1).max(5000) });
  let rows;
  try {
    ({ rows } = schema.parse(req.body));
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const results: { row: number; tid: string; status: 'created' | 'skipped'; reason?: string }[] = [];
  let created = 0;

  // Pre-fetch all customers once for fast code lookups
  const customers = await prisma.customer.findMany({ select: { id: true, code: true } });
  const customerByCode = new Map(customers.map(c => [c.code.toUpperCase(), c.id]));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const customerId = customerByCode.get(row.customerCode.toUpperCase());
    if (!customerId) {
      results.push({ row: i + 1, tid: row.tid || '(none)', status: 'skipped', reason: `Unknown customer code "${row.customerCode}"` });
      continue;
    }
    try {
      await prisma.terminalMaster.create({
        data: {
          tid: row.tid ? row.tid : null,
          serialNo: row.serialNo,
          customerId,
          model: row.model,
          branchCode: row.branchCode,
          site: row.site,
          createdById: req.admin!.adminId,
        },
      });
      created++;
      results.push({ row: i + 1, tid: row.tid || '(none)', status: 'created' });
    } catch (e: any) {
      results.push({ row: i + 1, tid: row.tid || '(none)', status: 'skipped', reason: e?.code === 'P2002' ? 'Duplicate TID or Serial No' : 'Insert failed' });
    }
  }

  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'BULK_IMPORT_TERMINAL_MASTERS', entityType: 'TerminalMaster', entityId: 'bulk', details: { total: rows.length, created } },
  });

  return res.status(201).json({ created, skipped: rows.length - created, results });
});

router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({
    tid: z.string().min(3).optional(),
    customerId: z.string().optional(),
    model: z.string().optional(),
    branchCode: z.string().optional(),
    site: z.string().optional(),
    notes: z.string().optional(),
    status: z.nativeEnum(TerminalMasterStatus).optional(),
  });
  try {
    const data = schema.parse(req.body);
    let customerId: string | undefined;
    if (data.customerId) {
      const customer = await resolveCustomer(data.customerId);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      customerId = customer.id;
    }
    const master = await prisma.terminalMaster.update({
      where: { id: req.params.id },
      data: { ...data, customerId },
    });
    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'UPDATE_TERMINAL_MASTER', entityType: 'TerminalMaster', entityId: master.id, details: data },
    });
    return res.json({ terminalMaster: master });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    if ((e as any)?.code === 'P2002') return res.status(409).json({ error: 'TID already registered to another device' });
    return res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  const master = await prisma.terminalMaster.findUnique({ where: { id: req.params.id }, include: { terminal: true } });
  if (!master) return res.status(404).json({ error: 'Terminal master not found' });
  if (master.terminal) return res.status(409).json({ error: 'Cannot delete — a device has already enrolled against this master. Retire it instead.' });

  await prisma.terminalMaster.delete({ where: { id: req.params.id } });
  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'DELETE_TERMINAL_MASTER', entityType: 'TerminalMaster', entityId: req.params.id, details: {} },
  });
  return res.json({ message: 'Terminal master deleted' });
});

// ── Live Download Progress for one Serial No / TID ────────────────────────────
// Shows, for this terminal master's resolved DEFAULT apps (terminal overrides
// customer, same precedence as the device-facing catalog), the latest known
// install status per app plus a summary of which one is currently downloading
// — so the admin portal's "Downloads" view can show real-time progress
// instead of only a historical event log.
router.get('/:id/downloads', requireAdmin, async (req: Request, res: Response) => {
  const master = await prisma.terminalMaster.findUnique({
    where: { id: req.params.id },
    include: { terminal: true },
  });
  if (!master) return res.status(404).json({ error: 'Terminal master not found' });

  const assignments = await prisma.appAssignment.findMany({
    where: {
      mode: 'DEFAULT',
      OR: [
        { scope: 'CUSTOMER', customerId: master.customerId },
        { scope: 'TERMINAL', terminalMasterId: master.id },
      ],
    },
    include: { app: { select: { id: true, name: true, iconUrl: true } } },
  });

  const resolved = new Map<string, { app: { id: string; name: string; iconUrl: string | null }; order: number; source: string }>();
  for (const a of assignments) {
    if (a.scope === 'CUSTOMER') resolved.set(a.appId, { app: a.app, order: a.order, source: 'CUSTOMER' });
  }
  for (const a of assignments) {
    if (a.scope === 'TERMINAL') resolved.set(a.appId, { app: a.app, order: a.order, source: 'TERMINAL' });
  }
  const defaultApps = Array.from(resolved.values()).sort((x, y) => x.order - y.order);

  let appsWithStatus = defaultApps.map((d) => ({
    appId: d.app.id,
    name: d.app.name,
    iconUrl: d.app.iconUrl,
    order: d.order,
    source: d.source,
    status: 'NOT_STARTED' as string,
    timestamp: null as Date | null,
  }));

  if (master.terminal && defaultApps.length > 0) {
    const events = await prisma.downloadEvent.findMany({
      where: { terminalId: master.terminal.id, appId: { in: defaultApps.map((d) => d.app.id) } },
      orderBy: { timestamp: 'desc' },
    });
    const latestByApp = new Map<string, (typeof events)[number]>();
    for (const e of events) if (!latestByApp.has(e.appId)) latestByApp.set(e.appId, e);
    appsWithStatus = appsWithStatus.map((a) => {
      const ev = latestByApp.get(a.appId);
      return ev ? { ...a, status: ev.installStatus, timestamp: ev.timestamp } : a;
    });
  }

  const total = appsWithStatus.length;
  const completed = appsWithStatus.filter((a) => a.status === 'SUCCESS').length;
  const failed = appsWithStatus.filter((a) => a.status === 'FAILED').length;
  const downloading = appsWithStatus.find((a) => a.status === 'DOWNLOADING');
  const nextQueued = appsWithStatus.find((a) => a.status === 'NOT_STARTED' || a.status === 'PENDING');

  return res.json({
    serialNo: master.serialNo,
    tid: master.tid,
    enrolled: !!master.terminal,
    apps: appsWithStatus,
    summary: {
      total,
      completed,
      failed,
      currentlyDownloading: downloading?.name ?? null,
      nextInQueue: !downloading ? nextQueued?.name ?? null : null,
    },
  });
});

export default router;

