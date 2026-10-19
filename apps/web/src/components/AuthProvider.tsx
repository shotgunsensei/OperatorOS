'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  completeMfaLogin: (input: { code?: string; recoveryCode?: string }) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  registerWithInvite: (token: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutEverywhere: () => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthError: () => void;
  // Internal async ownership check; never a server authorization decision.
  captureIdentity: (candidate: User | null) => () => boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  authError: null,
  login: async () => ({ mfaRequired: false }),
  completeMfaLogin: async () => {},
  register: async () => {},
  registerWithInvite: async () => {},
  logout: async () => {},
  logoutEverywhere: async () => {},
  refresh: async () => {},
  clearAuthError: () => {},
  captureIdentity: () => () => true,
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
  const mounted = useRef(true);
  const readVersion = useRef(0);
  const transitionVersion = useRef(0);
  const pendingTransition = useRef<number | null>(null);
  const identity = useRef<{ user: User | null; version: number }>({ user: null, version: 0 });

  const commitUser = useCallback((next: User | null) => {
    identity.current = { user: next, version: identity.current.version + 1 };
    setUser(next);
  }, []);
  const captureIdentity = useCallback((candidate: User | null) => {
    const version = identity.current.version;
    return () => mounted.current && identity.current.user === candidate && identity.current.version === version;
  }, []);
  const beginTransition = () => {
    const version = ++transitionVersion.current;
    pendingTransition.current = version;
    readVersion.current++;
    return version;
  };
  const currentTransition = (version: number) => mounted.current && transitionVersion.current === version;
  const finishTransition = (version: number) => {
    if (!currentTransition(version)) return;
    pendingTransition.current = null;
    setLoading(false);
  };

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const refresh = useCallback(async () => {
    // Incidental reads must not supersede an explicit sign-in/sign-out.
    if (!mounted.current || pendingTransition.current !== null) return;
    const read = ++readVersion.current;
    const transition = transitionVersion.current;
    const current = () => mounted.current && readVersion.current === read
      && transitionVersion.current === transition && pendingTransition.current === null;
    try {
      const { user } = await authApi.me();
      if (!current()) return;
      // Seed the active tenant from the server-side current_tenant_id on
      // cold reloads so the very first downstream request already carries
      // X-Tenant-Id, even before TenantProvider.refresh() completes.
      setActiveTenantId(user?.currentTenantId ?? null);
      commitUser(user);
      setAuthError(null);
    } catch (err: any) {
      if (!current()) return;
      commitUser(null);
      setActiveTenantId(null);
      if (err?.status === 401 && restartCentralAuthAfterInvalidSession()) return;
      if (err?.code === 'ACCOUNT_SUSPENDED') {
        setAuthError({ code: 'ACCOUNT_SUSPENDED', message: err.error || 'Account suspended' });
      } else if (err?.code === 'ACCOUNT_DELETED') {
        setAuthError({ code: 'ACCOUNT_DELETED', message: err.error || 'Account deleted' });
      }
    } finally {
      if (current()) setLoading(false);
    }
  }, [commitUser]);

  useEffect(() => {
    mounted.current = true;
    // One-time migration cleanup: v1 never reads or writes a browser bearer,
    // but remove any token left by a pre-v1 release.
    try { localStorage.removeItem('token'); } catch {}
    refresh();
    return () => {
      mounted.current = false;
      readVersion.current++;
      transitionVersion.current++;
      pendingTransition.current = null;
      identity.current.version++;
    };
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const renew = () => {
      if (document.visibilityState !== 'visible' || pendingTransition.current !== null) return;
      const transition = transitionVersion.current;
      const read = readVersion.current;
      void authApi.refresh().catch((err: any) => {
        if (!mounted.current || transitionVersion.current !== transition
          || readVersion.current !== read || pendingTransition.current !== null) return;
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
    const transition = beginTransition();
    setAuthError(null);
    try {
      const data = await authApi.login(email, password);
      if (data.mfaRequired) return { mfaRequired: true };
      if (!currentTransition(transition)) return { mfaRequired: false };
      // Seed active tenant immediately so the very first post-login request
      // already carries X-Tenant-Id, instead of racing TenantProvider.refresh().
      setActiveTenantId(data.user?.currentTenantId ?? null);
      commitUser(data.user);
      return { mfaRequired: false };
    } finally { finishTransition(transition); }
  };

  const completeMfaLogin = async (input: { code?: string; recoveryCode?: string }) => {
    const transition = beginTransition();
    setAuthError(null);
    try {
      const data = await authApi.completeMfaLogin(input);
      if (!currentTransition(transition)) return;
      setActiveTenantId(data.user?.currentTenantId ?? null);
      commitUser(data.user);
    } finally { finishTransition(transition); }
  };

  const register = async (email: string, password: string, name: string) => {
    setAuthError(null);
    await authApi.register(email, password, name);
    throw { code: 'REGISTRATION_SUBMITTED', error: 'If this email is new, your account has been created. Please sign in to continue.' };
  };

  const registerWithInvite = async (token: string, password: string, name: string) => {
    const transition = beginTransition();
    setAuthError(null);
    try {
      const data = await authApi.registerWithInvite(token, password, name);
      if (!currentTransition(transition)) return;
      setActiveTenantId(data.user?.currentTenantId ?? data.personalTenantId ?? null);
      commitUser(data.user);
    } finally { finishTransition(transition); }
  };

  const logout = async () => {
    const transition = beginTransition();
    try {
      try { await authApi.logout(); } catch {}
      if (!currentTransition(transition)) return;
      setActiveTenantId(null);
      commitUser(null);
      setAuthError(null);
    } finally { finishTransition(transition); }
  };

  const logoutEverywhere = async () => {
    const transition = beginTransition();
    // Unlike local logout, do not swallow an API failure: the UI must not
    // claim every host was revoked unless token_version was incremented by
    // the authoritative server.
    try {
      await authApi.logoutAll();
      if (!currentTransition(transition)) return;
      setActiveTenantId(null);
      commitUser(null);
      setAuthError(null);
    } finally { finishTransition(transition); }
  };

  return (
    <AuthContext.Provider value={{ user, loading, authError, login, completeMfaLogin, register, registerWithInvite, logout, logoutEverywhere, refresh, clearAuthError, captureIdentity }}>
      {children}
    </AuthContext.Provider>
  );
}
