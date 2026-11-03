import { useEffect, useState } from 'react';
import { terminalGroupsApi, terminalMastersApi, customersApi } from '../api';
import {
  Boxes, Plus, Trash2, Loader2, CheckCircle, HardDrive, X,
} from 'lucide-react';

interface Customer { id: string; name: string; code: string; }
interface TerminalMaster { id: string; tid: string; serialNo: string; customer: { id: string; name: string } }
interface Group {
  id: string;
  name: string;
  description: string | null;
  customer: { id: string; name: string; code: string } | null;
  _count: { members: number; assignments: number };
}
interface GroupDetail extends Omit<Group, '_count'> {
  members: TerminalMaster[];
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit modal
  const [editingGroup, setEditingGroup] = useState<GroupDetail | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [memberDetails, setMemberDetails] = useState<Record<string, TerminalMaster>>({});
  const [submitting, setSubmitting] = useState(false);

  // Member search/filter state (shared pattern with AssignmentsPage)
  const [terminalSearch, setTerminalSearch] = useState('');
  const [terminalCustomerFilter, setTerminalCustomerFilter] = useState('');
  const [filteredMasters, setFilteredMasters] = useState<TerminalMaster[]>([]);
  const [mastersLoading, setMastersLoading] = useState(false);
  const [mastersTotal, setMastersTotal] = useState(0);

  const load = () => {
    setLoading(true);
    Promise.all([terminalGroupsApi.list(), customersApi.list()])
      .then(([gRes, cRes]) => {
        setGroups(gRes.data.terminalGroups);
        setCustomers(cRes.data.customers);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  // Live search for terminal masters when the modal is open — avoids ever
  // loading the full terminal-master list (can run into the lakhs).
  useEffect(() => {
    if (!showModal) return;
    if (!terminalCustomerFilter && terminalSearch.trim().length < 2) {
      setFilteredMasters([]); setMastersTotal(0);
      return;
    }
    const handle = setTimeout(() => {
      setMastersLoading(true);
      const params: Record<string, string> = {};
      if (terminalCustomerFilter) params.customerId = terminalCustomerFilter;
      if (terminalSearch.trim().length >= 2) params.search = terminalSearch.trim();
      terminalMastersApi.list(params)
        .then(res => {
          setFilteredMasters(res.data.terminalMasters);
          setMastersTotal(res.data.total ?? res.data.terminalMasters.length);
        })
        .finally(() => setMastersLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [showModal, terminalSearch, terminalCustomerFilter]);

  const resetModal = () => {
    setEditingGroup(null); setName(''); setDescription('');
    setMemberIds([]); setMemberDetails({});
    setTerminalSearch(''); setTerminalCustomerFilter(''); setFilteredMasters([]);
  };

  const openCreateModal = () => { resetModal(); setShowModal(true); };

  const openEditModal = async (group: Group) => {
    resetModal();
    setShowModal(true);
    setModalLoading(true);
    try {
      const res = await terminalGroupsApi.get(group.id);
      const detail: GroupDetail = res.data.terminalGroup;
      setEditingGroup(detail);
      setName(detail.name);
      setDescription(detail.description || '');
      setMemberIds(detail.members.map(m => m.id));
      setMemberDetails(Object.fromEntries(detail.members.map(m => [m.id, m])));
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to load group');
      setShowModal(false);
    } finally {
      setModalLoading(false);
    }
  };

  const toggleMember = (t: TerminalMaster) => {
    setMemberDetails(prev => ({ ...prev, [t.id]: t }));
    setMemberIds(list => list.includes(t.id) ? list.filter(x => x !== t.id) : [...list, t.id]);
  };

  const submit = async () => {
    if (!name.trim()) { alert('Group name is required'); return; }
    setSubmitting(true);
    try {
      if (editingGroup) {
        await terminalGroupsApi.update(editingGroup.id, { name: name.trim(), description });
        const current = new Set(editingGroup.members.map(m => m.id));
        const toAdd = memberIds.filter(id => !current.has(id));
        const toRemove = [...current].filter(id => !memberIds.includes(id));
        if (toAdd.length) await terminalGroupsApi.addMembers(editingGroup.id, toAdd);
        for (const id of toRemove) await terminalGroupsApi.removeMember(editingGroup.id, id);
      } else {
        await terminalGroupsApi.create({ name: name.trim(), description, memberIds });
      }
      setShowModal(false);
      load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to save group');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteGroup = async (g: Group) => {
    if (!confirm(`Delete group "${g.name}"? Any advertisements assigned to it will stop targeting these devices.`)) return;
    await terminalGroupsApi.delete(g.id);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Device Groups</h2>
          <p className="page-subtitle">Create named groups of Serial No / TID devices (e.g. "Mumbai Flagship Stores") to target advertisements at just those devices</p>
        </div>
        <button className="btn btn-primary" onClick={openCreateModal}>
          <Plus size={16} /> New Group
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
                <th>Group</th>
                <th>Members</th>
                <th>Ad Assignments</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <tr key={g.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    {g.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{g.description}</div>}
                  </td>
                  <td>
                    <span className="badge badge-info"><HardDrive size={11} /> {g._count.members} device{g._count.members === 1 ? '' : 's'}</span>
                  </td>
                  <td>{g._count.assignments}</td>
                  <td style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEditModal(g)}>Manage</button>
                    <button className="btn btn-danger btn-sm btn-icon" onClick={() => deleteGroup(g)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <Boxes size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <div>No device groups yet. Click "New Group" to create one.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ width: '620px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{editingGroup ? `Manage "${editingGroup.name}"` : 'New Device Group'}</h3>
              <button className="btn btn-secondary btn-sm btn-icon" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {modalLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                <Loader2 size={24} className="spinner" color="var(--text-muted)" />
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontWeight: 700, fontSize: '13px' }}>Group Name</label>
                  <input type="text" className="form-input" placeholder="e.g. Mumbai Flagship Stores" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <label style={{ fontWeight: 700, fontSize: '13px' }}>Description (optional)</label>
                  <input type="text" className="form-input" value={description} onChange={e => setDescription(e.target.value)} />
                </div>

                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>Member Devices</div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                    <select className="form-input" value={terminalCustomerFilter} onChange={e => setTerminalCustomerFilter(e.target.value)} style={{ flex: 1 }}>
                      <option value="">All customers</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code})</option>)}
                    </select>
                    <input
                      type="text" className="form-input" placeholder="Type Serial No or TID to search..."
                      value={terminalSearch} onChange={e => setTerminalSearch(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>

                  {memberIds.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                      {memberIds.map(id => {
                        const t = memberDetails[id];
                        return (
                          <span key={id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px',
                            borderRadius: 'var(--radius-sm)', background: 'rgba(1,135,95,0.12)',
                            border: '1px solid var(--brand-primary)', fontSize: '12px', fontFamily: 'var(--font-mono)',
                          }}>
                            {t?.serialNo || id}
                            <button
                              onClick={() => setMemberIds(list => list.filter(x => x !== id))}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontWeight: 700, lineHeight: 1 }}
                              title="Remove"
                            ><X size={11} /></button>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {!terminalCustomerFilter && terminalSearch.trim().length < 2 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                      Select a customer or type at least 2 characters of a Serial No / TID to search.
                    </div>
                  ) : mastersLoading ? (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                      <Loader2 size={18} className="spinner" color="var(--text-muted)" />
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                      {filteredMasters.map(t => {
                        const checked = memberIds.includes(t.id);
                        return (
                          <label key={t.id} style={{
                            display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                            borderRadius: 'var(--radius-sm)', background: checked ? 'rgba(1,135,95,0.1)' : 'var(--bg-surface-2)',
                            border: `1px solid ${checked ? 'var(--brand-primary)' : 'var(--border-subtle)'}`, cursor: 'pointer',
                          }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleMember(t)}
                              style={{ accentColor: 'var(--brand-primary)', width: '16px', height: '16px' }} />
                            <span style={{ fontFamily: 'var(--font-mono)' }}>{t.serialNo} <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-sans)', fontSize: '12px' }}>— TID: {t.tid || 'not mapped'} — {t.customer.name}</span></span>
                          </label>
                        );
                      })}
                      {filteredMasters.length === 0 && (
                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>No matching terminals.</div>
                      )}
                      {mastersTotal > filteredMasters.length && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          Showing first {filteredMasters.length} of {mastersTotal} matches — refine your search for more.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                  <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={submit} disabled={submitting}>
                    {submitting ? <Loader2 size={14} className="spinner" /> : <CheckCircle size={14} />}
                    {editingGroup ? 'Save Changes' : 'Create Group'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
