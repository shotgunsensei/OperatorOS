'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Download, Loader2, PhoneCall, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { ShellLiveBadge } from './ShellChrome';

type Row = Record<string, any>;
type Workspace = {
  settings: Row | null;
  profiles: Row[];
  triggers: Row[];
  calls: Row[];
  usage: Row[];
  provider: { name: 'test' | 'twilio' | 'disabled'; configured: boolean; ready: boolean; reason: string | null };
  safety: Record<string, boolean>;
};

const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px',
  color: semantic.text, background: semantic.bg, border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
};
const button: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 14px',
  border: 0, borderRadius: radius.sm, background: semantic.accent,
  color: '#fff', fontWeight: 700, cursor: 'pointer',
};

function errorMessage(error: unknown) {
  return (error as any)?.error || (error as any)?.message || 'OutCall request failed';
}

export default function OutCallShell() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [phone, setPhone] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationStarted, setVerificationStarted] = useState(false);
  const [profile, setProfile] = useState({ name: '', message: '' });
  const [editingProfileId, setEditingProfileId] = useState('');
  const [trigger, setTrigger] = useState({ profileId: '', phrase: '', neutralReply: 'Request received.', delaySeconds: 0 });
  const [editingTriggerId, setEditingTriggerId] = useState('');
  const [runAt, setRunAt] = useState('');
  const [privacyPassword, setPrivacyPassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const load = useCallback(async () => {
    try {
      setWorkspace(await moduleShellApi.outcall.workspace() as Workspace);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(name: string, action: () => Promise<unknown>, success: string) {
    setBusy(name); setError(''); setNotice('');
    try {
      await action();
      setNotice(success);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  if (!workspace) {
    return <main style={{ padding: space.xxl, color: semantic.text }} data-testid="shell-outcall" aria-busy={!error}>
      <h1 style={{ margin: '0 0 10px', fontSize: 28 }}>OutCall</h1>
      {error
        ? <div role="alert" style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger }}>{error}</div>
        : <div role="status" style={{ color: semantic.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={18} aria-hidden="true" /> Loading the verified exit-assistance workspace…</div>}
    </main>;
  }

  const accepted = !!workspace.settings?.disclaimerAcceptedAt;
  const verified = !!workspace.settings?.phoneVerifiedAt;
  const providerReady = workspace.provider.ready;

  async function exportData() {
    setBusy('export'); setError(''); setNotice('');
    try {
      const result = await moduleShellApi.outcall.exportData(privacyPassword) as { export: Record<string, unknown> };
      const url = URL.createObjectURL(new Blob([JSON.stringify(result.export, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `outcall-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice('Your OutCall data export is ready.');
      setPrivacyPassword('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy('');
    }
  }

  return (
    <main style={{ padding: space.xxl, maxWidth: 1180, margin: '0 auto', color: semantic.text }} data-testid="shell-outcall">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>OutCall</h1>
          <p style={{ color: semantic.textMuted, maxWidth: 720 }}>
            Discreet exit-assistance calls to your verified phone. OutCall is not emergency dispatch and does not replace 911.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShellLiveBadge />
          <span style={{ color: providerReady ? semantic.accentSuccess : '#d29922', fontSize: fontSize.sm }}>
            {providerReady ? 'Calls ready' : 'Calling setup required'}
          </span>
        </div>
      </header>

      {(error || notice) && (
        <div role="status" style={{ ...cardStyle, marginBottom: space.lg, borderColor: error ? semantic.accentDanger : semantic.accentSuccess }}>
          {error || notice}
        </div>
      )}

      <section id="outcall-readiness" tabIndex={-1} style={{ ...cardStyle, marginBottom: space.lg }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Readiness and safety</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
          <Status ok={accepted} text="Safety disclaimer accepted" />
          <Status ok={verified} text={verified ? `Verified ${workspace.settings?.phoneMasked}` : 'Mobile verification required'} />
          <Status ok={workspace.profiles.length > 0} text="Rescue profile configured" />
          <Status ok={providerReady} text={providerReady ? 'Calling ready' : 'Calling setup required'} />
        </div>
        {!accepted && (
          <button data-testid="button-outcall-accept-safety" style={{ ...button, marginTop: 16 }} disabled={!!busy}
            onClick={() => run('safety', moduleShellApi.outcall.acceptSafety, 'Safety acknowledgement saved.')}>
            <ShieldCheck size={16} /> I understand the safety limitations
          </button>
        )}
        {!providerReady && <p style={{ color: '#d29922', marginBottom: 0 }}>{workspace.provider.reason} You can finish your profile now; calling will unlock when setup is complete.</p>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: space.lg }}>
        <section id="outcall-setup" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Verified mobile</h2>
          {verified ? <p><CheckCircle2 size={16} /> {workspace.settings?.phoneMasked}</p> : (
            <>
              <label>Mobile number (E.164)<input data-testid="input-outcall-phone" style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567" /></label>
              <p style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>We send a one-time code to confirm this is your number. It is the only destination OutCall can call.</p>
              {workspace.provider.name === 'test' ? (
                <button data-testid="button-outcall-verify-phone" style={button} disabled={!accepted || !!busy || !providerReady || !phone}
                  onClick={() => run('phone', () => moduleShellApi.outcall.verifyPhone(phone, '000000'), 'Phone ownership verified.')}>
                  Verify phone
                </button>
              ) : !verificationStarted ? (
                <button data-testid="button-outcall-start-verification" style={button} disabled={!accepted || !!busy || !providerReady || !phone}
                  onClick={() => run('phone-start', async () => {
                    await moduleShellApi.outcall.startPhoneVerification(phone);
                    setVerificationStarted(true);
                  }, 'Verification code sent.')}>
                  Send verification code
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'end' }}>
                  <label style={{ flex: 1 }}>Verification code<input data-testid="input-outcall-verification-code" inputMode="numeric" autoComplete="one-time-code" style={input} value={verificationCode} onChange={e => setVerificationCode(e.target.value)} /></label>
                  <button data-testid="button-outcall-confirm-verification" style={button} disabled={!!busy || !verificationCode}
                    onClick={() => run('phone-confirm', () => moduleShellApi.outcall.confirmPhoneVerification(phone, verificationCode), 'Phone ownership verified.')}>
                    Confirm
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <section id="outcall-profiles" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Rescue profile</h2>
          <input data-testid="input-outcall-profile-name" style={input} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Trusted callback" />
          <textarea data-testid="input-outcall-profile-message" style={{ ...input, minHeight: 88, marginTop: 10 }} value={profile.message} onChange={e => setProfile({ ...profile, message: e.target.value })} placeholder="A neutral, non-emergency message to play" />
          <button data-testid="button-outcall-create-profile" style={{ ...button, marginTop: 10 }} disabled={!!busy}
            onClick={() => run('profile', async () => {
              if (editingProfileId) await moduleShellApi.outcall.updateProfile(editingProfileId, profile);
              else await moduleShellApi.outcall.createProfile(profile);
              setEditingProfileId('');
              setProfile({ name: '', message: '' });
            }, editingProfileId ? 'Rescue profile updated.' : 'Rescue profile created.')}>
            <Plus size={16} /> {editingProfileId ? 'Save profile' : 'Create profile'}
          </button>
          <ActionList rows={workspace.profiles} empty="No rescue profiles yet." render={row => `${row.name} · ${row.language}`}
            secondaryActionLabel="Edit profile" onSecondaryAction={row => {
              setEditingProfileId(String(row.id));
              setProfile({ name: String(row.name ?? ''), message: String(row.message ?? '') });
            }}
            actionLabel="Remove profile" onAction={row => run(`profile-${row.id}`, () => moduleShellApi.outcall.deleteProfile(row.id), 'Rescue profile removed.')} />
        </section>

        <section id="outcall-triggers" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Private SMS triggers</h2>
          <select aria-label="Rescue profile for trigger" style={input} value={trigger.profileId || workspace.profiles[0]?.id || ''}
            onChange={event => setTrigger({ ...trigger, profileId: event.target.value })}>
            {workspace.profiles.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <input data-testid="input-outcall-trigger" style={{ ...input, marginTop: 10 }} type="password" autoComplete="off" value={trigger.phrase} onChange={e => setTrigger({ ...trigger, phrase: e.target.value })} placeholder="Private exact-match phrase" />
          <input style={{ ...input, marginTop: 10 }} value={trigger.neutralReply} onChange={e => setTrigger({ ...trigger, neutralReply: e.target.value })} aria-label="Neutral reply" />
          <button data-testid="button-outcall-create-trigger" style={{ ...button, marginTop: 10 }} disabled={!verified || workspace.profiles.length === 0 || !!busy}
            onClick={() => run('trigger', async () => {
              const input = { ...trigger, profileId: trigger.profileId || workspace.profiles[0].id };
              if (editingTriggerId) await moduleShellApi.outcall.updateTrigger(editingTriggerId, input);
              else await moduleShellApi.outcall.createTrigger(input);
              setEditingTriggerId('');
              setTrigger({ profileId: '', phrase: '', neutralReply: 'Request received.', delaySeconds: 0 });
            }, editingTriggerId ? 'Private trigger updated.' : 'Private trigger created.')}>
            <Plus size={16} /> Save trigger
          </button>
          <ActionList rows={workspace.triggers} empty="No private triggers yet." render={row => `Hidden phrase · ${row.delaySeconds}s delay · ${row.enabled ? 'enabled' : 'disabled'}`}
            secondaryActionLabel="Edit trigger" onSecondaryAction={row => {
              setEditingTriggerId(String(row.id));
              setTrigger({ profileId: String(row.profileId ?? ''), phrase: '', neutralReply: String(row.neutralReply ?? 'Request received.'), delaySeconds: Number(row.delaySeconds ?? 0) });
            }}
            actionLabel="Remove trigger" onAction={row => run(`trigger-${row.id}`, () => moduleShellApi.outcall.deleteTrigger(row.id), 'Private trigger removed.')} />
        </section>

        <section id="outcall-schedule" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Schedule an exit call</h2>
          <p style={{ color: semantic.textMuted }}>Calls can only go to your verified number.</p>
          <label>When to call (optional)<input type="datetime-local" style={{ ...input, marginBottom: 10 }} value={runAt} onChange={event => setRunAt(event.target.value)} /></label>
          <button data-testid="button-outcall-schedule" style={button}
            disabled={!verified || !providerReady || workspace.profiles.length === 0 || !!busy}
            onClick={() => run('call', () => moduleShellApi.outcall.schedule({
              profileId: workspace.profiles[0].id,
              idempotencyKey: crypto.randomUUID(),
              ...(runAt ? { runAt: new Date(runAt).toISOString() } : {}),
            }), 'Durable call request scheduled.')}>
            {runAt ? <CalendarClock size={16} /> : <PhoneCall size={16} />} {runAt ? 'Schedule call' : 'Call me now'}
          </button>
          <ActionList rows={workspace.calls} empty="No call requests yet." render={row => `${row.destinationMasked} · ${row.status} · ${new Date(row.scheduledAt).toLocaleString()}`}
            actionLabel="Cancel call" actionWhen={row => row.status === 'scheduled'}
            onAction={row => run(`call-${row.id}`, () => moduleShellApi.outcall.cancel(row.id), 'Scheduled call canceled.')} />
        </section>
      </div>

      <section id="outcall-privacy" tabIndex={-1} style={{ ...cardStyle, marginTop: space.lg }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Your privacy</h2>
        <p style={{ color: semantic.textMuted }}>Download a private copy of your OutCall data or remove it from this workspace. Your password is required for either action.</p>
        <label>Password<input type="password" autoComplete="current-password" style={{ ...input, maxWidth: 420 }} value={privacyPassword} onChange={event => setPrivacyPassword(event.target.value)} /></label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button style={{ ...button, background: semantic.bgPanel, border: `1px solid ${semantic.border}` }} disabled={!!busy || !privacyPassword} onClick={() => void exportData()}>
            <Download size={16} /> Download my data
          </button>
          <input aria-label="Deletion confirmation" style={{ ...input, maxWidth: 220 }} value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder="Type DELETE OUTCALL" />
          <button style={{ ...button, background: semantic.accentDanger }} disabled={!!busy || !privacyPassword || deleteConfirmation !== 'DELETE OUTCALL'}
            onClick={() => run('delete-data', () => moduleShellApi.outcall.deleteData(privacyPassword, deleteConfirmation), 'Your OutCall data was removed.')}>
            <Trash2 size={16} /> Remove my OutCall data
          </button>
        </div>
      </section>

      <section style={{ ...cardStyle, marginTop: space.lg }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Built for discreet exits</h2>
        <p style={{ color: semantic.textMuted, marginBottom: 0 }}>
          OutCall uses your verified number, keeps recording off, and never contacts emergency services. If you are in immediate danger, call 911 or your local emergency number.
        </p>
      </section>
    </main>
  );
}

function Status({ ok, text }: { ok: boolean; text: string }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    {ok ? <CheckCircle2 size={17} color={semantic.accentSuccess} /> : <AlertTriangle size={17} color="#d29922" />}
    <span>{text}</span>
  </div>;
}

function ActionList({
  rows,
  empty,
  render,
  actionLabel,
  actionWhen,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  rows: Row[];
  empty: string;
  render: (row: Row) => string;
  actionLabel: string;
  actionWhen?: (row: Row) => boolean;
  onAction: (row: Row) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (row: Row) => void;
}) {
  if (!rows.length) return <p style={{ color: semantic.textMuted }}>{empty}</p>;
  return <ul style={{ paddingLeft: 20, color: semantic.textMuted }}>{rows.slice(0, 5).map(row => <li key={row.id} style={{ marginTop: 8 }}>
    <Clock3 size={12} /> {render(row)}{' '}
    {secondaryActionLabel && onSecondaryAction && <button type="button" aria-label={secondaryActionLabel} onClick={() => onSecondaryAction(row)}
      style={{ border: 0, background: 'transparent', color: semantic.accent, cursor: 'pointer', fontWeight: 700 }}>
      {secondaryActionLabel}
    </button>}{' '}
    {(!actionWhen || actionWhen(row)) && <button type="button" aria-label={actionLabel} onClick={() => onAction(row)}
      style={{ border: 0, background: 'transparent', color: semantic.accentDanger, cursor: 'pointer', fontWeight: 700 }}>
      {actionLabel}
    </button>}
  </li>)}</ul>;
}
