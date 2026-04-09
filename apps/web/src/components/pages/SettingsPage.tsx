'use client';

import { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { authApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

export default function SettingsPage() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true); setMessage('');
    try {
      await authApi.updateProfile({ name: name.trim() });
      await refresh();
      setMessage('Profile updated');
    } catch (err: any) {
      setMessage(err.error || 'Failed to update');
    } finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { setPwMessage('Password must be at least 8 characters'); return; }
    setPwSaving(true); setPwMessage('');
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setPwMessage('Password changed successfully');
      setCurrentPassword(''); setNewPassword('');
    } catch (err: any) {
      setPwMessage(err.error || 'Failed to change password');
    } finally { setPwSaving(false); }
  };

  return (
    <div style={{ padding: '32px 40px', maxWidth: 700 }} data-testid="settings-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 32px' }}>Settings</h1>

      <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Profile</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Email</label>
          <input disabled value={user?.email || ''} style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.textMuted, fontSize: 14, boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Name</label>
          <input data-testid="input-settings-name" value={name} onChange={e => setName(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {message && <div style={{ fontSize: 13, color: message.includes('updated') ? colors.accentGreen : colors.accentRed, marginBottom: 12 }}>{message}</div>}
        <button data-testid="button-save-profile" onClick={handleSaveProfile} disabled={saving}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>

      <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Change Password</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>Current password</label>
          <input data-testid="input-current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text }}>New password</label>
          <input data-testid="input-new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} placeholder="Min 8 characters" />
        </div>
        {pwMessage && <div style={{ fontSize: 13, color: pwMessage.includes('success') ? colors.accentGreen : colors.accentRed, marginBottom: 12 }}>{pwMessage}</div>}
        <button data-testid="button-change-password" onClick={handleChangePassword} disabled={pwSaving}
          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {pwSaving ? 'Changing...' : 'Change password'}
        </button>
      </div>

      <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>Account Info</h3>
        <div style={{ fontSize: 13, color: colors.textMuted }}>
          <div>Role: <span style={{ color: user?.role === 'admin' ? colors.accentPurple : colors.text }}>{user?.role}</span></div>
          <div>Member since: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</div>
        </div>
      </div>
    </div>
  );
}
