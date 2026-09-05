'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, CheckCircle2, Clock3, Download, Loader2, PhoneCall, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import type { OutCallRouteArea } from './OutCallRoute.contract';

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
const outCallLink = '#c4b5fd';

function errorMessage(error: unknown) {
  return (error as any)?.error || (error as any)?.message || 'OutCall request failed';
}

export default function OutCallWorkspace({ view, recordId, hrefFor = path => path, canWrite = false }: { view: OutCallRouteArea; recordId?: string; hrefFor?: (path: string) => string; canWrite?: boolean }) {
  const router = useRouter();
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
    if (!canWrite || busy) return;
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
    return <section style={{ color: semantic.text }} data-testid={`outcall-${view}-route`} aria-busy={!error}>
      {error
        ? <div role="alert" style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger }}>{error}</div>
        : <div role="status" style={{ color: semantic.textMuted, display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={18} aria-hidden="true" /> Loading the verified exit-assistance workspace…</div>}
    </section>;
  }

  const accepted = !!workspace.settings?.disclaimerAcceptedAt;
  const verified = !!workspace.settings?.phoneVerifiedAt;
  const providerReady = workspace.provider.ready;
  const selectedCall = workspace.calls.find(item => item.id === recordId) ?? null;

  async function exportData() {
    if (!canWrite || busy) return;
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
    <section style={{ minWidth: 0, color: semantic.text }} data-testid={`outcall-${view}-route`} data-outcall-view={view}>
      {(error || notice) && (
        <div role="status" style={{ ...cardStyle, marginBottom: space.lg, borderColor: error ? semantic.accentDanger : semantic.accentSuccess }}>
          {error || notice}
        </div>
      )}
      {!canWrite && (
        <div role="status" data-testid="outcall-read-only" style={{ ...cardStyle, marginBottom: space.lg, borderColor: '#8b5cf6', color: '#ddd6fe' }}>
          <strong>Read-only OutCall access</strong>
          <div style={{ color: semantic.textMuted, marginTop: 4 }}>You can review safety status, verified-self setup, profiles, triggers, and call history. Edit access is required to change settings, verify a phone, request a call, cancel a schedule, export, or remove data.</div>
        </div>
      )}

      {['overview', 'delivery', 'settings'].includes(view) && <section id="outcall-readiness" tabIndex={-1} style={{ ...cardStyle, marginBottom: space.lg }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Readiness and safety</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 12 }}>
          <Status ok={accepted} text="Safety disclaimer accepted" />
          <Status ok={verified} text={verified ? `Verified ${workspace.settings?.phoneMasked}` : 'Mobile verification required'} />
          <Status ok={workspace.profiles.length > 0} text="Rescue profile configured" />
          <Status ok={providerReady} text={providerReady ? 'Calling ready' : 'Calling setup required'} />
        </div>
        {!accepted && (
          <button data-testid="button-outcall-accept-safety" style={{ ...button, marginTop: 16 }} disabled={!canWrite || !!busy}
            onClick={() => run('safety', moduleShellApi.outcall.acceptSafety, 'Safety acknowledgement saved.')}>
            <ShieldCheck size={16} /> I understand the safety limitations
          </button>
        )}
        {!providerReady && <p style={{ color: '#d29922', marginBottom: 0 }}>Calling is not connected for this organization yet. You can finish your profile now; an administrator can complete phone-service setup when you are ready to place calls.</p>}
      </section>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,300px),1fr))', gap: space.lg }}>
        {view === 'verification' && <section id="outcall-setup" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Verified mobile</h2>
          {verified ? <p><CheckCircle2 size={16} /> {workspace.settings?.phoneMasked}</p> : (
            <>
              <label>Mobile number, including country code<input data-testid="input-outcall-phone" style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555 123 4567" disabled={!canWrite} /></label>
              <p style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>We send a one-time code to confirm this is your number. It is the only destination OutCall can call.</p>
              {workspace.provider.name === 'test' ? (
                <button data-testid="button-outcall-verify-phone" style={button} disabled={!canWrite || !accepted || !!busy || !providerReady || !phone}
                  onClick={() => run('phone', () => moduleShellApi.outcall.verifyPhone(phone, '000000'), 'Phone ownership verified.')}>
                  Verify phone
                </button>
              ) : !verificationStarted ? (
                <button data-testid="button-outcall-start-verification" style={button} disabled={!canWrite || !accepted || !!busy || !providerReady || !phone}
                  onClick={() => run('phone-start', async () => {
                    await moduleShellApi.outcall.startPhoneVerification(phone);
                    setVerificationStarted(true);
                  }, 'Verification code sent.')}>
                  Send verification code
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'end' }}>
                  <label style={{ flex: 1 }}>Verification code<input data-testid="input-outcall-verification-code" inputMode="numeric" autoComplete="one-time-code" style={input} value={verificationCode} onChange={e => setVerificationCode(e.target.value)} disabled={!canWrite} /></label>
                  <button data-testid="button-outcall-confirm-verification" style={button} disabled={!canWrite || !!busy || !verificationCode}
                    onClick={() => run('phone-confirm', () => moduleShellApi.outcall.confirmPhoneVerification(phone, verificationCode), 'Phone ownership verified.')}>
                    Confirm
                  </button>
                </div>
              )}
            </>
          )}
        </section>}

        {view === 'contacts' && <section id="outcall-profiles" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Rescue profile</h2>
          <p style={{ color: semantic.textMuted }}>OutCall has no arbitrary contact address book. Every profile can call only your independently verified mobile number.</p>
          <input aria-label="Rescue profile name" data-testid="input-outcall-profile-name" style={input} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Trusted callback" disabled={!canWrite} />
          <textarea aria-label="Neutral assistance message" data-testid="input-outcall-profile-message" style={{ ...input, minHeight: 88, marginTop: 10 }} value={profile.message} onChange={e => setProfile({ ...profile, message: e.target.value })} placeholder="A neutral, non-emergency message to play" disabled={!canWrite} />
          <button data-testid="button-outcall-create-profile" style={{ ...button, marginTop: 10 }} disabled={!canWrite || !!busy}
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
            secondaryActionEnabled={canWrite}
            actionLabel="Remove profile" actionEnabled={canWrite} onAction={row => run(`profile-${row.id}`, () => moduleShellApi.outcall.deleteProfile(row.id), 'Rescue profile removed.')} />
        </section>}

        {view === 'campaigns' && <section id="outcall-triggers" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Private SMS triggers</h2>
          <p style={{ color: semantic.textMuted }}>This is not a bulk outbound campaign. An exact private phrase can request one bounded call to your verified number.</p>
          <select aria-label="Rescue profile for trigger" style={input} value={trigger.profileId || workspace.profiles[0]?.id || ''} disabled={!canWrite}
            onChange={event => setTrigger({ ...trigger, profileId: event.target.value })}>
            {workspace.profiles.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
          <input aria-label="Private exact-match phrase" data-testid="input-outcall-trigger" style={{ ...input, marginTop: 10 }} type="password" autoComplete="off" value={trigger.phrase} onChange={e => setTrigger({ ...trigger, phrase: e.target.value })} placeholder="Private exact-match phrase" disabled={!canWrite} />
          <input style={{ ...input, marginTop: 10 }} value={trigger.neutralReply} onChange={e => setTrigger({ ...trigger, neutralReply: e.target.value })} aria-label="Neutral reply" disabled={!canWrite} />
          <button data-testid="button-outcall-create-trigger" style={{ ...button, marginTop: 10 }} disabled={!canWrite || !verified || workspace.profiles.length === 0 || !!busy}
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
            secondaryActionEnabled={canWrite}
            actionLabel="Remove trigger" actionEnabled={canWrite} onAction={row => run(`trigger-${row.id}`, () => moduleShellApi.outcall.deleteTrigger(row.id), 'Private trigger removed.')} />
        </section>}

        {['schedules', 'calls', 'reminders', 'history'].includes(view) && <section id="outcall-schedule" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>{view === 'history' ? 'Call delivery history' : view === 'calls' ? 'Call requests' : view === 'reminders' ? 'Exit-call reminders' : 'Schedule an exit call'}</h2>
          <p style={{ color: semantic.textMuted }}>Calls can only go to your verified number.</p>
          {['schedules', 'reminders'].includes(view) && <><label>When to call (optional)<input type="datetime-local" style={{ ...input, marginBottom: 10 }} value={runAt} onChange={event => setRunAt(event.target.value)} disabled={!canWrite} /></label>
          <button data-testid="button-outcall-schedule" style={button}
            disabled={!canWrite || !verified || !providerReady || workspace.profiles.length === 0 || !!busy}
            onClick={() => run('call', () => moduleShellApi.outcall.schedule({
              profileId: workspace.profiles[0].id,
              idempotencyKey: crypto.randomUUID(),
              ...(runAt ? { runAt: new Date(runAt).toISOString() } : {}),
            }), 'Durable call request scheduled.')}>
            {runAt ? <CalendarClock size={16} /> : <PhoneCall size={16} />} {runAt ? 'Schedule call' : 'Call me now'}
          </button></>}
          {selectedCall && <article data-testid="outcall-call-record" style={{ ...cardStyle, marginTop: 12 }}><strong>{selectedCall.destinationMasked}</strong><p style={{ color: semantic.textMuted }}>{selectedCall.status} · scheduled {new Date(selectedCall.scheduledAt).toLocaleString()}</p><small>Delivery status: {String(selectedCall.providerStatus || selectedCall.status).replaceAll('_', ' ')}. A call appears as completed only after the calling service confirms it.</small></article>}
          <ActionList rows={workspace.calls} empty="No call requests yet." render={row => `${row.destinationMasked} · ${row.status} · ${new Date(row.scheduledAt).toLocaleString()}`}
            secondaryActionLabel="Open call record" onSecondaryAction={row => router.push(hrefFor(`/calls/${row.id}`))}
            actionLabel="Cancel call" actionWhen={row => row.status === 'scheduled'}
            actionEnabled={canWrite}
            onAction={row => run(`call-${row.id}`, () => moduleShellApi.outcall.cancel(row.id), 'Scheduled call canceled.')} />
        </section>}
      </div>

      {view === 'compliance' && <section id="outcall-privacy" tabIndex={-1} style={{ ...cardStyle, marginTop: space.lg }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Your privacy</h2>
        <p style={{ color: semantic.textMuted }}>Download a private copy of your OutCall data or remove it from this workspace. Your password is required for either action.</p>
        <label>Password<input type="password" autoComplete="current-password" style={{ ...input, maxWidth: 420 }} value={privacyPassword} onChange={event => setPrivacyPassword(event.target.value)} disabled={!canWrite} /></label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <button style={{ ...button, background: semantic.bgPanel, border: `1px solid ${semantic.border}` }} disabled={!canWrite || !!busy || !privacyPassword} onClick={() => void exportData()}>
            <Download size={16} /> Download my data
          </button>
          <input aria-label="Deletion confirmation" style={{ ...input, maxWidth: 220 }} value={deleteConfirmation} onChange={event => setDeleteConfirmation(event.target.value)} placeholder="Type DELETE OUTCALL" disabled={!canWrite} />
          <button style={{ ...button, background: semantic.accentDanger }} disabled={!canWrite || !!busy || !privacyPassword || deleteConfirmation !== 'DELETE OUTCALL'}
            onClick={() => run('delete-data', () => moduleShellApi.outcall.deleteData(privacyPassword, deleteConfirmation), 'Your OutCall data was removed.')}>
            <Trash2 size={16} /> Remove my OutCall data
          </button>
        </div>
      </section>}

      {['compliance', 'settings'].includes(view) && <section id="outcall-safety-boundary" style={{ ...cardStyle, marginTop: space.lg }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Built for discreet exits</h2>
        <p style={{ color: semantic.textMuted, marginBottom: 0 }}>
          OutCall uses your verified number, keeps recording off, and never contacts emergency services. OutCall does not replace 911. If you are in immediate danger, call 911 or your local emergency number.
        </p>
      </section>}
    </section>
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
  actionEnabled = true,
  secondaryActionEnabled = true,
}: {
  rows: Row[];
  empty: string;
  render: (row: Row) => string;
  actionLabel: string;
  actionWhen?: (row: Row) => boolean;
  onAction: (row: Row) => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: (row: Row) => void;
  actionEnabled?: boolean;
  secondaryActionEnabled?: boolean;
}) {
  if (!rows.length) return <p style={{ color: semantic.textMuted }}>{empty}</p>;
  return <ul style={{ paddingLeft: 20, color: semantic.textMuted }}>{rows.slice(0, 5).map(row => <li key={row.id} style={{ marginTop: 8 }}>
    <Clock3 size={12} /> {render(row)}{' '}
    {secondaryActionLabel && onSecondaryAction && <button type="button" aria-label={secondaryActionLabel} disabled={!secondaryActionEnabled} onClick={() => onSecondaryAction(row)}
      style={{ border: 0, background: 'transparent', color: outCallLink, cursor: 'pointer', fontWeight: 700 }}>
      {secondaryActionLabel}
    </button>}{' '}
    {(!actionWhen || actionWhen(row)) && <button type="button" aria-label={actionLabel} disabled={!actionEnabled} onClick={() => onAction(row)}
      style={{ border: 0, background: 'transparent', color: semantic.accentDanger, cursor: 'pointer', fontWeight: 700 }}>
      {actionLabel}
    </button>}
  </li>)}</ul>;
}
