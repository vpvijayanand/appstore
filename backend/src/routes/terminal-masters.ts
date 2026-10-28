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
  tid: z.string().min(3),
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
        tid: data.tid,
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
  tid: z.string().min(3),
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
      results.push({ row: i + 1, tid: row.tid, status: 'skipped', reason: `Unknown customer code "${row.customerCode}"` });
      continue;
    }
    try {
      await prisma.terminalMaster.create({
        data: {
          tid: row.tid,
          serialNo: row.serialNo,
          customerId,
          model: row.model,
          branchCode: row.branchCode,
          site: row.site,
          createdById: req.admin!.adminId,
        },
      });
      created++;
      results.push({ row: i + 1, tid: row.tid, status: 'created' });
    } catch (e: any) {
      results.push({ row: i + 1, tid: row.tid, status: 'skipped', reason: e?.code === 'P2002' ? 'Duplicate TID or Serial No' : 'Insert failed' });
    }
  }

  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'BULK_IMPORT_TERMINAL_MASTERS', entityType: 'TerminalMaster', entityId: 'bulk', details: { total: rows.length, created } },
  });

  return res.status(201).json({ created, skipped: rows.length - created, results });
});

router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({
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

export default router;
