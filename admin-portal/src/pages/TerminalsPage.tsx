import { useEffect, useState } from 'react';
import { terminalsApi } from '../api';
import { Monitor, MapPin, RefreshCw, Loader2, Clock, Wifi } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface Terminal {
  id: string;
  terminalId: string;
  serialNo: string | null;
  model: string | null;
  site: string | null;
  status: string;
  lastSeenAt: string | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  enrolledAt: string;
  customer: { name: string; code: string };
  _count: { downloadEvents: number };
}

const STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  ACTIVE:   { cls: 'badge-success', label: 'Active' },
  RETIRED:  { cls: 'badge-warning', label: 'Retired' },
  WIPED:    { cls: 'badge-error',   label: 'Wiped' },
};

export default function TerminalsPage() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const load = () => {
    setLoading(true);
    terminalsApi.list(filter ? { status: filter } : {})
      .then(res => setTerminals(res.data.terminals))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const updateStatus = async (id: string, status: string) => {
    if (!confirm(`Change terminal status to ${status}?`)) return;
    await terminalsApi.updateStatus(id, status);
    load();
  };

  const rotateKey = async (id: string) => {
    if (!confirm('Rotate API key? The terminal will need re-enrollment.')) return;
    const res = await terminalsApi.rotateKey(id);
    alert(`New API key: ${res.data.newKey}`);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Terminals</h2>
          <p className="page-subtitle">{terminals.length} enrolled devices</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select className="form-select" style={{ width: '150px' }} value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="RETIRED">Retired</option>
            <option value="WIPED">Wiped</option>
          </select>
          <button className="btn btn-secondary" onClick={load}>
            {loading ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={32} className="spinner" color="var(--text-muted)" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Terminal ID</th>
                <th>Customer</th>
                <th>Model / Site</th>
                <th>Status</th>
                <th>Last Seen</th>
                <th>Location</th>
                <th>Downloads</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {terminals.map(t => {
                const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.ACTIVE;
                const isOnline = t.lastSeenAt && (Date.now() - new Date(t.lastSeenAt).getTime()) < 300000;
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                          width: '8px', height: '8px', borderRadius: '50%',
                          background: isOnline ? 'var(--status-success)' : 'var(--text-muted)',
                          flexShrink: 0,
                        }} />
                        <div>
                          <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                            {t.terminalId}
                          </div>
                          {t.serialNo && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>SN: {t.serialNo}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{t.customer.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {t.customer.code}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px' }}>{t.model || '—'}</div>
                      {t.site && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.site}</div>}
                    </td>
                    <td><span className={`badge ${cfg.cls}`}>{cfg.label}</span></td>
                    <td>
                      {t.lastSeenAt ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px' }}>
                          <Clock size={12} color="var(--text-muted)" />
                          <span title={format(new Date(t.lastSeenAt), 'dd MMM yyyy HH:mm')}>
                            {formatDistanceToNow(new Date(t.lastSeenAt), { addSuffix: true })}
                          </span>
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)' }}>Never</span>}
                    </td>
                    <td>
                      {t.lastLatitude ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-accent)', fontSize: '12px' }}>
                          <MapPin size={12} />
                          {t.lastLatitude.toFixed(3)}, {t.lastLongitude?.toFixed(3)}
                        </div>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{t._count.downloadEvents}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => rotateKey(t.id)}
                          title="Rotate API Key"
                          style={{ fontSize: '11px' }}
                        >
                          🔑 Rotate
                        </button>
                        {t.status === 'ACTIVE' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => updateStatus(t.id, 'RETIRED')}
                            style={{ fontSize: '11px' }}
                          >
                            Retire
                          </button>
                        )}
                        {t.status === 'RETIRED' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => updateStatus(t.id, 'ACTIVE')}
                            style={{ fontSize: '11px' }}
                          >
                            Reactivate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {terminals.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <Monitor size={36} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <div>No terminals enrolled</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
