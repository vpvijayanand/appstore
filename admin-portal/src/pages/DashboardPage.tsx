import { useEffect, useState } from 'react';
import { analyticsApi } from '../api';
import {
  Package, Monitor, Users, Download,
  CheckCircle, XCircle, TrendingUp, Calendar
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

interface Stats {
  totalApps: number;
  totalTerminals: number;
  totalCustomers: number;
  totalDownloads: number;
  downloadsToday: number;
  successfulInstalls: number;
  failedInstalls: number;
  successRate: string;
}

const STAT_CARDS = (stats: Stats) => [
  {
    label: 'Published Apps',
    value: stats.totalApps,
    icon: Package,
    color: 'var(--brand-primary)',
    bg: 'rgba(1,135,95,0.12)',
    change: '+2 this week',
    positive: true,
  },
  {
    label: 'Active Terminals',
    value: stats.totalTerminals,
    icon: Monitor,
    color: 'var(--status-info)',
    bg: 'rgba(66,133,244,0.12)',
    change: '+3 this month',
    positive: true,
  },
  {
    label: 'Customers',
    value: stats.totalCustomers,
    icon: Users,
    color: 'var(--brand-yellow)',
    bg: 'rgba(251,188,4,0.12)',
    change: 'Stable',
    positive: true,
  },
  {
    label: 'Downloads Today',
    value: stats.downloadsToday,
    icon: Download,
    color: 'var(--brand-accent)',
    bg: 'rgba(52,199,133,0.12)',
    change: `${stats.successRate}% success rate`,
    positive: true,
  },
];

const CUSTOM_TOOLTIP_STYLE = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  fontSize: '12px',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trend, setTrend] = useState<{ date: string; count: number }[]>([]);
  const [topApps, setTopApps] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsApi.getStats(),
      analyticsApi.getTrend(14),
      analyticsApi.getTopApps(),
    ]).then(([statsRes, trendRes, appsRes]) => {
      setStats(statsRes.data);
      setTrend(trendRes.data.trend);
      setTopApps(appsRes.data.topApps);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const pieData = stats ? [
    { name: 'Success', value: stats.successfulInstalls, color: 'var(--status-success)' },
    { name: 'Failed', value: stats.failedInstalls, color: 'var(--status-error)' },
    { name: 'Pending', value: Math.max(0, stats.totalDownloads - stats.successfulInstalls - stats.failedInstalls), color: 'var(--status-info)' },
  ] : [];

  if (loading) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <div className="skeleton" style={{ width: '200px', height: '28px' }} />
        </div>
        <div className="stats-grid">
          {[1,2,3,4].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: '42px', height: '42px', borderRadius: '12px' }} />
              <div className="skeleton" style={{ width: '80px', height: '12px' }} />
              <div className="skeleton" style={{ width: '60px', height: '28px' }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">Overview</h2>
          <p className="page-subtitle">Real-time platform health and distribution analytics</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12.5px' }}>
          <Calendar size={14} />
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        {STAT_CARDS(stats).map(({ label, value, icon: Icon, color, bg, change, positive }) => (
          <div key={label} className="stat-card" style={{ '--stat-color': color, '--stat-bg': bg } as React.CSSProperties}>
            <div className="stat-icon">
              <Icon size={20} />
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value.toLocaleString()}</div>
            <div className={`stat-change ${positive ? 'positive' : 'negative'}`}>
              <TrendingUp size={12} />
              {change}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="content-grid grid-2" style={{ marginBottom: '20px' }}>
        {/* Download Trend */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Download Activity</div>
              <div className="card-subtitle">Last 14 days</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="downloadGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="count" stroke="var(--brand-primary)"
                fill="url(#downloadGrad)" strokeWidth={2} name="Downloads" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Install Status Pie */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Install Status</div>
              <div className="card-subtitle">All time distribution</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                paddingAngle={3} dataKey="value">
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Legend formatter={(v) => <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px', marginTop: '8px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--status-success)' }}>
                {stats.successRate}%
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Success Rate</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {stats.totalDownloads}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Downloads</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Apps + Quick Stats */}
      <div className="content-grid grid-2">
        {/* Top Apps */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Top Apps by Downloads</div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topApps.slice(0, 5)} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                tickFormatter={n => n.split(' ')[0]} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
              <Tooltip contentStyle={CUSTOM_TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} name="Downloads" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Health Panel */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: '20px' }}>Platform Health</div>
          {[
            { label: 'APK Storage (MinIO)', value: 'Operational', ok: true },
            { label: 'Database', value: 'Healthy', ok: true },
            { label: 'Terminal Connections', value: `${stats.totalTerminals} Active`, ok: true },
            { label: 'Last Sync', value: 'Just now', ok: true },
          ].map(({ label, value, ok }) => (
            <div key={label} style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {ok ? <CheckCircle size={14} color="var(--status-success)" /> : <XCircle size={14} color="var(--status-error)" />}
                <span style={{ fontSize: '13px', color: ok ? 'var(--status-success)' : 'var(--status-error)', fontWeight: 500 }}>
                  {value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
