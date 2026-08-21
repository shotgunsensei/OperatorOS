'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, setActiveTenantId } from '@/lib/auth';
import { shouldRestartCentralAuth } from '@/lib/auth-navigation';

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
  registerWithInvite: (token: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authError: null,
  login: async () => {},
  register: async () => {},
  registerWithInvite: async () => {},
  logout: async () => {},
  logoutEverywhere: async () => {},
  refresh: async () => {},
  clearAuthError: () => {},
});

function restartCentralAuthAfterInvalidSession(): boolean {
  if (
    typeof window === 'undefined' ||
    !shouldRestartCentralAuth(window.location.hostname, window.location.pathname)
  ) return false;
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(`/logout?reauth=1&return_to=${encodeURIComponent(returnTo)}`);
  return true;
}

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
      // Seed the active tenant from the server-side current_tenant_id on
      // cold reloads so the very first downstream request already carries
      // X-Tenant-Id, even before TenantProvider.refresh() completes.
      setActiveTenantId(user?.currentTenantId ?? null);
      setUser(user);
      setAuthError(null);
    } catch (err: any) {
      setUser(null);
      setActiveTenantId(null);
      if (err?.status === 401 && restartCentralAuthAfterInvalidSession()) return;
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
    // One-time migration cleanup: v1 never reads or writes a browser bearer,
    // but remove any token left by a pre-v1 release.
    try { localStorage.removeItem('token'); } catch {}
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const renew = () => {
      if (document.visibilityState !== 'visible') return;
      void authApi.refresh().catch((err: any) => {
        if (err?.status === 401) void refresh();
      });
    };
    const interval = window.setInterval(renew, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', renew);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', renew);
    };
  }, [refresh, user]);

  const login = async (email: string, password: string) => {
    setAuthError(null);
    const data = await authApi.login(email, password);
    // Seed active tenant immediately so the very first post-login request
    // already carries X-Tenant-Id, instead of racing TenantProvider.refresh().
    setActiveTenantId(data.user?.currentTenantId ?? null);
    setUser(data.user);
  };

  const register = async (email: string, password: string, name: string) => {
    setAuthError(null);
    await authApi.register(email, password, name);
    throw { code: 'REGISTRATION_SUBMITTED', error: 'If this email is new, your account has been created. Please sign in to continue.' };
  };

  const registerWithInvite = async (token: string, password: string, name: string) => {
    setAuthError(null);
    const data = await authApi.registerWithInvite(token, password, name);
    setActiveTenantId(data.user?.currentTenantId ?? data.personalTenantId ?? null);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {}
    setActiveTenantId(null);
    setUser(null);
    setAuthError(null);
  };

  const logoutEverywhere = async () => {
    // Unlike local logout, do not swallow an API failure: the UI must not
    // claim every host was revoked unless token_version was incremented by
    // the authoritative server.
    await authApi.logoutAll();
    setActiveTenantId(null);
    setUser(null);
    setAuthError(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, register, registerWithInvite, logout, logoutEverywhere, refresh, clearAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}
