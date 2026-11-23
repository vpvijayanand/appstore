import { useMemo, useState } from 'react';
import { Loader2, CheckCircle2, Search, FileSpreadsheet } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface Step { key: string; label: string; state: 'done' | 'active' | 'pending'; at: string | null }
interface DeliveryRow {
  terminalDbId: string;
  terminalId: string;
  serialNo: string | null;
  tid: string | null;
  site: string | null;
  sources: string[];
  customer: string;
  online: boolean;
  lastSeenAt: string | null;
  state: string;
  label: string;
  detail: string;
  eta: string | null;
  steps: Step[];
  firstFetchedAt: string | null;
  lastFetchedAt: string | null;
  lastShownAt: string | null;
  showCount: number;
}
export interface DeliveryData {
  summary: Record<string, number>;
  total: number;
  rows: DeliveryRow[];
}

const STATES: { key: string; label: string; badge: string; color: string }[] = [
  { key: 'SHOWN', label: 'Shown on screen', badge: 'badge-success', color: 'var(--success, #16a34a)' },
  { key: 'DELIVERED', label: 'Delivered', badge: 'badge-info', color: 'var(--info, #0284c7)' },
  { key: 'WAITING_FOR_DEVICE', label: 'Waiting for device', badge: 'badge-warning', color: 'var(--warning, #f59e0b)' },
  { key: 'NOT_ENROLLED', label: 'Not enrolled', badge: 'badge-warning', color: 'var(--warning, #f59e0b)' },
  { key: 'SCHEDULED', label: 'Scheduled', badge: 'badge-info', color: 'var(--text-muted)' },
  { key: 'ENDED', label: 'Ended', badge: 'badge-default', color: 'var(--text-muted)' },
  { key: 'INACTIVE', label: 'Paused', badge: 'badge-default', color: 'var(--text-muted)' },
];
const badgeOf = (s: string) => STATES.find((x) => x.key === s)?.badge ?? 'badge-default';
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

export default function AdDeliveryBody({ data, loading, title }: { data: DeliveryData | null; loading: boolean; title: string }) {
  const [filter, setFilter] = useState<string>('ALL');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => {
      if (filter !== 'ALL' && r.state !== filter) return false;
      if (!needle) return true;
      return [r.serialNo, r.tid, r.terminalId, r.customer, r.site].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
  }, [data, filter, q]);

  if (loading && !data) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}><Loader2 size={28} className="spinner" /></div>;
  }
  if (!data) return null;

  if (data.total === 0) {
    return (
      <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
        This advertisement has not been assigned to any terminals, groups or customers yet.
      </div>
    );
  }

  const exportRows = () =>
    exportToExcel(
      rows.map((r) => ({
        'Serial No': r.serialNo ?? '',
        TID: r.tid ?? '',
        'Terminal ID': r.terminalId,
        Customer: r.customer,
        Site: r.site ?? '',
        'Assigned Via': r.sources.join('; '),
        Status: r.label,
        Details: r.detail,
        'First Delivered': fmt(r.firstFetchedAt),
        'Last Shown': fmt(r.lastShownAt),
        'Times Shown': r.showCount,
      })),
      `ad_delivery_${title.replace(/\W+/g, '_')}`,
      'Delivery',
    );

  const chip = (key: string, label: string, count: number, color?: string) => (
    <button
      key={key}
      onClick={() => setFilter(key)}
      className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-secondary'}`}
      style={{ gap: '6px' }}
    >
      {label} <strong style={{ color: filter === key ? undefined : color }}>{count}</strong>
    </button>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {chip('ALL', 'All', data.total)}
        {STATES.filter((s) => data.summary[s.key]).map((s) => chip(s.key, s.label, data.summary[s.key], s.color))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', flex: 1 }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '13px', width: '100%' }}
            placeholder="Search serial, TID, customer, site..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportRows} disabled={rows.length === 0}>
          <FileSpreadsheet size={13} /> Export
        </button>
      </div>

      <div style={{ display: 'grid', gap: '8px' }}>
        {rows.map((r) => {
          const key = r.terminalDbId || `m-${r.serialNo}`;
          const expanded = open === key;
          return (
            <div key={key} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)' }}>
              <div
                onClick={() => setOpen(expanded ? null : key)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: 'pointer' }}
              >
                <span
                  title={r.terminalDbId ? (r.online ? 'Online' : 'Offline') : 'Not enrolled'}
                  style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.online ? '#16a34a' : 'var(--text-muted)', flexShrink: 0 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '13px' }}>
                    {r.serialNo || r.terminalId}
                    {r.tid && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '8px', fontSize: '11.5px' }}>TID {r.tid}</span>}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {r.customer}{r.site ? ` · ${r.site}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '240px' }}>
                  {r.sources.map((s) => <span key={s} className="badge badge-default" style={{ fontSize: '10.5px' }}>{s}</span>)}
                </div>
                <span className={`badge ${badgeOf(r.state)}`}>{r.label}</span>
              </div>

              {expanded && (
                <div style={{ padding: '0 14px 14px', display: 'grid', gap: '10px' }}>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.detail}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', padding: '8px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    {r.steps.map((st, i) => (
                      <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11.5px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: st.state === 'active' ? 600 : 500, color: st.state === 'done' ? '#16a34a' : st.state === 'active' ? '#0284c7' : 'var(--text-muted)' }}>
                          {st.state === 'done' ? <CheckCircle2 size={13} /> : st.state === 'active' ? <Loader2 size={12} className="spinner" /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-subtle)' }} />}
                          {st.label}
                        </span>
                        {i < r.steps.length - 1 && <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '8px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    <div>Terminal ID<br /><strong style={{ color: 'var(--text-primary)' }}>{r.terminalId}</strong></div>
                    <div>First delivered<br /><strong style={{ color: 'var(--text-primary)' }}>{fmt(r.firstFetchedAt)}</strong></div>
                    <div>Last shown<br /><strong style={{ color: 'var(--text-primary)' }}>{fmt(r.lastShownAt)}</strong></div>
                    <div>Times shown<br /><strong style={{ color: 'var(--text-primary)' }}>{r.showCount}</strong></div>
                    <div>Last seen<br /><strong style={{ color: 'var(--text-primary)' }}>{fmt(r.lastSeenAt)}</strong></div>
                    {r.eta && <div>Next window<br /><strong style={{ color: '#0284c7' }}>{fmt(r.eta)}</strong></div>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No terminals match this filter.</div>
        )}
      </div>
    </div>
  );
}
