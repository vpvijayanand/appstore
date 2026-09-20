import { useEffect, useState } from 'react';
import { analyticsApi } from '../api';
import { format } from 'date-fns';
import { Download, Filter, RefreshCw, Loader2, MapPin } from 'lucide-react';

interface DownloadEvent {
  id: string;
  timestamp: string;
  installStatus: string;
  version: string;
  latitude: number | null;
  longitude: number | null;
  networkType: string | null;
  terminal: {
    terminalId: string;
    site: string;
    model: string;
    customer: { name: string };
  };
  app: { name: string; packageName: string; version: string };
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  SUCCESS:     { label: 'Success',     cls: 'badge-success' },
  FAILED:      { label: 'Failed',      cls: 'badge-error' },
  PENDING:     { label: 'Pending',     cls: 'badge-info' },
  DOWNLOADING: { label: 'Downloading', cls: 'badge-warning' },
};

export default function DownloadsPage() {
  const [events, setEvents] = useState<DownloadEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const load = () => {
    setLoading(true);
    analyticsApi.getEvents({ page, limit: 30, ...(status ? { status } : {}) })
      .then(res => { setEvents(res.data.events); setTotal(res.data.total); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, status]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Download Events</h2>
          <p className="page-subtitle">{total.toLocaleString()} total events — complete audit trail</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select className="form-select" style={{ width: '150px' }} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
            <option value="DOWNLOADING">Downloading</option>
          </select>
          <button className="btn btn-secondary" onClick={load}>
            {loading ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Loader2 size={32} className="spinner" />
        </div>
      ) : (
        <>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Terminal</th>
                  <th>Customer</th>
                  <th>App</th>
                  <th>Version</th>
                  <th>Network</th>
                  <th>GPS</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => {
                  const cfg = STATUS_CONFIG[ev.installStatus] || { label: ev.installStatus, cls: 'badge-default' };
                  return (
                    <tr key={ev.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        {format(new Date(ev.timestamp), 'dd MMM yy HH:mm')}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{ev.terminal.terminalId}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ev.terminal.site || ev.terminal.model}</div>
                      </td>
                      <td style={{ fontSize: '13px' }}>{ev.terminal.customer.name}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{ev.app.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ev.app.packageName}</div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>v{ev.version}</td>
                      <td>
                        {ev.networkType ? (
                          <span className="badge badge-default">{ev.networkType}</span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {ev.latitude && ev.longitude ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-accent)', fontSize: '12px' }}>
                            <MapPin size={12} />
                            {ev.latitude.toFixed(3)}, {ev.longitude.toFixed(3)}
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
                      </td>
                    </tr>
                  );
                })}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                      <Download size={36} style={{ marginBottom: '12px', opacity: 0.3 }} />
                      <div>No download events found</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
              Showing {((page - 1) * 30) + 1}–{Math.min(page * 30, total)} of {total}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                ← Previous
              </button>
              <button className="btn btn-secondary btn-sm" disabled={page * 30 >= total} onClick={() => setPage(p => p + 1)}>
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
