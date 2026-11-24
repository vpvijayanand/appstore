import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Monitor, Power, RotateCw } from 'lucide-react';
import { terminalsApi } from '../api';
import './Terminal360Page.css';

type Tone = 'ok' | 'bad' | 'mid' | 'info';
type BoxKey = 'default' | 'demand' | 'ads' | 'downloads';
type PopKey = BoxKey | 'terminal';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

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

// Teal Android POS terminal: printer slot, camera, touchscreen (with live fields), keypad, card slot.
function PosSvg({ fields }: { fields: (readonly [string, string])[] }) {
  const keys: { x: number; y: number; fill: string }[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      let fill = 'url(#pk)';
      if (r === 3) fill = c === 0 ? 'url(#pr)' : c === 1 ? 'url(#py)' : 'url(#pg)';
      keys.push({ x: 28 + c * 54, y: 214 + r * 28, fill });
    }
  }
  return (
    <svg viewBox="0 0 200 360" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="pb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="0.45" stopColor="#14b8a6" /><stop offset="1" stopColor="#0b5e57" /></linearGradient>
        <linearGradient id="ps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0a3b44" /><stop offset="1" stopColor="#04141d" /></linearGradient>
        <linearGradient id="pk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0fdfa" /><stop offset="1" stopColor="#99d9d0" /></linearGradient>
        <linearGradient id="pr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff7b7b" /><stop offset="1" stopColor="#c62828" /></linearGradient>
        <linearGradient id="py" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#d49b00" /></linearGradient>
        <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6ee7a0" /><stop offset="1" stopColor="#15803d" /></linearGradient>
        <linearGradient id="pscan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#22e6ff" stopOpacity="0" /><stop offset="1" stopColor="#22e6ff" stopOpacity="0.5" /></linearGradient>
        <clipPath id="pclip"><rect x="30" y="40" width="140" height="152" rx="8" /></clipPath>
      </defs>
      <rect x="8" y="4" width="184" height="352" rx="30" fill="url(#pb)" stroke="#a7f3e8" strokeOpacity="0.7" strokeWidth="1.5" />
      <rect x="14" y="10" width="172" height="340" rx="25" fill="none" stroke="#042f2b" strokeOpacity="0.35" />
      <rect x="48" y="14" width="104" height="7" rx="3.5" fill="#052e2b" />
      <circle cx="100" cy="30" r="2.6" fill="#052e2b" /><circle cx="100" cy="30" r="1" fill="#22e6ff" />
      <rect x="22" y="36" width="156" height="160" rx="13" fill="#031a1c" stroke="#0f766e" />
      <rect x="30" y="40" width="140" height="152" rx="8" fill="url(#ps)" />
      <g clipPath="url(#pclip)">
        <rect className="t360-scan" x="30" y="40" width="140" height="24" fill="url(#pscan)" />
        <text x="38" y="53" fontSize="8" fontWeight="700" fill="#22e6ff" letterSpacing="1.5" fontFamily="Segoe UI, Arial, sans-serif">WL BIZSTORE</text>
        <circle cx="160" cy="49" r="3" fill="#4ade80" />
        {fields.map(([k, v], i) => (
          <g key={k}>
            <text x="38" y={74 + i * 29} fontSize="6.6" fontWeight="700" fill="#ffc83d" letterSpacing="1.2" fontFamily="Segoe UI, Arial, sans-serif">{k}</text>
            <text x="38" y={87 + i * 29} fontSize="11.5" fontWeight="700" fill="#e6fbff" fontFamily="Consolas, ui-monospace, monospace">{clip(v, 17)}</text>
          </g>
        ))}
      </g>
      <path d="M34 44 L90 44 L34 120 Z" fill="#fff" opacity="0.05" />
      {keys.map((k, i) => (
        <rect key={i} x={k.x} y={k.y} width="40" height="22" rx="6" fill={k.fill} stroke="#04403a" strokeOpacity="0.5" />
      ))}
      <rect x="40" y="334" width="120" height="5" rx="2.5" fill="#052e2b" />
      <text x="100" y="349" textAnchor="middle" fontSize="7" fontWeight="700" fill="#042f2b" letterSpacing="2" fontFamily="Segoe UI, Arial, sans-serif">WORLDLINE</text>
    </svg>
  );
}

export default function Terminal360Page() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Terminal360Data | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [active, setActive] = useState<{ key: PopKey; style: CSSProperties } | null>(null);
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

  const openPopup = (key: PopKey, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const w = key === 'terminal' ? 420 : 320;
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 10), Math.max(10, window.innerWidth - w - 10));
    const below = r.bottom + (key === 'terminal' ? 330 : 280) < window.innerHeight;
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

        <div
          className={`t360-term${active?.key === 'terminal' ? ' on' : ''}`}
          tabIndex={0}
          role="button"
          aria-label={`Terminal ${t.terminalId}, serial ${t.serialNo}, ${t.customer}, ${t.location}`}
          aria-describedby={active?.key === 'terminal' ? 't360-pop' : undefined}
          onMouseEnter={(e) => openPopup('terminal', e.currentTarget)}
          onMouseLeave={() => setActive(null)}
          onFocus={(e) => openPopup('terminal', e.currentTarget)}
          onBlur={() => setActive(null)}
          onClick={(e) => (active?.key === 'terminal' ? setActive(null) : openPopup('terminal', e.currentTarget))}
        >
          <PosSvg fields={[['TERMINAL ID', t.terminalId], ['S.NO', t.serialNo], ['CUSTOMER', t.customer], ['LOCATION', t.location]]} />
        </div>
      </div>

      {active?.key === 'terminal' && (
        <div id="t360-pop" role="tooltip" className="t360-pop big" style={active.style}>
          <h4>TERMINAL DETAILS</h4>
          {([['TERMINAL ID', t.terminalId], ['S.NO', t.serialNo], ['CUSTOMER NAME', t.customer], ['LOCATION', t.location]] as const).map(([k, v]) => (
            <div className="row" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
          ))}
        </div>
      )}

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
