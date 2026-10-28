import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AppsPage from './pages/AppsPage';
import CustomersPage from './pages/CustomersPage';
import TerminalsPage from './pages/TerminalsPage';
import AnalyticsMapPage from './pages/AnalyticsMapPage';
import DownloadsPage from './pages/DownloadsPage';
import CategoriesPage from './pages/CategoriesPage';
import DeviceMasterPage from './pages/DeviceMasterPage';
import AssignmentsPage from './pages/AssignmentsPage';
import 'leaflet/dist/leaflet.css';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="apps" element={<AppsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="terminals" element={<TerminalsPage />} />
        <Route path="device-master" element={<DeviceMasterPage />} />
        <Route path="assignments" element={<AssignmentsPage />} />
        <Route path="map" element={<AnalyticsMapPage />} />
        <Route path="downloads" element={<DownloadsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
