'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, PhoneCall, Plus, ShieldCheck } from 'lucide-react';
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
  provider: { name: string; ready: boolean; reason: string | null };
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
  const [profile, setProfile] = useState({ name: '', message: '' });
  const [trigger, setTrigger] = useState({ phrase: '', neutralReply: 'Request received.', delaySeconds: 0 });

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
    return <div style={{ padding: space.xxl, color: semantic.textMuted }}><Loader2 size={18} /> Loading OutCall…</div>;
  }

  const accepted = !!workspace.settings?.disclaimerAcceptedAt;
  const verified = !!workspace.settings?.phoneVerifiedAt;
  const providerReady = workspace.provider.ready;

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
            {providerReady ? 'Controlled test adapter' : 'Provider fail-closed'}
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
          <Status ok={providerReady} text={providerReady ? 'Call adapter ready' : 'Live provider unavailable'} />
        </div>
        {!accepted && (
          <button data-testid="button-outcall-accept-safety" style={{ ...button, marginTop: 16 }} disabled={!!busy}
            onClick={() => run('safety', moduleShellApi.outcall.acceptSafety, 'Safety acknowledgement saved.')}>
            <ShieldCheck size={16} /> I understand the safety limitations
          </button>
        )}
        {!providerReady && <p style={{ color: '#d29922', marginBottom: 0 }}>{workspace.provider.reason} Call actions remain disabled.</p>}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: space.lg }}>
        <section id="outcall-setup" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Verified mobile</h2>
          {verified ? <p><CheckCircle2 size={16} /> {workspace.settings?.phoneMasked}</p> : (
            <>
              <label>Mobile number (E.164)<input data-testid="input-outcall-phone" style={input} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567" /></label>
              <p style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                Verification is available only through configured Twilio Verify. Isolated test environments use the documented test code.
              </p>
              <button data-testid="button-outcall-verify-phone" style={button} disabled={!accepted || !!busy || !providerReady}
                onClick={() => run('phone', () => moduleShellApi.outcall.verifyPhone(phone, '000000'), 'Phone ownership verified.')}>
                Verify test phone
              </button>
            </>
          )}
        </section>

        <section id="outcall-profiles" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Rescue profile</h2>
          <input data-testid="input-outcall-profile-name" style={input} value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Trusted callback" />
          <textarea data-testid="input-outcall-profile-message" style={{ ...input, minHeight: 88, marginTop: 10 }} value={profile.message} onChange={e => setProfile({ ...profile, message: e.target.value })} placeholder="A neutral, non-emergency message to play" />
          <button data-testid="button-outcall-create-profile" style={{ ...button, marginTop: 10 }} disabled={!!busy}
            onClick={() => run('profile', () => moduleShellApi.outcall.createProfile(profile), 'Rescue profile created.')}>
            <Plus size={16} /> Create profile
          </button>
          <List rows={workspace.profiles} empty="No rescue profiles yet." render={row => `${row.name} · ${row.language}`} />
        </section>

        <section id="outcall-triggers" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Private SMS triggers</h2>
          <input data-testid="input-outcall-trigger" style={input} type="password" autoComplete="off" value={trigger.phrase} onChange={e => setTrigger({ ...trigger, phrase: e.target.value })} placeholder="Private exact-match phrase" />
          <input style={{ ...input, marginTop: 10 }} value={trigger.neutralReply} onChange={e => setTrigger({ ...trigger, neutralReply: e.target.value })} aria-label="Neutral reply" />
          <button data-testid="button-outcall-create-trigger" style={{ ...button, marginTop: 10 }} disabled={!verified || !!busy}
            onClick={() => run('trigger', () => moduleShellApi.outcall.createTrigger(trigger), 'Encrypted private trigger created.')}>
            <Plus size={16} /> Save private trigger
          </button>
          <List rows={workspace.triggers} empty="No private triggers yet." render={row => `Hidden phrase · ${row.delaySeconds}s delay · ${row.enabled ? 'enabled' : 'disabled'}`} />
        </section>

        <section id="outcall-schedule" tabIndex={-1} style={cardStyle}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Verified-self test call</h2>
          <p style={{ color: semantic.textMuted }}>The server selects your verified destination. No phone field or arbitrary destination is accepted.</p>
          <button data-testid="button-outcall-schedule" style={button}
            disabled={!verified || !providerReady || workspace.profiles.length === 0 || !!busy}
            onClick={() => run('call', () => moduleShellApi.outcall.schedule({
              profileId: workspace.profiles[0].id,
              idempotencyKey: crypto.randomUUID(),
            }), 'Durable call request scheduled.')}>
            <PhoneCall size={16} /> Schedule controlled test
          </button>
          <List rows={workspace.calls} empty="No call requests yet." render={row => `${row.destinationMasked} · ${row.status} · ${new Date(row.scheduledAt).toLocaleString()}`} />
        </section>
      </div>

      <section style={{ ...cardStyle, marginTop: space.lg }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Unavailable safety extensions</h2>
        <p style={{ color: semantic.textMuted, marginBottom: 0 }}>
          Trusted contacts, check-ins, duress, and location are disabled. They will not be presented as working until consent, entitlement, escalation, and provider acceptance are complete.
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

function List({ rows, empty, render }: { rows: Row[]; empty: string; render: (row: Row) => string }) {
  if (!rows.length) return <p style={{ color: semantic.textMuted }}>{empty}</p>;
  return <ul style={{ paddingLeft: 20, color: semantic.textMuted }}>{rows.slice(0, 5).map(row => <li key={row.id}><Clock3 size={12} /> {render(row)}</li>)}</ul>;
}
