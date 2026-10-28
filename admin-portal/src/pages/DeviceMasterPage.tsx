import { useEffect, useState } from 'react';
import { terminalMastersApi, customersApi } from '../api';
import {
  HardDrive, Plus, Trash2, Loader2, FileSpreadsheet, UploadCloud,
  CheckCircle, XCircle, Search, Link2,
} from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface Customer { id: string; name: string; code: string; }

interface TerminalMaster {
  id: string;
  tid: string | null;
  serialNo: string;
  model: string | null;
  branchCode: string | null;
  site: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  customer: { id: string; name: string; code: string };
  terminal: { id: string; status: string; lastSeenAt: string | null } | null;
  _count: { assignments: number };
  createdAt: string;
}

export default function DeviceMasterPage() {
  const [masters, setMasters] = useState<TerminalMaster[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ serialNo: '', tid: '', customerId: '', model: '', branchCode: '', site: '' });
  const [bulkText, setBulkText] = useState('SerialNo,TID,CustomerCode,Model,BranchCode,Site\nSN-1001,TID-1001,RETAIL_A,PAX A920,BR001,Mumbai HQ');
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [mapTidFor, setMapTidFor] = useState<TerminalMaster | null>(null);
  const [mapTidValue, setMapTidValue] = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([terminalMastersApi.list({ search }), customersApi.list()])
      .then(([mRes, cRes]) => {
        setMasters(mRes.data.terminalMasters);
        setCustomers(cRes.data.customers);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [search]);

  const createMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await terminalMastersApi.create(form);
      setShowCreate(false);
      setForm({ serialNo: '', tid: '', customerId: '', model: '', branchCode: '', site: '' });
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const runBulkImport = async () => {
    setSaving(true);
    setBulkResult(null);
    try {
      const lines = bulkText.trim().split('\n').map(l => l.trim()).filter(Boolean);
      const [header, ...dataLines] = lines;
      const cols = header.split(',').map(c => c.trim().toLowerCase());
      const rows = dataLines.map(line => {
        const vals = line.split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        cols.forEach((c, i) => {
          if (c === 'tid') row.tid = vals[i];
          else if (c === 'serialno') row.serialNo = vals[i];
          else if (c === 'customercode') row.customerCode = vals[i];
          else if (c === 'model') row.model = vals[i];
          else if (c === 'branchcode') row.branchCode = vals[i];
          else if (c === 'site') row.site = vals[i];
        });
        return row;
      });
      const res = await terminalMastersApi.bulkImport(rows);
      setBulkResult(res.data);
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Bulk import failed');
    } finally {
      setSaving(false);
    }
  };

  const deleteMaster = async (m: TerminalMaster) => {
    if (!confirm(`Delete device master "${m.serialNo}"?`)) return;
    try {
      await terminalMastersApi.delete(m.id);
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Delete failed');
    }
  };

  const openMapTid = (m: TerminalMaster) => {
    setMapTidFor(m);
    setMapTidValue(m.tid || '');
  };

  const saveMapTid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapTidFor) return;
    setSaving(true);
    try {
      await terminalMastersApi.update(mapTidFor.id, { tid: mapTidValue });
      setMapTidFor(null);
      setMapTidValue('');
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Mapping failed');
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = () => {
    const rows = masters.map(m => ({
      'Serial No': m.serialNo,
      'TID': m.tid || '',
      'Customer': m.customer.name,
      'Customer Code': m.customer.code,
      'Model': m.model || '',
      'Branch Code': m.branchCode || '',
      'Site': m.site || '',
      'Status': m.status,
      'Enrolled Device': m.terminal ? 'Yes' : 'No',
      'Assignments': m._count.assignments,
    }));
    exportToExcel(rows, 'device_masters', 'Device Masters');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Device Master (Serial No / TID)</h2>
          <p className="page-subtitle">
            {masters.length} provisioned devices — map each Serial No / TID to a customer before enrollment
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={exportExcel} disabled={loading || masters.length === 0}>
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <button className="btn btn-secondary" onClick={() => setShowBulk(true)}>
            <UploadCloud size={15} /> Bulk Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Add Device
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', flex: 1, maxWidth: '360px' }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '13.5px', width: '100%' }}
            placeholder="Search TID or Serial No..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
                <th>Serial No</th>
                <th>TID</th>
                <th>Customer</th>
                <th>Model</th>
                <th>Site / Branch</th>
                <th>Status</th>
                <th>Device</th>
                <th>Assignments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {masters.map(m => (
                <tr key={m.id}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{m.serialNo}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {m.tid || (
                      <button className="btn btn-secondary btn-sm" onClick={() => openMapTid(m)} style={{ fontSize: '11px' }}>
                        <Link2 size={12} /> Map TID
                      </button>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.customer.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{m.customer.code}</div>
                  </td>
                  <td>{m.model || '—'}</td>
                  <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {[m.site, m.branchCode].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>
                    {m.status === 'ACTIVE'
                      ? <span className="badge badge-success"><CheckCircle size={11} /> Active</span>
                      : <span className="badge badge-default"><XCircle size={11} /> Inactive</span>}
                  </td>
                  <td>
                    {m.terminal
                      ? <span className="badge badge-info">Enrolled</span>
                      : <span className="badge badge-warning">Not Enrolled</span>}
                  </td>
                  <td>{m._count.assignments}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {m.tid && (
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openMapTid(m)} title="Edit TID mapping">
                          <Link2 size={13} />
                        </button>
                      )}
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteMaster(m)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {masters.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <HardDrive size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <div>No devices provisioned yet. Add one or bulk-import a list.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal" style={{ width: '480px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Add Device (Serial No / TID)</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={createMaster} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="content-grid grid-2" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Serial No *</label>
                  <input className="form-input" value={form.serialNo} onChange={e => setForm(f => ({ ...f, serialNo: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">TID <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional — map later)</span></label>
                  <input className="form-input" value={form.tid} onChange={e => setForm(f => ({ ...f, tid: e.target.value }))} placeholder="Leave blank if not yet known" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Customer *</label>
                <select className="form-select" value={form.customerId} onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))} required>
                  <option value="">Select customer…</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                </select>
              </div>
              <div className="content-grid grid-2" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Model</label>
                  <input className="form-input" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. PAX A920" />
                </div>
                <div className="form-group">
                  <label className="form-label">Branch Code</label>
                  <input className="form-input" value={form.branchCode} onChange={e => setForm(f => ({ ...f, branchCode: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Site</label>
                <input className="form-input" value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={14} className="spinner" /> : <HardDrive size={14} />}
                  Add Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulk && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowBulk(false)}>
          <div className="modal" style={{ width: '680px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Bulk Import Devices</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => { setShowBulk(false); setBulkResult(null); }}>✕</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '12px' }}>
              Paste CSV rows (header required): <code style={{ fontFamily: 'var(--font-mono)' }}>SerialNo,TID,CustomerCode,Model,BranchCode,Site</code> — TID may be left blank and mapped later.
            </p>
            <textarea
              className="form-input"
              style={{ width: '100%', height: '200px', fontFamily: 'var(--font-mono)', fontSize: '12.5px', resize: 'vertical' }}
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
            />
            {bulkResult && (
              <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontWeight: 700, marginBottom: '6px' }}>
                  ✅ {bulkResult.created} created · {bulkResult.skipped} skipped
                </div>
                <div style={{ maxHeight: '140px', overflowY: 'auto', fontSize: '12px' }}>
                  {bulkResult.results.filter((r: any) => r.status === 'skipped').map((r: any, i: number) => (
                    <div key={i} style={{ color: 'var(--status-error)' }}>Row {r.row} ({r.tid}): {r.reason}</div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '18px' }}>
              <button className="btn btn-secondary" onClick={() => { setShowBulk(false); setBulkResult(null); }}>Close</button>
              <button className="btn btn-primary" onClick={runBulkImport} disabled={saving}>
                {saving ? <Loader2 size={14} className="spinner" /> : <UploadCloud size={14} />}
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map TID Modal */}
      {mapTidFor && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setMapTidFor(null)}>
          <div className="modal" style={{ width: '420px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Map TID</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setMapTidFor(null)}>✕</button>
            </div>
            <form onSubmit={saveMapTid} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Serial No</label>
                <input className="form-input" value={mapTidFor.serialNo} disabled />
              </div>
              <div className="form-group">
                <label className="form-label">TID *</label>
                <input
                  className="form-input"
                  value={mapTidValue}
                  onChange={e => setMapTidValue(e.target.value)}
                  placeholder="Scan or enter the device TID"
                  autoFocus
                  required
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setMapTidFor(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <Loader2 size={14} className="spinner" /> : <Link2 size={14} />}
                  Save Mapping
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
