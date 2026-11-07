import { DeviceCommand, DeviceCommandType } from '@prisma/client';

// Device polling cadence, mirrored from the Android client (CommandPollService
// polls every FOREGROUND_POLL_SEC while the app is running; WorkManager is the
// 15-minute safety net when the service has been killed).
export const FOREGROUND_POLL_SEC = 10;
export const BACKGROUND_POLL_MIN = 15;
const ONLINE_WINDOW_MS = 45_000;
const REBOOT_EXPECTED_MS = 5 * 60_000;
const APP_RESTART_EXPECTED_MS = 60_000;
const CONSENT_EXPECTED_MS = 2 * 60_000;

export type StepState = 'done' | 'active' | 'pending' | 'failed';

export interface TimelineStep {
  key: string;
  label: string;
  description: string;
  state: StepState;
  at: string | null;
}

export interface CommandView {
  id: string;
  type: DeviceCommandType;
  status: DeviceCommand['status'];
  stage: string | null;
  stageDetail: string | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  payload: unknown;
  steps: TimelineStep[];
  hint: string;
  expectedBy: string | null;
  overdue: boolean;
  finished: boolean;
}

interface StageDef { key: string; label: string; description: string }

// Ordered, device-reported stages that happen AFTER the device received the
// command. "QUEUED" and "DELIVERED" are derived from timestamps, not stages.
const STAGES: Record<DeviceCommandType, StageDef[]> = {
  RESTART_APP: [
    { key: 'RESTARTING', label: 'Restarting WL BizStore', description: 'The app is closing and relaunching itself.' },
    { key: 'BACK_ONLINE', label: 'App is back online', description: 'WL BizStore started again and checked in.' },
  ],
  RESTART_DEVICE: [
    { key: 'REBOOTING', label: 'Rebooting the terminal', description: 'The operating system is restarting.' },
    { key: 'BACK_ONLINE', label: 'Terminal is back online', description: 'The terminal booted and WL BizStore checked in.' },
  ],
  START_SCREEN_SHARE: [
    { key: 'CONSENT_PENDING', label: 'Waiting for on-device approval', description: 'Android requires someone at the terminal to tap "Start now" on the screen-capture prompt.' },
    { key: 'CONNECTING', label: 'Connecting video stream', description: 'Setting up the peer-to-peer WebRTC connection.' },
    { key: 'STREAMING', label: 'Live screen streaming', description: 'The terminal screen is being streamed to the portal.' },
  ],
  STOP_SCREEN_SHARE: [
    { key: 'STOPPED', label: 'Screen sharing stopped', description: 'The terminal stopped capturing its screen.' },
  ],
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.round(m / 60)} h`;
}

export function buildCommandView(cmd: DeviceCommand, terminalLastSeenAt: Date | null, now = new Date()): CommandView {
  const defs = STAGES[cmd.type] ?? [];
  const failed = cmd.status === 'FAILED';
  const completed = cmd.status === 'COMPLETED';

  // How many post-delivery stages are done.
  let stagesDone = 0;
  if (completed) {
    stagesDone = defs.length;
  } else if (cmd.stage) {
    const idx = defs.findIndex((d) => d.key === cmd.stage);
    // A reported stage means that stage has been *reached* (in progress), so
    // everything before it is done; it is the active step.
    stagesDone = idx >= 0 ? idx : 0;
  }

  const steps: TimelineStep[] = [];
  steps.push({
    key: 'QUEUED', label: 'Queued on server', description: 'The command was saved and is waiting for the terminal to collect it.',
    state: 'done', at: iso(cmd.createdAt),
  });

  const delivered = !!cmd.acknowledgedAt;
  steps.push({
    key: 'DELIVERED', label: 'Delivered to terminal', description: 'The terminal checked in and picked up the command.',
    state: delivered ? 'done' : failed ? 'failed' : 'active', at: iso(cmd.acknowledgedAt),
  });

  let activeAssigned = !delivered; // 'active' already used by DELIVERED if not delivered
  defs.forEach((def, i) => {
    let state: StepState;
    let at: Date | null = null;
    if (!delivered) {
      state = 'pending';
    } else if (i < stagesDone) {
      state = 'done';
      at = i === stagesDone - 1 && completed ? cmd.completedAt : cmd.stageUpdatedAt;
    } else if (!activeAssigned) {
      activeAssigned = true;
      state = failed ? 'failed' : 'active';
      at = cmd.stageUpdatedAt;
    } else {
      state = 'pending';
    }
    steps.push({ key: def.key, label: def.label, description: def.description, state, at: iso(at) });
  });

  // Delivered but device hasn't reported any stage yet and nothing is active
  // (e.g. older app versions only report COMPLETED/FAILED): mark first stage active.
  if (delivered && !failed && !completed && !steps.some((s) => s.state === 'active') && steps.length > 2) {
    const firstPending = steps.find((s, i) => i >= 2 && s.state === 'pending');
    if (firstPending) firstPending.state = 'active';
  }

  // ── Human hint + ETA ────────────────────────────────────────────────────
  let hint = '';
  let expectedBy: Date | null = null;
  let overdue = false;
  const lastSeenAge = terminalLastSeenAt ? now.getTime() - terminalLastSeenAt.getTime() : null;

  if (cmd.status === 'PENDING') {
    if (lastSeenAge !== null && lastSeenAge <= ONLINE_WINDOW_MS) {
      hint = `Terminal is online (checked in ${ago(lastSeenAge)} ago). It should pick this up within about ${FOREGROUND_POLL_SEC} seconds.`;
      expectedBy = new Date(cmd.createdAt.getTime() + (FOREGROUND_POLL_SEC + 20) * 1000);
    } else if (terminalLastSeenAt) {
      hint = `Terminal last checked in ${ago(lastSeenAge!)} ago. WL BizStore checks every ${FOREGROUND_POLL_SEC}s while it is running and at least every ${BACKGROUND_POLL_MIN} min in the background, so this will be delivered when it next connects.`;
      expectedBy = new Date(Math.max(now.getTime(), terminalLastSeenAt.getTime()) + BACKGROUND_POLL_MIN * 60_000);
    } else {
      hint = 'This terminal has never checked in, so the command cannot be delivered yet.';
    }
    overdue = expectedBy ? now > expectedBy : false;
  } else if (cmd.status === 'ACKNOWLEDGED') {
    const since = cmd.stageUpdatedAt ?? cmd.acknowledgedAt ?? cmd.createdAt;
    switch (cmd.stage) {
      case 'CONSENT_PENDING':
        hint = 'Waiting for someone at the terminal to tap "Start now" on the screen-capture prompt (Android requires this for every new session).';
        expectedBy = new Date(since.getTime() + CONSENT_EXPECTED_MS);
        break;
      case 'CONNECTING':
        hint = 'Approved on the terminal. Establishing the live video connection.';
        expectedBy = new Date(since.getTime() + 30_000);
        break;
      case 'REBOOTING':
        hint = 'The terminal is rebooting. This usually takes 1–3 minutes; we are waiting for WL BizStore to start again.';
        expectedBy = new Date(since.getTime() + REBOOT_EXPECTED_MS);
        break;
      case 'RESTARTING':
        hint = 'WL BizStore is relaunching itself. This normally takes a few seconds.';
        expectedBy = new Date(since.getTime() + APP_RESTART_EXPECTED_MS);
        break;
      default:
        hint = 'The terminal has received the command and is working on it.';
        expectedBy = new Date(since.getTime() + 60_000);
    }
    if (cmd.stageDetail) hint += ` (${cmd.stageDetail})`;
    overdue = expectedBy ? now > expectedBy : false;
    if (overdue) hint += ' This is taking longer than expected.';
  } else if (completed) {
    hint = cmd.type === 'START_SCREEN_SHARE' ? 'Screen sharing session established.' : 'Completed successfully.';
  } else if (failed) {
    hint = cmd.errorMessage ? `Failed: ${cmd.errorMessage}` : 'The terminal reported a failure.';
  }

  return {
    id: cmd.id,
    type: cmd.type,
    status: cmd.status,
    stage: cmd.stage,
    stageDetail: cmd.stageDetail,
    createdAt: cmd.createdAt,
    acknowledgedAt: cmd.acknowledgedAt,
    completedAt: cmd.completedAt,
    errorMessage: cmd.errorMessage,
    payload: cmd.payload,
    steps,
    hint,
    expectedBy: iso(expectedBy),
    overdue,
    finished: completed || failed,
  };
}

/** Allowed device-reported stages per command type (validates /progress calls). */
export function isValidStage(type: DeviceCommandType, stage: string): boolean {
  if (stage === 'RECEIVED') return true;
  return (STAGES[type] ?? []).some((d) => d.key === stage);
}

