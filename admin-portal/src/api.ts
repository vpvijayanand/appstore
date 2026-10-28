import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wl_admin_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token expiry
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('wl_refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post(`${BASE_URL}/auth/admin/refresh`, { refreshToken });
          localStorage.setItem('wl_admin_token', data.token);
          error.config.headers.Authorization = `Bearer ${data.token}`;
          return api.request(error.config);
        } catch {
          localStorage.clear();
          window.location.href = '/login';
        }
      } else {
        localStorage.clear();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/admin/login', { email, password }),
};

// ── Analytics ─────────────────────────────────────────────────────────────────
export const analyticsApi = {
  getStats: () => api.get('/analytics/stats'),
  getEvents: (params?: Record<string, string | number>) =>
    api.get('/analytics/events', { params }),
  getMapData: (days = 30) => api.get('/analytics/map', { params: { days } }),
  getTopApps: () => api.get('/analytics/top-apps'),
  getTrend: (days = 30) => api.get('/analytics/trend', { params: { days } }),
  getTerminals: () => api.get('/analytics/terminals'),
};

// ── Apps ──────────────────────────────────────────────────────────────────────
export const appsApi = {
  list: (params?: Record<string, string | number>) =>
    api.get('/apps', { params }),
  get: (id: string) => api.get(`/apps/${id}`),
  upload: (formData: FormData) =>
    api.post('/apps/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/apps/${id}`, data),
  delete: (id: string) => api.delete(`/apps/${id}`),
  getDownloads: (id: string) => api.get(`/apps/${id}/downloads`),
};

// ── Categories ────────────────────────────────────────────────────────────────
export const categoriesApi = {
  list: () => api.get('/categories'),
  create: (data: { name: string; iconName?: string }) =>
    api.post('/categories', data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

// ── Customers ─────────────────────────────────────────────────────────────────
export const customersApi = {
  list: () => api.get('/customers'),
  get: (id: string) => api.get(`/customers/${id}`),
  create: (data: Record<string, string>) => api.post('/customers', data),
  updateEntitlements: (id: string, appIds: string[]) =>
    api.put(`/customers/${id}/entitlements`, { appIds }),
  getDownloads: (id: string) => api.get(`/customers/${id}/downloads`),
};

// ── Terminals ─────────────────────────────────────────────────────────────────
export const terminalsApi = {
  list: (params?: Record<string, string>) =>
    api.get('/terminals', { params }),
  get: (id: string) => api.get(`/terminals/${id}`),
  rotateKey: (id: string) => api.post(`/terminals/${id}/rotate-key`),
  updateStatus: (id: string, status: string) =>
    api.patch(`/terminals/${id}/status`, { status }),
};

// ── Terminal Masters (Serial No / TID device provisioning) ────────────────────
export const terminalMastersApi = {
  list: (params?: Record<string, string>) =>
    api.get('/terminal-masters', { params }),
  get: (id: string) => api.get(`/terminal-masters/${id}`),
  create: (data: Record<string, string>) => api.post('/terminal-masters', data),
  bulkImport: (rows: Record<string, string>[]) =>
    api.post('/terminal-masters/bulk-import', { rows }),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/terminal-masters/${id}`, data),
  delete: (id: string) => api.delete(`/terminal-masters/${id}`),
};

// ── App Assignments (App <-> Customer/Terminal mapping) ───────────────────────
export const assignmentsApi = {
  list: (params?: Record<string, string>) => api.get('/assignments', { params }),
  bulk: (payload: {
    appIds: string[];
    targets: { scope: 'CUSTOMER'; customerIds: string[] } | { scope: 'TERMINAL'; terminalMasterIds: string[] };
    mode: 'DEFAULT' | 'ON_REQUEST';
    replaceExisting?: boolean;
  }) => api.post('/assignments/bulk', payload),
  delete: (id: string) => api.delete(`/assignments/${id}`),
};

export default api;
