import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// ── List Terminal Groups ──────────────────────────────────────────────────────
// Supports an optional `search` (by group name) and `customerId` filter, same
// pattern as /terminal-masters, so this scales to many groups too.
router.get('/', requireAdmin, async (req: Request, res: Response) => {
  const search = (req.query.search as string) || '';
  const customerId = req.query.customerId as string;

  const where: any = {};
  if (customerId) where.customerId = customerId;
  if (search) where.name = { contains: search, mode: 'insensitive' };

  const groups = await prisma.terminalGroup.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, code: true } },
      _count: { select: { members: true, assignments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return res.json({ terminalGroups: groups });
});

// ── Get One Group (with full member list) ────────────────────────────────────
router.get('/:id', requireAdmin, async (req: Request, res: Response) => {
  const group = await prisma.terminalGroup.findUnique({
    where: { id: req.params.id },
    include: {
      customer: { select: { id: true, name: true, code: true } },
      members: {
        select: { id: true, serialNo: true, tid: true, customer: { select: { id: true, name: true } } },
      },
    },
  });
  if (!group) return res.status(404).json({ error: 'Terminal group not found' });
  return res.json({ terminalGroup: group });
});

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  customerId: z.string().optional(),
  memberIds: z.array(z.string()).optional().default([]),
});

// ── Create a Group ────────────────────────────────────────────────────────────
router.post('/', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const group = await prisma.terminalGroup.create({
      data: {
        name: data.name,
        description: data.description,
        customerId: data.customerId || null,
        createdById: req.admin!.adminId,
        members: data.memberIds.length ? { connect: data.memberIds.map(id => ({ id })) } : undefined,
      },
      include: { _count: { select: { members: true } } },
    });

    await prisma.adminAuditLog.create({
      data: { adminId: req.admin!.adminId, action: 'CREATE_TERMINAL_GROUP', entityType: 'TerminalGroup', entityId: group.id, details: data },
    });

    return res.status(201).json({ terminalGroup: group });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    if ((e as any)?.code === 'P2002') return res.status(409).json({ error: 'A group with this name already exists' });
    console.error(e);
    return res.status(500).json({ error: 'Failed to create terminal group' });
  }
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  customerId: z.string().nullable().optional(),
});

// ── Update Group Name/Description ─────────────────────────────────────────────
router.patch('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const group = await prisma.terminalGroup.update({
      where: { id: req.params.id },
      data,
    });
    return res.json({ terminalGroup: group });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    if ((e as any)?.code === 'P2025') return res.status(404).json({ error: 'Terminal group not found' });
    if ((e as any)?.code === 'P2002') return res.status(409).json({ error: 'A group with this name already exists' });
    console.error(e);
    return res.status(500).json({ error: 'Failed to update terminal group' });
  }
});

// ── Delete Group ───────────────────────────────────────────────────────────────
router.delete('/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    await prisma.terminalGroup.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (e) {
    if ((e as any)?.code === 'P2025') return res.status(404).json({ error: 'Terminal group not found' });
    console.error(e);
    return res.status(500).json({ error: 'Failed to delete terminal group' });
  }
});

const membersSchema = z.object({ terminalMasterIds: z.array(z.string()).min(1) });

// ── Add Members ────────────────────────────────────────────────────────────────
router.post('/:id/members', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { terminalMasterIds } = membersSchema.parse(req.body);
    const group = await prisma.terminalGroup.update({
      where: { id: req.params.id },
      data: { members: { connect: terminalMasterIds.map(id => ({ id })) } },
      include: { _count: { select: { members: true } } },
    });
    return res.json({ terminalGroup: group });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.errors });
    if ((e as any)?.code === 'P2025') return res.status(404).json({ error: 'Terminal group or terminal master not found' });
    console.error(e);
    return res.status(500).json({ error: 'Failed to add members' });
  }
});

// ── Remove One Member ─────────────────────────────────────────────────────────
router.delete('/:id/members/:terminalMasterId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const group = await prisma.terminalGroup.update({
      where: { id: req.params.id },
      data: { members: { disconnect: { id: req.params.terminalMasterId } } },
      include: { _count: { select: { members: true } } },
    });
    return res.json({ terminalGroup: group });
  } catch (e) {
    if ((e as any)?.code === 'P2025') return res.status(404).json({ error: 'Terminal group not found' });
    console.error(e);
    return res.status(500).json({ error: 'Failed to remove member' });
  }
});

export default router;
