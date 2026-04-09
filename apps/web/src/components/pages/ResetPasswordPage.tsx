'use client';

import { useState } from 'react';
import { authApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

interface ResetPasswordPageProps {
  onSwitch: (page: 'login') => void;
}

export default function ResetPasswordPage({ onSwitch }: ResetPasswordPageProps) {
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setMessage('');

    if (!token.trim()) { setError('Reset token is required'); return; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      await authApi.resetPassword(token.trim(), newPassword);
      setMessage('Password reset successfully. You can now sign in with your new password.');
      setToken(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      setError(err.error || 'Failed to reset password');
    } finally { setLoading(false); }
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: 0 }}>Reset password</h1>
          <p style={{ fontSize: 14, color: colors.textMuted, marginTop: 8 }}>Enter your reset token and new password</p>
        </div>

        {error && (
          <div data-testid="reset-error" style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 8,
            background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`,
            color: colors.accentRed, fontSize: 13,
          }}>{error}</div>
        )}

        {message && (
          <div data-testid="reset-success" style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 8,
            background: 'rgba(63,185,80,0.1)', border: `1px solid ${colors.accentGreen}`,
            color: colors.accentGreen, fontSize: 13,
          }}>{message}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Reset token</label>
            <input
              data-testid="input-reset-token"
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="Paste your reset token"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>New password</label>
            <input
              data-testid="input-reset-new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="Min 8 characters"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Confirm password</label>
            <input
              data-testid="input-reset-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 8,
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="Confirm new password"
            />
          </div>

          <button
            type="submit"
            data-testid="button-reset-password"
            disabled={loading}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              background: loading ? colors.textDim : colors.accent,
              color: '#fff', fontSize: 14, fontWeight: 600, cursor: loading ? 'default' : 'pointer',
            }}
          >{loading ? 'Resetting...' : 'Reset password'}</button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: colors.textMuted }}>
          <button
            data-testid="link-login"
            onClick={() => onSwitch('login')}
            style={{ background: 'none', border: 'none', color: colors.accent, cursor: 'pointer', fontSize: 13 }}
          >Back to sign in</button>
        </div>
      </div>
    </div>
  );
}
