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
 * creating a redirect loop with the "Launch OperatorOS" / "Sign in" CTAs.
 */

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import { ToastProvider } from '@/components/Toast';
import LoginPage from '@/components/pages/LoginPage';
import RegisterPage from '@/components/pages/RegisterPage';
import ForgotPasswordPage from '@/components/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/components/pages/ResetPasswordPage';
import OperatorLoader from '@/components/brand/OperatorLoader';
import { brand } from '@/lib/brand';
import { sanitizeReturnTo } from '../../../../../packages/modules/public-url.js';

// Open-redirect guard. Delegates to the shared `sanitizeReturnTo` (the single
// source of truth used by the API and edge middleware) so the accept policy
// can't drift: relative in-app paths (rejecting protocol-relative `//evil.com`)
// or absolute URLs whose host is same-site (`*.operatoros.net`, or local in
// dev), so after signing in on auth.operatoros.net we can hand the user back to
// the ORIGINAL subdomain (e.g. techdeck.operatoros.net) instead of stranding
// them on the auth host.
function safeNext(raw: string | null): string {
  return sanitizeReturnTo(raw, '/app');
}

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

function LoginGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  // Deep-link support: /login?mode=reset-password&token=… (used by the
  // password-reset email) lands the user directly on ResetPasswordPage.
  const initialMode: AuthMode = ((): AuthMode => {
    const m = params.get('mode');
    if (m === 'register' || m === 'forgot-password' || m === 'reset-password') return m;
    return 'login';
  })();
  const [mode, setMode] = React.useState<AuthMode>(initialMode);

  useEffect(() => {
    if (!loading && user) {
      // An absolute same-site `next` means the user came from another subdomain
      // (module/app host). Use a full navigation so we cross hosts cleanly; the
      // shared `.operatoros.net` session cookie carries the login across.
      if (/^https?:\/\//i.test(next)) {
        window.location.assign(next);
      } else {
        router.replace(next);
      }
    }
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

  // LoginPage emits 'register' or 'forgot-password' through `onSwitch`;
  // honoring the argument verbatim keeps parity with the legacy
  // /app-hosted auth flow that this route replaces.
  switch (mode) {
    case 'register':
      return <RegisterPage onSwitch={() => setMode('login')} />;
    case 'forgot-password':
      return <ForgotPasswordPage onSwitch={(target) => setMode(target)} />;
    case 'reset-password':
      return <ResetPasswordPage onSwitch={() => setMode('login')} />;
    case 'login':
    default:
      return <LoginPage onSwitch={(target) => setMode(target)} />;
  }
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
