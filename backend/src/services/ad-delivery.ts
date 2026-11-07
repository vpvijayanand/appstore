import { PrismaClient, Advertisement, AdvertisementDelivery } from '@prisma/client';

const prisma = new PrismaClient();

const ONLINE_WINDOW_MS = 45_000;
export const SCREENSAVER_IDLE_SEC = 60; // mirrors AdvertisementManager.IDLE_THRESHOLD_MS on the device

export type AdState =
  | 'NOT_ENROLLED'
  | 'SCHEDULED'
  | 'WAITING_FOR_DEVICE'
  | 'DELIVERED'
  | 'SHOWN'
  | 'ENDED'
  | 'INACTIVE';

export interface AdStateResult {
  state: AdState;
  label: string;
  detail: string;
  eta: string | null; // ISO — when the next meaningful event is expected
  steps: { key: string; label: string; state: 'done' | 'active' | 'pending'; at: string | null }[];
}

function fmtDur(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 48) return rm ? `${h} h ${rm} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Computes where an advertisement is in its journey to ONE terminal:
 *   Assigned → Schedule active → Fetched by terminal → Shown on screen.
 * `lastPopupShownAt` is the terminal's most recent POPUP of ANY ad, because the
 * Android app throttles popups with one global cooldown (popupIntervalHours).
 */
export function computeAdState(
  ad: Pick<Advertisement, 'isActive' | 'startAt' | 'endAt' | 'displayMode'>,
  delivery: AdvertisementDelivery | null,
  lastPopupShownAt: Date | null,
  popupIntervalHours: number,
  now = new Date(),
): AdStateResult {
  const assigned = { key: 'ASSIGNED', label: 'Assigned', state: 'done' as const, at: null as string | null };
  const mk = (
    schedule: 'done' | 'active' | 'pending',
    fetched: 'done' | 'active' | 'pending',
    shown: 'done' | 'active' | 'pending',
  ): AdStateResult['steps'] => [
    assigned,
    { key: 'SCHEDULE', label: 'Schedule window open', state: schedule, at: schedule === 'done' ? iso(ad.startAt) : null },
    { key: 'FETCHED', label: 'Delivered to terminal', state: fetched, at: iso(delivery?.firstFetchedAt) },
    { key: 'SHOWN', label: 'Shown on terminal screen', state: shown, at: iso(delivery?.firstShownAt) },
  ];

  if (!ad.isActive) {
    return { state: 'INACTIVE', label: 'Paused', detail: 'This advertisement is switched off, so terminals will not show it.', eta: null, steps: mk('pending', 'pending', 'pending') };
  }
  if (now > ad.endAt) {
    return {
      state: 'ENDED', label: 'Ended',
      detail: delivery?.showCount ? `Campaign ended. It was shown ${delivery.showCount} time(s) on this terminal.` : 'Campaign ended without being shown on this terminal.',
      eta: null, steps: mk('done', delivery ? 'done' : 'pending', delivery?.showCount ? 'done' : 'pending'),
    };
  }
  if (now < ad.startAt) {
    return {
      state: 'SCHEDULED', label: 'Scheduled',
      detail: `Starts in ${fmtDur(ad.startAt.getTime() - now.getTime())}. The terminal will fetch it once the window opens.`,
      eta: iso(ad.startAt), steps: mk('active', 'pending', 'pending'),
    };
  }

  const popupCooldownMs = Math.max(popupIntervalHours, 1) * 3600_000;
  const nextPopupAt = lastPopupShownAt ? new Date(lastPopupShownAt.getTime() + popupCooldownMs) : null;
  const cooldownActive = nextPopupAt ? nextPopupAt > now : false;

  if (!delivery) {
    return {
      state: 'WAITING_FOR_DEVICE', label: 'Waiting for terminal',
      detail: 'The schedule is live but the terminal has not fetched this ad yet. The WL BizStore app fetches ads whenever its screen changes, so it will be picked up on the next screen change.',
      eta: null, steps: mk('done', 'active', 'pending'),
    };
  }

  if (delivery.showCount === 0) {
    if (ad.displayMode === 'SCREENSAVER') {
      return {
        state: 'DELIVERED', label: 'Delivered — waiting to display',
        detail: `Delivered to the terminal. It will appear as a screensaver after ${SCREENSAVER_IDLE_SEC}s of no touch on the catalog screen.`,
        eta: null, steps: mk('done', 'done', 'active'),
      };
    }
    if (cooldownActive && nextPopupAt) {
      return {
        state: 'DELIVERED', label: 'Delivered — waiting for popup window',
        detail: `Delivered to the terminal. Popups are limited to one every ${popupIntervalHours} h, so it can be shown in ${fmtDur(nextPopupAt.getTime() - now.getTime())} (on the first screen change after that).`,
        eta: iso(nextPopupAt), steps: mk('done', 'done', 'active'),
      };
    }
    return {
      state: 'DELIVERED', label: 'Delivered — shows on next screen change',
      detail: 'Delivered to the terminal. It will pop up the next time the terminal changes screen.',
      eta: null, steps: mk('done', 'done', 'active'),
    };
  }

  let detail = `Shown ${delivery.showCount} time(s). Last shown ${delivery.lastShownAt ? fmtDur(now.getTime() - delivery.lastShownAt.getTime()) + ' ago' : ''}.`;
  let eta: string | null = null;
  if (ad.displayMode === 'POPUP' && nextPopupAt && cooldownActive) {
    detail += ` Next popup possible in ${fmtDur(nextPopupAt.getTime() - now.getTime())}.`;
    eta = iso(nextPopupAt);
  }
  detail += ` Campaign ends in ${fmtDur(ad.endAt.getTime() - now.getTime())}.`;
  return { state: 'SHOWN', label: 'Shown on terminal', detail, eta, steps: mk('done', 'done', 'done') };
}

/** Per-terminal delivery rows for one advertisement (admin "delivery status" view). */
export async function getAdvertisementDeliveryStatus(advertisementId: string) {
  const ad = await prisma.advertisement.findUnique({
    where: { id: advertisementId },
    include: { assignments: true },
  });
  if (!ad) return null;

  const settings = await prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  const customerIds = ad.assignments.filter((a) => a.scope === 'CUSTOMER' && a.customerId).map((a) => a.customerId!);
  const masterIds = ad.assignments.filter((a) => a.scope === 'TERMINAL' && a.terminalMasterId).map((a) => a.terminalMasterId!);
  const groupIds = ad.assignments.filter((a) => a.scope === 'GROUP' && a.groupId).map((a) => a.groupId!);

  const groupMembers = groupIds.length
    ? await prisma.terminalGroup.findMany({ where: { id: { in: groupIds } }, select: { members: { select: { id: true } } } })
    : [];
  const allMasterIds = Array.from(new Set([...masterIds, ...groupMembers.flatMap((g) => g.members.map((m) => m.id))]));

  const terminals = await prisma.terminal.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        ...(customerIds.length ? [{ customerId: { in: customerIds } }] : []),
        ...(allMasterIds.length ? [{ terminalMasterId: { in: allMasterIds } }] : []),
      ],
    },
    include: { customer: { select: { name: true } } },
  });

  // Terminal masters assigned directly/by group that haven't enrolled a device yet.
  const enrolledMasterIds = new Set(terminals.map((t) => t.terminalMasterId).filter(Boolean) as string[]);
  const notEnrolledMasters = allMasterIds.length
    ? await prisma.terminalMaster.findMany({
        where: { id: { in: allMasterIds.filter((id) => !enrolledMasterIds.has(id)) } },
        select: { id: true, serialNo: true, tid: true },
      })
    : [];

  const terminalIds = terminals.map((t) => t.id);
  const [deliveries, popupShown] = await Promise.all([
    prisma.advertisementDelivery.findMany({ where: { advertisementId, terminalId: { in: terminalIds } } }),
    prisma.advertisementDelivery.groupBy({
      by: ['terminalId'],
      where: { terminalId: { in: terminalIds }, advertisement: { displayMode: 'POPUP' }, lastShownAt: { not: null } },
      _max: { lastShownAt: true },
    }),
  ]);
  const deliveryByTerminal = new Map(deliveries.map((d) => [d.terminalId, d]));
  const lastPopupByTerminal = new Map(popupShown.map((p) => [p.terminalId, p._max.lastShownAt]));
  const now = new Date();

  const rows = terminals.map((t) => {
    const r = computeAdState(ad, deliveryByTerminal.get(t.id) ?? null, lastPopupByTerminal.get(t.id) ?? null, settings.popupIntervalHours, now);
    const d = deliveryByTerminal.get(t.id);
    return {
      terminalDbId: t.id,
      terminalId: t.terminalId,
      serialNo: t.serialNo,
      customer: t.customer.name,
      online: !!t.lastSeenAt && now.getTime() - t.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
      lastSeenAt: iso(t.lastSeenAt),
      ...r,
      firstFetchedAt: iso(d?.firstFetchedAt),
      lastFetchedAt: iso(d?.lastFetchedAt),
      lastShownAt: iso(d?.lastShownAt),
      showCount: d?.showCount ?? 0,
    };
  });

  for (const m of notEnrolledMasters) {
    rows.push({
      terminalDbId: '', terminalId: m.tid ?? '—', serialNo: m.serialNo, customer: '', online: false, lastSeenAt: null,
      state: 'NOT_ENROLLED', label: 'Device not enrolled', detail: 'Assigned to this serial number, but no physical terminal has enrolled yet. It will be delivered after enrollment.',
      eta: null, steps: [
        { key: 'ASSIGNED', label: 'Assigned', state: 'done', at: null },
        { key: 'SCHEDULE', label: 'Schedule window open', state: 'pending', at: null },
        { key: 'FETCHED', label: 'Delivered to terminal', state: 'pending', at: null },
        { key: 'SHOWN', label: 'Shown on terminal screen', state: 'pending', at: null },
      ],
      firstFetchedAt: null, lastFetchedAt: null, lastShownAt: null, showCount: 0,
    });
  }

  const summary: Record<string, number> = {};
  for (const r of rows) summary[r.state] = (summary[r.state] ?? 0) + 1;

  return {
    advertisement: { id: ad.id, title: ad.title, displayMode: ad.displayMode, startAt: ad.startAt, endAt: ad.endAt, isActive: ad.isActive },
    popupIntervalHours: settings.popupIntervalHours,
    summary,
    total: rows.length,
    rows,
  };
}

/** Advertisement states for ONE terminal (terminal "activity" view). */
export async function getTerminalAdvertisementStates(terminal: { id: string; customerId: string; terminalMasterId: string | null }) {
  const groups = terminal.terminalMasterId
    ? await prisma.terminalGroup.findMany({ where: { members: { some: { id: terminal.terminalMasterId } } }, select: { id: true } })
    : [];
  const horizon = new Date(Date.now() - 24 * 3600_000);
  const assignments = await prisma.advertisementAssignment.findMany({
    where: {
      OR: [
        { scope: 'CUSTOMER', customerId: terminal.customerId },
        ...(terminal.terminalMasterId ? [{ scope: 'TERMINAL' as const, terminalMasterId: terminal.terminalMasterId }] : []),
        ...(groups.length ? [{ scope: 'GROUP' as const, groupId: { in: groups.map((g) => g.id) } }] : []),
      ],
      advertisement: { endAt: { gte: horizon } },
    },
    include: { advertisement: true },
  });
  const ads = new Map(assignments.map((a) => [a.advertisement.id, a.advertisement]));

  const [settings, deliveries] = await Promise.all([
    prisma.appSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } }),
    prisma.advertisementDelivery.findMany({ where: { terminalId: terminal.id }, include: { advertisement: { select: { displayMode: true } } } }),
  ]);
  const byAd = new Map(deliveries.map((d) => [d.advertisementId, d]));
  const lastPopup = deliveries
    .filter((d) => d.advertisement.displayMode === 'POPUP' && d.lastShownAt)
    .reduce<Date | null>((max, d) => (!max || d.lastShownAt! > max ? d.lastShownAt : max), null);

  return Array.from(ads.values()).map((ad) => ({
    advertisementId: ad.id,
    title: ad.title,
    displayMode: ad.displayMode,
    startAt: ad.startAt,
    endAt: ad.endAt,
    showCount: byAd.get(ad.id)?.showCount ?? 0,
    lastShownAt: iso(byAd.get(ad.id)?.lastShownAt),
    ...computeAdState(ad, byAd.get(ad.id) ?? null, lastPopup, settings.popupIntervalHours),
  }));
}
