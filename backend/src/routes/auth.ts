import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// ── Admin Login ───────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    const refreshToken = jwt.sign(
      { adminId: admin.id },
      process.env.JWT_REFRESH_SECRET!,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      refreshToken,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Login failed' });
  }
});

// ── Token Refresh ─────────────────────────────────────────────────────────────
router.post('/admin/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as { adminId: string };
    const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminId } });
    if (!admin) return res.status(401).json({ error: 'Admin not found' });

    const token = jwt.sign(
      { adminId: admin.id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    return res.json({ token });
  } catch {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── Terminal Enrollment ───────────────────────────────────────────────────────
const enrollSchema = z.object({
  terminalId: z.string().min(3),
  customerId: z.string().min(1),
  serialNo: z.string().optional(),
  imei: z.string().optional(),
  model: z.string().optional(),
  site: z.string().optional(),
  branchCode: z.string().optional(),
});

// Device provisioning policy for /terminal/enroll:
//  - 'strict' (recommended for production): the TID MUST already exist as a
//    pre-provisioned TerminalMaster (created by an admin, optionally in bulk).
//    The customer is derived ONLY from that master record — the client-supplied
//    customerId is ignored for trust purposes. Unknown TIDs are rejected.
//  - 'auto' (default, convenient for dev/demo): if no TerminalMaster exists for
//    the TID, one is created on the fly using the client-supplied customerId,
//    so existing flows keep working. Set TERMINAL_ENROLLMENT_MODE=strict to
//    close this gap once devices are provisioned via the admin portal.
const ENROLLMENT_MODE = (process.env.TERMINAL_ENROLLMENT_MODE || 'auto').toLowerCase();

router.post('/terminal/enroll', async (req: Request, res: Response) => {
  try {
    const data = enrollSchema.parse(req.body);

    // 1. Resolve the pre-provisioned Terminal Master by TID (the source of truth).
    let master = await prisma.terminalMaster.findUnique({ where: { tid: data.terminalId }, include: { customer: true } });

    if (!master) {
      if (ENROLLMENT_MODE === 'strict') {
        return res.status(403).json({ error: 'Device not pre-provisioned. Ask an administrator to register this Serial No / TID before enrolling.' });
      }

      // Auto-create mode: trust the client-supplied customerId (legacy behavior),
      // but materialize a TerminalMaster so the device is visible/manageable afterwards.
      const isUuid = z.string().uuid().safeParse(data.customerId).success;
      const customer = await prisma.customer.findUnique({
        where: isUuid ? { id: data.customerId } : { code: data.customerId.toUpperCase() },
      });
      if (!customer) return res.status(404).json({ error: 'Customer not found' });

      master = await prisma.terminalMaster.create({
        data: {
          tid: data.terminalId,
          serialNo: data.serialNo || `AUTO-${data.terminalId}`,
          customerId: customer.id,
          model: data.model,
          site: data.site,
          branchCode: data.branchCode,
          notes: 'Auto-created at enrollment (no pre-provisioned master found)',
        },
        include: { customer: true },
      });
    }

    const customer = master.customer;

    // 2. Upsert the Terminal, always linked to the trusted master's customer.
    const apiKey = 'wl_' + crypto.randomBytes(24).toString('hex');
    const terminal = await prisma.terminal.upsert({
      where: { terminalId: data.terminalId },
      update: { lastSeenAt: new Date(), status: 'ACTIVE', terminalMasterId: master.id, customerId: customer.id },
      create: {
        terminalId: data.terminalId,
        customerId: customer.id,
        terminalMasterId: master.id,
        serialNo: data.serialNo || master.serialNo,
        imei: data.imei,
        model: data.model || master.model,
        site: data.site || master.site,
        branchCode: data.branchCode || master.branchCode,
        apiKey,
        status: 'ACTIVE',
      },
    });

    return res.json({
      terminalId: terminal.terminalId,
      apiKey: terminal.apiKey,
      customerId: terminal.customerId,
      message: 'Terminal enrolled successfully',
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Enrollment failed' });
  }
});

// ── Terminal Ping / Verify API Key ────────────────────────────────────────────
router.post('/terminal/verify', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-terminal-key'] as string;
  if (!apiKey) return res.status(400).json({ error: 'API key required' });

  const terminal = await prisma.terminal.findUnique({
    where: { apiKey },
    include: { customer: { select: { id: true, name: true, code: true } } },
  });

  if (!terminal || terminal.status !== 'ACTIVE') {
    return res.status(401).json({ error: 'Invalid or inactive terminal' });
  }

  return res.json({
    terminalId: terminal.terminalId,
    customer: terminal.customer,
    site: terminal.site,
    model: terminal.model,
    status: terminal.status,
  });
});

export default router;
