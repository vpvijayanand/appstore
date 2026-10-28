import { useEffect, useState } from 'react';
import { assignmentsApi, appsApi, customersApi, terminalMastersApi } from '../api';
import {
  Share2, Plus, Trash2, Loader2, CheckCircle, ChevronRight, ChevronLeft,
  Users, HardDrive, Star, Clock,
} from 'lucide-react';

interface App { id: string; name: string; iconUrl?: string | null; }
interface Customer { id: string; name: string; code: string; }
interface TerminalMaster { id: string; tid: string; serialNo: string; customer: { name: string } }

interface Assignment {
  id: string;
  scope: 'CUSTOMER' | 'TERMINAL';
  mode: 'DEFAULT' | 'ON_REQUEST';
  grantedAt: string;
  app: { id: string; name: string };
  customer: { id: string; name: string; code: string } | null;
  terminalMaster: { id: string; tid: string; serialNo: string } | null;
}

type Scope = 'CUSTOMER' | 'TERMINAL';

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [masters, setMasters] = useState<TerminalMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);

  // Wizard state
  const [step, setStep] = useState(1);
  const [scope, setScope] = useState<Scope>('CUSTOMER');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [appIds, setAppIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'DEFAULT' | 'ON_REQUEST'>('ON_REQUEST');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([assignmentsApi.list(), appsApi.list({ limit: '200' }), customersApi.list(), terminalMastersApi.list()])
      .then(([aRes, appRes, cRes, mRes]) => {
        setAssignments(aRes.data.assignments);
        setApps(appRes.data.apps);
        setCustomers(cRes.data.customers);
        setMasters(mRes.data.terminalMasters);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetWizard = () => {
    setStep(1); setScope('CUSTOMER'); setTargetIds([]); setAppIds([]);
    setMode('ON_REQUEST'); setReplaceExisting(false); setResult(null);
  };

  const openWizard = () => { resetWizard(); setShowWizard(true); };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const targets = scope === 'CUSTOMER'
        ? { scope: 'CUSTOMER' as const, customerIds: targetIds }
        : { scope: 'TERMINAL' as const, terminalMasterIds: targetIds };
      const res = await assignmentsApi.bulk({ appIds, targets, mode, replaceExisting });
      setResult(res.data);
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Bulk assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const removeAssignment = async (a: Assignment) => {
    if (!confirm(`Remove assignment of "${a.app.name}"?`)) return;
    await assignmentsApi.delete(a.id);
    load();
  };

  const canNext = (
    (step === 1 && targetIds.length > 0) ||
    (step === 2 && appIds.length > 0) ||
    step === 3
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">App Assignments</h2>
          <p className="page-subtitle">Assign apps to customers or specific devices — mark as Default (auto-installs) or On Request</p>
        </div>
        <button className="btn btn-primary" onClick={openWizard}>
          <Plus size={16} /> Bulk Assign Apps
        </button>
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
                <th>App</th>
                <th>Scope</th>
                <th>Target</th>
                <th>Mode</th>
                <th>Granted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.app.name}</td>
                  <td>
                    {a.scope === 'CUSTOMER'
                      ? <span className="badge badge-info"><Users size={11} /> Customer</span>
                      : <span className="badge badge-info"><HardDrive size={11} /> Terminal</span>}
                  </td>
                  <td>
                    {a.scope === 'CUSTOMER'
                      ? <>{a.customer?.name} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>({a.customer?.code})</span></>
                      : <span style={{ fontFamily: 'var(--font-mono)' }}>{a.terminalMaster?.tid}</span>}
                  </td>
                  <td>
                    {a.mode === 'DEFAULT'
                      ? <span className="badge badge-success"><Star size={11} /> Default</span>
                      : <span className="badge badge-default"><Clock size={11} /> On Request</span>}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(a.grantedAt).toLocaleDateString()}</td>
                  <td>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => removeAssignment(a)} title="Remove">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <Share2 size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <div>No assignments yet. Click "Bulk Assign Apps" to get started.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk Assign Wizard */}
      {showWizard && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowWizard(false)}>
          <div className="modal" style={{ width: '620px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Bulk Assign Apps — Step {step} of 4</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowWizard(false)}>✕</button>
            </div>

            {/* Step indicator */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '20px' }}>
              {['Targets', 'Apps', 'Mode', 'Review'].map((label, i) => (
                <div key={label} style={{
                  flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 'var(--radius-sm)',
                  fontSize: '12px', fontWeight: 600,
                  background: step === i + 1 ? 'var(--brand-primary)' : 'var(--bg-surface-2)',
                  color: step === i + 1 ? 'white' : 'var(--text-muted)',
                }}>
                  {i + 1}. {label}
                </div>
              ))}
            </div>

            {/* Step 1: Targets */}
            {step === 1 && (
              <div>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                  <button
                    className={`btn ${scope === 'CUSTOMER' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setScope('CUSTOMER'); setTargetIds([]); }}
                  >
                    <Users size={14} /> By Customer
                  </button>
                  <button
                    className={`btn ${scope === 'TERMINAL' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setScope('TERMINAL'); setTargetIds([]); }}
                  >
                    <HardDrive size={14} /> By Device (TID)
                  </button>
                </div>
                <div style={{ display: 'grid', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                  {(scope === 'CUSTOMER' ? customers : masters).map((t: any) => {
                    const checked = targetIds.includes(t.id);
                    return (
                      <label key={t.id} style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                        borderRadius: 'var(--radius-sm)', background: checked ? 'rgba(1,135,95,0.1)' : 'var(--bg-surface-2)',
                        border: `1px solid ${checked ? 'var(--brand-primary)' : 'var(--border-subtle)'}`, cursor: 'pointer',
                      }}>
                        <input type="checkbox" checked={checked} onChange={() => toggle(targetIds, setTargetIds, t.id)}
                          style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }} />
                        {scope === 'CUSTOMER'
                          ? <span>{t.name} <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({t.code})</span></span>
                          : <span style={{ fontFamily: 'var(--font-mono)' }}>{t.tid} <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}>— {t.customer.name}</span></span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step 2: Apps */}
            {step === 2 && (
              <div style={{ display: 'grid', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
                {apps.map(app => {
                  const checked = appIds.includes(app.id);
                  return (
                    <label key={app.id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)', background: checked ? 'rgba(1,135,95,0.1)' : 'var(--bg-surface-2)',
                      border: `1px solid ${checked ? 'var(--brand-primary)' : 'var(--border-subtle)'}`, cursor: 'pointer',
                    }}>
                      <input type="checkbox" checked={checked} onChange={() => toggle(appIds, setAppIds, app.id)}
                        style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }} />
                      <span>{app.name}</span>
                      {checked && <CheckCircle size={15} color="var(--brand-primary)" style={{ marginLeft: 'auto' }} />}
                    </label>
                  );
                })}
              </div>
            )}

            {/* Step 3: Mode */}
            {step === 3 && (
              <div style={{ display: 'grid', gap: '14px' }}>
                <div style={{ display: 'grid', gap: '10px' }}>
                  <label style={{
                    display: 'flex', gap: '12px', padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: mode === 'DEFAULT' ? 'rgba(1,135,95,0.1)' : 'var(--bg-surface-2)',
                    border: `1px solid ${mode === 'DEFAULT' ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                  }}>
                    <input type="radio" checked={mode === 'DEFAULT'} onChange={() => setMode('DEFAULT')} style={{ accentColor: 'var(--brand-primary)' }} />
                    <div>
                      <div style={{ fontWeight: 700 }}><Star size={13} style={{ verticalAlign: '-2px' }} /> Default</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Auto-downloads on the device on first launch / setup.</div>
                    </div>
                  </label>
                  <label style={{
                    display: 'flex', gap: '12px', padding: '14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    background: mode === 'ON_REQUEST' ? 'rgba(1,135,95,0.1)' : 'var(--bg-surface-2)',
                    border: `1px solid ${mode === 'ON_REQUEST' ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                  }}>
                    <input type="radio" checked={mode === 'ON_REQUEST'} onChange={() => setMode('ON_REQUEST')} style={{ accentColor: 'var(--brand-primary)' }} />
                    <div>
                      <div style={{ fontWeight: 700 }}><Clock size={13} style={{ verticalAlign: '-2px' }} /> On Request</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Visible in the store catalog; user installs manually.</div>
                    </div>
                  </label>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                  <input type="checkbox" checked={replaceExisting} onChange={e => setReplaceExisting(e.target.checked)}
                    style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }} />
                  Replace existing assignments for selected targets (remove apps not in this selection)
                </label>
              </div>
            )}

            {/* Step 4: Review */}
            {step === 4 && !result && (
              <div style={{ display: 'grid', gap: '10px', fontSize: '13.5px' }}>
                <div><b>Scope:</b> {scope === 'CUSTOMER' ? 'By Customer' : 'By Device (TID)'}</div>
                <div><b>Targets:</b> {targetIds.length} selected</div>
                <div><b>Apps:</b> {appIds.map(id => apps.find(a => a.id === id)?.name).join(', ')}</div>
                <div><b>Mode:</b> {mode === 'DEFAULT' ? 'Default (auto-install)' : 'On Request'}</div>
                <div><b>Replace existing:</b> {replaceExisting ? 'Yes' : 'No'}</div>
              </div>
            )}
            {result && (
              <div style={{ padding: '14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                <CheckCircle size={18} color="var(--status-success)" style={{ verticalAlign: '-4px' }} />{' '}
                <b>Done:</b> {result.created} created, {result.updated} updated, {result.removed} removed.
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', marginTop: '22px' }}>
              <div>
                {step > 1 && !result && (
                  <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}><ChevronLeft size={14} /> Back</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {!result ? (
                  step < 4 ? (
                    <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(s => s + 1)}>
                      Next <ChevronRight size={14} />
                    </button>
                  ) : (
                    <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                      {submitting ? <Loader2 size={14} className="spinner" /> : <CheckCircle size={14} />}
                      Confirm Assignment
                    </button>
                  )
                ) : (
                  <button className="btn btn-primary" onClick={() => setShowWizard(false)}>Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
