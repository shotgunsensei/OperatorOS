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
import ContactLink from '@/components/ContactLink';
import { brand } from '@/lib/brand';
import { issueModuleLaunch } from '@/lib/module-launch';
import { sanitizeReturnTo } from '../../../../../packages/modules/public-url.js';
import { OPERATOROS_MODULE_REGISTRY } from '../../../../../packages/modules/registry.js';

// Open-redirect guard. Delegates to the shared `sanitizeReturnTo` (the single
// source of truth used by the API and edge middleware) so the accept policy
// can't drift: relative in-app paths (rejecting protocol-relative `//evil.com`)
// or HTTPS URLs whose host is exactly registered (plus HTTP(S) loopback URLs
// for local development), so after signing in on auth.operatoros.net we can
// hand the user back to the ORIGINAL subdomain (e.g.
// techdeck.operatoros.net) without permitting an HTTP downgrade.
function safeNext(raw: string | null): string {
  return sanitizeReturnTo(raw, '/app');
}

type AuthMode = 'login' | 'register' | 'forgot-password' | 'reset-password';

function LoginGate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  // Deep-link support: /login?mode=reset-password lands the user directly on
  // ResetPasswordPage, where the reset capability is entered and submitted in
  // the request body rather than read from the URL.
  const initialMode: AuthMode = ((): AuthMode => {
    const m = params.get('mode');
    if (m === 'register' || m === 'forgot-password' || m === 'reset-password') return m;
    return 'login';
  })();
  const [mode, setMode] = React.useState<AuthMode>(initialMode);
  const [launchError, setLaunchError] = React.useState<string | null>(null);
  const transactionStarted = React.useRef(false);

  useEffect(() => {
    if (loading || !user || transactionStarted.current) return;
    transactionStarted.current = true;

    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    const state = params.get('state');
    const nonce = params.get('nonce');
    const codeChallenge = params.get('code_challenge');
    const codeChallengeMethod = params.get('code_challenge_method');
    const hasTransaction = [clientId, redirectUri, state, nonce, codeChallenge, codeChallengeMethod]
      .every(value => typeof value === 'string' && value.length > 0);

    if (hasTransaction) {
      const module = OPERATOROS_MODULE_REGISTRY.find(entry => entry.clientId === clientId);
      if (!module || codeChallengeMethod !== 'S256') {
        setLaunchError('The authorization request is invalid or targets an unknown OperatorOS client.');
        return;
      }

      void issueModuleLaunch(module.id, user.currentTenantId, {
        clientId: clientId!,
        redirectUri: redirectUri!,
        returnTo: next,
        state: state!,
        nonce: nonce!,
        codeChallenge: codeChallenge!,
        codeChallengeMethod: 'S256',
      }).then((handoff) => {
        const destination = handoff.launchUrl || handoff.redirectUrl || handoff.redirect_url;
        if (!destination) throw new Error('Authorization succeeded without a callback URL.');
        // Treat the API response as untrusted browser input too. The API owns
        // exact redirect-URI validation, while the shared sanitizer provides
        // defense in depth against a compromised/stale response downgrading a
        // canonical OperatorOS host to HTTP or leaving the registered hosts.
        const safeDestination = sanitizeReturnTo(destination, '');
        if (!safeDestination || safeDestination.startsWith('/')) {
          throw new Error('Authorization returned an unsafe callback URL.');
        }
        window.location.replace(safeDestination);
      }).catch((err: any) => {
        setLaunchError(err?.message || 'OperatorOS could not complete the module authorization.');
      });
      return;
    }

    // Compatibility for old bookmarks: return to the requested host once.
    // Its middleware will create a complete PKCE transaction and the existing
    // auth-host session makes the second hop silent.
    if (next.startsWith('/')) router.replace(next);
    else window.location.assign(next);
  }, [loading, user, next, router]);

  if (loading || (user && !launchError)) {
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

  if (launchError) {
    return (
      <div style={{ minHeight: '100vh', background: brand.bgPrimary, display: 'grid', placeItems: 'center', padding: 24 }}>
        <section style={{ width: 'min(520px, 100%)', padding: 24, borderRadius: 16, background: brand.bgSecondary, border: `1px solid ${brand.borderSoft}` }}>
          <h1 style={{ color: brand.textPrimary, marginTop: 0 }}>Authorization could not be completed</h1>
          <p style={{ color: brand.textSecondary }}>{launchError}</p>
          <button
            type="button"
            onClick={() => window.location.assign(
              window.location.hostname === 'operatoros.net' || window.location.hostname.endsWith('.operatoros.net')
                ? 'https://operatoros.net/app'
                : '/',
            )}
            style={{ border: 0, borderRadius: 10, padding: '10px 16px', background: brand.accentCyan, color: brand.accentInk, cursor: 'pointer', fontWeight: 700 }}
          >
            Return to OperatorOS
          </button>
        </section>
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
        <ContactLink />
      </ToastProvider>
    </AuthProvider>
  );
}
