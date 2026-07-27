'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, Headphones, PhoneCall, Plus, Radio, ShieldCheck } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { semantic, space, radius, fontSize } from '@/lib/design-tokens';
import { ShellLaunchButton, ShellLiveBadge } from './ShellChrome';

type Row = Record<string, any>;
type Workspace = {
  summary: { calls: number; completed: number; failed: number; last24Hours: number };
  channels: Row[];
  profiles: Row[];
  transferTargets: Row[];
  consents: Row[];
  suppressions: Row[];
  calls: Row[];
  followups: Row[];
  provider: { configured: boolean; provider: string; source: string | null; testAdapter: boolean };
};

const card: React.CSSProperties = {
  background: semantic.bgPanel,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.md,
  padding: space.lg,
};
const input: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: semantic.bg, color: semantic.text,
  border: `1px solid ${semantic.border}`, borderRadius: radius.sm, padding: '9px 10px',
};
const button: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  border: 0, borderRadius: radius.sm, padding: '9px 13px', color: '#fff',
  background: semantic.accent, fontWeight: 700, cursor: 'pointer',
};

export default function CallCommandShell({ baseUrl }: { baseUrl?: string }) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [phone, setPhone] = useState('+15551234567');
  const [subject, setSubject] = useState('Acceptance caller');
  const [purpose, setPurpose] = useState('support');
  const [consentEvidence, setConsentEvidence] = useState('Customer requested a support callback in the authenticated portal.');
  const [selectedCallId, setSelectedCallId] = useState('');
  const [disposition, setDisposition] = useState('follow_up_required');
  const [dispositionNote, setDispositionNote] = useState('');
  const [followupChannel, setFollowupChannel] = useState('task');
  const [followupBody, setFollowupBody] = useState('');

  const refresh = useCallback(async () => {
    try {
      setData(await moduleShellApi.callcommand.workspace() as Workspace);
      setError('');
    } catch (caught: any) {
      setError(caught?.error || caught?.message || 'Call workspace could not be loaded.');
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const activeChannel = useMemo(() => data?.channels.find(row => row.status === 'active'), [data]);
  const activeProfile = useMemo(() => data?.profiles.find(row => row.status === 'active'), [data]);
  const matchingConsent = useMemo(
    () => data?.consents.find(row => row.purpose === purpose && !row.revokedAt),
    [data, purpose],
  );
  const selectedCall = useMemo(
    () => data?.calls.find(row => row.id === selectedCallId) ?? data?.calls[0],
    [data, selectedCallId],
  );
  const selectedFollowups = useMemo(
    () => data?.followups.filter(row => row.callId === selectedCall?.id) ?? [],
    [data, selectedCall],
  );

  async function act(name: string, work: () => Promise<unknown>) {
    if (busy) return;
    setBusy(name);
    setError('');
    try { await work(); await refresh(); }
    catch (caught: any) { setError(caught?.error || caught?.message || 'Request failed.'); }
    finally { setBusy(''); }
  }

  const providerLabel = data?.provider.testAdapter
    ? 'Local test adapter · no external contact'
    : data?.provider.configured
      ? `Twilio connected${data.provider.source ? ` · ${data.provider.source}` : ''}`
      : 'Provider disabled · calls fail closed';

  return (
    <main data-testid="shell-callcommand-ai" style={{ padding: space.xxl, maxWidth: 1180, margin: '0 auto', color: semantic.text }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: space.md, alignItems: 'center', marginBottom: space.xl }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'linear-gradient(145deg,#14532d,#22c55e)' }}>
          <Headphones size={24} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <h1 style={{ margin: 0, fontSize: 27 }}>CallCommand AI</h1><ShellLiveBadge />
          </div>
          <p style={{ margin: '4px 0 0', color: semantic.textMuted }}>Consent-first call intake, routing, follow-up, and provider operations.</p>
        </div>
        <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-callcommand-ai" label="Open call console" />
      </header>

      <section data-testid="banner-callcommand-provider" style={{ ...card, display: 'flex', gap: 10, alignItems: 'center', marginBottom: space.lg,
        borderColor: data?.provider.configured || data?.provider.testAdapter ? `${semantic.accentSuccess}66` : `${semantic.accentWarning}66` }}>
        <Radio size={16} color={data?.provider.configured || data?.provider.testAdapter ? semantic.accentSuccess : semantic.accentWarning} />
        <strong>{providerLabel}</strong>
        <span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>Test mode is accepted only when APP_ENV=test.</span>
      </section>

      {error && <div data-testid="text-callcommand-error" role="alert" style={{ ...card, color: semantic.accentDanger, marginBottom: space.lg }}>{error}</div>}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: space.md, marginBottom: space.lg }}>
        {[
          ['Calls', data?.summary.calls ?? 0],
          ['Completed', data?.summary.completed ?? 0],
          ['Failed', data?.summary.failed ?? 0],
          ['Last 24 hours', data?.summary.last24Hours ?? 0],
        ].map(([label, value]) => <div key={String(label)} style={card}><div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{label}</div><div style={{ fontSize: 25, fontWeight: 800 }}>{value}</div></div>)}
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: space.lg }}>
        <div id="callcommand-configuration" style={card}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>1. Call configuration</h2>
          <p style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>Channels own consent language and recording defaults. Profiles own bounded intake behavior.</p>
          {!activeChannel ? (
            <button data-testid="button-callcommand-create-channel" style={button} disabled={!!busy}
              onClick={() => act('channel', () => moduleShellApi.callcommand.createChannel({
                name: 'Primary support line', phone: '+15550001111', timezone: 'America/New_York',
                consentScript: 'This call may be recorded only with your consent. You may ask us to stop at any time.',
                recordingEnabled: false,
              }))}><Plus size={14}/> Create secure channel</button>
          ) : <ConfigRow icon={<PhoneCall size={15}/>} title={activeChannel.name} detail={`${activeChannel.phoneE164 || 'Configured number'} · recordings ${activeChannel.recordingEnabled ? 'enabled' : 'off'}`} />}
          <div style={{ height: 10 }} />
          {!activeProfile ? (
            <button data-testid="button-callcommand-create-profile" style={button} disabled={!!busy}
              onClick={() => act('profile', () => moduleShellApi.callcommand.createProfile({
                name: 'Support intake', mode: 'intake',
                greeting: 'Thanks for calling. I can capture your support request and route it to the team.',
                intakeFields: ['name', 'company', 'callback reason', 'urgency'],
              }))}><Plus size={14}/> Create intake profile</button>
          ) : <ConfigRow icon={<ShieldCheck size={15}/>} title={activeProfile.name} detail={`${activeProfile.mode} · ${(activeProfile.intakeFields || []).length} intake fields`} />}
        </div>

        <form id="callcommand-consent" style={card} onSubmit={event => {
          event.preventDefault();
          void act('consent', () => moduleShellApi.callcommand.grantConsent({
            phone, subjectName: subject, purpose, source: 'authenticated_portal', evidence: consentEvidence,
          }));
        }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>2. Consent ledger</h2>
          <Field label="E.164 phone"><input data-testid="input-callcommand-phone" style={input} value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="Contact name"><input data-testid="input-callcommand-name" style={input} value={subject} onChange={e => setSubject(e.target.value)} /></Field>
          <Field label="Purpose"><select data-testid="select-callcommand-purpose" style={input} value={purpose} onChange={e => setPurpose(e.target.value)}>
            <option value="support">Support</option><option value="service_callback">Service callback</option><option value="appointment">Appointment</option>
          </select></Field>
          <Field label="Evidence"><textarea data-testid="input-callcommand-consent-evidence" style={{ ...input, minHeight: 74 }} value={consentEvidence} onChange={e => setConsentEvidence(e.target.value)} /></Field>
          <button data-testid="button-callcommand-grant-consent" style={button} disabled={!!busy}><ShieldCheck size={14}/> Record consent</button>
          {matchingConsent && <p data-testid="text-callcommand-consent-active" style={{ color: semantic.accentSuccess, marginBottom: 0 }}><CheckCircle2 size={14} style={{ verticalAlign: -2 }}/> Active {purpose} consent is recorded.</p>}
        </form>

        <form id="callcommand-operations" style={card} onSubmit={event => {
          event.preventDefault();
          if (!activeChannel || !activeProfile) return setError('Create a channel and profile first.');
          void act('call', () => moduleShellApi.callcommand.place({
            phone, subjectName: subject, purpose, channelId: activeChannel.id, profileId: activeProfile.id,
            idempotencyKey: `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          }));
        }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>3. Controlled call</h2>
          <p style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>The server rechecks consent, suppression, entitlement, provider state, and rate limits before dialing.</p>
          <button data-testid="button-callcommand-place-test-call" style={button} disabled={!!busy || !activeChannel || !activeProfile || !matchingConsent}>
            <PhoneCall size={14}/> {data?.provider.testAdapter ? 'Run provider test' : 'Place authorized call'}
          </button>
          {!matchingConsent && <p style={{ color: semantic.accentWarning, fontSize: fontSize.sm }}>Record matching consent before a call can be requested.</p>}
          <button type="button" data-testid="button-callcommand-suppress" style={{ ...button, background: semantic.accentDanger, marginLeft: 8 }} disabled={!!busy}
            onClick={() => act('suppress', () => moduleShellApi.callcommand.suppress({ phone, reason: 'Contact requested no further calls.' }))}>
            <Ban size={14}/> Suppress number
          </button>
        </form>
      </section>

      <section id="callcommand-calls" style={{ marginTop: space.xl }}>
        <h2 style={{ fontSize: 19 }}>Recent calls</h2>
        {!data ? <div style={card}>Loading persisted call data…</div> : data.calls.length === 0 ? (
          <div data-testid="text-callcommand-empty" style={{ ...card, color: semantic.textMuted }}>No calls yet. Configure a channel and profile, record consent, then run the accepted provider workflow.</div>
        ) : (
          <div data-testid="list-callcommand-calls" style={{ display: 'grid', gap: space.sm }}>
            {data.calls.map(call => <article data-testid={`row-callcommand-call-${call.id}`} key={call.id} style={{ ...card, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center' }}>
              <Status status={call.status}/>
              <div><strong>{call.subjectName || call.phoneMasked}</strong><div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{call.phoneMasked} · {call.direction} · {call.purpose} · {call.provider}</div>{call.summary && <div style={{ marginTop: 6 }}>{call.summary}</div>}{call.disposition && <div data-testid={`text-callcommand-disposition-${call.id}`} style={{ marginTop: 6, color: semantic.accentSuccess }}>Disposition: {call.disposition.replaceAll('_', ' ')}</div>}</div>
              <span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>Recording: {call.recordingStatus}</span>
            </article>)}
          </div>
        )}
      </section>

      {data && data.calls.length > 0 && (
        <section id="callcommand-review" style={{ marginTop: space.xl, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: space.lg }}>
          <form style={card} onSubmit={event => {
            event.preventDefault();
            if (!selectedCall) return;
            void act('disposition', () => moduleShellApi.callcommand.setDisposition(selectedCall.id, {
              disposition,
              note: dispositionNote || null,
            }));
          }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>4. Operator disposition</h2>
            <p style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>Review a persisted call and record its operational outcome. Notes remain tenant-private.</p>
            <Field label="Call">
              <select data-testid="select-callcommand-review-call" style={input} value={selectedCall?.id ?? ''} onChange={event => setSelectedCallId(event.target.value)}>
                {data.calls.map(call => <option key={call.id} value={call.id}>{call.subjectName || call.phoneMasked} · {call.purpose}</option>)}
              </select>
            </Field>
            <Field label="Disposition">
              <select data-testid="select-callcommand-disposition" style={input} value={disposition} onChange={event => setDisposition(event.target.value)}>
                <option value="resolved">Resolved</option>
                <option value="follow_up_required">Follow-up required</option>
                <option value="transferred">Transferred</option>
                <option value="no_action">No action</option>
                <option value="unreachable">Unreachable</option>
              </select>
            </Field>
            <Field label="Private note">
              <textarea data-testid="input-callcommand-disposition-note" style={{ ...input, minHeight: 74 }} maxLength={500} value={dispositionNote} onChange={event => setDispositionNote(event.target.value)} />
            </Field>
            <button data-testid="button-callcommand-save-disposition" style={button} disabled={!!busy || !selectedCall}><CheckCircle2 size={14}/> Save disposition</button>
          </form>

          <form style={card} onSubmit={event => {
            event.preventDefault();
            if (!selectedCall) return;
            void act('followup', async () => {
              await moduleShellApi.callcommand.draftFollowup(selectedCall.id, {
                channel: followupChannel,
                body: followupBody,
              });
              setFollowupBody('');
            });
          }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>5. Reviewed follow-up</h2>
            <p style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>Draft only. CallCommand does not send a message or execute a task until a reviewed delivery contract is approved.</p>
            <Field label="Channel">
              <select data-testid="select-callcommand-followup-channel" style={input} value={followupChannel} onChange={event => setFollowupChannel(event.target.value)}>
                <option value="task">Operator task</option>
                <option value="sms">SMS draft</option>
                <option value="email">Email draft</option>
              </select>
            </Field>
            <Field label="Draft">
              <textarea data-testid="input-callcommand-followup-body" style={{ ...input, minHeight: 100 }} maxLength={2000} value={followupBody} onChange={event => setFollowupBody(event.target.value)} />
            </Field>
            <button data-testid="button-callcommand-save-followup" style={button} disabled={!!busy || !selectedCall || !followupBody.trim()}><Plus size={14}/> Save review draft</button>
            <div data-testid="list-callcommand-followups" style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              {selectedFollowups.length === 0 ? <span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>No follow-up drafts for this call.</span> : selectedFollowups.map(item => (
                <div key={item.id} style={{ borderTop: `1px solid ${semantic.border}`, paddingTop: 8 }}>
                  <strong>{item.channel} · {item.status}</strong>
                  <div style={{ color: semantic.textMuted, overflowWrap: 'anywhere' }}>{item.body}</div>
                </div>
              ))}
            </div>
          </form>
        </section>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label style={{ display: 'grid', gap: 5, marginBottom: 10, color: semantic.textMuted, fontSize: fontSize.sm }}>{label}{children}</label>;
}
function ConfigRow({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div style={{ display: 'flex', gap: 9, alignItems: 'center', padding: 10, border: `1px solid ${semantic.border}`, borderRadius: radius.sm }}>
    {icon}<div><strong>{title}</strong><div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{detail}</div></div>
  </div>;
}
function Status({ status }: { status: string }) {
  const ok = status === 'completed';
  return <span data-testid={`status-callcommand-${status}`} style={{ padding: '4px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800,
    color: ok ? semantic.accentSuccess : status === 'failed' ? semantic.accentDanger : semantic.accentWarning,
    border: `1px solid ${ok ? semantic.accentSuccess : status === 'failed' ? semantic.accentDanger : semantic.accentWarning}55` }}>{status}</span>;
}
