import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireTerminal } from '../middleware/auth';
import { FOREGROUND_POLL_SEC, isValidStage } from '../services/command-timeline';

const router = Router();
const prisma = new PrismaClient();

// All routes here are terminal-facing (device polling), authenticated via X-Terminal-Key.

// ── Get Pending Commands ──────────────────────────────────────────────────────
// Returns any commands still PENDING for this terminal and immediately flips
// them to ACKNOWLEDGED (stage RECEIVED) so the same command isn't redelivered
// on the next poll. The device then reports fine-grained progress via
// POST /:id/progress and the final outcome via POST /:id/complete.
router.get('/pending', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { dbId } = req.terminal!;
    const candidates = await prisma.deviceCommand.findMany({
      where: { terminalId: dbId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    // Claim each command atomically (PENDING -> ACKNOWLEDGED). With several
    // pollers on the device (foreground service, resume check, WorkManager) two
    // requests can race on the same row; only the one whose conditional update
    // actually flips it gets to deliver the command, so it can never run twice.
    const now = new Date();
    const pending: typeof candidates = [];
    for (const c of candidates) {
      const claimed = await prisma.deviceCommand.updateMany({
        where: { id: c.id, status: 'PENDING' },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: now, stage: 'RECEIVED', stageUpdatedAt: now },
      });
      if (claimed.count === 1) pending.push(c);
    }

    return res.json({
      commands: pending.map((c) => ({ id: c.id, type: c.type, payload: c.payload })),
      pollIntervalSec: FOREGROUND_POLL_SEC,
      serverTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch pending commands' });
  }
});

// ── Report Progress (intermediate step) ───────────────────────────────────────
const progressSchema = z.object({
  stage: z.string().min(1).max(40),
  detail: z.string().max(300).optional(),
});

router.post('/:id/progress', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { stage, detail } = progressSchema.parse(req.body);
    const { dbId } = req.terminal!;

    const command = await prisma.deviceCommand.findUnique({ where: { id: req.params.id } });
    if (!command || command.terminalId !== dbId) {
      return res.status(404).json({ error: 'Command not found' });
    }
    if (!isValidStage(command.type, stage)) {
      return res.status(400).json({ error: `Unknown stage "${stage}" for ${command.type}` });
    }
    // Never move a finished command backwards.
    if (command.status === 'COMPLETED' || command.status === 'FAILED') {
      return res.json({ message: 'Command already finished' });
    }

    await prisma.deviceCommand.update({
      where: { id: command.id },
      data: {
        stage,
        stageDetail: detail ?? null,
        stageUpdatedAt: new Date(),
        // Reporting progress implies the device has the command, even if it
        // skipped the /pending flip (e.g. command fetched by an older build).
        ...(command.status === 'PENDING' ? { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() } : {}),
      },
    });
    return res.json({ message: 'Progress recorded' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Failed to record progress' });
  }
});

// ── Report Command Outcome ────────────────────────────────────────────────────
const completeSchema = z.object({
  status: z.enum(['COMPLETED', 'FAILED']),
  errorMessage: z.string().optional(),
  stage: z.string().max(40).optional(),
  detail: z.string().max(300).optional(),
});

router.post('/:id/complete', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { status, errorMessage, stage, detail } = completeSchema.parse(req.body);
    const { dbId } = req.terminal!;

    const command = await prisma.deviceCommand.findUnique({ where: { id: req.params.id } });
    // Only allow a terminal to complete its own commands.
    if (!command || command.terminalId !== dbId) {
      return res.status(404).json({ error: 'Command not found' });
    }

    const now = new Date();
    await prisma.deviceCommand.update({
      where: { id: command.id },
      data: {
        status,
        completedAt: now,
        errorMessage: errorMessage ?? null,
        ...(stage && isValidStage(command.type, stage) ? { stage, stageUpdatedAt: now } : {}),
        ...(detail ? { stageDetail: detail } : {}),
        ...(command.acknowledgedAt ? {} : { acknowledgedAt: now }),
      },
    });

    return res.json({ message: 'Command outcome recorded' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Failed to record command outcome' });
  }
});

export default router;
