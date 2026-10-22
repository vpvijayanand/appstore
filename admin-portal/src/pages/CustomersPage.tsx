import { useEffect, useState } from 'react';
import { customersApi, appsApi } from '../api';
import { Users, Plus, Edit, CheckCircle, Loader2, Download, FileSpreadsheet } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface Customer {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  _count: { terminals: number };
  entitlements: { app: { id: string; name: string; iconUrl: string } }[];
}

interface App { id: string; name: string; }

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selectedApps, setSelectedApps] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', code: '', contactEmail: '' });
  const [downloadsModalCustomer, setDownloadsModalCustomer] = useState<Customer | null>(null);
  const [customerDownloads, setCustomerDownloads] = useState<any[]>([]);
  const [loadingDownloads, setLoadingDownloads] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([customersApi.list(), appsApi.list()])
      .then(([cRes, appsRes]) => {
        setCustomers(cRes.data.customers);
        setApps(appsRes.data.apps);
      }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (c: Customer) => {
    setEditing(c);
    setSelectedApps(c.entitlements.map(e => e.app.id));
  };

  const saveEntitlements = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await customersApi.updateEntitlements(editing.id, selectedApps);
      load();
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const createCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    await customersApi.create(newCustomer);
    setShowCreate(false);
    setNewCustomer({ name: '', code: '', contactEmail: '' });
    load();
  };

  const showDownloads = async (c: Customer) => {
    setDownloadsModalCustomer(c);
    setLoadingDownloads(true);
    try {
      const res = await customersApi.getDownloads(c.id);
      setCustomerDownloads(res.data.downloads);
    } catch (e) {
      alert('Failed to load downloads');
    } finally {
      setLoadingDownloads(false);
    }
  };

  const exportExcel = () => {
    const rows = customers.map(c => ({
      'Name':          c.name,
      'Code':          c.code,
      'Contact Email': c.contactEmail || '',
      'Terminals':     c._count.terminals,
      'Entitled Apps': c.entitlements.map(e => e.app.name).join(', ') || 'None',
    }));
    exportToExcel(rows, 'customers', 'Customers');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="page-subtitle">Manage customers and their app catalog entitlements</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={exportExcel} disabled={loading || customers.length === 0}>
            <FileSpreadsheet size={15} />
            Export Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Add Customer
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={32} className="spinner" color="var(--text-muted)" />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {customers.map(c => (
            <div key={c.id} className="card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-blue))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 800, color: 'white', flexShrink: 0,
                }}>
                  {c.name.charAt(0)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Code: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{c.code}</span>
                    {' · '}
                    <span>{c._count.terminals} terminals</span>
                    {c.contactEmail && ` · ${c.contactEmail}`}
                  </div>
                </div>

                {/* Entitlement badges */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 2 }}>
                  {c.entitlements.length === 0 ? (
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No entitlements</span>
                  ) : c.entitlements.map(e => (
                    <span key={e.app.id} className="badge badge-success">
                      <CheckCircle size={11} /> {e.app.name}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => showDownloads(c)} title="Download History">
                    <Download size={13} /> History
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>
                    <Edit size={13} /> Manage
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Entitlement Modal */}
      {editing && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Manage Entitlements — {editing.name}</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditing(null)}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '20px' }}>
              Select the individual apps this customer's terminals can access.
            </p>
            <div style={{ display: 'grid', gap: '10px' }}>
              {apps.map(app => {
                const checked = selectedApps.includes(app.id);
                return (
                  <label
                    key={app.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '14px 16px', borderRadius: 'var(--radius-sm)',
                      background: checked ? 'rgba(1,135,95,0.1)' : 'var(--bg-surface-2)',
                      border: `1px solid ${checked ? 'var(--brand-primary)' : 'var(--border-subtle)'}`,
                      cursor: 'pointer', transition: 'all var(--transition-fast)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        if (e.target.checked) setSelectedApps(s => [...s, app.id]);
                        else setSelectedApps(s => s.filter(id => id !== app.id));
                      }}
                      style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: checked ? 600 : 400, fontSize: '14px' }}>{app.name}</span>
                    {checked && <CheckCircle size={16} color="var(--brand-primary)" style={{ marginLeft: 'auto' }} />}
                  </label>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEntitlements} disabled={saving}>
                {saving ? <Loader2 size={14} className="spinner" /> : <CheckCircle size={14} />}
                Save Entitlements
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Customer Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal" style={{ width: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Customer</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={createCustomer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Customer Name *</label>
                <input className="form-input" value={newCustomer.name}
                  onChange={e => setNewCustomer(c => ({ ...c, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Customer Code *</label>
                <input className="form-input" placeholder="e.g. RETAIL_A" value={newCustomer.code}
                  onChange={e => setNewCustomer(c => ({ ...c, code: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Email</label>
                <input className="form-input" type="email" value={newCustomer.contactEmail}
                  onChange={e => setNewCustomer(c => ({ ...c, contactEmail: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  <Users size={14} /> Create Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Downloads Modal */}
      {downloadsModalCustomer && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDownloadsModalCustomer(null)}>
          <div className="modal" style={{ width: '800px' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Download History</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{downloadsModalCustomer.name}</div>
              </div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setDownloadsModalCustomer(null)}>✕</button>
            </div>
            
            {loadingDownloads ? (
              <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={24} className="spinner" /></div>
            ) : (
              <div className="table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                <table>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th>Date / Time</th>
                      <th>Terminal ID</th>
                      <th>App</th>
                      <th>Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerDownloads.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(d.timestamp).toLocaleString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{d.terminal.terminalId}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="app-icon" style={{ width: '24px', height: '24px', fontSize: '10px', borderRadius: '4px' }}>
                              {d.app.name.charAt(0)}
                            </div>
                            {d.app.name}
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>v{d.app.version}</td>
                      </tr>
                    ))}
                    {customerDownloads.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No apps downloaded by this customer yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
