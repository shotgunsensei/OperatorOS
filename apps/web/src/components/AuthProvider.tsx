'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi } from '@/lib/auth';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  avatarUrl?: string;
  createdAt: string;
  // Gate 1+: platform-scoped authority (`super_admin` | `user`).
  platformRole?: 'super_admin' | 'user';
  // Active tenant id (resolves the per-request tenant context server-side).
  currentTenantId?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  authError: { code: string; message: string } | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authError: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  refresh: async () => {},
  clearAuthError: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<{ code: string; message: string } | null>(null);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const refresh = useCallback(async () => {
    try {
      const { user } = await authApi.me();
      setUser(user);
      setAuthError(null);
    } catch (err: any) {
      setUser(null);
      localStorage.removeItem('token');
      if (err?.code === 'ACCOUNT_SUSPENDED') {
        setAuthError({ code: 'ACCOUNT_SUSPENDED', message: err.error || 'Account suspended' });
      } else if (err?.code === 'ACCOUNT_DELETED') {
        setAuthError({ code: 'ACCOUNT_DELETED', message: err.error || 'Account deleted' });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    setAuthError(null);
    const data = await authApi.login(email, password);
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    setAuthError(null);
    const data = await authApi.register(email, password, name);
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {}
    localStorage.removeItem('token');
    setUser(null);
    setAuthError(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, register, logout, refresh, clearAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}
