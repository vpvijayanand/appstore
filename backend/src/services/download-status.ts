import { PrismaClient } from '@prisma/client';

// If a terminal never confirms a download/install outcome, we auto-fail stale
// events so admin views do not show indefinite PENDING/DOWNLOADING rows.
const PENDING_TIMEOUT_MS = 3 * 60_000;
const DOWNLOADING_TIMEOUT_MS = 15 * 60_000;

export async function expireStaleDownloadEvents(prisma: PrismaClient) {
  const now = Date.now();
  const pendingBefore = new Date(now - PENDING_TIMEOUT_MS);
  const downloadingBefore = new Date(now - DOWNLOADING_TIMEOUT_MS);

  await Promise.all([
    prisma.downloadEvent.updateMany({
      where: {
        installStatus: 'PENDING',
        timestamp: { lt: pendingBefore },
      },
      data: {
        installStatus: 'FAILED',
        timestamp: new Date(),
      },
    }),
    prisma.downloadEvent.updateMany({
      where: {
        installStatus: 'DOWNLOADING',
        timestamp: { lt: downloadingBefore },
      },
      data: {
        installStatus: 'FAILED',
        timestamp: new Date(),
      },
    }),
  ]);
}
