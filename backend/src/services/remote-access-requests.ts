import { PrismaClient } from '@prisma/client';

const DEFAULT_EXPIRY_MINUTES = 15;

export async function expireStaleRemoteAccessRequests(
  prisma: PrismaClient,
  expiryMinutes = DEFAULT_EXPIRY_MINUTES
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
