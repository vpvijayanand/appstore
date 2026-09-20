import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { analyticsApi } from '../api';
import { MapPin, RefreshCw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  status: string;
  timestamp: string;
  terminalId: string;
  site: string;
  customerName: string;
  appName: string;
}

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: '#34c785',
  FAILED: '#ea4335',
  PENDING: '#4285f4',
  DOWNLOADING: '#fbbc04',
};

export default function AnalyticsMapPage() {
  const [points, setPoints] = useState<MapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [filter, setFilter] = useState('ALL');

  const load = () => {
    setLoading(true);
    analyticsApi.getMapData(days)
      .then(res => setPoints(res.data.points))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [days]);

  const filtered = filter === 'ALL' ? points : points.filter(p => p.status === filter);

  const counts = {
    SUCCESS: points.filter(p => p.status === 'SUCCESS').length,
    FAILED: points.filter(p => p.status === 'FAILED').length,
    PENDING: points.filter(p => p.status === 'PENDING').length,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">Download Location Map</h2>
          <p className="page-subtitle">GPS location of every app download event</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select className="form-select" style={{ width: '140px' }} value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button className="btn btn-secondary" onClick={load} title="Refresh">
            {loading ? <Loader2 size={15} className="spinner" /> : <RefreshCw size={15} />}
            Refresh
          </button>
        </div>
      </div>

      {/* Status Filter + Legend */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {(['ALL', 'SUCCESS', 'FAILED', 'PENDING'] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              border: `1px solid ${filter === s ? STATUS_COLORS[s] || 'var(--brand-primary)' : 'var(--border-default)'}`,
              background: filter === s ? `${STATUS_COLORS[s] || 'var(--brand-primary)'}22` : 'var(--bg-surface)',
              color: filter === s ? (STATUS_COLORS[s] || 'var(--brand-primary)') : 'var(--text-secondary)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {s !== 'ALL' && (
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLORS[s], display: 'inline-block' }} />
            )}
            {s === 'ALL' ? `All (${points.length})` : `${s} (${counts[s] || 0})`}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', height: '520px' }}>
        <MapContainer
          center={[20.5937, 78.9629]}
          zoom={5}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {filtered.map(point => (
            <CircleMarker
              key={point.id}
              center={[point.lat, point.lng]}
              radius={8}
              pathOptions={{
                color: STATUS_COLORS[point.status] || '#888',
                fillColor: STATUS_COLORS[point.status] || '#888',
                fillOpacity: 0.8,
                weight: 2,
              }}
            >
              <Popup>
                <div style={{ fontSize: '13px', minWidth: '180px' }}>
                  <div style={{ fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} color={STATUS_COLORS[point.status]} />
                    {point.terminalId}
                  </div>
                  <table style={{ fontSize: '12px', width: '100%' }}>
                    <tbody>
                      {[
                        ['App', point.appName],
                        ['Customer', point.customerName],
                        ['Site', point.site || 'N/A'],
                        ['Status', point.status],
                        ['Time', format(new Date(point.timestamp), 'dd MMM HH:mm')],
                        ['GPS', `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`],
                      ].map(([label, value]) => (
                        <tr key={label}>
                          <td style={{ color: '#666', paddingRight: '8px', paddingBottom: '4px' }}>{label}</td>
                          <td style={{ fontWeight: 500 }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
        Showing {filtered.length} of {points.length} events · GPS captured at moment of download
      </div>
    </div>
  );
}
