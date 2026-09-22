'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { authApi } from '@/lib/auth';
import { brand } from '@/lib/brand';
import { colors } from '../SaasLayout';

export default function VerifyEmailPage({ onSwitch }: { onSwitch: (page: 'login') => void }) {
  const [emailChanged, setEmailChanged] = useState(false);
  const [state, setState] = useState<'working' | 'verified' | 'invalid'>('working');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    if (!token) {
      setState('invalid');
      return;
    }
    // Remove the one-use secret before any request or later navigation.
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    window.history.replaceState(null, '', `${url.pathname}?mode=verify-email`);
    void authApi.confirmEmailVerification(token).then(result => {
      setEmailChanged(Boolean(result.emailChanged));
      setState('verified');
    }).catch(() => setState('invalid'));
  }, []);

  const Icon = state === 'working' ? Loader2 : state === 'verified' ? CheckCircle2 : ShieldAlert;
  const title = state === 'working'
    ? 'Verifying your email'
    : state === 'verified'
      ? 'Email verified'
      : 'This verification link cannot be used';
  const detail = state === 'working'
    ? 'Checking the single-use link with OperatorOS…'
    : state === 'verified'
      ? emailChanged ? 'Your sign-in email has been updated. Sign in with your new email to continue. Your other sessions have been signed out.' : 'Your email is verified. You can now continue to your account.'
      : 'The link may have expired or already been used. Sign in to request a new one.';

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: brand.bgPrimary, padding: 24 }}>
      <section data-testid="email-verification-result" style={{ width: '100%', maxWidth: 460, padding: 36, borderRadius: 16, background: brand.bgSecondary, border: `1px solid ${brand.borderSoft}`, textAlign: 'center' }}>
        <Icon
          size={42}
          aria-hidden="true"
          className={state === 'working' ? 'spin' : undefined}
          color={state === 'invalid' ? colors.accentRed : colors.accentGreen}
          style={{ margin: '0 auto 18px', display: 'block' }}
        />
        <h1 style={{ color: brand.textPrimary, fontSize: 24, margin: 0 }}>{title}</h1>
        <p style={{ color: brand.textSecondary, fontSize: 14, lineHeight: 1.6, margin: '12px 0 24px' }}>{detail}</p>
        {state !== 'working' && (
          <button type="button" data-testid="button-verification-login" onClick={() => onSwitch('login')} style={{ width: '100%', padding: 12, border: 0, borderRadius: 8, background: colors.accent, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            Continue to sign in
          </button>
        )}
      </section>
    </div>
  );
}
