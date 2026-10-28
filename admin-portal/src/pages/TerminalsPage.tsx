import { useEffect, useState } from 'react';
import { terminalsApi, customersApi } from '../api';
import { Monitor, MapPin, RefreshCw, Loader2, Clock, FileSpreadsheet, Power, RotateCw } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { exportToExcel } from '../utils/exportExcel';

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
  const [customerFilter, setCustomerFilter] = useState('');
  const [customers, setCustomers] = useState<{id: string, name: string}[]>([]);
  const [restartingId, setRestartingId] = useState<string | null>(null);
  const [restartingDeviceId, setRestartingDeviceId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const params: any = {};
    if (filter) params.status = filter;
    if (customerFilter) params.customerId = customerFilter;
    
    Promise.all([
      terminalsApi.list(params),
      customersApi.list()
    ]).then(([termRes, custRes]) => {
      setTerminals(termRes.data.terminals);
      setCustomers(custRes.data.customers);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter, customerFilter]);

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

  const forceRestart = async (id: string, terminalId: string) => {
    if (!confirm(`Force restart the WL BizStore app on ${terminalId}?\n\nThe app will relaunch the next time the device checks in (usually within a few minutes, or immediately if the app is currently open).`)) return;
    setRestartingId(id);
    try {
      await terminalsApi.sendCommand(id, 'RESTART_APP');
      alert('Restart command queued. It will run next time the device checks in.');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to queue restart command');
    } finally {
      setRestartingId(null);
    }
  };

  const restartDevice = async (id: string, terminalId: string) => {
    if (!confirm(`Reboot the entire physical device for ${terminalId}?\n\nThis restarts the Android OS itself, not just the app. It only works on terminals provisioned as Android Device Owner — on other devices this command will fail and be reported back as such.`)) return;
    setRestartingDeviceId(id);
    try {
      await terminalsApi.sendCommand(id, 'RESTART_DEVICE');
      alert('Device reboot command queued. It will run next time the device checks in.');
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to queue device reboot command');
    } finally {
      setRestartingDeviceId(null);
    }
  };

  const exportExcel = () => {
    const rows = terminals.map(t => ({
      'Terminal ID':   t.terminalId,
      'Serial No':     t.serialNo || '',
      'Customer':      t.customer.name,
      'Customer Code': t.customer.code,
      'Model':         t.model || '',
      'Site':          t.site || '',
      'Status':        t.status,
      'Enrolled At':   format(new Date(t.enrolledAt), 'dd MMM yyyy HH:mm'),
      'Last Seen':     t.lastSeenAt ? format(new Date(t.lastSeenAt), 'dd MMM yyyy HH:mm') : '',
      'Latitude':      t.lastLatitude  != null ? t.lastLatitude.toFixed(6)  : '',
      'Longitude':     t.lastLongitude != null ? t.lastLongitude.toFixed(6) : '',
      'Total Downloads': t._count.downloadEvents,
    }));
    exportToExcel(rows, 'terminals', 'Terminals');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Terminals</h2>
          <p className="page-subtitle">{terminals.length} enrolled devices</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select className="form-select" style={{ width: '200px' }} value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
            <option value="">All Customers</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
          <button className="btn btn-primary" onClick={exportExcel} disabled={loading}>
            <FileSpreadsheet size={14} />
            Export Excel
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
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => forceRestart(t.id, t.terminalId)}
                          disabled={t.status !== 'ACTIVE' || restartingId === t.id}
                          title="Force restart the Android app on this device"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {restartingId === t.id ? <Loader2 size={12} className="spinner" /> : <Power size={12} />}
                          Force Restart
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => restartDevice(t.id, t.terminalId)}
                          disabled={t.status !== 'ACTIVE' || restartingDeviceId === t.id}
                          title="Reboot the physical device (requires Device Owner provisioning)"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          {restartingDeviceId === t.id ? <Loader2 size={12} className="spinner" /> : <RotateCw size={12} />}
                          Restart Device
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
