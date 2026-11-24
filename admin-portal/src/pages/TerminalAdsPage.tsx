import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Megaphone, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { advertisementAssignmentsApi, terminalsApi } from '../api';

interface AdAssignment {
  id: string;
  scope: 'CUSTOMER' | 'TERMINAL' | 'GROUP';
  sourceName: string | null;
  advertisement: {
    id: string; title: string; type: string; displayMode: 'POPUP' | 'SCREENSAVER';
    startAt: string; endAt: string; isActive: boolean;
  };
}

interface TerminalInfo { id: string; terminalId: string; serialNo: string | null; customer: string }

const fmt = (s: string) => format(new Date(s), 'dd MMM yyyy, HH:mm');

function adStatus(a: AdAssignment['advertisement']) {
  const now = Date.now();
  if (!a.isActive) return { label: 'Paused', cls: 'badge-default' };
  if (now < new Date(a.startAt).getTime()) return { label: 'Scheduled', cls: 'badge-info' };
  if (now > new Date(a.endAt).getTime()) return { label: 'Ended', cls: 'badge-default' };
  return { label: 'Live', cls: 'badge-success' };
}

export default function TerminalAdsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [terminal, setTerminal] = useState<TerminalInfo | null>(null);
  const [items, setItems] = useState<AdAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    terminalsApi.getAdvertisementAssignments(id!)
      .then((res) => { setTerminal(res.data.terminal); setItems(res.data.assignments); setError(''); })
      .catch((e) => setError(e.response?.data?.error || 'Failed to load advertisements'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const remove = async (a: AdAssignment) => {
    const via = a.scope === 'TERMINAL'
      ? 'This removes the advertisement from this terminal only.'
      : a.scope === 'CUSTOMER'
        ? `This assignment is for the whole customer "${a.sourceName}". Removing it removes the advertisement from ALL terminals of that customer.`
        : `This assignment is for the group "${a.sourceName}". Removing it removes the advertisement from ALL terminals in that group.`;
    if (!window.confirm(`Remove "${a.advertisement.title}"?\n\n${via}`)) return;
    setBusyId(a.id);
    try {
      await advertisementAssignmentsApi.delete(a.id);
      setItems((prev) => prev.filter((x) => x.id !== a.id));
    } catch (e: any) {
      alert(e.response?.data?.error || 'Delete failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Terminal Advertisements</h2>
          <p className="page-subtitle">
            {terminal
              ? <>TID <b>{terminal.terminalId}</b> · S.No <b>{terminal.serialNo || '—'}</b> · {terminal.customer} · {items.length} assigned</>
              : 'Advertisements assigned to this terminal'}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/terminals')}>
          <ArrowLeft size={14} /> Terminals
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={32} className="spinner" color="var(--text-muted)" />
        </div>
      ) : error ? (
        <div style={{ color: 'var(--danger, #dc2626)', padding: '24px' }}>{error}</div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Advertisement</th>
                <th>Display</th>
                <th>Assigned Via</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const st = adStatus(a.advertisement);
                return (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>{a.advertisement.title}</td>
                    <td>{a.advertisement.displayMode === 'POPUP' ? 'Popup' : 'Screensaver'}</td>
                    <td>
                      {a.scope === 'TERMINAL' ? 'This terminal' : a.scope === 'CUSTOMER' ? `Customer: ${a.sourceName}` : `Group: ${a.sourceName}`}
                    </td>
                    <td style={{ fontSize: '12px' }}>{fmt(a.advertisement.startAt)}</td>
                    <td style={{ fontSize: '12px' }}>{fmt(a.advertisement.endAt)}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busyId === a.id}
                        onClick={() => remove(a)}
                        title="Delete this assignment"
                        style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Trash2 size={12} /> Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>
                    <Megaphone size={40} style={{ marginBottom: '12px', opacity: 0.3 }} />
                    <div>No advertisements are assigned to this terminal.</div>
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
