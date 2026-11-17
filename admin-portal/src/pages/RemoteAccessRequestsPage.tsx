import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, Monitor, RefreshCw, XCircle } from 'lucide-react';
import { remoteAccessRequestsApi } from '../api';
import { formatDistanceToNow } from 'date-fns';

interface RemoteAccessRequestItem {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  requestedAt: string;
  message: string | null;
  rejectionReason: string | null;
  terminal: {
    id: string;
    terminalId: string;
    serialNo: string | null;
    model: string | null;
    site: string | null;
    lastSeenAt: string | null;
    customer: { name: string; code: string };
    terminalMaster: { tid: string | null } | null;
  };
}

export default function RemoteAccessRequestsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requests, setRequests] = useState<RemoteAccessRequestItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');

  const load = async () => {
    setLoading(true);
    try {
      const res = await remoteAccessRequestsApi.list(statusFilter, 100);
      setRequests(res.data.requests || []);
    } catch {
      alert('Failed to load remote access requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [statusFilter]);

  const handleApproveAndConnect = async (request: RemoteAccessRequestItem) => {
    setBusyId(request.id);
    try {
      if (request.status === 'PENDING') {
        await remoteAccessRequestsApi.approve(request.id);
      }
      navigate(`/terminals/${request.terminal.id}/screen`);
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to approve request');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (request: RemoteAccessRequestItem) => {
    const reason = prompt('Optional rejection reason:') || undefined;
    setBusyId(request.id);
    try {
      await remoteAccessRequestsApi.reject(request.id, reason);
      await load();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Failed to reject request');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Remote Access Requests</h2>
          <p className="page-subtitle">Device-initiated support queue (Serial No / TID)</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            className="form-select"
            style={{ width: '160px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'PENDING' | 'APPROVED' | 'REJECTED')}
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>
            {loading ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <Loader2 size={28} className="spinner" color="var(--text-muted)" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Requested</th>
                <th>Terminal</th>
                <th>Serial No / TID</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Message</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const isBusy = busyId === r.id;
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        {formatDistanceToNow(new Date(r.requestedAt), { addSuffix: true })}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                        {r.terminal.terminalId}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {r.terminal.model || 'Unknown model'}
                        {r.terminal.site ? ` • ${r.terminal.site}` : ''}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>SN: {r.terminal.serialNo || '—'}</div>
                      <div style={{ fontSize: '12px' }}>TID: {r.terminal.terminalMaster?.tid || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.terminal.customer.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {r.terminal.customer.code}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${
                        r.status === 'PENDING'
                          ? 'badge-warning'
                          : r.status === 'APPROVED'
                          ? 'badge-success'
                          : 'badge-error'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ maxWidth: '280px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {r.message || r.rejectionReason || '—'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleApproveAndConnect(r)}
                          disabled={isBusy || r.status === 'REJECTED'}
                          style={{ fontSize: '11px' }}
                        >
                          {isBusy ? <Loader2 size={12} className="spinner" /> : <Monitor size={12} />}
                          Connect
                        </button>
                        {r.status === 'PENDING' && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleReject(r)}
                            disabled={isBusy}
                            style={{ fontSize: '11px' }}
                          >
                            <XCircle size={12} />
                            Reject
                          </button>
                        )}
                        {r.status === 'APPROVED' && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#10b981' }}>
                            <CheckCircle2 size={12} />
                            Approved
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {requests.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '22px' }}>
                    No remote access requests in this view.
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
