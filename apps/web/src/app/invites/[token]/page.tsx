'use client';

/**
 * Stable tenant-invitation landing page.
 *
 * Authentication happens on this origin instead of parking the opaque token
 * in sessionStorage and crossing through auth.operatoros.net. New users set a
 * password and join in one server transaction; existing users sign in and the
 * same page accepts the invitation. The accept endpoint is idempotent for the
 * invited account, so a retry or recovered domain-match invitation cannot
 * turn a completed join into a false error.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Building2, CheckCircle2, KeyRound, UserPlus, XCircle } from 'lucide-react';
import { tenantApi } from '@/lib/auth';
import AuthProvider, { useAuth } from '@/components/AuthProvider';
import ContactLink from '@/components/ContactLink';
import OperatorLoader from '@/components/brand/OperatorLoader';
import { brand } from '@/lib/brand';

const LEGACY_INVITE_KEYS = [
  'operatoros.pendingInviteToken',
  'operatoros.pendingInviteEmail',
];

type Phase = 'loading' | 'auth' | 'decision' | 'accepting' | 'declining' | 'accepted' | 'declined' | 'error';
type AuthMode = 'create' | 'sign-in';

interface PeekInfo {
  email: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  tenantName: string | null;
  status: 'pending' | 'expired' | 'accepted' | 'declined';
}

function clearLegacyInviteRelay() {
  try {
    for (const key of LEGACY_INVITE_KEYS) sessionStorage.removeItem(key);
  } catch {}
}

function InviteAcceptInner() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading, login, registerWithInvite, logout } = useAuth();
  const token = decodeURIComponent(String(params?.token ?? ''));
  const [phase, setPhase] = useState<Phase>('loading');
  const [authMode, setAuthMode] = useState<AuthMode>('create');
  const [peek, setPeek] = useState<PeekInfo | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const navigationStarted = useRef(false);

  const completeJoin = async (tenantId: string) => {
    if (navigationStarted.current) return;
    navigationStarted.current = true;
    clearLegacyInviteRelay();
    try {
      localStorage.setItem('activeTenantId', tenantId);
      await tenantApi.switch(tenantId);
    } catch {
      // The accept/register transaction already made this tenant current on
      // the server. This retry only keeps the browser cache synchronized.
    }
    setPhase('accepted');
    window.setTimeout(() => {
      if (typeof window !== 'undefined') window.location.replace('/app');
      else router.replace('/app');
    }, 450);
  };

  useEffect(() => {
    if (!token) {
      setErrorCode('INVITE_NOT_FOUND');
      setPhase('error');
      return;
    }
    let cancelled = false;
    void tenantApi.peekInvite(token).then((info: PeekInfo) => {
      if (cancelled) return;
      setPeek(info);
      if (info.status === 'expired') {
        setErrorCode('INVITE_EXPIRED');
        setPhase('error');
        return;
      }
      if (info.status === 'declined') {
        setPhase('declined');
        return;
      }
      if (info.status === 'accepted') setAuthMode('sign-in');
    }).catch((error: any) => {
      if (cancelled) return;
      setErrorCode(error?.code ?? 'INVITE_NOT_FOUND');
      setErrorText(error?.error ?? null);
      setPhase('error');
    });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (loading || !peek || navigationStarted.current) return;
    if (['accepting', 'declining', 'accepted', 'declined', 'error'].includes(phase)) return;
    if (!user) {
      setPhase('auth');
      return;
    }
    if (user.email.trim().toLowerCase() !== peek.email.trim().toLowerCase()) {
      setErrorCode('INVITE_EMAIL_MISMATCH');
      setPhase('error');
      return;
    }
    setPhase('decision');
  }, [loading, peek, phase, token, user]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!peek || authBusy) return;
    setAuthBusy(true);
    setErrorCode(null);
    setErrorText(null);
    try {
      await login(peek.email, password);
      setPhase('decision');
    } catch (error: any) {
      setErrorCode(error?.code ?? 'INVALID_CREDENTIALS');
      setErrorText(error?.error ?? 'We could not sign you in. Check your password and try again.');
    } finally {
      setAuthBusy(false);
    }
  };

  const createAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!peek || authBusy || peek.status !== 'pending') return;
    if (password.length < 8) {
      setErrorCode('VALIDATION_ERROR');
      setErrorText('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorCode('VALIDATION_ERROR');
      setErrorText('The passwords do not match.');
      return;
    }
    setAuthBusy(true);
    setErrorCode(null);
    setErrorText(null);
    try {
      await registerWithInvite(token, password, name);
      setPhase('decision');
    } catch (error: any) {
      if (error?.code === 'INVITE_ACCOUNT_EXISTS') setAuthMode('sign-in');
      setErrorCode(error?.code ?? 'UNKNOWN');
      setErrorText(error?.error ?? 'We could not create the invited account.');
    } finally {
      setAuthBusy(false);
    }
  };

  const acceptInvitation = async () => {
    if (!peek || authBusy || !user) return;
    setAuthBusy(true);
    setErrorCode(null);
    setErrorText(null);
    setPhase('accepting');
    try {
      const result = await tenantApi.acceptInvite(token) as { tenantId: string };
      await completeJoin(result.tenantId);
    } catch (error: any) {
      setErrorCode(error?.code ?? 'UNKNOWN');
      setErrorText(error?.error ?? 'Could not accept this invitation.');
      setPhase('error');
      setAuthBusy(false);
    }
  };

  const declineInvitation = async () => {
    if (!peek || authBusy || !user || peek.status !== 'pending') return;
    setAuthBusy(true);
    setErrorCode(null);
    setErrorText(null);
    setPhase('declining');
    try {
      await tenantApi.declineInvite(token);
      clearLegacyInviteRelay();
      setPeek(current => current ? { ...current, status: 'declined' } : current);
      setPhase('declined');
    } catch (error: any) {
      setErrorCode(error?.code ?? 'UNKNOWN');
      setErrorText(error?.error ?? 'Could not decline this invitation.');
      setPhase('error');
    } finally {
      setAuthBusy(false);
    }
  };

  const restartWithInvitedAccount = async () => {
    try { await logout(); } catch {}
    setErrorCode(null);
    setErrorText(null);
    setAuthMode('sign-in');
    setPassword('');
    setPhase('auth');
  };

  const tenantName = peek?.tenantName ?? 'your organization';
  const canReviewAgain = Boolean(
    user &&
    peek &&
    user.email.trim().toLowerCase() === peek.email.trim().toLowerCase() &&
    !['INVITE_NOT_FOUND', 'INVITE_EXPIRED', 'INVITE_DECLINED'].includes(errorCode ?? ''),
  );

  return (
    <main className="invite-shell" data-testid="page-invite-accept">
      <style>{`
        .invite-shell {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
          box-sizing: border-box;
          background:
            radial-gradient(circle at 18% 10%, rgba(34,211,238,.12), transparent 32%),
            radial-gradient(circle at 88% 92%, rgba(139,92,246,.12), transparent 34%),
            ${brand.bgPrimary};
          color: ${brand.textPrimary};
        }
        .invite-card { width: min(520px, 100%); padding: clamp(24px, 5vw, 38px); box-sizing: border-box; border: 1px solid ${brand.borderSoft}; border-radius: 20px; background: ${brand.bgSecondary}; box-shadow: 0 24px 80px rgba(0,0,0,.34); }
        .invite-kicker { margin: 0 0 10px; color: ${brand.accentCyan}; font-size: 12px; font-weight: 800; letter-spacing: .14em; text-transform: uppercase; }
        .invite-card h1 { margin: 0; font-size: clamp(24px, 6vw, 34px); line-height: 1.12; }
        .invite-context { margin: 14px 0 22px; color: ${brand.textSecondary}; font-size: 14px; line-height: 1.6; }
        .invite-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 5px; margin-bottom: 20px; border-radius: 12px; background: ${brand.bgPrimary}; }
        .invite-tabs button { border: 0; border-radius: 8px; padding: 10px; cursor: pointer; color: ${brand.textSecondary}; background: transparent; font-weight: 700; }
        .invite-tabs button.active { color: ${brand.accentInk}; background: ${brand.accentCyan}; }
        .invite-form { display: grid; gap: 15px; }
        .invite-label { display: grid; gap: 7px; color: ${brand.textSecondary}; font-size: 13px; font-weight: 650; }
        .invite-input { width: 100%; box-sizing: border-box; border: 1px solid ${brand.borderSoft}; border-radius: 10px; padding: 12px 13px; background: ${brand.bgPrimary}; color: ${brand.textPrimary}; font: inherit; }
        .invite-input:focus { outline: 2px solid rgba(34,211,238,.35); border-color: ${brand.accentCyan}; }
        .invite-input[readonly] { color: ${brand.textSecondary}; cursor: not-allowed; }
        .invite-primary { display: inline-flex; align-items: center; justify-content: center; gap: 9px; border: 0; border-radius: 10px; padding: 13px 16px; cursor: pointer; color: ${brand.accentInk}; background: ${brand.accentCyan}; font-weight: 800; }
        .invite-primary:disabled { cursor: wait; opacity: .6; }
        .invite-actions { display: flex; flex-wrap: wrap; gap: 10px; }
        .invite-decision { display: grid; gap: 16px; padding: 18px; border: 1px solid ${brand.borderSoft}; border-radius: 12px; background: ${brand.bgPrimary}; }
        .invite-decision p { margin: 0; color: ${brand.textSecondary}; font-size: 14px; line-height: 1.55; }
        .invite-error { margin: 0 0 16px; padding: 11px 13px; border: 1px solid rgba(248,81,73,.4); border-radius: 10px; color: ${brand.accentRed}; background: rgba(248,81,73,.08); font-size: 13px; line-height: 1.5; }
        .invite-secondary { border: 1px solid ${brand.borderSoft}; border-radius: 9px; padding: 10px 14px; cursor: pointer; color: ${brand.textPrimary}; background: transparent; font-weight: 700; }
        @media (max-width: 540px) { .invite-shell { padding: 12px; align-items: start; } .invite-card { margin-top: 18px; border-radius: 16px; } }
      `}</style>

      <section className="invite-card" aria-live="polite">
        <p className="invite-kicker">OperatorOS organization invite</p>
        <h1>{peek ? `Join ${tenantName}` : 'Checking your invitation'}</h1>
        {peek && (
          <p className="invite-context">
            <strong>{peek.email}</strong> was invited as <strong>{peek.role}</strong>.
            {peek.status === 'accepted'
              ? ' This invitation is already linked; sign in to open the organization.'
              : peek.status === 'declined'
                ? ' This invitation was declined. Your existing workspace was not changed.'
                : ' Create your account or sign in, then choose whether to join. Your existing workspace is not changed unless you accept.'}
          </p>
        )}

        {(phase === 'loading' || phase === 'accepting' || phase === 'declining') && (
          <div data-testid="text-invite-status" style={{ textAlign: 'center', padding: '26px 0', color: brand.textSecondary }}>
            <OperatorLoader />
            <p>{phase === 'loading'
              ? 'Validating the secure invitation…'
              : phase === 'accepting'
                ? 'Linking your account to the organization…'
                : 'Keeping your current workspace and declining the invitation…'}</p>
          </div>
        )}

        {phase === 'auth' && peek && (
          <>
            <div className="invite-tabs" role="tablist" aria-label="Invitation account options">
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'create'}
                className={authMode === 'create' ? 'active' : ''}
                disabled={peek.status !== 'pending'}
                onClick={() => { setAuthMode('create'); setErrorCode(null); setErrorText(null); }}
              >Create account</button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'sign-in'}
                className={authMode === 'sign-in' ? 'active' : ''}
                onClick={() => { setAuthMode('sign-in'); setErrorCode(null); setErrorText(null); }}
              >Sign in</button>
            </div>

            {errorCode && <p className="invite-error" data-testid="text-invite-error">{humanizeError(errorCode, errorText)}</p>}

            {authMode === 'create' && peek.status === 'pending' ? (
              <form className="invite-form" onSubmit={createAccount} data-testid="form-invite-register">
                <label className="invite-label">Invited email<input className="invite-input" value={peek.email} readOnly /></label>
                <label className="invite-label">Full name<input className="invite-input" value={name} onChange={event => setName(event.target.value)} required maxLength={100} autoComplete="name" /></label>
                <label className="invite-label">Create password<input className="invite-input" type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" /></label>
                <label className="invite-label">Confirm password<input className="invite-input" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete="new-password" /></label>
                <button className="invite-primary" type="submit" disabled={authBusy} data-testid="button-invite-register"><UserPlus size={18} />{authBusy ? 'Creating account…' : 'Create account and review invitation'}</button>
              </form>
            ) : (
              <form className="invite-form" onSubmit={signIn} data-testid="form-invite-login">
                <label className="invite-label">Invited email<input className="invite-input" value={peek.email} readOnly /></label>
                <label className="invite-label">Password<input className="invite-input" type="password" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="current-password" /></label>
                <button className="invite-primary" type="submit" disabled={authBusy} data-testid="button-invite-login"><KeyRound size={18} />{authBusy ? 'Signing in…' : 'Sign in and review invitation'}</button>
              </form>
            )}
          </>
        )}

        {phase === 'decision' && peek && user && (
          <div className="invite-decision" data-testid="panel-invite-decision">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Building2 size={26} color={brand.accentCyan} aria-hidden="true" />
              <div>
                <strong>{peek.status === 'accepted' ? `Open ${tenantName}` : `Join ${tenantName}?`}</strong>
                <p>Signed in as {user.email}</p>
              </div>
            </div>
            <p>
              {peek.status === 'accepted'
                ? 'This account already belongs to the organization. Continue to switch into its workspace.'
                : `Accepting adds this account as ${peek.role} and switches you into the organization. Declining leaves your current workspace and access unchanged.`}
            </p>
            <div className="invite-actions">
              <button className="invite-primary" type="button" disabled={authBusy} data-testid="button-invite-accept" onClick={acceptInvitation}>
                <CheckCircle2 size={18} />{peek.status === 'accepted' ? 'Open organization' : 'Join organization'}
              </button>
              {peek.status === 'pending' && (
                <button className="invite-secondary" type="button" disabled={authBusy} data-testid="button-invite-decline" onClick={declineInvitation}>
                  <XCircle size={18} /> Decline invitation
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'accepted' && (
          <div data-testid="text-invite-status" style={{ display: 'grid', justifyItems: 'center', gap: 12, padding: '22px 0', color: '#3fb950', textAlign: 'center' }}>
            <CheckCircle2 size={44} aria-hidden="true" />
            <strong>Account linked to {tenantName}.</strong>
            <span style={{ color: brand.textSecondary }}>Opening the organization workspace…</span>
          </div>
        )}

        {phase === 'declined' && (
          <div data-testid="text-invite-declined" style={{ display: 'grid', justifyItems: 'center', gap: 12, padding: '22px 0', textAlign: 'center' }}>
            <XCircle size={44} color={brand.textSecondary} aria-hidden="true" />
            <strong>Invitation declined.</strong>
            <span style={{ color: brand.textSecondary }}>You were not added to {tenantName}. Your current workspace and access remain unchanged.</span>
            <button className="invite-primary" type="button" onClick={() => router.replace('/app')}>Open my workspace</button>
          </div>
        )}

        {phase === 'error' && (
          <div>
            <p className="invite-error" data-testid="text-invite-error">{humanizeError(errorCode, errorText)}</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {errorCode === 'INVITE_EMAIL_MISMATCH' && (
                <button className="invite-primary" type="button" onClick={restartWithInvitedAccount}>Sign in as {peek?.email}</button>
              )}
              {canReviewAgain && (
                <button className="invite-primary" type="button" onClick={() => setPhase('decision')}>Review invitation again</button>
              )}
              <button className="invite-secondary" type="button" data-testid="button-invite-home" onClick={() => router.replace('/')}>Back to OperatorOS</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function humanizeError(code: string | null, fallback: string | null): string {
  switch (code) {
    case 'INVITE_NOT_FOUND':
      return 'This invitation link is no longer valid. Ask the organization owner to send a new one.';
    case 'INVITE_EXPIRED':
      return 'This invitation has expired. Ask the organization owner to resend it.';
    case 'INVITE_ALREADY_ACCEPTED':
      return 'This invitation is already linked to an account. Sign in with the invited email to continue.';
    case 'INVITE_DECLINED':
      return 'This invitation was declined. Ask the organization owner to send a new invitation if you changed your mind.';
    case 'INVITE_ACCOUNT_EXISTS':
      return 'An account already exists for this email. Sign in with its password to join the organization.';
    case 'INVITE_EMAIL_MISMATCH':
      return 'You are signed in with a different account. Sign out and use the invited email shown above.';
    case 'INVALID_CREDENTIALS':
      return 'The password did not match the invited account. Try again or reset the password from the sign-in page.';
    case 'INVITE_TENANT_UNAVAILABLE':
      return 'This organization is not currently available. Contact its owner before trying again.';
    default:
      return fallback ?? 'OperatorOS could not complete this invitation.';
  }
}

export default function InviteAcceptPage() {
  return (
    <AuthProvider>
      <InviteAcceptInner />
      <ContactLink />
    </AuthProvider>
  );
}
