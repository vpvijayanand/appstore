import { useEffect, useRef, useState } from 'react';
import { advertisementsApi, advertisementAssignmentsApi, customersApi, terminalMastersApi } from '../api';
import {
  Megaphone, Plus, Trash2, Loader2, CheckCircle, XCircle, Image as ImageIcon,
  Video, FileCode, Users, HardDrive, Share2, Clock,
} from 'lucide-react';

interface Advertisement {
  id: string;
  title: string;
  description: string | null;
  type: 'IMAGE' | 'VIDEO' | 'HTML';
  displayMode: 'POPUP' | 'SCREENSAVER';
  durationSeconds: number;
  startAt: string;
  endAt: string;
  isActive: boolean;
  previewUrl: string | null;
  assignmentCount: number;
}

interface Customer { id: string; name: string; code: string; }
interface TerminalMaster { id: string; tid: string; serialNo: string; customer: { name: string } }

type Scope = 'CUSTOMER' | 'TERMINAL';

function statusOf(ad: Advertisement): { label: string; cls: string } {
  if (!ad.isActive) return { label: 'Disabled', cls: 'badge-default' };
  const now = Date.now();
  const start = new Date(ad.startAt).getTime();
  const end = new Date(ad.endAt).getTime();
  if (now < start) return { label: 'Scheduled', cls: 'badge-info' };
  if (now > end) return { label: 'Expired', cls: 'badge-default' };
  return { label: 'Active', cls: 'badge-success' };
}

const typeIcon = { IMAGE: ImageIcon, VIDEO: Video, HTML: FileCode };

function toDatetimeLocal(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdvertisementsPage() {
  const [ads, setAds] = useState<Advertisement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [masters, setMasters] = useState<TerminalMaster[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const now = new Date();
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const inOneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const [form, setForm] = useState({
    title: '', description: '', type: 'IMAGE' as 'IMAGE' | 'VIDEO' | 'HTML',
    displayMode: 'POPUP' as 'POPUP' | 'SCREENSAVER', durationSeconds: '10',
    htmlContent: '', startAt: toDatetimeLocal(inOneHour.toISOString()), endAt: toDatetimeLocal(inOneWeek.toISOString()),
  });

  // Assign modal
  const [assigningAd, setAssigningAd] = useState<Advertisement | null>(null);
  const [scope, setScope] = useState<Scope>('CUSTOMER');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([advertisementsApi.list(), customersApi.list(), terminalMastersApi.list()])
      .then(([adRes, cRes, mRes]) => {
        setAds(adRes.data.advertisements);
        setCustomers(cRes.data.customers);
        setMasters(mRes.data.terminalMasters);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm({
      title: '', description: '', type: 'IMAGE', displayMode: 'POPUP', durationSeconds: '10',
      htmlContent: '', startAt: toDatetimeLocal(inOneHour.toISOString()), endAt: toDatetimeLocal(inOneWeek.toISOString()),
    });
    setSelectedFile(null);
  };

  const openCreateModal = () => { resetForm(); setShowModal(true); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.type !== 'HTML' && !selectedFile) {
      alert('A media file is required for Image/Video advertisements');
      return;
    }
    setCreating(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('type', form.type);
      fd.append('displayMode', form.displayMode);
      fd.append('durationSeconds', form.durationSeconds);
      fd.append('startAt', new Date(form.startAt).toISOString());
      fd.append('endAt', new Date(form.endAt).toISOString());
      if (form.type === 'HTML') fd.append('htmlContent', form.htmlContent);
      if (selectedFile) fd.append('media', selectedFile);

      await advertisementsApi.create(fd);
      setShowModal(false);
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to create advertisement');
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (ad: Advertisement) => {
    await advertisementsApi.update(ad.id, { isActive: !ad.isActive });
    load();
  };

  const deleteAd = async (ad: Advertisement) => {
    if (!confirm(`Delete "${ad.title}"? This cannot be undone.`)) return;
    await advertisementsApi.delete(ad.id);
    load();
  };

  const openAssignModal = (ad: Advertisement) => {
    setAssigningAd(ad);
    setScope('CUSTOMER');
    setTargetIds([]);
  };

  const toggleTarget = (id: string) => {
    setTargetIds(list => list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  };

  const submitAssign = async () => {
    if (!assigningAd || targetIds.length === 0) return;
    setSubmitting(true);
    try {
      const targets = scope === 'CUSTOMER'
        ? { scope: 'CUSTOMER' as const, customerIds: targetIds }
        : { scope: 'TERMINAL' as const, terminalMasterIds: targetIds };
      await advertisementAssignmentsApi.bulk({ advertisementIds: [assigningAd.id], targets });
      setAssigningAd(null);
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Assignment failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Advertisements</h2>
          <p className="page-subtitle">Push image/video/HTML promos to terminals as a popup or idle screensaver, on a schedule</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={16} /> New Advertisement
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <Loader2 size={32} className="spinner" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Advertisement</th>
                <th>Type</th>
                <th>Display Mode</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Assignments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ads.map(ad => {
                const Icon = typeIcon[ad.type];
                const status = statusOf(ad);
                return (
                  <tr key={ad.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div className="app-icon app-icon-sm">
                          <Icon size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 600 }}>{ad.title}</div>
                          {ad.description && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{ad.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td><span className="badge badge-info">{ad.type}</span></td>
                    <td>{ad.displayMode === 'POPUP' ? 'Popup' : 'Screensaver'}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {new Date(ad.startAt).toLocaleString()} &rarr; {new Date(ad.endAt).toLocaleString()}
                    </td>
                    <td><span className={`badge ${status.cls}`}><Clock size={11} /> {status.label}</span></td>
                    <td>{ad.assignmentCount}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(ad)} title={ad.isActive ? 'Disable' : 'Enable'}>
                          {ad.isActive ? <XCircle size={13} /> : <CheckCircle size={13} />}
                        </button>
                        <button className="btn btn-secondary btn-sm btn-icon" onClick={() => openAssignModal(ad)} title="Assign">
                          <Share2 size={13} />
                        </button>
                        <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteAd(ad)} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {ads.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <Megaphone size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <div>No advertisements yet. Click "New Advertisement" to get started.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ width: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">New Advertisement</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="content-grid grid-2" style={{ gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">Title *</label>
                  <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Content Type *</label>
                  <select className="form-select" value={form.type}
                    onChange={e => { setSelectedFile(null); setForm(f => ({ ...f, type: e.target.value as any })); }}>
                    <option value="IMAGE">Image</option>
                    <option value="VIDEO">Video</option>
                    <option value="HTML">HTML Newsletter</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Display Mode *</label>
                  <select className="form-select" value={form.displayMode}
                    onChange={e => setForm(f => ({ ...f, displayMode: e.target.value as any }))}>
                    <option value="POPUP">Popup (shown on launch/resume)</option>
                    <option value="SCREENSAVER">Screensaver (shown when idle)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (seconds) *</label>
                  <input className="form-input" type="number" min={3} value={form.durationSeconds}
                    onChange={e => setForm(f => ({ ...f, durationSeconds: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Start Date/Time *</label>
                  <input className="form-input" type="datetime-local" value={form.startAt}
                    onChange={e => setForm(f => ({ ...f, startAt: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date/Time *</label>
                  <input className="form-input" type="datetime-local" value={form.endAt}
                    onChange={e => setForm(f => ({ ...f, endAt: e.target.value }))} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={2} value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>

              {form.type === 'HTML' ? (
                <div className="form-group">
                  <label className="form-label">HTML Content *</label>
                  <textarea className="form-input" rows={8} style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                    placeholder="<html>...</html>" value={form.htmlContent}
                    onChange={e => setForm(f => ({ ...f, htmlContent: e.target.value }))} required />
                </div>
              ) : (
                <div
                  className={`upload-zone ${dragging ? 'dragging' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) setSelectedFile(file);
                  }}
                >
                  <div className="upload-zone-icon">{form.type === 'VIDEO' ? '🎬' : '🖼️'}</div>
                  {selectedFile ? (
                    <div>
                      <div style={{ fontWeight: 600, color: 'var(--brand-accent)', marginBottom: '4px' }}>{selectedFile.name}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                        Drop {form.type === 'VIDEO' ? 'video' : 'image'} here or click to browse
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Max file size: 200MB</div>
                    </div>
                  )}
                </div>
              )}
              <input ref={fileInputRef} type="file" accept={form.type === 'VIDEO' ? 'video/*' : 'image/*'} style={{ display: 'none' }}
                onChange={e => e.target.files?.[0] && setSelectedFile(e.target.files[0])} />

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <Loader2 size={15} className="spinner" /> : <Plus size={15} />}
                  {creating ? 'Creating...' : 'Create Advertisement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assigningAd && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setAssigningAd(null)}>
          <div className="modal" style={{ width: '560px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Assign "{assigningAd.title}"</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setAssigningAd(null)}>✕</button>
            </div>

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

            <div style={{ display: 'grid', gap: '8px', maxHeight: '320px', overflowY: 'auto', marginBottom: '16px' }}>
              {(scope === 'CUSTOMER' ? customers : masters).map((t: any) => {
                const checked = targetIds.includes(t.id);
                return (
                  <label key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)', background: checked ? 'rgba(1,135,95,0.1)' : 'var(--bg-surface-2)',
                    border: `1px solid ${checked ? 'var(--brand-primary)' : 'var(--border-subtle)'}`, cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleTarget(t.id)}
                      style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }} />
                    {scope === 'CUSTOMER'
                      ? <span>{t.name} <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>({t.code})</span></span>
                      : <span style={{ fontFamily: 'var(--font-mono)' }}>{t.tid} <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}>— {t.customer.name}</span></span>}
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setAssigningAd(null)}>Cancel</button>
              <button className="btn btn-primary" disabled={submitting || targetIds.length === 0} onClick={submitAssign}>
                {submitting ? <Loader2 size={15} className="spinner" /> : <Share2 size={15} />}
                {submitting ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
