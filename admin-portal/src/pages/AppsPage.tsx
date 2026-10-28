import { useEffect, useState, useRef } from 'react';
import { appsApi, categoriesApi } from '../api';
import { Plus, Upload, Search, Package, Trash2, Eye, CheckCircle, XCircle, Loader2, Download, FileSpreadsheet, Globe, Lock } from 'lucide-react';
import { exportToExcel } from '../utils/exportExcel';

interface App {
  id: string;
  name: string;
  packageName: string;
  version: string;
  sizeBytes: string;
  isPublished: boolean;
  visibility: 'PUBLIC' | 'PRIVATE';
  category: { id: string; name: string };
  developer: string;
  createdAt: string;
}

interface Category { id: string; name: string; }

function formatBytes(bytes: string) {
  const n = parseInt(bytes);
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', packageName: '', version: '1.0.0', versionCode: '1',
    categoryId: '', description: '', developer: 'Worldline Global Services',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [downloadsModalApp, setDownloadsModalApp] = useState<App | null>(null);
  const [appDownloads, setAppDownloads] = useState<any[]>([]);
  const [loadingDownloads, setLoadingDownloads] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      appsApi.list({ search, categoryId: filterCat }),
      categoriesApi.list(),
    ]).then(([appsRes, catRes]) => {
      setApps(appsRes.data.apps);
      setCategories(catRes.data.categories);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, filterCat]);

  const handleFileChange = (file: File) => {
    setSelectedFile(file);
    if (!form.name) {
      setForm(f => ({ ...f, name: file.name.replace('.apk', '').replace(/-/g, ' ') }));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setUploadProgress(0);

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    fd.append('apk', selectedFile);

    try {
      const interval = setInterval(() => setUploadProgress(p => Math.min(p + 10, 90)), 300);
      await appsApi.upload(fd);
      clearInterval(interval);
      setUploadProgress(100);
      setTimeout(() => {
        setShowModal(false);
        setSelectedFile(null);
        setUploadProgress(0);
        load();
      }, 800);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const togglePublish = async (app: App) => {
    await appsApi.update(app.id, { isPublished: !app.isPublished });
    load();
  };

  const toggleVisibility = async (app: App) => {
    await appsApi.update(app.id, { visibility: app.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC' });
    load();
  };

  const deleteApp = async (app: App) => {
    if (!confirm(`Delete "${app.name}"? This cannot be undone.`)) return;
    await appsApi.delete(app.id);
    load();
  };

  const showDownloads = async (app: App) => {
    setDownloadsModalApp(app);
    setLoadingDownloads(true);
    try {
      const res = await appsApi.getDownloads(app.id);
      setAppDownloads(res.data.downloads);
    } catch (e) {
      alert('Failed to load downloads');
    } finally {
      setLoadingDownloads(false);
    }
  };

  const exportExcel = () => {
    const rows = apps.map(app => ({
      'Name':        app.name,
      'Package':     app.packageName,
      'Category':    app.category.name,
      'Developer':   app.developer,
      'Version':     app.version,
      'Size':        formatBytes(app.sizeBytes),
      'Status':      app.isPublished ? 'Published' : 'Draft',
      'Visibility':  app.visibility === 'PUBLIC' ? 'Public (All customers)' : 'Private (Assigned only)',
      'Created At':  new Date(app.createdAt).toLocaleDateString(),
    }));
    exportToExcel(rows, 'apps_catalog', 'Apps');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">App Catalog</h2>
          <p className="page-subtitle">{apps.length} apps across {categories.length} categories</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={exportExcel} disabled={loading || apps.length === 0}>
            <FileSpreadsheet size={15} />
            Export Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Upload APK
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '8px 14px', flex: '1', minWidth: '200px' }}>
          <Search size={14} color="var(--text-muted)" />
          <input
            style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '13.5px', width: '100%' }}
            placeholder="Search apps..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="form-select" style={{ width: '180px' }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Apps Table */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Loader2 size={32} className="spinner" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>App</th>
                <th>Package Name</th>
                <th>Category</th>
                <th>Version</th>
                <th>Size</th>
                <th>Status</th>
                <th>Visibility</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map(app => (
                <tr key={app.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div className="app-icon app-icon-sm">
                        {app.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{app.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{app.developer}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {app.packageName}
                  </td>
                  <td>
                    <span className="badge badge-info">{app.category.name}</span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>v{app.version}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{formatBytes(app.sizeBytes)}</td>
                  <td>
                    {app.isPublished
                      ? <span className="badge badge-success"><CheckCircle size={11} /> Published</span>
                      : <span className="badge badge-default"><XCircle size={11} /> Draft</span>
                    }
                  </td>
                  <td>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => toggleVisibility(app)}
                      title={app.visibility === 'PUBLIC' ? 'Visible to all customers — click to make Private' : 'Private (assignment required) — click to make Public'}
                    >
                      {app.visibility === 'PUBLIC'
                        ? <span className="badge badge-info"><Globe size={11} /> Public</span>
                        : <span className="badge badge-default"><Lock size={11} /> Private</span>}
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => togglePublish(app)}
                        title={app.isPublished ? 'Unpublish' : 'Publish'}
                      >
                        {app.isPublished ? <XCircle size={13} /> : <CheckCircle size={13} />}
                      </button>
                      <button className="btn btn-secondary btn-sm btn-icon" onClick={() => showDownloads(app)} title="View Downloads">
                        <Download size={13} />
                      </button>
                      <button className="btn btn-secondary btn-sm btn-icon" title="Preview">
                        <Eye size={13} />
                      </button>
                      <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteApp(app)} title="Delete">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {apps.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <Package size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <div>No apps found. Upload your first APK.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ width: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Upload New APK</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleUpload} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Drop Zone */}
              <div
                className={`upload-zone ${dragging ? 'dragging' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file?.name.endsWith('.apk')) handleFileChange(file);
                }}
              >
                <div className="upload-zone-icon">📦</div>
                {selectedFile ? (
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--brand-accent)', marginBottom: '4px' }}>
                      {selectedFile.name}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Drop APK here or click to browse</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max file size: 200MB</div>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".apk" style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && handleFileChange(e.target.files[0])} />

              <div className="content-grid grid-2" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">App Name *</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Package Name *</label>
                  <input className="form-input" value={form.packageName} placeholder="com.example.app"
                    onChange={e => setForm(f => ({ ...f, packageName: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Version *</label>
                  <input className="form-input" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Version Code *</label>
                  <input className="form-input" type="number" value={form.versionCode}
                    onChange={e => setForm(f => ({ ...f, versionCode: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-select" value={form.categoryId}
                    onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} required>
                    <option value="">Select category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Developer</label>
                  <input className="form-input" value={form.developer} onChange={e => setForm(f => ({ ...f, developer: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={3} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              {uploading && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    <span>Uploading...</span><span>{uploadProgress}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={uploading || !selectedFile}>
                  {uploading ? <Loader2 size={15} className="spinner" /> : <Upload size={15} />}
                  {uploading ? 'Uploading...' : 'Upload APK'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Downloads Modal */}
      {downloadsModalApp && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDownloadsModalApp(null)}>
          <div className="modal" style={{ width: '800px' }}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">Download History</h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{downloadsModalApp.name} (v{downloadsModalApp.version})</div>
              </div>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setDownloadsModalApp(null)}>✕</button>
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
                      <th>Branch</th>
                      <th>Customer</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {appDownloads.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(d.timestamp).toLocaleString()}</td>
                        <td style={{ fontFamily: 'var(--font-mono)' }}>{d.terminal.terminalId}</td>
                        <td>{d.terminal.branchCode || '-'}</td>
                        <td>{d.terminal.customer.name}</td>
                        <td>
                          <span className={`badge ${d.installStatus === 'SUCCESS' ? 'badge-success' : d.installStatus === 'FAILED' ? 'badge-error' : 'badge-info'}`}>
                            {d.installStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {appDownloads.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No downloads recorded yet.</td>
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
