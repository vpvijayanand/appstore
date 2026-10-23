import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { analyticsApi, customersApi, appsApi } from '../api';
import { format } from 'date-fns';
import { Download, RefreshCw, Loader2, MapPin, X, FileSpreadsheet } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: '#34c785',
  FAILED: '#ea4335',
  PENDING: '#4285f4',
  DOWNLOADING: '#fbbc04',
};

interface DownloadEvent {
  id: string;
  timestamp: string;
  installStatus: string;
  version: string;
  // Prisma serialises Decimal as string — accept both to be safe
  latitude: string | number | null;
  longitude: string | number | null;
  networkType: string | null;
  terminal: {
    terminalId: string;
    site: string;
    model: string;
    customer: { name: string };
  };
  app: { name: string; packageName: string; version: string };
}

interface Customer { id: string; name: string; }
interface App     { id: string; name: string; packageName: string; }

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  SUCCESS:     { label: 'Success',     cls: 'badge-success' },
  FAILED:      { label: 'Failed',      cls: 'badge-error' },
  PENDING:     { label: 'Pending',     cls: 'badge-info' },
  DOWNLOADING: { label: 'Downloading', cls: 'badge-warning' },
};

export default function DownloadsPage() {
  const [events, setEvents]       = useState<DownloadEvent[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // Filter state
  const [status,     setStatus]     = useState('');
  const [customerId, setCustomerId] = useState('');
  const [appId,      setAppId]      = useState('');

  // Filter options
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [apps, setApps]           = useState<App[]>([]);

  const hasFilters = status !== '' || customerId !== '' || appId !== '';
  const [exporting, setExporting] = useState(false);
  const [locationEvent, setLocationEvent] = useState<DownloadEvent | null>(null);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const params: Record<string, string | number> = { page: 1, limit: 10000 };
      if (status)     params.status     = status;
      if (customerId) params.customerId = customerId;
      if (appId)      params.appId      = appId;
      const res = await analyticsApi.getEvents(params);
      const rows = res.data.events.map((ev: any) => ({
        'Timestamp':    format(new Date(ev.timestamp), 'dd MMM yyyy HH:mm'),
        'Terminal ID':  ev.terminal.terminalId,
        'Site':         ev.terminal.site || '',
        'Model':        ev.terminal.model || '',
        'Customer':     ev.terminal.customer.name,
        'App':          ev.app.name,
        'Package':      ev.app.packageName,
        'Version':      ev.version,
        'Network':      ev.networkType || '',
        'Latitude':     ev.latitude  != null ? parseFloat(String(ev.latitude)).toFixed(6)  : '',
        'Longitude':    ev.longitude != null ? parseFloat(String(ev.longitude)).toFixed(6) : '',
        'Status':       ev.installStatus,
      }));
      exportToExcel(rows, 'download_events', 'Download Events');
    } catch {
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Load filter options once on mount
  useEffect(() => {
    customersApi.list().then(r => setCustomers(r.data.customers)).catch(() => {});
    appsApi.list({ limit: 100 }).then(r => setApps(r.data.apps)).catch(() => {});
  }, []);

  const load = (p: number, st: string, cid: string, aid: string) => {
    setLoading(true);
    setError('');
    const params: Record<string, string | number> = { page: p, limit: 30 };
    if (st)  params.status     = st;
    if (cid) params.customerId = cid;
    if (aid) params.appId      = aid;
    analyticsApi.getEvents(params)
      .then(res => { setEvents(res.data.events); setTotal(res.data.total); })
      .catch(() => setError('Failed to load download events. Please try again.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, status, customerId, appId); }, [page, status, customerId, appId]);

  const handleFilter = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const clearFilters = () => {
    setStatus(''); setCustomerId(''); setAppId(''); setPage(1);
  };

  return (
    <div>
      {/* Title row */}
      <div className="page-header" style={{ marginBottom: '12px' }}>
        <div>
          <h2 className="page-title">Download Events</h2>
          <p className="page-subtitle">{total.toLocaleString()} total events — complete audit trail</p>
        </div>
      </div>

      {/* Single-line filter bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '16px',
        padding: '10px 14px',
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
      }}>
        {/* Customer filter */}
        <select
          className="form-select"
          style={{ flex: 1, minWidth: 0 }}
          value={customerId}
          onChange={e => handleFilter(setCustomerId, e.target.value)}
        >
          <option value="">All Customers</option>
          {customers.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* App filter */}
        <select
          className="form-select"
          style={{ flex: 1, minWidth: 0 }}
          value={appId}
          onChange={e => handleFilter(setAppId, e.target.value)}
        >
          <option value="">All Apps</option>
          {apps.map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          className="form-select"
          style={{ flex: '0 0 140px' }}
          value={status}
          onChange={e => handleFilter(setStatus, e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="SUCCESS">✅ Success</option>
          <option value="FAILED">❌ Failed</option>
          <option value="PENDING">⏳ Pending</option>
          <option value="DOWNLOADING">⬇️ Downloading</option>
        </select>

        {/* Divider */}
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', flexShrink: 0 }} />

        {/* Clear — only when a filter is active */}
        {hasFilters && (
          <button className="btn btn-secondary" onClick={clearFilters} title="Clear all filters" style={{ flexShrink: 0 }}>
            <X size={14} />
            Clear
          </button>
        )}

        {/* Refresh */}
        <button className="btn btn-secondary" onClick={() => load(page, status, customerId, appId)} style={{ flexShrink: 0 }}>
          {loading ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />}
          Refresh
        </button>

        {/* Export */}
        <button className="btn btn-primary" onClick={exportExcel} disabled={exporting} style={{ flexShrink: 0 }}>
          {exporting ? <Loader2 size={14} className="spinner" /> : <FileSpreadsheet size={14} />}
          Export Excel
        </button>
      </div>

      {/* Active filter chips */}
      {hasFilters && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {customerId && (
            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}>
              Customer: {customers.find(c => c.id === customerId)?.name ?? customerId}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleFilter(setCustomerId, '')} />
            </span>
          )}
          {appId && (
            <span className="badge badge-info" style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}>
              App: {apps.find(a => a.id === appId)?.name ?? appId}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleFilter(setAppId, '')} />
            </span>
          )}
          {status && (
            <span className={`badge ${STATUS_CONFIG[status]?.cls ?? 'badge-default'}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}>
              {STATUS_CONFIG[status]?.label ?? status}
              <X size={12} style={{ cursor: 'pointer' }} onClick={() => handleFilter(setStatus, '')} />
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '60px', color: 'var(--text-muted)' }}>
          <Loader2 size={32} className="spinner" />
          <span style={{ fontSize: '13px' }}>Loading download events...</span>
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--status-error)' }}>
          <Download size={36} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <div>{error}</div>
          <button className="btn btn-secondary" style={{ marginTop: '16px' }} onClick={() => load(page, status, customerId, appId)}>
            Retry
          </button>
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
                        {ev.networkType
                          ? <span className="badge badge-default">{ev.networkType}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>
                        {ev.latitude != null && ev.longitude != null ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setLocationEvent(ev)}
                            title="View on map"
                            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 8px' }}
                          >
                            <MapPin size={12} />
                            {parseFloat(String(ev.latitude)).toFixed(3)}, {parseFloat(String(ev.longitude)).toFixed(3)}
                          </button>
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
                      <div>No download events found{hasFilters ? ' for the selected filters' : ''}</div>
                      {hasFilters && (
                        <button className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={clearFilters}>
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                Showing {((page - 1) * 30) + 1}–{Math.min(page * 30, total)} of {total.toLocaleString()}
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
          )}
        </>
      )}

      {/* View Location modal */}
      {locationEvent && locationEvent.latitude != null && locationEvent.longitude != null && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setLocationEvent(null)}>
          <div className="modal" style={{ width: '620px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h3 className="modal-title">
                <MapPin size={16} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                Download Location — {locationEvent.terminal.terminalId}
              </h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setLocationEvent(null)}>✕</button>
            </div>
            <div style={{ padding: '0 0 16px 0' }}>
              <div className="card" style={{ padding: 0, overflow: 'hidden', height: '360px', margin: '0 16px 12px 16px', width: 'calc(100% - 32px)' }}>
                <MapContainer
                  key={locationEvent.id}
                  center={[parseFloat(String(locationEvent.latitude)), parseFloat(String(locationEvent.longitude))]}
                  zoom={14}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <CircleMarker
                    center={[parseFloat(String(locationEvent.latitude)), parseFloat(String(locationEvent.longitude))]}
                    radius={10}
                    pathOptions={{
                      color: STATUS_COLORS[locationEvent.installStatus] || '#888',
                      fillColor: STATUS_COLORS[locationEvent.installStatus] || '#888',
                      fillOpacity: 0.8,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div style={{ fontSize: '13px', minWidth: '180px' }}>
                        <div style={{ fontWeight: 700, marginBottom: '6px' }}>{locationEvent.terminal.terminalId}</div>
                        <div>{locationEvent.app.name} · v{locationEvent.version}</div>
                      </div>
                    </Popup>
                  </CircleMarker>
                </MapContainer>
              </div>
              <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '13px' }}>
                <div><span style={{ color: 'var(--text-muted)' }}>Customer:</span> {locationEvent.terminal.customer.name}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Site:</span> {locationEvent.terminal.site || '—'}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>App:</span> {locationEvent.app.name}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Status:</span> {locationEvent.installStatus}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>Time:</span> {format(new Date(locationEvent.timestamp), 'dd MMM yyyy HH:mm')}</div>
                <div><span style={{ color: 'var(--text-muted)' }}>GPS:</span> {parseFloat(String(locationEvent.latitude)).toFixed(6)}, {parseFloat(String(locationEvent.longitude)).toFixed(6)}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

