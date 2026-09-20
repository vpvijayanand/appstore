import { useEffect, useState } from 'react';
import { customersApi, categoriesApi } from '../api';
import { Users, Plus, Edit, CheckCircle, Loader2 } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  code: string;
  contactEmail: string;
  _count: { terminals: number };
  entitlements: { category: { id: string; name: string; iconName: string } }[];
}

interface Category { id: string; name: string; }

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', code: '', contactEmail: '' });

  const load = () => {
    setLoading(true);
    Promise.all([customersApi.list(), categoriesApi.list()])
      .then(([cRes, catRes]) => {
        setCustomers(cRes.data.customers);
        setCategories(catRes.data.categories);
      }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openEdit = (c: Customer) => {
    setEditing(c);
    setSelectedCats(c.entitlements.map(e => e.category.id));
  };

  const saveEntitlements = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await customersApi.updateEntitlements(editing.id, selectedCats);
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

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Customers</h2>
          <p className="page-subtitle">Manage customers and their app catalog entitlements</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Add Customer
        </button>
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
                    <span key={e.category.id} className="badge badge-success">
                      <CheckCircle size={11} /> {e.category.name}
                    </span>
                  ))}
                </div>

                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>
                  <Edit size={13} /> Manage
                </button>
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
              Select the app categories this customer's terminals can access.
            </p>
            <div style={{ display: 'grid', gap: '10px' }}>
              {categories.map(cat => {
                const checked = selectedCats.includes(cat.id);
                return (
                  <label
                    key={cat.id}
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
                        if (e.target.checked) setSelectedCats(s => [...s, cat.id]);
                        else setSelectedCats(s => s.filter(id => id !== cat.id));
                      }}
                      style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontWeight: checked ? 600 : 400, fontSize: '14px' }}>{cat.name}</span>
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
    </div>
  );
}
