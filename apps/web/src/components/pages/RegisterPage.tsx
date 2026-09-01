'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useAuth } from '../AuthProvider';
import { colors } from '../SaasLayout';
import { brand } from '@/lib/brand';

interface RegisterPageProps {
  onSwitch: (page: 'login') => void;
}

export default function RegisterPage({ onSwitch }: RegisterPageProps) {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await register(email, password, name);
    } catch (err: any) {
      if (err.code === 'REGISTRATION_SUBMITTED') {
        setSubmitted(true);
        return;
      }
      setError(err.error || 'We could not create the account. Review the fields and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: brand.bgPrimary, padding: 'clamp(16px, 4vw, 32px)',
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: brand.bgSecondary,
        border: `1px solid ${brand.borderSoft}`, borderRadius: 16,
        padding: 'clamp(24px, 7vw, 40px)', boxSizing: 'border-box',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
            background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 800, color: brand.accentInk,
          }}>O</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: brand.textPrimary, margin: 0 }}>Create your OperatorOS account</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>
            Set up one account for your organization and connected apps.
          </p>
        </div>

        {submitted ? (
          <div data-testid="register-success" style={{ textAlign: 'center' }}>
            <CheckCircle2
              size={40}
              color={colors.accentGreen}
              aria-hidden="true"
              style={{ display: 'block', margin: '0 auto 16px' }}
            />
            <p style={{ color: colors.text, fontSize: 14, marginBottom: 24 }}>
              If this email is new, your account has been created. Check your inbox for the verification link, then sign in to continue.
            </p>
            <button data-testid="button-go-login" onClick={() => onSwitch('login')}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Sign in
            </button>
          </div>
        ) : (
          <>
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
              placeholder="Your name" />
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
              placeholder="At least 8 characters" />
          </div>
          <button type="submit" data-testid="button-register" disabled={loading}
            style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: loading ? colors.textDim : colors.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
            {loading ? 'Creating account...' : 'Create OperatorOS account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: colors.textMuted }}>
          Already have an account?{' '}
          <button data-testid="link-login" onClick={() => onSwitch('login')}
            style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 13 }}>Sign in</button>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
