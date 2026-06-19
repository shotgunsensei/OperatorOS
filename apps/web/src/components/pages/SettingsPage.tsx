'use client';

import { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { authApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import { useToast } from '../Toast';

export default function SettingsPage() {
  const { user, refresh, logout } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);

  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteMessage, setDeleteMessage] = useState('');
  const [deleteSaving, setDeleteSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true); setMessage('');
    try {
      await authApi.updateProfile({ name: name.trim() });
      await refresh();
      toast('Profile updated');
      setMessage('');
    } catch (err: any) {
      setMessage(err.error || 'Failed to update');
    } finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { setPwMessage('Password must be at least 8 characters'); return; }
    setPwSaving(true); setPwMessage('');
    try {
      const data = await authApi.changePassword(currentPassword, newPassword);
      if (data.token) localStorage.setItem('token', data.token);
      await refresh();
      toast('Password changed successfully');
      setPwMessage('');
      setCurrentPassword(''); setNewPassword('');
    } catch (err: any) {
      setPwMessage(err.error || 'Failed to change password');
    } finally { setPwSaving(false); }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) { setEmailMessage('Email is required'); return; }
    if (!emailPassword) { setEmailMessage('Password is required'); return; }
    setEmailSaving(true); setEmailMessage('');
    try {
      const data = await authApi.changeEmail(newEmail.trim(), emailPassword);
      if (data.token) localStorage.setItem('token', data.token);
      await refresh();
      toast('Email updated successfully');
      setEmailMessage('');
      setNewEmail(''); setEmailPassword('');
    } catch (err: any) {
      setEmailMessage(err.error || 'Failed to change email');
    } finally { setEmailSaving(false); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { setDeleteMessage('Type DELETE to confirm'); return; }
    if (!deletePassword) { setDeleteMessage('Password is required'); return; }
    setDeleteSaving(true); setDeleteMessage('');
    try {
      await authApi.requestDeletion(deletePassword);
      await logout();
    } catch (err: any) {
      setDeleteMessage(err.error || 'Failed to delete account');
      setDeleteSaving(false);
    }
  };

  const cardStyle = {
    background: colors.bgSecondary,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: `1px solid ${colors.border}`, background: colors.bg,
    color: colors.text, fontSize: 14, outline: 'none', boxSizing: 'border-box' as const,
  };

  const labelStyle = {
    display: 'block' as const, fontSize: 13, fontWeight: 500, marginBottom: 6, color: colors.text,
  };

  const btnStyle = {
    padding: '8px 20px', borderRadius: 8, border: 'none',
    background: colors.accent, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 700 }} data-testid="settings-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 32px' }}>Settings</h1>

      <div style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Profile</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Email</label>
          <input disabled value={user?.email || ''} style={{ ...inputStyle, color: colors.textMuted }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Name</label>
          <input data-testid="input-settings-name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </div>
        {message && <div style={{ fontSize: 13, color: message.includes('updated') ? colors.accentGreen : colors.accentRed, marginBottom: 12 }}>{message}</div>}
        <button data-testid="button-save-profile" onClick={handleSaveProfile} disabled={saving} style={btnStyle}>
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Change Password</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Current password</label>
          <input data-testid="input-current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>New password</label>
          <input data-testid="input-new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} placeholder="Min 8 characters" />
        </div>
        {pwMessage && <div style={{ fontSize: 13, color: pwMessage.includes('success') ? colors.accentGreen : colors.accentRed, marginBottom: 12 }}>{pwMessage}</div>}
        <button data-testid="button-change-password" onClick={handleChangePassword} disabled={pwSaving} style={btnStyle}>
          {pwSaving ? 'Changing...' : 'Change password'}
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Change Email</h3>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>Changing your email requires password verification.</p>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>New email</label>
          <input data-testid="input-new-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inputStyle} placeholder="new@example.com" />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Current password</label>
          <input data-testid="input-email-password" type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} style={inputStyle} />
        </div>
        {emailMessage && <div style={{ fontSize: 13, color: emailMessage.includes('success') ? colors.accentGreen : colors.accentRed, marginBottom: 12 }}>{emailMessage}</div>}
        <button data-testid="button-change-email" onClick={handleChangeEmail} disabled={emailSaving} style={btnStyle}>
          {emailSaving ? 'Updating...' : 'Update email'}
        </button>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>Account Info</h3>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
          <div>Role: <span style={{ color: user?.role === 'admin' ? colors.accentPurple : colors.text }}>{user?.role}</span></div>
          <div>Status: <span style={{ color: colors.accentGreen }}>{user?.status}</span></div>
          <div>Member since: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</div>
        </div>
      </div>

      {user?.role !== 'admin' && (
        <div style={{ ...cardStyle, borderColor: 'rgba(248,81,73,0.3)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: colors.accentRed, margin: '0 0 8px' }}>Danger Zone</h3>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Type DELETE to confirm</label>
            <input data-testid="input-delete-confirm" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} style={inputStyle} placeholder="DELETE" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Password</label>
            <input data-testid="input-delete-password" type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} style={inputStyle} />
          </div>
          {deleteMessage && <div style={{ fontSize: 13, color: colors.accentRed, marginBottom: 12 }}>{deleteMessage}</div>}
          <button data-testid="button-delete-account" onClick={handleDeleteAccount} disabled={deleteSaving}
            style={{ ...btnStyle, background: colors.accentRed }}>
            {deleteSaving ? 'Deleting...' : 'Delete my account'}
          </button>
        </div>
      )}
    </div>
  );
}
