'use client';

import { useState } from 'react';
import { authApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import { brand } from '@/lib/brand';

interface ForgotPasswordPageProps {
  onSwitch: (page: 'login' | 'reset-password') => void;
}

export default function ForgotPasswordPage({ onSwitch }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.error || 'We could not process that reset request. Try again in a moment.');
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: brand.textPrimary, margin: 0 }}>Reset your OperatorOS access</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>
            {sent ? 'If an account uses this email, reset instructions are on the way.' : 'Enter your email and we’ll send a reset link.'}
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 8,
            background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`,
            color: colors.accentRed, fontSize: 13,
          }}>{error}</div>
        )}

        {!sent ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Email</label>
              <input data-testid="input-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1px solid ${brand.borderSoft}`, background: brand.bgPrimary, color: brand.textPrimary, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                placeholder="you@example.com" />
            </div>
            <button type="submit" data-testid="button-reset" disabled={loading}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: loading ? brand.textMuted : `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`, color: brand.accentInk, fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div data-testid="reset-sent" style={{ color: colors.accentGreen, fontSize: 14, marginBottom: 16 }}>
              If that email exists, reset instructions have been sent.
            </div>
            <button
              data-testid="link-reset-password"
              onClick={() => onSwitch('reset-password')}
              style={{
                padding: '10px 24px', borderRadius: 8, border: 'none',
                background: colors.accent, color: '#fff', fontSize: 13,
                fontWeight: 600, cursor: 'pointer',
              }}
            >I have a reset token</button>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <button data-testid="link-login" onClick={() => onSwitch('login')}
            style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 13 }}>Back to sign in</button>
        </div>
      </div>
    </div>
  );
}
