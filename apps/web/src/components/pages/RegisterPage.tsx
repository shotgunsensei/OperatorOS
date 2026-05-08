'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '../AuthProvider';
import { colors } from '../SaasLayout';

interface RegisterPageProps {
  onSwitch: (page: 'login') => void;
}

// Set by the invite landing page when an unauthenticated visitor hits
// /invites/<token>. Pre-filling email here means a brand-new user doesn't
// have to remember which address the invite was sent to.
const PENDING_INVITE_EMAIL_KEY = 'operatoros.pendingInviteEmail';

export default function RegisterPage({ onSwitch }: RegisterPageProps) {
  const { register } = useAuth();
  const [name, setName] = useState('');
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
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await register(email, password, name);
    } catch (err: any) {
      setError(err.error || 'Registration failed');
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
        border: `1px solid ${colors.border}`, borderRadius: 16, padding: 40,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: 'linear-gradient(135deg, #58a6ff 0%, #bc8cff 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: '#fff',
          }}>O</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Create your account</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>Start your OperatorOS journey</p>
        </div>

        {error && (
          <div data-testid="register-error" style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 8,
            background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`,
            color: colors.accentRed, fontSize: 13,
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Full name</label>
            <input data-testid="input-name" type="text" value={name} onChange={e => setName(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              placeholder="John Doe" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Email</label>
            <input data-testid="input-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              placeholder="you@example.com" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Password</label>
            <input data-testid="input-password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
              placeholder="Min 8 characters" />
          </div>
          <button type="submit" data-testid="button-register" disabled={loading}
            style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: loading ? colors.textDim : colors.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: colors.textMuted }}>
          Already have an account?{' '}
          <button data-testid="link-login" onClick={() => onSwitch('login')}
            style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 13 }}>Sign in</button>
        </div>
      </div>
    </div>
  );
}
