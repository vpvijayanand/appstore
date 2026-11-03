import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireTerminal } from '../middleware/auth';
import { getPresignedUrl } from '../services/minio';

const router = Router();
const prisma = new PrismaClient();

// ── Get Currently-Active Advertisements For This Terminal ─────────────────────
// Resolves ads assigned (directly, via the terminal's customer, or via a
// named TerminalGroup the device's TerminalMaster belongs to) to this device
// whose schedule window currently covers "now" and are still active. Same
// CUSTOMER/TERMINAL/GROUP union pattern as catalog.ts's app resolution — a
// terminal sees its customer-wide ads, its own device-specific ads, and any
// ads assigned to a group it's a member of.
router.get('/pending', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { customerId, terminalMasterId } = req.terminal!;
    const now = new Date();

    // A device's own terminal master may belong to one or more named groups
    // (see TerminalGroup) — resolve those first so group-scoped ad
    // assignments (scope: GROUP) are included below.
    const groupIds = terminalMasterId
      ? (await prisma.terminalGroup.findMany({
          where: { members: { some: { id: terminalMasterId } } },
          select: { id: true },
        })).map(g => g.id)
      : [];

    const [assignments, settings] = await Promise.all([
      prisma.advertisementAssignment.findMany({
        where: {
          OR: [
            { scope: 'CUSTOMER', customerId },
            ...(terminalMasterId ? [{ scope: 'TERMINAL' as const, terminalMasterId }] : []),
            ...(groupIds.length ? [{ scope: 'GROUP' as const, groupId: { in: groupIds } }] : []),
          ],
          advertisement: {
            isActive: true,
            startAt: { lte: now },
            endAt: { gte: now },
          },
        },
        include: { advertisement: true },
      }),
      prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    ]);

    // Dedupe (a terminal can match both a CUSTOMER and TERMINAL assignment for the same ad)
    const seen = new Map<string, (typeof assignments)[number]['advertisement']>();
    for (const a of assignments) seen.set(a.advertisement.id, a.advertisement);

    const advertisements = await Promise.all(
      Array.from(seen.values()).map(async (ad) => ({
        id: ad.id,
        title: ad.title,
        description: ad.description,
        type: ad.type,
        displayMode: ad.displayMode,
        durationSeconds: ad.durationSeconds,
        startAt: ad.startAt,
        endAt: ad.endAt,
        htmlContent: ad.type === 'HTML' ? ad.htmlContent : null,
        mediaUrl: ad.mediaObjectName ? await getPresignedUrl(ad.mediaObjectName, 3600) : null,
      }))
    );

    return res.json({ advertisements, popupIntervalHours: settings.popupIntervalHours });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to resolve advertisements' });
  }
});

export default router;
