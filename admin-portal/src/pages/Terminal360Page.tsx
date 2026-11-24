import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Monitor, Power, RotateCw } from 'lucide-react';
import { terminalsApi } from '../api';
import './Terminal360Page.css';

type Tone = 'ok' | 'bad' | 'mid' | 'info';
type BoxKey = 'default' | 'demand' | 'ads' | 'downloads';

interface Terminal360Data {
  terminal: { id: string; terminalId: string; serialNo: string; customer: string; location: string; online: boolean; active: boolean };
  defaultApps: { name: string; version: string; installed: boolean }[];
  demandApps: { name: string; version: string; installed: boolean }[];
  ads: { title: string; where: string; startAt: string; endAt: string }[];
  downloads: { name: string; version: string; status: 'SUCCESS' | 'FAILED' | 'IN_PROGRESS' }[];
}

// Fallback shown when the API cannot be reached.
const SAMPLE_DATA: Terminal360Data = {
  terminal: { id: 'sample', terminalId: 'TID-000123', serialNo: 'SN-9A31-7742', customer: 'Sample Bank Ltd', location: 'Chennai, Tamil Nadu', online: true, active: false },
  defaultApps: [
    { name: 'WL Pay', version: '2.4.1', installed: true },
    { name: 'Merchant Hub', version: '1.9.0', installed: true },
    { name: 'Settlement', version: '1.2.3', installed: false },
  ],
  demandApps: [
    { name: 'Loyalty Plus', version: '3.0.2', installed: true },
    { name: 'Invoice Lite', version: '1.1.0', installed: false },
    { name: 'Bill Pay', version: '2.0.0', installed: false },
  ],
  ads: [
    { title: 'Festive Cashback Offer', where: 'Popup', startAt: '2025-01-01T00:00:00Z', endAt: '2025-12-31T00:00:00Z' },
    { title: 'New UPI Launch', where: 'Screensaver', startAt: '2025-02-01T00:00:00Z', endAt: '2025-10-31T00:00:00Z' },
  ],
  downloads: [
    { name: 'WL Pay', version: '2.4.1', status: 'SUCCESS' },
    { name: 'Merchant Hub', version: '1.9.0', status: 'SUCCESS' },
    { name: 'Settlement', version: '1.2.3', status: 'FAILED' },
  ],
};

const fmtDate = (s: string) => { const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); };

function mapActivity(r: any): Terminal360Data {
  const t = r.terminal ?? {};
  const apps: any[] = r.apps ?? [];
  return {
    terminal: {
      id: t.id, terminalId: t.terminalId ?? '—', serialNo: t.serialNo ?? '—', customer: t.customer ?? '—',
      location: t.site || '—', online: !!t.online, active: t.status === 'ACTIVE',
    },
    defaultApps: apps.filter((a) => a.mode === 'DEFAULT').map((a) => ({ name: a.name, version: a.version, installed: a.state === 'INSTALLED' })),
    demandApps: apps.filter((a) => a.mode !== 'DEFAULT').map((a) => ({ name: a.name, version: a.version, installed: a.state === 'INSTALLED' })),
    ads: (r.advertisements ?? []).map((a: any) => ({
      title: a.title, where: a.displayMode === 'POPUP' ? 'Popup' : 'Screensaver', startAt: a.startAt, endAt: a.endAt,
    })),
    downloads: (r.downloads ?? []).map((d: any) => ({ name: d.name, version: d.version, status: d.status })),
  };
}

const Tag = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`t360-tag ${tone}`}>{children}</span>;

const MAX_ROWS = 6;

export default function Terminal360Page() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Terminal360Data | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [active, setActive] = useState<{ key: BoxKey; style: CSSProperties } | null>(null);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(null);
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [busy, setBusy] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    terminalsApi.getActivity(id!)
      .then((res) => { if (!cancelled) { setData(mapActivity(res.data)); setIsSample(false); } })
      .catch(() => { if (!cancelled) { setData(SAMPLE_DATA); setIsSample(true); } });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setActive(null); setConfirmReboot(false); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const runCommand = async (type: 'RESTART_APP' | 'RESTART_DEVICE', okMsg: string) => {
    if (isSample) { showToast(`${okMsg} (sample data — no command sent)`); return; }
    setBusy(true);
    try {
      await terminalsApi.sendCommand(id!, type);
      showToast(okMsg);
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Command failed', true);
    } finally { setBusy(false); }
  };

  const boxes = useMemo(() => {
    if (!data) return [];
    const inst = (list: { installed: boolean }[]) => list.filter((a) => a.installed).length;
    const okDl = data.downloads.filter((d) => d.status === 'SUCCESS').length;
    const rows = {
      default: data.defaultApps.map((a) => ({ main: a.name, sub: `v${a.version}`, tag: a.installed ? <Tag tone="ok">Installed</Tag> : <Tag tone="mid">Pending</Tag> })),
      demand: data.demandApps.map((a) => ({ main: a.name, sub: `v${a.version}`, tag: a.installed ? <Tag tone="ok">Installed</Tag> : <Tag tone="info">Available</Tag> })),
      ads: data.ads.map((a) => ({ main: a.title, sub: `${fmtDate(a.startAt)} → ${fmtDate(a.endAt)}`, tag: <Tag tone="info">{a.where}</Tag> })),
      downloads: data.downloads.map((d) => ({
        main: d.name, sub: `v${d.version}`,
        tag: d.status === 'SUCCESS' ? <Tag tone="ok">Success</Tag> : d.status === 'FAILED' ? <Tag tone="bad">Failed</Tag> : <Tag tone="mid">In progress</Tag>,
      })),
    };
    return [
      { key: 'default' as BoxKey, label: 'Default Apps', angle: 0, count: data.defaultApps.length, hint: `${inst(data.defaultApps)} installed`, rows: rows.default },
      { key: 'demand' as BoxKey, label: 'Apps on Demand', angle: 90, count: data.demandApps.length, hint: `${inst(data.demandApps)} installed`, rows: rows.demand },
      { key: 'ads' as BoxKey, label: 'Advertisements', angle: 180, count: data.ads.length, hint: 'popup / screensaver', rows: rows.ads },
      { key: 'downloads' as BoxKey, label: 'Downloads', angle: 270, count: data.downloads.length, hint: `${okDl} successful`, rows: rows.downloads },
    ];
  }, [data]);

  const openPopup = (key: BoxKey, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(r.left + r.width / 2 - 160, 10), Math.max(10, window.innerWidth - 330));
    const below = r.bottom + 280 < window.innerHeight;
    setActive({ key, style: below ? { left, top: r.bottom + 12 } : { left, bottom: window.innerHeight - r.top + 12 } });
  };

  if (!data) return <div className="t360"><div className="t360-loading">Loading terminal…</div></div>;

  const activeBox = boxes.find((b) => b.key === active?.key);
  const t = data.terminal;

  return (
    <div className={`t360${active ? ' paused' : ''}`} data-active={active?.key ?? ''}>
      <div className="t360-head">
        <div>
          <h1 className="t360-title">TERMINAL 360 VIEW</h1>
          <p className="t360-sub">Everything on this terminal, at a glance. Hover or focus a card for details.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isSample && <span className="t360-chip sample">Sample data</span>}
          <span className={`t360-chip${t.online ? ' online' : ''}`}><span className="t360-dot" />{t.online ? 'Online' : 'Offline'}</span>
          <button className="t360-back" onClick={() => navigate('/terminals')}><ArrowLeft size={14} /> Terminals</button>
        </div>
      </div>

      <div className="t360-stage">
        <div className="t360-ring"><div className="t360-arc" /></div>
        <div className="t360-glow" />

        <div className="t360-orbit">
          {boxes.map((b, i) => (
            <div key={`s-${b.key}`} className={`t360-spoke ${b.key}`} style={{ ['--a' as string]: `${b.angle}deg`, ['--d' as string]: `${-i * 0.4}s` }} />
          ))}
          {boxes.map((b) => (
            <div key={b.key} className="t360-slot" style={{ ['--a' as string]: `${b.angle}deg` }}>
              <div className="t360-counter">
                <button
                  type="button"
                  className={`t360-box${active?.key === b.key ? ' on' : ''}`}
                  aria-describedby={active?.key === b.key ? 't360-pop' : undefined}
                  aria-label={`${b.label}: ${b.count}`}
                  onMouseEnter={(e) => openPopup(b.key, e.currentTarget)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={(e) => openPopup(b.key, e.currentTarget)}
                  onBlur={() => setActive(null)}
                  onClick={(e) => (active?.key === b.key ? setActive(null) : openPopup(b.key, e.currentTarget))}
                >
                  <span className="t360-box-label">{b.label}</span>
                  <span className="t360-box-count">{b.count}</span>
                  <span className="t360-box-hint">{b.hint}</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="t360-term" aria-label="Terminal">
          <div className="t360-screen">
            <div><b>TERMINAL ID</b><span>{t.terminalId}</span></div>
            <div><b>S.NO</b><span>{t.serialNo}</span></div>
            <div><b>CUSTOMER</b><span>{t.customer}</span></div>
            <div><b>LOCATION</b><span>{t.location}</span></div>
          </div>
          <div className="t360-keys">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
          <div className="t360-slotline" />
        </div>
      </div>

      {active && activeBox && (
        <div id="t360-pop" role="tooltip" className="t360-pop" style={active.style}>
          <h4>{activeBox.label.toUpperCase()} · {activeBox.count}</h4>
          {activeBox.rows.length === 0 ? <div className="empty">Nothing here yet.</div> : (
            <ul>
              {activeBox.rows.slice(0, MAX_ROWS).map((r, i) => (
                <li key={i}><span>{r.main}<small>{r.sub}</small></span>{r.tag}</li>
              ))}
              {activeBox.rows.length > MAX_ROWS && <li><span className="empty">+{activeBox.rows.length - MAX_ROWS} more</span></li>}
            </ul>
          )}
        </div>
      )}

      <div className="t360-panel">
        <button className="t360-btn" disabled={busy || (!isSample && !t.active)} onClick={() => runCommand('RESTART_APP', 'App restart command sent')}>
          <Power size={16} /> App Restart
        </button>
        <button className="t360-btn danger" disabled={busy || (!isSample && !t.active)} onClick={() => setConfirmReboot(true)}>
          <RotateCw size={16} /> Device Reboot
        </button>
        <Link className="t360-btn violet" to="/remote-access-requests" onClick={() => showToast('Opening remote access queue…')}>
          <Monitor size={16} /> Remote Access
        </Link>
      </div>

      {confirmReboot && (
        <div className="t360-modal-bg" onClick={() => setConfirmReboot(false)}>
          <div className="t360-modal" role="alertdialog" aria-modal="true" aria-labelledby="t360-cf" onClick={(e) => e.stopPropagation()}>
            <h3 id="t360-cf">Reboot device?</h3>
            <p>The physical terminal <b>{t.terminalId}</b> will restart and be unavailable for a few minutes.</p>
            <div>
              <button className="t360-btn" autoFocus onClick={() => setConfirmReboot(false)}>Cancel</button>
              <button className="t360-btn danger" onClick={() => { setConfirmReboot(false); runCommand('RESTART_DEVICE', 'Device reboot command sent'); }}>Reboot</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`t360-toast${toast.error ? ' error' : ''}`} role="status">{toast.msg}</div>}
    </div>
  );
}
