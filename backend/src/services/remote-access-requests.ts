import { PrismaClient } from '@prisma/client';

const DEFAULT_EXPIRY_MINUTES = 15;

export function getRemoteAccessRequestExpiryMinutes(): number {
  const raw = Number(process.env.REMOTE_ACCESS_REQUEST_EXPIRY_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_EXPIRY_MINUTES;
}

export function computeExpiresAt(requestedAt: Date, expiryMinutes = getRemoteAccessRequestExpiryMinutes()): Date {
  return new Date(requestedAt.getTime() + expiryMinutes * 60_000);
}

/**
 * Cheap startup sanity check: confirms the remote-access-request tables actually
 * exist and are queryable. The #1 cause of "remote access requests don't work" in
 * production is forgetting to run `prisma migrate deploy` after an update — without
 * this check that shows up only as opaque 500s the first time a terminal/admin hits
 * the feature, not at deploy time.
 */
export async function checkRemoteAccessSchema(prisma = new PrismaClient()): Promise<void> {
  await prisma.remoteAccessRequest.count();
  await prisma.deviceCommand.count();
}

export async function expireStaleRemoteAccessRequests(
  prisma: PrismaClient,
  expiryMinutes = getRemoteAccessRequestExpiryMinutes()
) {
  const cutoff = new Date(Date.now() - expiryMinutes * 60_000);
  await prisma.remoteAccessRequest.updateMany({
    where: {
      status: 'PENDING',
      requestedAt: { lt: cutoff },
    },
    data: {
      status: 'EXPIRED',
    },
  });
}
