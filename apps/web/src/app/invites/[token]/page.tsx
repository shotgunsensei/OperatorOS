'use client';

/**
 * Invite landing page.
 *
 * Hit by recipients of the email sent from
 * `POST /v1/tenants/:tenantId/invites`. The accept endpoint itself
 * (`POST /v1/invites/:token/accept`) is auth-required, so this page acts as
 * the browser bridge:
 *
 *   1. If the visitor is not signed in, stash the token in localStorage and
 *      send them to the app root, which already renders the login/register
 *      flow. After they sign in we'll come back here automatically.
 *   2. If they are signed in, POST the token to the accept endpoint, then
 *      redirect into the newly-joined tenant.
 *
 * Errors from the API (expired, already accepted, email mismatch) are shown
 * inline so the recipient knows what to do next without a support ticket.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tenantApi } from '@/lib/auth';
import AuthProvider, { useAuth } from '@/components/AuthProvider';

const PENDING_INVITE_KEY = 'operatoros.pendingInviteToken';

type Phase =
  | 'loading'
  | 'redirecting-login'
  | 'accepting'
  | 'accepted'
  | 'error';

function InviteAcceptInner() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const token = decodeURIComponent(String(params?.token ?? ''));
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !token) return;

    if (!user) {
      // Park the token until they finish signing in. The root page will
      // pick this up after auth and route the user back here.
      try { localStorage.setItem(PENDING_INVITE_KEY, token); } catch {}
      setPhase('redirecting-login');
      router.replace('/');
      return;
    }

    let cancelled = false;
    setPhase('accepting');
    (async () => {
      try {
        const result = await tenantApi.acceptInvite(token);
        if (cancelled) return;
        try { localStorage.removeItem(PENDING_INVITE_KEY); } catch {}
        // Persist the new active tenant in the header used by apiFetch so
        // the very next page load lands inside the joined tenant.
        try {
          if (result?.tenantId) {
            localStorage.setItem('activeTenantId', result.tenantId);
          }
        } catch {}
        setPhase('accepted');
        // Small delay so the success state is visible.
        setTimeout(() => router.replace('/'), 600);
      } catch (e: any) {
        if (cancelled) return;
        setErrorCode(e?.code ?? 'UNKNOWN');
        setErrorText(e?.error ?? 'Could not accept this invite.');
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [loading, user, token, router]);

  return (
    <main
      data-testid="page-invite-accept"
      style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#010409', color: '#c9d1d9',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 440, padding: 28, borderRadius: 12,
          background: '#0d1117', border: '1px solid #30363d',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 12px', color: '#fff' }}>
          Tenant invite
        </h1>

        {(phase === 'loading' || phase === 'accepting') && (
          <p data-testid="text-invite-status" style={{ fontSize: 13, color: '#8b949e' }}>
            {phase === 'loading' ? 'Checking your session…' : 'Accepting invite…'}
          </p>
        )}

        {phase === 'redirecting-login' && (
          <p data-testid="text-invite-status" style={{ fontSize: 13, color: '#8b949e' }}>
            Sign in or create an account to accept this invite — we'll bring
            you back here automatically.
          </p>
        )}

        {phase === 'accepted' && (
          <p data-testid="text-invite-status" style={{ fontSize: 13, color: '#3fb950' }}>
            Invite accepted. Taking you to your new workspace…
          </p>
        )}

        {phase === 'error' && (
          <>
            <p
              data-testid="text-invite-error"
              style={{ fontSize: 13, color: '#f85149', margin: '0 0 12px' }}
            >
              {humanizeError(errorCode, errorText)}
            </p>
            <button
              data-testid="button-invite-home"
              onClick={() => router.replace('/')}
              style={{
                padding: '8px 14px', borderRadius: 6, border: '1px solid #30363d',
                background: 'transparent', color: '#c9d1d9', cursor: 'pointer', fontSize: 13,
              }}
            >Back to OperatorOS</button>
          </>
        )}
      </div>
    </main>
  );
}

function humanizeError(code: string | null, fallback: string | null): string {
  switch (code) {
    case 'INVITE_NOT_FOUND':
      return 'This invite link is no longer valid. Ask whoever invited you to send a new one.';
    case 'INVITE_EXPIRED':
      return 'This invite has expired. Ask the inviter to resend it.';
    case 'INVITE_ALREADY_ACCEPTED':
      return 'This invite has already been used.';
    case 'INVITE_EMAIL_MISMATCH':
      return 'This invite was issued to a different email address. Sign in with the invited email and try again.';
    default:
      return fallback ?? 'Could not accept this invite.';
  }
}

export default function InviteAcceptPage() {
  // The root layout doesn't mount AuthProvider, so we wrap locally to access
  // the same auth state the rest of the app uses.
  return (
    <AuthProvider>
      <InviteAcceptInner />
    </AuthProvider>
  );
}
