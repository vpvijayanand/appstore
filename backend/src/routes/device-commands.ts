import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireTerminal } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// All routes here are terminal-facing (device polling), authenticated via X-Terminal-Key.

// ── Get Pending Commands ──────────────────────────────────────────────────────
// Returns any commands still PENDING for this terminal and immediately flips
// them to ACKNOWLEDGED so the same command isn't redelivered on the next poll.
// The device reports final outcome via POST /:id/complete.
router.get('/pending', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { dbId } = req.terminal!;
    const pending = await prisma.deviceCommand.findMany({
      where: { terminalId: dbId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    if (pending.length > 0) {
      await prisma.deviceCommand.updateMany({
        where: { id: { in: pending.map((c) => c.id) } },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt: new Date() },
      });
    }

    return res.json({ commands: pending.map((c) => ({ id: c.id, type: c.type, payload: c.payload })) });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to fetch pending commands' });
  }
});

// ── Report Command Outcome ────────────────────────────────────────────────────
const completeSchema = z.object({
  status: z.enum(['COMPLETED', 'FAILED']),
  errorMessage: z.string().optional(),
});

router.post('/:id/complete', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { status, errorMessage } = completeSchema.parse(req.body);
    const { dbId } = req.terminal!;

    const command = await prisma.deviceCommand.findUnique({ where: { id: req.params.id } });
    // Only allow a terminal to complete its own commands.
    if (!command || command.terminalId !== dbId) {
      return res.status(404).json({ error: 'Command not found' });
    }

    await prisma.deviceCommand.update({
      where: { id: command.id },
      data: { status, completedAt: new Date(), errorMessage: errorMessage ?? null },
    });

    return res.json({ message: 'Command outcome recorded' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    console.error(e);
    return res.status(500).json({ error: 'Failed to record command outcome' });
  }
});

export default router;
