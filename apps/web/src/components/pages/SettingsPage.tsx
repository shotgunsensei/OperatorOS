'use client';

import { useState } from 'react';
import { useAuth } from '../AuthProvider';
import { authApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import { useToast } from '../Toast';
import { FieldMessage, PageHeader } from '../ExperiencePrimitives';

export default function SettingsPage() {
  const { user, refresh, logout, logoutEverywhere } = useAuth();
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

  const [globalLogoutMessage, setGlobalLogoutMessage] = useState('');
  const [globalLogoutSaving, setGlobalLogoutSaving] = useState(false);

  const handleSaveProfile = async () => {
    setSaving(true); setMessage('');
    try {
      await authApi.updateProfile({ name: name.trim() });
      await refresh();
      toast('Profile updated');
      setMessage('');
    } catch (err: any) {
      setMessage('We could not save your profile. Your name is still on this page. Check it and try again.');
    } finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 8) { setPwMessage('Password must be at least 8 characters'); return; }
    setPwSaving(true); setPwMessage('');
    try {
      await authApi.changePassword(currentPassword, newPassword);
      await refresh();
      toast('Password changed successfully');
      setPwMessage('');
      setCurrentPassword(''); setNewPassword('');
    } catch {
      setPwMessage('We could not change your password. Check your current password and try again. Your account is unchanged.');
    } finally { setPwSaving(false); }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim()) { setEmailMessage('Email is required'); return; }
    if (!emailPassword) { setEmailMessage('Password is required'); return; }
    setEmailSaving(true); setEmailMessage('');
    try {
      await authApi.changeEmail(newEmail.trim(), emailPassword);
      await refresh();
      toast('Email updated successfully');
      setEmailMessage('');
      setNewEmail(''); setEmailPassword('');
    } catch {
      setEmailMessage('We could not update your email. Check your password and email address, then try again. Your current email is unchanged.');
    } finally { setEmailSaving(false); }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') { setDeleteMessage('Type DELETE to confirm'); return; }
    if (!deletePassword) { setDeleteMessage('Password is required'); return; }
    setDeleteSaving(true); setDeleteMessage('');
    try {
      await authApi.requestDeletion(deletePassword);
      await logout();
    } catch {
      setDeleteMessage('We could not delete your account. Your account and data are unchanged. Check your password and try again.');
      setDeleteSaving(false);
    }
  };

  const handleGlobalLogout = async () => {
    setGlobalLogoutSaving(true);
    setGlobalLogoutMessage('');
    try {
      await logoutEverywhere();
      if (typeof window !== 'undefined') {
        window.location.assign('/signed-out?signed_out=global');
      }
    } catch (err: any) {
      setGlobalLogoutMessage('We could not sign this account out everywhere. Your current session is still active. Try again in a moment.');
      setGlobalLogoutSaving(false);
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
    <div className="ops-page" style={{ maxWidth: 820 }} data-testid="settings-page">
      <PageHeader
        eyebrow="Account"
        title="Profile and security"
        description="Update your personal details, sign-in information, and active OperatorOS sessions. Organization settings are managed separately."
      />

      <section style={cardStyle} aria-labelledby="profile-heading">
        <h2 id="profile-heading" style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>Personal details</h2>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 18px' }}>This name appears to teammates in OperatorOS activity and assignments.</p>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="settings-current-email" style={labelStyle}>Current email</label>
          <input id="settings-current-email" disabled value={user?.email || ''} style={{ ...inputStyle, color: colors.textMuted }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="settings-name" style={labelStyle}>Display name</label>
          <input id="settings-name" autoComplete="name" data-testid="input-settings-name" value={name} onChange={e => setName(e.target.value)} style={inputStyle} />
        </div>
        {message && <FieldMessage>{message}</FieldMessage>}
        <button data-testid="button-save-profile" onClick={handleSaveProfile} disabled={saving} style={btnStyle}>
          {saving ? 'Saving profile…' : 'Save profile'}
        </button>
      </section>

      <section style={cardStyle} aria-labelledby="password-heading">
        <h2 id="password-heading" style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>Password</h2>
        <p id="password-guidance" style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 18px' }}>Use at least 8 characters. Changing your password signs out other sessions.</p>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="settings-current-password" style={labelStyle}>Current password</label>
          <input id="settings-current-password" autoComplete="current-password" data-testid="input-current-password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="settings-new-password" style={labelStyle}>New password</label>
          <input id="settings-new-password" autoComplete="new-password" aria-describedby="password-guidance" data-testid="input-new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={inputStyle} />
        </div>
        {pwMessage && <FieldMessage>{pwMessage}</FieldMessage>}
        <button data-testid="button-change-password" onClick={handleChangePassword} disabled={pwSaving} style={btnStyle}>
          {pwSaving ? 'Changing password…' : 'Change password'}
        </button>
      </section>

      <section style={cardStyle} aria-labelledby="email-heading">
        <h2 id="email-heading" style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 6px' }}>Sign-in email</h2>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>Changing your email requires password verification.</p>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="settings-new-email" style={labelStyle}>New email</label>
          <input id="settings-new-email" autoComplete="email" data-testid="input-new-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="settings-email-password" style={labelStyle}>Current password</label>
          <input id="settings-email-password" autoComplete="current-password" data-testid="input-email-password" type="password" value={emailPassword} onChange={e => setEmailPassword(e.target.value)} style={inputStyle} />
        </div>
        {emailMessage && <FieldMessage>{emailMessage}</FieldMessage>}
        <button data-testid="button-change-email" onClick={handleChangeEmail} disabled={emailSaving} style={btnStyle}>
          {emailSaving ? 'Updating email…' : 'Update sign-in email'}
        </button>
      </section>

      <section style={cardStyle} aria-labelledby="account-info-heading">
        <h2 id="account-info-heading" style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>Account information</h2>
        <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
          <div>Account type: <span style={{ color: user?.role === 'admin' ? colors.accentPurple : colors.text }}>{user?.role === 'admin' ? 'Administrator' : 'Team member'}</span></div>
          <div>Account status: <span style={{ color: colors.accentGreen }}>{user?.status === 'active' ? 'Active' : 'Needs attention'}</span></div>
          <div>Member since: {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</div>
        </div>
      </section>

      <section style={cardStyle} aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>Active sessions</h2>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px', lineHeight: 1.6 }}>
          Sign out everywhere closes this account&apos;s OperatorOS and module sessions. Other tabs and modules will ask you to sign in again on their next secure request.
        </p>
        {globalLogoutMessage && (
          <div role="alert" style={{ fontSize: 13, color: colors.accentRed, marginBottom: 12 }}>
            {globalLogoutMessage}
          </div>
        )}
        <button
          data-testid="button-logout-everywhere"
          onClick={handleGlobalLogout}
          disabled={globalLogoutSaving}
          style={{ ...btnStyle, background: colors.accentRed }}
        >
          {globalLogoutSaving ? 'Signing out everywhere…' : 'Sign out everywhere'}
        </button>
      </section>

      {user?.role !== 'admin' && (
        <section style={{ ...cardStyle, borderColor: 'rgba(255,107,99,0.45)' }} aria-labelledby="delete-account-heading">
          <h2 id="delete-account-heading" style={{ fontSize: 16, fontWeight: 600, color: colors.accentRed, margin: '0 0 8px' }}>Delete account</h2>
          <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>
            Permanently delete your OperatorOS user account and personal account data. Business records owned by an organization follow that organization&apos;s access and retention rules. This action cannot be undone.
          </p>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="settings-delete-confirm" style={labelStyle}>Type DELETE to confirm</label>
            <input id="settings-delete-confirm" data-testid="input-delete-confirm" value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="settings-delete-password" style={labelStyle}>Current password</label>
            <input id="settings-delete-password" autoComplete="current-password" data-testid="input-delete-password" type="password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} style={inputStyle} />
          </div>
          {deleteMessage && <FieldMessage>{deleteMessage}</FieldMessage>}
          <button data-testid="button-delete-account" onClick={handleDeleteAccount} disabled={deleteSaving}
            style={{ ...btnStyle, background: colors.accentRed }}>
            {deleteSaving ? 'Deleting account…' : 'Permanently delete my account'}
          </button>
        </section>
      )}
    </div>
  );
}
