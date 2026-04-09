'use client';

import { useState } from 'react';
import { authApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

interface ForgotPasswordPageProps {
  onSwitch: (page: 'login') => void;
}

export default function ForgotPasswordPage({ onSwitch }: ForgotPasswordPageProps) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch {} finally {
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Reset password</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>
            {sent ? 'Check your email for reset instructions' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {!sent ? (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Email</label>
              <input data-testid="input-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                placeholder="you@example.com" />
            </div>
            <button type="submit" data-testid="button-reset" disabled={loading}
              style={{ width: '100%', padding: '12px', borderRadius: 8, border: 'none', background: loading ? colors.textDim : colors.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        ) : (
          <div data-testid="reset-sent" style={{ textAlign: 'center', padding: '20px 0', color: colors.accentGreen, fontSize: 14 }}>
            ✓ Reset email sent (check server logs for dev token)
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
