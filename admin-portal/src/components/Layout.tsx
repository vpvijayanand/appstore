import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import logoMark from '../assets/logo-mark.png';
import {
  LayoutDashboard, Package, Tag, Users, Monitor,
  Map, Download, LogOut, Search, Bell, HardDrive, Share2
} from 'lucide-react';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/apps', icon: Package, label: 'Apps' },
  { path: '/categories', icon: Tag, label: 'Categories' },
  { path: '/customers', icon: Users, label: 'Customers' },
  { path: '/terminals', icon: Monitor, label: 'Terminals' },
  { path: '/device-master', icon: HardDrive, label: 'Device Master' },
  { path: '/assignments', icon: Share2, label: 'App Assignments' },
  { path: '/map', icon: Map, label: 'Location Map' },
  { path: '/downloads', icon: Download, label: 'Downloads' },
];

export default function Layout() {
  const { admin, logout } = useAuth();
  const location = useLocation();

  const pageTitle = navItems.find(n =>
    n.path === '/' ? location.pathname === '/' : location.pathname.startsWith(n.path)
  )?.label || 'WL BizStore';

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <img src={logoMark} alt="WL BizStore" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div className="sidebar-logo-text">WL BizStore</div>
            <div className="sidebar-logo-sub">Empowering Your Point of Sale</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(({ path, icon: Icon, label }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Icon className="nav-icon" size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">
              {admin?.name?.charAt(0) || 'A'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {admin?.name}
              </div>
              <div className="user-role">{admin?.role?.replace('_', ' ')}</div>
            </div>
            <button
              onClick={logout}
              className="btn btn-icon btn-secondary"
              title="Sign out"
              style={{ padding: '6px', flexShrink: 0 }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* Top Bar */}
      <header className="topbar">
        <h1 className="topbar-title">{pageTitle}</h1>
        <div className="topbar-search">
          <Search size={14} color="var(--text-muted)" />
          <input placeholder="Search apps, terminals..." />
        </div>
        <button className="btn btn-icon btn-secondary" title="Notifications">
          <Bell size={16} />
        </button>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
