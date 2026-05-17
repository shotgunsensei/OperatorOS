'use client';

/**
 * /login — dedicated public sign-in surface.
 *
 * Phase 1 contract:
 *   - `/app/*` is authenticated console territory. Anonymous traffic
 *     gets 307-redirected to `/login` (see apps/web/src/middleware.ts).
 *   - `/login` renders the LoginPage component inside AuthProvider so
 *     it can call /v1/auth/login and observe `user` updating in place.
 *   - Once `user` is populated, we navigate the visitor to the URL
 *     they originally tried to reach (`?next=…`) or fall back to /app.
 *
 * Keeping login on its own route (instead of overloading `/app`) is
 * what lets `/app` itself enforce the 307-redirect contract without
 * creating a redirect loop with the "Launch console" / "Sign in" CTAs.
 */

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import LoginPage from '@/components/pages/LoginPage';
import RegisterPage from '@/components/pages/RegisterPage';
import OperatorLoader from '@/components/brand/OperatorLoader';
import { brand } from '@/lib/brand';

function safeNext(raw: string | null): string {
  // Only honor in-app destinations — never let `?next=` bounce us to
  // an external origin (open-redirect guard).
  if (!raw) return '/app';
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/app';
  return raw;
}

function LoginGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [mode, setMode] = React.useState<'login' | 'register'>('login');

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  if (loading || user) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: brand.bgPrimary,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <OperatorLoader />
      </div>
    );
  }

  return mode === 'login' ? (
    <LoginPage onSwitch={() => setMode('register')} />
  ) : (
    <RegisterPage onSwitch={() => setMode('login')} />
  );
}

export default function LoginRoute() {
  return (
    <AuthProvider>
      <ToastProvider>
        <LoginGate />
      </ToastProvider>
    </AuthProvider>
  );
}
