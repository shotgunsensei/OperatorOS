'use client';

import { useState } from 'react';
import { authApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import { brand } from '@/lib/brand';
import AccountFlowFrame from './AccountFlowFrame';

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
      setMessage('Password reset successfully. You can now sign in to OperatorOS.');
      setToken(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: any) {
      setError(err.error || 'We could not reset the password. Check the token and try again.');
    } finally { setLoading(false); }
  };

  return (
    <AccountFlowFrame title="Choose a new password" description="Paste the reset token from your email, then choose a password.">

        {error && (
          <div data-testid="reset-error" role="alert" style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 8,
            background: 'rgba(248,81,73,0.1)', border: `1px solid ${colors.accentRed}`,
            color: colors.accentRed, fontSize: 13,
          }}>{error}</div>
        )}

        {message && (
          <div data-testid="reset-success" role="status" style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 8,
            background: 'rgba(63,185,80,0.1)', border: `1px solid ${colors.accentGreen}`,
            color: colors.accentGreen, fontSize: 13,
          }}>{message}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="reset-token" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Reset token</label>
            <input
              id="reset-token" autoComplete="off" data-testid="input-reset-token"
              type="text"
              value={token}
              onChange={e => setToken(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${brand.borderSoft}`, background: brand.bgPrimary,
                color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="Paste your reset token"
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="reset-new-password" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>New password</label>
            <input
              id="reset-new-password" autoComplete="new-password" data-testid="input-reset-new-password"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${brand.borderSoft}`, background: brand.bgPrimary,
                color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
              placeholder="At least 8 characters"
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label htmlFor="reset-confirm-password" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Confirm password</label>
            <input
              id="reset-confirm-password" autoComplete="new-password" data-testid="input-reset-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                border: `1px solid ${brand.borderSoft}`, background: brand.bgPrimary,
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
              width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: loading ? brand.textMuted : `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`,
              color: brand.accentInk, fontSize: 14, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
            }}
          >{loading ? 'Updating password…' : 'Update password'}</button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: colors.textMuted }}>
          <button
            data-testid="link-login"
            onClick={() => onSwitch('login')}
            style={{ background: 'none', border: 'none', color: '#9cc8ff', cursor: 'pointer', fontSize: 13 }}
          >Back to sign in</button>
        </div>
    </AccountFlowFrame>
  );
}
