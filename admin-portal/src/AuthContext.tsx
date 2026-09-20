import React, { createContext, useContext, useState, useCallback } from 'react';
import { authApi } from './api';

interface Admin {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextValue {
  admin: Admin | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(() => {
    const stored = localStorage.getItem('wl_admin');
    return stored ? JSON.parse(stored) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem('wl_admin_token', data.token);
    localStorage.setItem('wl_refresh_token', data.refreshToken);
    localStorage.setItem('wl_admin', JSON.stringify(data.admin));
    setAdmin(data.admin);
  }, []);

  const logout = useCallback(() => {
    localStorage.clear();
    setAdmin(null);
  }, []);

  return (
    <AuthContext.Provider value={{ admin, login, logout, isAuthenticated: !!admin }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
