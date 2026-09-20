import { useEffect, useState } from 'react';
import { categoriesApi } from '../api';
import { Tag, Plus, Trash2, Loader2 } from 'lucide-react';

interface Category { id: string; name: string; iconName: string; sortOrder: number; _count: { apps: number }; }

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', iconName: 'apps' });

  const load = () => {
    setLoading(true);
    categoriesApi.list().then(res => setCategories(res.data.categories)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await categoriesApi.create(form);
    setShowCreate(false);
    setForm({ name: '', iconName: 'apps' });
    load();
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Delete category "${name}"?`)) return;
    await categoriesApi.delete(id);
    load();
  };

  const ICON_MAP: Record<string, string> = {
    payment: '💳', build: '🔧', bar_chart: '📊', security: '🔒',
    apps: '📦', settings: '⚙️', cloud: '☁️', analytics: '📈',
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Categories</h2>
          <p className="page-subtitle">Organize apps into categories and assign to customers</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Category
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={32} className="spinner" color="var(--text-muted)" />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {categories.map(cat => (
            <div key={cat.id} className="card" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px',
                  background: 'var(--bg-surface-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '22px',
                }}>
                  {ICON_MAP[cat.iconName] || '📦'}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px' }}>{cat.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{cat._count.apps} apps</div>
                </div>
                <button
                  className="btn btn-danger btn-sm btn-icon"
                  onClick={() => del(cat.id, cat.name)}
                  style={{ marginLeft: 'auto' }}
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <div style={{ height: '4px', borderRadius: '2px', background: 'var(--bg-surface-3)' }}>
                <div style={{
                  height: '100%', borderRadius: '2px',
                  background: 'linear-gradient(90deg, var(--brand-primary), var(--brand-accent))',
                  width: `${Math.min(100, cat._count.apps * 20)}%`,
                }} />
              </div>
            </div>
          ))}
          {categories.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
              <Tag size={36} style={{ marginBottom: '12px', opacity: 0.3 }} />
              <div>No categories yet. Create one to get started.</div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowCreate(false)}>
          <div className="modal" style={{ width: '400px' }}>
            <div className="modal-header">
              <h3 className="modal-title">New Category</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <form onSubmit={create} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label">Category Name *</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Icon</label>
                <select className="form-select" value={form.iconName}
                  onChange={e => setForm(f => ({ ...f, iconName: e.target.value }))}>
                  <option value="payment">💳 Payment</option>
                  <option value="build">🔧 Build / Utilities</option>
                  <option value="bar_chart">📊 Reporting</option>
                  <option value="security">🔒 Security</option>
                  <option value="apps">📦 Apps (Generic)</option>
                  <option value="settings">⚙️ Settings</option>
                  <option value="cloud">☁️ Cloud</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  <Tag size={14} /> Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
