'use client';

/**
 * Invite landing page.
 *
 * Hit by recipients of the email sent from
 * `POST /v1/tenants/:tenantId/invites`. The accept endpoint itself
 * (`POST /v1/invites/:token/accept`) is auth-required, so this page acts as
 * the browser bridge:
 *
 *   1. Peek the invite (public, unauthenticated) so we can pre-fill the
 *      invitee's email and surface friendly errors (expired / already used /
 *      not found) before asking them to sign in.
 *   2. If the visitor is not signed in, stash the token + email in
 *      localStorage and send them to the app root, which already renders
 *      the login/register flow. The login/register pages read the parked
 *      email and pre-fill it. After auth, the root page bounces back here
 *      and we accept the invite automatically.
 *   3. If they are signed in, POST the token to the accept endpoint, switch
 *      the active tenant to the newly-joined one (so users.current_tenant_id
 *      and the X-Tenant-Id header agree on landing), then redirect home.
 *
 * Errors from the API (expired, already accepted, email mismatch) are shown
 * inline so the recipient knows what to do next without a support ticket.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { tenantApi } from '@/lib/auth';
import AuthProvider, { useAuth } from '@/components/AuthProvider';

const PENDING_INVITE_KEY = 'operatoros.pendingInviteToken';
const PENDING_INVITE_EMAIL_KEY = 'operatoros.pendingInviteEmail';

type Phase =
  | 'loading'
  | 'redirecting-login'
  | 'accepting'
  | 'accepted'
  | 'error';

interface PeekInfo {
  email: string;
  role: 'owner' | 'admin' | 'member';
  tenantName: string | null;
  status: 'pending' | 'expired' | 'accepted';
}

function InviteAcceptInner() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const token = decodeURIComponent(String(params?.token ?? ''));
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [peek, setPeek] = useState<PeekInfo | null>(null);
  // Single-shot guard: React Strict Mode and rerenders can fire the accept
  // effect more than once. We must POST /accept exactly once per page visit
  // — otherwise a second call lands as INVITE_ALREADY_ACCEPTED (409) and
  // can clobber the success UI with a false error.
  const acceptStarted = useRef(false);

  // 1. Peek the invite up-front so we can pre-fill email and short-circuit
  //    expired/accepted/not-found before forcing sign-in.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const info = await tenantApi.peekInvite(token);
        if (cancelled) return;
        setPeek(info);
        if (info.status === 'expired') {
          setErrorCode('INVITE_EXPIRED');
          setPhase('error');
        } else if (info.status === 'accepted') {
          setErrorCode('INVITE_ALREADY_ACCEPTED');
          setPhase('error');
        }
      } catch (e: any) {
        if (cancelled) return;
        setErrorCode(e?.code ?? 'INVITE_NOT_FOUND');
        setErrorText(e?.error ?? null);
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // 2. Once we have the peek + auth state settled, route to login or accept.
  //    NOTE: `phase` is intentionally NOT in the dep list — this effect must
  //    not re-run when phase transitions, or we'd double-fire accept.
  useEffect(() => {
    if (loading || !token) return;
    // Wait for peek to resolve before deciding (peek may also have set
    // phase to 'error' for expired/already-accepted/not-found).
    if (!peek) return;

    // If peek already short-circuited to an error (expired / accepted /
    // not-found), keep the recipient on this page so they see the friendly
    // error — do NOT bounce signed-out users to login first. Also clear any
    // stale parked invite so a later sign-in doesn't try to redeem it.
    if (peek.status !== 'pending') {
      try {
        localStorage.removeItem(PENDING_INVITE_KEY);
        localStorage.removeItem(PENDING_INVITE_EMAIL_KEY);
      } catch {}
      return;
    }

    if (!user) {
      // Park token + email so login/register can pre-fill, then bounce to
      // the root which already renders the auth flow. The root page picks
      // the token back up after sign-in and sends them right back here.
      try {
        localStorage.setItem(PENDING_INVITE_KEY, token);
        if (peek.email) localStorage.setItem(PENDING_INVITE_EMAIL_KEY, peek.email);
      } catch {}
      setPhase('redirecting-login');
      router.replace('/');
      return;
    }

    // Single-shot guard against Strict-Mode double-invoke and rerenders.
    if (acceptStarted.current) return;
    acceptStarted.current = true;

    setPhase('accepting');
    (async () => {
      try {
        const result = await tenantApi.acceptInvite(token);
        try {
          localStorage.removeItem(PENDING_INVITE_KEY);
          localStorage.removeItem(PENDING_INVITE_EMAIL_KEY);
        } catch {}
        // Switch the active tenant server-side so users.current_tenant_id
        // matches the X-Tenant-Id header — otherwise the next page load
        // would land back in the previously-active tenant.
        if (result?.tenantId) {
          try {
            localStorage.setItem('activeTenantId', result.tenantId);
            await tenantApi.switch(result.tenantId);
          } catch {
            // switch is best-effort; the localStorage cache + hard
            // navigate below is still enough for the UI to land in the
            // new tenant.
          }
        }
        setPhase('accepted');
        // Hard navigate so TenantProvider re-fetches with the new tenant.
        setTimeout(() => {
          if (typeof window !== 'undefined') window.location.href = '/';
          else router.replace('/');
        }, 600);
      } catch (e: any) {
        // Only surface this error if we haven't already reached a terminal
        // success state — defends against any late rejection after success.
        setPhase((current) => {
          if (current === 'accepted') return current;
          setErrorCode(e?.code ?? 'UNKNOWN');
          setErrorText(e?.error ?? 'Could not accept this invite.');
          return 'error';
        });
      }
    })();
  }, [loading, user, token, router, peek]);

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
          {peek?.tenantName ? `Join ${peek.tenantName}` : 'Tenant invite'}
        </h1>

        {peek && phase !== 'error' && (
          <p style={{ fontSize: 13, color: '#8b949e', margin: '0 0 12px' }}>
            Invited as <strong style={{ color: '#c9d1d9' }}>{peek.email}</strong>
            {' '}({peek.role})
          </p>
        )}

        {(phase === 'loading' || phase === 'accepting') && (
          <p data-testid="text-invite-status" style={{ fontSize: 13, color: '#8b949e' }}>
            {phase === 'loading' ? 'Checking your invite…' : 'Accepting invite…'}
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
