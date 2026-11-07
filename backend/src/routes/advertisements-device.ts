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
//
// Side effect: records that THIS terminal has fetched each returned ad
// (AdvertisementDelivery.lastFetchedAt) so the admin portal can show the ad as
// "delivered to terminal" rather than "waiting for terminal".
router.get('/pending', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { customerId, terminalMasterId, dbId } = req.terminal!;
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

    // Record delivery (best-effort — never fail the poll because of tracking).
    await Promise.all(
      Array.from(seen.keys()).map((advertisementId) =>
        prisma.advertisementDelivery.upsert({
          where: { advertisementId_terminalId: { advertisementId, terminalId: dbId } },
          update: { lastFetchedAt: now },
          create: { advertisementId, terminalId: dbId, firstFetchedAt: now, lastFetchedAt: now },
        }).catch((err) => console.warn('[ads] delivery upsert failed:', err?.message))
      )
    );

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

// ── Report That An Ad Was Actually Displayed ─────────────────────────────────
// Called by the Android app each time AdvertisementActivity puts an ad on screen.
router.post('/:id/shown', requireTerminal, async (req: Request, res: Response) => {
  try {
    const { dbId } = req.terminal!;
    const advertisementId = req.params.id;
    const ad = await prisma.advertisement.findUnique({ where: { id: advertisementId }, select: { id: true } });
    if (!ad) return res.status(404).json({ error: 'Advertisement not found' });

    const now = new Date();
    await prisma.advertisementDelivery.upsert({
      where: { advertisementId_terminalId: { advertisementId, terminalId: dbId } },
      update: { lastShownAt: now, firstShownAt: undefined, showCount: { increment: 1 } },
      create: { advertisementId, terminalId: dbId, firstFetchedAt: now, lastFetchedAt: now, firstShownAt: now, lastShownAt: now, showCount: 1 },
    });
    // firstShownAt only set once.
    await prisma.advertisementDelivery.updateMany({
      where: { advertisementId, terminalId: dbId, firstShownAt: null },
      data: { firstShownAt: now },
    });
    return res.json({ message: 'Recorded' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to record ad display' });
  }
});

export default router;
