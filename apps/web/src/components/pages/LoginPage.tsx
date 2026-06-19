'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../AuthProvider';
import { colors } from '../SaasLayout';

interface LoginPageProps {
  onSwitch: (page: 'register' | 'forgot-password') => void;
}

// Set by the invite landing page when an unauthenticated visitor hits
// /invites/<token>. Reading it here pre-fills the email so the recipient
// doesn't have to retype the address the invite was issued to.
const PENDING_INVITE_EMAIL_KEY = 'operatoros.pendingInviteEmail';

export default function LoginPage({ onSwitch }: LoginPageProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  useEffect(() => {
    try {
      const parked = localStorage.getItem(PENDING_INVITE_EMAIL_KEY);
      if (parked) setEmail(parked);
    } catch {}
  }, []);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.error || 'We could not sign you in. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: colors.bg, padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, background: colors.bgSecondary,
        border: `1px solid ${colors.border}`, borderRadius: 16,
        padding: 'clamp(24px, 7vw, 40px)', boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#fff',
          }}>O</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>One login. Every operation.</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>
            Sign in to the OperatorOS parent command layer.
          </p>
        </div>

        {error && (
          <div data-testid="login-error" style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 8,
            background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`,
            color: colors.accentRed, fontSize: 13,
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Email</label>
            <input
              data-testid="input-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="you@example.com"
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Password</label>
            <input
              data-testid="input-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="••••••••"
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: 20 }}>
            <button
              type="button"
              data-testid="link-forgot-password"
              onClick={() => onSwitch('forgot-password')}
              style={{
                background: 'none', border: 'none', color: colors.accent,
                cursor: 'pointer', fontSize: 13,
              }}
            >Forgot password?</button>
          </div>

          <button
            type="submit"
            data-testid="button-login"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              background: loading ? colors.textDim : colors.accent,
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            }}
          >{loading ? 'Signing in...' : 'Enter OperatorOS'}</button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: colors.textMuted }}>
          Need access to OperatorOS?{' '}
          <button
            data-testid="link-register"
            onClick={() => onSwitch('register')}
            style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 13 }}
          >Create account</button>
        </div>
      </div>
    </div>
  );
}
