import { Router, Request, Response } from 'express';
import { PrismaClient, DeviceCommandType } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';
import { buildCommandView } from '../services/command-timeline';
import { getTerminalAdvertisementStates } from '../services/ad-delivery';
import crypto from 'crypto';

const router = Router();
const prisma = new PrismaClient();

const ONLINE_WINDOW_MS = 45_000;
const isOnline = (lastSeenAt: Date | null) => !!lastSeenAt && Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;

router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const customerId = req.query.customerId as string;
  const status = req.query.status as string;
  const where: any = {};
  if (customerId) where.customerId = customerId;
  if (status) where.status = status;

  const terminals = await prisma.terminal.findMany({
    where,
    include: { customer: { select: { name: true, code: true } }, _count: { select: { downloadEvents: true } } },
    orderBy: { enrolledAt: 'desc' },
  });

  return res.json({ terminals: terminals.map(t => ({
    ...t,
    apiKey: t.apiKey.substring(0, 8) + '...',  // mask
    lastLatitude: t.lastLatitude ? Number(t.lastLatitude) : null,
    lastLongitude: t.lastLongitude ? Number(t.lastLongitude) : null,
  })) });
});

// ── Active operations across ALL terminals ───────────────────────────────────
// Commands that are still in flight (or finished within the last 2 minutes),
// so the Terminals page can show a live "what is happening right now" panel.
// Declared before '/:id' routes for clarity.
router.get('/commands/active', requireAdmin, async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - 30 * 60_000);
  const recentlyFinished = new Date(Date.now() - 2 * 60_000);
  const commands = await prisma.deviceCommand.findMany({
    where: {
      createdAt: { gte: since },
      OR: [
        { status: { in: ['PENDING', 'ACKNOWLEDGED'] } },
        { completedAt: { gte: recentlyFinished } },
      ],
      // Screen-share start/stop are shown on the Remote Screen page itself.
      type: { in: ['RESTART_APP', 'RESTART_DEVICE'] },
    },
    include: { terminal: { select: { id: true, terminalId: true, lastSeenAt: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return res.json({
    commands: commands.map((c) => ({
      ...buildCommandView(c, c.terminal.lastSeenAt),
      terminalDbId: c.terminal.id,
      terminalId: c.terminal.terminalId,
    })),
  });
});

router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const terminal = await prisma.terminal.findUnique({
    where: { id: req.params.id },
    include: {
      customer: true,
      downloadEvents: {
        include: { app: { select: { name: true } } },
        orderBy: { timestamp: 'desc' },
        take: 20,
      },
    },
  });
  if (!terminal) return res.status(404).json({ error: 'Terminal not found' });
  return res.json({ terminal: {
    ...terminal,
    apiKey: terminal.apiKey.substring(0, 8) + '...',
    lastLatitude: terminal.lastLatitude ? Number(terminal.lastLatitude) : null,
    lastLongitude: terminal.lastLongitude ? Number(terminal.lastLongitude) : null,
  } });
});

// Revoke & regenerate API key
router.post('/:id/rotate-key', requireAdmin, async (req: Request, res: Response) => {
  const newKey = 'wl_' + crypto.randomBytes(24).toString('hex');
  await prisma.terminal.update({ where: { id: req.params.id }, data: { apiKey: newKey } });
  await prisma.adminAuditLog.create({
    data: { adminId: req.admin!.adminId, action: 'ROTATE_API_KEY', entityType: 'Terminal', entityId: req.params.id, details: {} },
  });
  return res.json({ message: 'API key rotated', newKey });
});

// Retire / wipe terminal
router.patch('/:id/status', requireAdmin, async (req: Request, res: Response) => {
  const schema = z.object({ status: z.enum(['ACTIVE', 'RETIRED', 'WIPED']) });
  try {
    const { status } = schema.parse(req.body);
    const terminal = await prisma.terminal.update({ where: { id: req.params.id }, data: { status } });
    return res.json({ terminal });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    return res.status(500).json({ error: 'Update failed' });
  }
});

// ── Remote Commands (restart app, reboot device, screen share, …) ────────────
// Queue a command for a terminal; the device picks it up next time it polls
// GET /api/terminal/commands/pending (see routes/device-commands.ts) and then
// reports step-by-step progress which we expose as a timeline.
const queueCommandSchema = z.object({
  type: z.nativeEnum(DeviceCommandType),
});

router.post('/:id/commands', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { type } = queueCommandSchema.parse(req.body);
    const terminal = await prisma.terminal.findUnique({ where: { id: req.params.id } });
    if (!terminal) return res.status(404).json({ error: 'Terminal not found' });

    // Don't stack duplicate restarts/reboots: if the same command is already in
    // flight (and recent), hand back that one so the UI just shows its progress.
    if (type === 'RESTART_APP' || type === 'RESTART_DEVICE') {
      const existing = await prisma.deviceCommand.findFirst({
        where: {
          terminalId: terminal.id,
          type,
          status: { in: ['PENDING', 'ACKNOWLEDGED'] },
          createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        return res.json({ command: buildCommandView(existing, terminal.lastSeenAt), alreadyInProgress: true });
      }
    }

    const command = await prisma.deviceCommand.create({
      data: { terminalId: terminal.id, type, createdById: req.admin!.adminId },
    });
    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'QUEUE_DEVICE_COMMAND', entityType: 'Terminal', entityId: terminal.id, details: { type } },
    });
    return res.json({ command: buildCommandView(command, terminal.lastSeenAt), alreadyInProgress: false });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Failed to queue command' });
  }
});

// Recent command history + live progress for a terminal (admin view).
router.get('/:id/commands', requireAdmin, async (req: Request, res: Response) => {
  const terminal = await prisma.terminal.findUnique({ where: { id: req.params.id }, select: { lastSeenAt: true } });
  if (!terminal) return res.status(404).json({ error: 'Terminal not found' });
  const commands = await prisma.deviceCommand.findMany({
    where: { terminalId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return res.json({ commands: commands.map((c) => buildCommandView(c, terminal.lastSeenAt)), online: isOnline(terminal.lastSeenAt) });
});

// One command with its step-by-step timeline (polled by the progress modal).
router.get('/:id/commands/:commandId', requireAdmin, async (req: Request, res: Response) => {
  const command = await prisma.deviceCommand.findUnique({
    where: { id: req.params.commandId },
    include: { terminal: { select: { id: true, terminalId: true, lastSeenAt: true } } },
  });
  if (!command || command.terminalId !== req.params.id) return res.status(404).json({ error: 'Command not found' });
  return res.json({
    command: buildCommandView(command, command.terminal.lastSeenAt),
    terminal: { id: command.terminal.id, terminalId: command.terminal.terminalId, lastSeenAt: command.terminal.lastSeenAt, online: isOnline(command.terminal.lastSeenAt) },
  });
});

// ── Everything "in flight" for one terminal ──────────────────────────────────
// Commands, app installs and advertisements, each with a human-readable state,
// so an admin can see what the terminal has done and what it is still waiting on.
router.get('/:id/activity', requireAdmin, async (req: Request, res: Response) => {
  try {
    const terminal = await prisma.terminal.findUnique({
      where: { id: req.params.id },
      include: { customer: { select: { name: true } } },
    });
    if (!terminal) return res.status(404).json({ error: 'Terminal not found' });

    const [commands, assignments, events, ads] = await Promise.all([
      prisma.deviceCommand.findMany({ where: { terminalId: terminal.id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      prisma.appAssignment.findMany({
        where: {
          OR: [
            { scope: 'CUSTOMER', customerId: terminal.customerId },
            ...(terminal.terminalMasterId ? [{ scope: 'TERMINAL' as const, terminalMasterId: terminal.terminalMasterId }] : []),
          ],
        },
        include: { app: { select: { id: true, name: true, version: true, isPublished: true } } },
      }),
      prisma.downloadEvent.findMany({ where: { terminalId: terminal.id }, orderBy: { timestamp: 'desc' }, take: 200 }),
      getTerminalAdvertisementStates(terminal),
    ]);

    // TERMINAL-scope assignment overrides CUSTOMER-scope for the same app.
    const resolved = new Map<string, (typeof assignments)[number]>();
    for (const a of assignments) if (a.scope === 'CUSTOMER' && !resolved.has(a.appId)) resolved.set(a.appId, a);
    for (const a of assignments) if (a.scope === 'TERMINAL') resolved.set(a.appId, a);

    const latestEvent = new Map<string, (typeof events)[number]>();
    for (const e of events) if (!latestEvent.has(e.appId)) latestEvent.set(e.appId, e);

    const apps = Array.from(resolved.values())
      .filter((a) => a.app.isPublished)
      .sort((a, b) => a.order - b.order)
      .map((a) => {
        const ev = latestEvent.get(a.appId);
        let state: 'WAITING' | 'IN_PROGRESS' | 'INSTALLED' | 'FAILED' | 'AVAILABLE';
        let detail: string;
        if (!ev) {
          if (a.mode === 'DEFAULT') {
            state = 'WAITING';
            detail = 'Waiting for the terminal to start the automatic install. It begins when WL BizStore is opened and runs the setup/“missing apps” install.';
          } else {
            state = 'AVAILABLE';
            detail = 'Available in the store on the terminal; installs when the user taps Install.';
          }
        } else if (ev.installStatus === 'SUCCESS') {
          state = 'INSTALLED'; detail = `Installed v${ev.version}.`;
        } else if (ev.installStatus === 'FAILED') {
          state = 'FAILED'; detail = `Last install attempt failed (v${ev.version}).`;
        } else {
          const stale = Date.now() - ev.timestamp.getTime() > 15 * 60_000;
          state = stale ? 'FAILED' : 'IN_PROGRESS';
          detail = stale
            ? `Install started (v${ev.version}) but no result was reported for over 15 minutes.`
            : ev.installStatus === 'DOWNLOADING' ? `Downloading v${ev.version}…` : `Starting install of v${ev.version}…`;
        }
        return {
          appId: a.appId, name: a.app.name, version: a.app.version, mode: a.mode, source: a.scope, order: a.order,
          state, detail, at: ev?.timestamp ?? null,
        };
      });

    return res.json({
      terminal: {
        id: terminal.id, terminalId: terminal.terminalId, serialNo: terminal.serialNo, customer: terminal.customer.name,
        lastSeenAt: terminal.lastSeenAt, online: isOnline(terminal.lastSeenAt),
      },
      commands: commands.map((c) => buildCommandView(c, terminal.lastSeenAt)),
      apps,
      advertisements: ads,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to load terminal activity' });
  }
});

export default router;
