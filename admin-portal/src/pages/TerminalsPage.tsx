import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { terminalsApi, customersApi } from '../api';
import {
  Monitor,
  MapPin,
  RefreshCw,
  Loader2,
  Clock,
  FileSpreadsheet,
  Power,
  RotateCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Activity,
  History,
  X,
  Radio,
  Sparkles,
} from 'lucide-react';
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

interface CommandStep {
  id: string;
  label: string;
  status: 'completed' | 'current' | 'pending' | 'failed';
  timestamp?: string | null;
  detail?: string | null;
}

interface TrackedCommand {
  id: string;
  terminalId: string;
  terminalLabel: string;
  type: string;
  status: string;
  stage: string | null;
  stageDetail: string | null;
  hint: string | null;
  steps: CommandStep[];
  estimatedSecondsRemaining: number | null;
  isOverdue: boolean;
}

interface ActiveCommandBannerItem {
  id: string;
  type: string;
  status: string;
  stage: string | null;
  createdAt: string;
  terminal: { id: string; terminalId: string; model: string | null };
}

const STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  ACTIVE:   { cls: 'badge-success', label: 'Active' },
  RETIRED:  { cls: 'badge-warning', label: 'Retired' },
  WIPED:    { cls: 'badge-error',   label: 'Wiped' },
};

export default function TerminalsPage() {
  const navigate = useNavigate();
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);

  // Active operations banner
  const [activeCommands, setActiveCommands] = useState<ActiveCommandBannerItem[]>([]);

  // Live Command Progress Modal
  const [trackedCommand, setTrackedCommand] = useState<TrackedCommand | null>(null);
  const [commandModalOpen, setCommandModalOpen] = useState(false);
  const pollTimerRef = useRef<any>(null);

  // Terminal Activity / History Drawer
  const [activityTerminal, setActivityTerminal] = useState<Terminal | null>(null);
  const [activityData, setActivityData] = useState<any>(null);
  const [activityLoading, setActivityLoading] = useState(false);

  const load = () => {
    setLoading(true);
    const params: any = {};
    if (filter) params.status = filter;
    if (customerFilter) params.customerId = customerFilter;

    Promise.all([
      terminalsApi.list(params),
      customersApi.list(),
      terminalsApi.getActiveCommands().catch(() => ({ data: { activeCommands: [] } })),
    ])
      .then(([termRes, custRes, actRes]) => {
        setTerminals(termRes.data.terminals);
        setCustomers(custRes.data.customers);
        setActiveCommands(actRes.data.activeCommands || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [filter, customerFilter]);

  // Periodic check for active commands banner every 10 seconds
  useEffect(() => {
    const bannerTimer = setInterval(() => {
      terminalsApi.getActiveCommands()
        .then((res) => setActiveCommands(res.data.activeCommands || []))
        .catch(() => {});
    }, 10000);
    return () => clearInterval(bannerTimer);
  }, []);

  // Poll tracked command when progress modal is open
  useEffect(() => {
    if (!commandModalOpen || !trackedCommand) return;
    const { terminalId, id } = trackedCommand;

    const poll = async () => {
      try {
        const res = await terminalsApi.getCommand(terminalId, id);
        const cmd = res.data.command;
        if (cmd) {
          setTrackedCommand((prev) => (prev ? { ...prev, ...cmd } : null));
          if (cmd.status === 'COMPLETED' || cmd.status === 'FAILED') {
            clearInterval(pollTimerRef.current);
            load(); // refresh list to reflect updated terminal lastSeenAt
          }
        }
      } catch {
        // silent retry
      }
    };

    pollTimerRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollTimerRef.current);
  }, [commandModalOpen, trackedCommand?.id, trackedCommand?.terminalId]);

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

  // Launch Force Restart (App Restart) with step progress modal
  const handleForceRestart = async (terminal: Terminal) => {
    if (!confirm(`Force restart the WL BizStore app on ${terminal.terminalId}?\n\nThis will trigger the app restart flow with live progress tracking.`)) {
      return;
    }
    try {
      const res = await terminalsApi.sendCommand(terminal.id, 'RESTART_APP');
      const cmd = res.data.command;
      setTrackedCommand({
        id: cmd.id,
        terminalId: terminal.id,
        terminalLabel: terminal.terminalId,
        type: 'RESTART_APP',
        status: cmd.status || 'PENDING',
        stage: cmd.stage || 'QUEUED',
        stageDetail: cmd.stageDetail || 'Queued in database',
        hint: 'Waiting for terminal check-in (poll every 10s)',
        steps: [
          { id: 'QUEUED', label: 'Command queued for terminal', status: 'completed', timestamp: new Date().toISOString() },
          { id: 'DELIVERED', label: 'Delivered to WL BizStore', status: 'current', detail: 'Waiting for terminal poll check-in' },
          { id: 'RESTARTING', label: 'Closing & relaunching app', status: 'pending' },
          { id: 'BACK_ONLINE', label: 'Back online & verified healthy', status: 'pending' },
        ],
        estimatedSecondsRemaining: 20,
        isOverdue: false,
      });
      setCommandModalOpen(true);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to dispatch restart command');
    }
  };

  // Launch Device Reboot (Castles CTOS SDK / Device Owner OS Reboot) with step progress modal
  const handleRestartDevice = async (terminal: Terminal) => {
    if (!confirm(`Reboot the physical POS terminal for ${terminal.terminalId}?\n\nThis invokes the hardware shutdown/reboot using Castles CTOS SDK or Android Device Owner. Live progress will be tracked.`)) {
      return;
    }
    try {
      const res = await terminalsApi.sendCommand(terminal.id, 'RESTART_DEVICE');
      const cmd = res.data.command;
      setTrackedCommand({
        id: cmd.id,
        terminalId: terminal.id,
        terminalLabel: terminal.terminalId,
        type: 'RESTART_DEVICE',
        status: cmd.status || 'PENDING',
        stage: cmd.stage || 'QUEUED',
        stageDetail: cmd.stageDetail || 'Queued in database',
        hint: 'Hardware reboot command dispatched. Waiting for terminal check-in.',
        steps: [
          { id: 'QUEUED', label: 'Hardware reboot queued', status: 'completed', timestamp: new Date().toISOString() },
          { id: 'DELIVERED', label: 'Delivered to terminal', status: 'current', detail: 'Waiting for terminal check-in' },
          { id: 'REBOOTING', label: 'Invoking Castles CtSystem.shutdown(REBOOT)', status: 'pending' },
          { id: 'BACK_ONLINE', label: 'POS OS rebooted & store app reconnected', status: 'pending' },
        ],
        estimatedSecondsRemaining: 65,
        isOverdue: false,
      });
      setCommandModalOpen(true);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to dispatch device reboot command');
    }
  };

  const openExistingCommandProgress = async (terminalId: string, commandId: string) => {
    const t = terminals.find((x) => x.id === terminalId);
    try {
      const res = await terminalsApi.getCommand(terminalId, commandId);
      const cmd = res.data.command;
      setTrackedCommand({
        id: cmd.id,
        terminalId,
        terminalLabel: t?.terminalId || terminalId,
        type: cmd.type,
        status: cmd.status,
        stage: cmd.stage,
        stageDetail: cmd.stageDetail,
        hint: cmd.hint,
        steps: cmd.steps || [],
        estimatedSecondsRemaining: cmd.estimatedSecondsRemaining,
        isOverdue: cmd.isOverdue || false,
      });
      setCommandModalOpen(true);
    } catch (e: any) {
      alert('Could not inspect command: ' + (e.response?.data?.error || e.message));
    }
  };

  const openActivity = async (t: Terminal) => {
    setActivityTerminal(t);
    setActivityLoading(true);
    try {
      const res = await terminalsApi.getActivity(t.id);
      setActivityData(res.data);
    } catch (e: any) {
      alert('Failed to load activity: ' + (e.response?.data?.error || e.message));
    } finally {
      setActivityLoading(false);
    }
  };

  const exportExcel = () => {
    const rows = terminals.map((t) => ({
      'Terminal ID':   t.terminalId,
      'Serial No':     t.serialNo || '',
      'Customer':      t.customer.name,
      'Customer Code': t.customer.code,
      'Model':         t.model || '',
      'Site':          t.site || '',
      'Status':        t.status,
      'Enrolled At':   format(new Date(t.enrolledAt), 'dd MMM yyyy HH:mm'),
      'Last Seen':     t.lastSeenAt ? format(new Date(t.lastSeenAt), 'dd MMM yyyy HH:mm') : '',
      'Latitude':      t.lastLatitude != null ? t.lastLatitude.toFixed(6) : '',
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
          <select
            className="form-select"
            style={{ width: '200px' }}
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ width: '150px' }}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
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

      {/* Active Operations Alert Banner */}
      {activeCommands.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
            border: '1px solid #38bdf8',
            borderRadius: '8px',
            padding: '12px 18px',
            marginBottom: '18px',
            color: '#f8fafc',
            boxShadow: '0 4px 12px rgba(56, 189, 248, 0.15)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Radio size={20} color="#38bdf8" className="spinner" />
            <div>
              <span style={{ fontWeight: 600, fontSize: '13.5px' }}>
                {activeCommands.length} Active Command{activeCommands.length > 1 ? 's' : ''} in Progress
              </span>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                {activeCommands
                  .map((c) => `${c.terminal.terminalId}: ${c.type} (${c.stage || c.status})`)
                  .join(' • ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeCommands.map((c) => (
              <button
                key={c.id}
                className="btn btn-secondary btn-sm"
                onClick={() => openExistingCommandProgress(c.terminal.id, c.id)}
                style={{ fontSize: '11px', background: '#334155', color: '#fff', border: '1px solid #475569' }}
              >
                Track {c.terminal.terminalId}
              </button>
            ))}
          </div>
        </div>
      )}

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
              {terminals.map((t) => {
                const cfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.ACTIVE;
                const isOnline = t.lastSeenAt && Date.now() - new Date(t.lastSeenAt).getTime() < 60000;
                return (
                  <tr key={t.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: isOnline ? '#10b981' : 'var(--text-muted)',
                            boxShadow: isOnline ? '0 0 8px rgba(16, 185, 129, 0.6)' : 'none',
                            flexShrink: 0,
                          }}
                          title={isOnline ? 'Online now (active in last 60s)' : 'Offline / Idle'}
                        />
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
                    <td>
                      <span className={`badge ${cfg.cls}`}>{cfg.label}</span>
                    </td>
                    <td>
                      {t.lastSeenAt ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px' }}>
                          <Clock size={12} color="var(--text-muted)" />
                          <span title={format(new Date(t.lastSeenAt), 'dd MMM yyyy HH:mm')}>
                            {formatDistanceToNow(new Date(t.lastSeenAt), { addSuffix: true })}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Never</span>
                      )}
                    </td>
                    <td>
                      {t.lastLatitude ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--brand-accent)', fontSize: '12px' }}>
                          <MapPin size={12} />
                          {t.lastLatitude.toFixed(3)}, {t.lastLongitude?.toFixed(3)}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>{t._count.downloadEvents}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/terminals/${t.id}/screen`)}
                          disabled={t.status !== 'ACTIVE'}
                          title="View and control this terminal's screen live"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Monitor size={12} />
                          Remote Screen
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleForceRestart(t)}
                          disabled={t.status !== 'ACTIVE'}
                          title="Restart the WL BizStore app with live progress tracking"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Power size={12} color="#0284c7" />
                          Force Restart
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleRestartDevice(t)}
                          disabled={t.status !== 'ACTIVE'}
                          title="Reboot physical terminal OS via Castles CTOS SDK / Device Owner"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <RotateCw size={12} color="#f59e0b" />
                          Restart Device
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openActivity(t)}
                          title="View command history, app states and ad deliveries"
                          style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Activity size={12} />
                          Activity
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => rotateKey(t.id)}
                          title="Rotate API Key"
                          style={{ fontSize: '11px' }}
                        >
                          🔑 Key
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

      {/* ── Live Command Progress Modal ────────────────────────────────────── */}
      {commandModalOpen && trackedCommand && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setCommandModalOpen(false)}
        >
          <div className="modal" style={{ width: '580px', borderRadius: '12px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} color="#0284c7" />
                <h3 className="modal-title">
                  {trackedCommand.type === 'RESTART_DEVICE'
                    ? 'Rebooting Physical Terminal'
                    : trackedCommand.type === 'RESTART_APP'
                    ? 'Restarting WL BizStore App'
                    : `${trackedCommand.type} Progress`}
                </h3>
              </div>
              <button
                className="btn btn-secondary btn-sm btn-icon"
                onClick={() => setCommandModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>Target Device: </span>
                  <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{trackedCommand.terminalLabel}</span>
                </div>
                <span
                  className={`badge badge-${
                    trackedCommand.status === 'COMPLETED'
                      ? 'success'
                      : trackedCommand.status === 'FAILED'
                      ? 'danger'
                      : 'warning'
                  }`}
                >
                  {trackedCommand.status}
                </span>
              </div>

              {trackedCommand.stageDetail && (
                <div
                  style={{
                    fontSize: '12.5px',
                    color: '#334155',
                    background: '#f1f5f9',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontFamily: 'var(--font-mono)',
                    marginBottom: '16px',
                  }}
                >
                  {trackedCommand.stageDetail}
                </div>
              )}
            </div>

            {/* Dynamic Step Timeline */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                padding: '16px',
                background: '#fafbfc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                marginBottom: '18px',
              }}
            >
              {trackedCommand.steps.map((step, idx) => {
                const isLast = idx === trackedCommand.steps.length - 1;
                return (
                  <div key={step.id} style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                    {/* Left Icon */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <div
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background:
                            step.status === 'completed'
                              ? '#dcfce7'
                              : step.status === 'current'
                              ? '#e0f2fe'
                              : step.status === 'failed'
                              ? '#fee2e2'
                              : '#f1f5f9',
                          color:
                            step.status === 'completed'
                              ? '#16a34a'
                              : step.status === 'current'
                              ? '#0284c7'
                              : step.status === 'failed'
                              ? '#dc2626'
                              : '#94a3b8',
                          border: `1.5px solid ${
                            step.status === 'completed'
                              ? '#16a34a'
                              : step.status === 'current'
                              ? '#0284c7'
                              : step.status === 'failed'
                              ? '#dc2626'
                              : '#cbd5e1'
                          }`,
                          flexShrink: 0,
                          zIndex: 2,
                        }}
                      >
                        {step.status === 'completed' ? (
                          <CheckCircle2 size={15} />
                        ) : step.status === 'current' ? (
                          <Loader2 size={14} className="spinner" />
                        ) : step.status === 'failed' ? (
                          <XCircle size={15} />
                        ) : (
                          <span style={{ fontSize: '11px', fontWeight: 600 }}>{idx + 1}</span>
                        )}
                      </div>
                      {!isLast && (
                        <div
                          style={{
                            width: '2px',
                            flex: 1,
                            background: step.status === 'completed' ? '#16a34a' : '#e2e8f0',
                            marginTop: '4px',
                            marginBottom: '4px',
                          }}
                        />
                      )}
                    </div>

                    {/* Step Content */}
                    <div style={{ flex: 1, paddingBottom: isLast ? 0 : '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontWeight: step.status === 'current' ? 600 : 500,
                            fontSize: '13px',
                            color: step.status === 'pending' ? '#94a3b8' : '#1e293b',
                          }}
                        >
                          {step.label}
                        </span>
                        {step.timestamp && (
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {format(new Date(step.timestamp), 'HH:mm:ss')}
                          </span>
                        )}
                      </div>
                      {step.detail && (
                        <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#64748b' }}>{step.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Hint and ETA banner */}
            {trackedCommand.hint && trackedCommand.status !== 'COMPLETED' && trackedCommand.status !== 'FAILED' && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '12px',
                  color: '#475569',
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={16} color="#0284c7" />
                <div style={{ flex: 1 }}>{trackedCommand.hint}</div>
                {trackedCommand.estimatedSecondsRemaining !== null && (
                  <span
                    style={{
                      fontWeight: 600,
                      color: trackedCommand.isOverdue ? '#dc2626' : '#0284c7',
                      fontSize: '12px',
                    }}
                  >
                    ~{trackedCommand.estimatedSecondsRemaining}s left
                  </span>
                )}
              </div>
            )}

            {trackedCommand.status === 'COMPLETED' && (
              <div
                style={{
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '12.5px',
                  color: '#15803d',
                  marginBottom: '16px',
                }}
              >
                <CheckCircle2 size={18} />
                <span>Operation completed successfully! Terminal checked back in and confirmed status.</span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button className="btn btn-secondary" onClick={() => setCommandModalOpen(false)}>
                {trackedCommand.status === 'COMPLETED' || trackedCommand.status === 'FAILED' ? 'Close' : 'Keep Running in Background'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Terminal Activity / History Drawer ─────────────────────────────── */}
      {activityTerminal && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setActivityTerminal(null)}
        >
          <div className="modal" style={{ width: '680px', maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={18} />
                <h3 className="modal-title">Activity Timeline — {activityTerminal.terminalId}</h3>
              </div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setActivityTerminal(null)}>
                <X size={14} />
              </button>
            </div>

            {activityLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 size={24} className="spinner" />
              </div>
            ) : activityData ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Recent Remote Commands */}
                <div>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 600, marginBottom: '10px', color: '#1e293b' }}>
                    Recent Remote Commands
                  </h4>
                  {activityData.recentCommands && activityData.recentCommands.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {activityData.recentCommands.map((cmd: any) => (
                        <div
                          key={cmd.id}
                          style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{cmd.type}</span>
                            <span
                              className={`badge badge-${
                                cmd.status === 'COMPLETED'
                                  ? 'success'
                                  : cmd.status === 'FAILED'
                                  ? 'danger'
                                  : 'warning'
                              }`}
                            >
                              {cmd.status}
                            </span>
                          </div>
                          <div style={{ color: '#64748b', marginBottom: '4px' }}>
                            Stage: <code>{cmd.stage || '—'}</code>
                            {cmd.stageDetail ? ` • ${cmd.stageDetail}` : ''}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            Created: {format(new Date(cmd.createdAt), 'dd MMM yyyy HH:mm:ss')}
                            {cmd.completedAt && ` • Finished: ${format(new Date(cmd.completedAt), 'HH:mm:ss')}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>No remote commands executed yet.</div>
                  )}
                </div>

                {/* Advertisement Deliveries */}
                <div>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 600, marginBottom: '10px', color: '#1e293b' }}>
                    Assigned Advertisements & Delivery Status
                  </h4>
                  {activityData.advertisementDeliveries && activityData.advertisementDeliveries.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {activityData.advertisementDeliveries.map((ad: any) => (
                        <div
                          key={ad.id}
                          style={{
                            padding: '10px 14px',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontWeight: 600 }}>{ad.advertisement?.title || ad.advertisementId}</span>
                            <span className="badge badge-info">Shown {ad.showCount} time(s)</span>
                          </div>
                          <div style={{ color: '#64748b', fontSize: '11.5px' }}>
                            Fetched: {ad.firstFetchedAt ? format(new Date(ad.firstFetchedAt), 'dd MMM HH:mm') : 'Pending'}
                            {ad.lastShownAt && ` • Last displayed: ${format(new Date(ad.lastShownAt), 'dd MMM HH:mm')}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>No advertisements tracked on this terminal yet.</div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
