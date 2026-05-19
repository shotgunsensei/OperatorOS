'use client';

/**
 * Task #72 — first-screen for CallCommand AI, backed by the API.
 * Task #75 — when a real telephony provider (Twilio) is configured the
 * server returns a `queued`/`ringing` row immediately and emits status
 * updates via webhook. We poll non-terminal calls every few seconds so
 * the shell shows the live progression and the final AI-generated
 * summary once the recording lands.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneCall, CheckCircle2, Clock, AlertTriangle, Link2, Plug, MicOff } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';
import { moduleShellApi } from '@/lib/auth';

type CallStatus = 'queued' | 'ringing' | 'completed' | 'failed';
type TranscriptStatus = 'pending' | 'ready' | 'unavailable';
interface TestCall {
  id: string;
  phone: string;
  callerName: string;
  persona: string;
  status: CallStatus;
  summary?: string | null;
  transcript?: string | null;
  transcriptStatus?: TranscriptStatus | null;
  recordingUrl?: string | null;
  errorMessage?: string | null;
  provider?: string | null;
  createdAt: string;
}

interface CallListResponse { calls: TestCall[] }

interface ConnectResponse {
  url: string;
  connectorId: string;
  connectorName: string;
  instructions: string;
}

const TERMINAL: Record<CallStatus, boolean> = {
  queued: false, ringing: false, completed: true, failed: true,
};

const PERSONAS = [
  { value: 'receptionist', label: 'Receptionist — books appointments' },
  { value: 'qualifier',    label: 'Lead qualifier — discovery questions' },
  { value: 'collector',    label: 'Payment reminder — friendly tone' },
];

// Task #89 — telephony config descriptor returned by the API. `source`
// tells the shell whether credentials came from the Replit connector or
// fall-back env vars; `connectorAvailable` indicates whether the one-click
// connector flow is even reachable from this environment (self-hosted
// installs running outside Replit lack the connector proxy).
interface TelephonyStatus {
  configured: boolean;
  provider: 'twilio';
  source: 'connector' | 'env' | null;
  connectorAvailable: boolean;
  // Task #96 — active Twilio identity so admins can confirm which line
  // will be used before placing a real test call. `accountSid` is masked
  // server-side (e.g. `AC••••1234`); `fromNumber` is the E.164 the call
  // will originate from. Both are null when not configured.
  fromNumber: string | null;
  accountSid: string | null;
}

export default function CallCommandShell({ baseUrl }: { baseUrl?: string }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<TestCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [telephony, setTelephony] = useState<TelephonyStatus | null>(null);
  const [connectPending, setConnectPending] = useState(false);
  const [connectInfo, setConnectInfo] = useState<ConnectResponse | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Re-fetch only the telephony status — used after a successful connect
  // flow and when the window regains focus (the admin likely just
  // finished the OAuth handshake in another tab).
  async function refreshTelephonyStatus() {
    try {
      const res = (await moduleShellApi.callcommand.telephonyStatus()) as TelephonyStatus;
      setTelephony(res);
      return res;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      moduleShellApi.callcommand.list() as Promise<CallListResponse>,
      moduleShellApi.callcommand.telephonyStatus().catch(() => null) as Promise<TelephonyStatus | null>,
    ])
      .then(([listRes, statusRes]) => {
        if (cancelled) return;
        setCalls(listRes?.calls ?? []);
        if (statusRes) setTelephony(statusRes);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load calls'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // When focus returns to the tab, the admin may have just finished
  // adding the Twilio connector in Replit. Re-poll the status so the
  // banner flips green without requiring a manual refresh.
  useEffect(() => {
    if (telephony?.configured) return;
    function onFocus() { void refreshTelephonyStatus(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [telephony?.configured]);

  async function handleConnectTwilio() {
    if (connectPending) return;
    setConnectPending(true);
    setConnectError(null);
    try {
      const res = (await moduleShellApi.callcommand.telephonyConnect()) as ConnectResponse;
      setConnectInfo(res);
      // Open the workspace in a new tab so the admin can drive the
      // Replit integration drawer. We deliberately do not block on it —
      // the focus listener above will pick up the new status when the
      // admin tabs back.
      const { openExternal } = await import('@/lib/launch');
      await openExternal(res.url);
    } catch (err: unknown) {
      const e = err as { code?: string; error?: string; message?: string };
      if (e?.code === 'CONNECTOR_UNAVAILABLE') {
        setConnectError('The Replit connector is not reachable from this environment — use environment variables instead.');
      } else if (e?.code === 'TELEPHONY_ALREADY_CONFIGURED') {
        // Race: someone else configured it between the status poll and
        // the click. Refresh to reflect reality.
        await refreshTelephonyStatus();
      } else {
        setConnectError(e?.error || e?.message || 'Could not start the connect flow.');
      }
    } finally {
      setConnectPending(false);
    }
  }

  // Poll every 3s for any non-terminal call. We only refresh those rows so
  // a long backlog of completed calls does not generate needless traffic.
  useEffect(() => {
    const pending = calls.filter((c) => !TERMINAL[c.status]);
    if (pending.length === 0) {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
      return;
    }
    if (pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      try {
        const updates = await Promise.all(
          pending.map((c) => moduleShellApi.callcommand.get(c.id).catch(() => null)),
        );
        setCalls((prev) =>
          prev.map((row) => {
            const fresh = updates.find((u: any) => u && u.id === row.id);
            return fresh ? (fresh as TestCall) : row;
          }),
        );
      } catch { /* swallow — next tick will retry */ }
    }, 3000);
    return () => {
      if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    };
  }, [calls]);

  async function placeCall(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const row: TestCall = await moduleShellApi.callcommand.place({ phone, name, persona });
      setCalls((prev) => [row, ...prev].slice(0, 20));
      setPhone('');
      setName('');
    } catch (err: any) {
      // apiFetch throws a plain object: `{ status, error, code, ... }`.
      const code: string = err?.code ?? '';
      const fallback: string = err?.error || err?.message || 'Could not place call';
      if (code === 'INVALID_PHONE') {
        setError('Enter a phone number with country code (e.g. +14155550123).');
      } else if (code === 'INVALID_PERSONA') {
        setError('Pick one of the agent personas above.');
      } else if (code === 'CALL_RATE_LIMITED') {
        setError(
          err?.error ||
            'You have placed too many test calls in a short window. Wait a few minutes before trying again.',
        );
      } else if (code === 'TELEPHONY_FAILED') {
        setError(
          err?.message
            ? `Telephony provider rejected the call: ${err.message}`
            : 'The telephony provider rejected the call. Check your Twilio number and credentials.',
        );
        // The server still persisted a `failed` row; refresh the list so it shows.
        try {
          const res: any = await moduleShellApi.callcommand.list();
          setCalls(res.calls ?? []);
        } catch { /* ignore */ }
      } else {
        setError(fallback);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: space.xxl, maxWidth: 960, margin: '0 auto' }} data-testid="shell-callcommand-ai">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
        <Phone size={28} color={semantic.accent} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>CallCommand AI</h1>
            <ShellLiveBadge />
          </div>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Place a sandboxed test call to confirm scripts and routing before going live.
          </p>
        </div>
      </header>

      <TelephonyBanner
        status={telephony}
        connectPending={connectPending}
        connectInfo={connectInfo}
        connectError={connectError}
        onConnect={handleConnectTwilio}
      />

      <form onSubmit={placeCall} style={{ ...cardStyle, display: 'grid', gap: space.md, marginTop: space.md }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff' }}>
          Place a test call
        </h2>

        <div style={{ display: 'grid', gap: space.sm, gridTemplateColumns: '1fr 1fr' }}>
          <Field label="Phone number">
            <input
              data-testid="input-callcommand-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 415 555 0123"
              style={inputStyle}
            />
          </Field>
          <Field label="Caller name (optional)">
            <input
              data-testid="input-callcommand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Agent persona">
          <select
            data-testid="select-callcommand-persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            style={inputStyle}
          >
            {PERSONAS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </Field>

        {error && (
          <div data-testid="text-callcommand-error" style={{ color: semantic.accentDanger, fontSize: fontSize.sm, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
          <button
            type="submit"
            disabled={submitting}
            data-testid="button-callcommand-place-test-call"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: radius.sm, border: 'none',
              background: submitting ? 'rgba(139,148,158,0.4)' : semantic.accent,
              color: '#fff', cursor: submitting ? 'wait' : 'pointer',
              fontWeight: 600, fontSize: fontSize.body,
            }}
          >
            <PhoneCall size={14} /> {submitting ? 'Placing call…' : 'Place test call'}
          </button>
          <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-callcommand-ai" label="Open the call console" />
        </div>
      </form>

      <section style={{ marginTop: space.xl }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          Recent test calls
        </h2>
        {loading ? (
          <div data-testid="text-callcommand-loading" style={{ ...cardStyle, color: semantic.textMuted }}>
            Loading recent calls…
          </div>
        ) : calls.length === 0 ? (
          <div
            data-testid="text-callcommand-empty"
            style={{ ...cardStyle, color: semantic.textMuted, fontSize: fontSize.body }}
          >
            No test calls yet — place one above to see how the agent handles it.
          </div>
        ) : (
          <ul data-testid="list-callcommand-calls" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}>
            {calls.map((c) => (
              <li key={c.id} data-testid={`row-callcommand-call-${c.id}`} style={{ ...cardStyle }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <StatusPill status={c.status} />
                  <div style={{ color: '#fff', fontWeight: 600 }}>{c.phone}</div>
                  <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                    {c.callerName} · {PERSONAS.find((p) => p.value === c.persona)?.label ?? c.persona}
                  </div>
                </div>
                {/* Task #94 — when Twilio never produced a transcript,
                    surface a dedicated badge so users notice the gap
                    instead of skimming past a quiet summary swap. We key
                    the badge off the backend's explicit
                    `transcript_status='unavailable'` signal so a row
                    that is still in-flight (status='completed' but
                    transcript polling not finished) does NOT mislabel
                    itself. */}
                {c.transcriptStatus === 'unavailable' && (
                  <div
                    data-testid={`badge-callcommand-transcript-unavailable-${c.id}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      marginTop: space.sm,
                      padding: '3px 10px', borderRadius: 999,
                      background: `${semantic.accentWarning}1a`,
                      border: `1px solid ${semantic.accentWarning}55`,
                      color: semantic.accentWarning,
                      fontSize: 11, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: 0.4,
                    }}
                  >
                    <MicOff size={12} /> Transcript unavailable
                  </div>
                )}
                {c.summary && (
                  <p
                    data-testid={`text-callcommand-summary-${c.id}`}
                    style={{ margin: `${space.sm}px 0 0`, color: semantic.textMuted, fontSize: fontSize.sm }}
                  >
                    {c.summary}
                  </p>
                )}
                {c.errorMessage && (
                  <p
                    data-testid={`text-callcommand-error-${c.id}`}
                    style={{ margin: `${space.sm}px 0 0`, color: semantic.accentDanger, fontSize: fontSize.sm }}
                  >
                    {c.errorMessage}
                  </p>
                )}
                {c.recordingUrl && (
                  <a
                    data-testid={`link-callcommand-recording-${c.id}`}
                    href={c.recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => {
                      e.preventDefault();
                      import('@/lib/launch').then(({ openExternal }) => openExternal(c.recordingUrl!));
                    }}
                    style={{ display: 'inline-block', marginTop: space.sm, color: semantic.accent, fontSize: fontSize.sm }}
                  >
                    Recording ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Task #89 — surface the telephony config state at the top of the shell.
 * Three modes:
 *   • Not configured + connector available → "Connect Twilio" button that
 *     reveals one-click setup instructions.
 *   • Not configured + connector unavailable (self-hosted) → guidance to
 *     paste the four env vars.
 *   • Configured → a green status pill labelled with the active source
 *     so admins can tell at a glance whether they are on the connector or
 *     legacy env-var path.
 */
function TelephonyBanner({
  status,
  connectPending,
  connectInfo,
  connectError,
  onConnect,
}: {
  status: TelephonyStatus | null;
  connectPending: boolean;
  connectInfo: ConnectResponse | null;
  connectError: string | null;
  onConnect: () => void;
}) {
  if (!status) return null;

  if (status.configured) {
    const label = status.source === 'connector'
      ? 'Twilio connected via Replit integration'
      : 'Twilio connected via environment variables';
    // Task #96 — surface the active from-number (and masked account SID
    // when available) beneath the source label so admins can confirm
    // which Twilio line CallCommand will dial from before placing a real
    // test call. Tenants with multiple Twilio numbers (sandbox vs prod,
    // region-specific) need this to avoid placing test calls on the
    // wrong line.
    const identityParts: string[] = [];
    if (status.fromNumber) identityParts.push(`From ${status.fromNumber}`);
    if (status.accountSid) identityParts.push(status.accountSid);
    const identityLabel = identityParts.join(' · ');
    return (
      <div
        data-testid="banner-telephony-connected"
        style={{
          ...cardStyle,
          display: 'grid', gap: 2,
          background: 'rgba(46,160,67,0.08)',
          border: `1px solid ${semantic.accentSuccess}44`,
          color: semantic.accentSuccess,
          fontSize: fontSize.sm, fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
          <CheckCircle2 size={14} />
          <span data-testid={`text-telephony-source-${status.source ?? 'unknown'}`}>{label}</span>
        </div>
        {identityLabel && (
          <span
            data-testid="text-telephony-identity"
            style={{
              marginLeft: 14 + space.sm,
              fontWeight: 500,
              fontSize: fontSize.xs,
              color: semantic.textMuted,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {identityLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      data-testid="banner-telephony-disconnected"
      style={{
        ...cardStyle,
        background: 'rgba(244,182,68,0.08)',
        border: `1px solid ${semantic.accentWarning}55`,
        color: semantic.text,
        display: 'grid', gap: space.sm,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
        <Plug size={16} color={semantic.accentWarning} />
        <div style={{ flex: 1, fontSize: fontSize.sm, color: semantic.textMuted }}>
          Twilio is not connected — test calls will be simulated with a stub
          response instead of dialing a real number.
        </div>
        {status.connectorAvailable ? (
          <button
            type="button"
            data-testid="button-connect-twilio"
            onClick={onConnect}
            disabled={connectPending}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: radius.sm, border: 'none',
              background: connectPending ? 'rgba(139,148,158,0.4)' : semantic.accent,
              color: '#fff', cursor: connectPending ? 'wait' : 'pointer',
              fontWeight: 600, fontSize: fontSize.sm,
            }}
          >
            <Link2 size={14} /> {connectPending ? 'Opening…' : 'Connect Twilio'}
          </button>
        ) : null}
      </div>

      {connectError && (
        <div
          data-testid="text-connect-twilio-error"
          style={{ color: semantic.accentDanger, fontSize: fontSize.sm }}
        >
          {connectError}
        </div>
      )}

      {connectInfo && (
        <div
          data-testid="panel-connect-twilio-info"
          style={{
            background: semantic.bg,
            border: `1px solid ${semantic.border}`,
            borderRadius: radius.sm,
            padding: space.md,
            color: semantic.textMuted,
            fontSize: fontSize.sm,
            lineHeight: 1.55,
          }}
        >
          <div style={{ color: '#fff', fontWeight: 600, marginBottom: 6 }}>
            Finish the connection in Replit
          </div>
          <p style={{ margin: '0 0 6px' }}>{connectInfo.instructions}</p>
          <a
            href={connectInfo.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-connect-twilio-workspace"
            onClick={(e) => {
              e.preventDefault();
              import('@/lib/launch').then(({ openExternal }) => openExternal(connectInfo.url));
            }}
            style={{ color: semantic.accent }}
          >
            Open the Replit workspace ↗
          </a>
        </div>
      )}

      {!status.connectorAvailable && (
        <div
          data-testid="panel-connect-twilio-envvars"
          style={{
            background: semantic.bg,
            border: `1px solid ${semantic.border}`,
            borderRadius: radius.sm,
            padding: space.md,
            color: semantic.textMuted,
            fontSize: fontSize.sm,
            lineHeight: 1.55,
          }}
        >
          <div style={{ color: '#fff', fontWeight: 600, marginBottom: 6 }}>
            Configure Twilio via environment variables
          </div>
          <p style={{ margin: '0 0 6px' }}>
            The Replit connector proxy is not available in this environment.
            Set the following secrets and restart the API:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li><code>TWILIO_ACCOUNT_SID</code></li>
            <li><code>TWILIO_AUTH_TOKEN</code></li>
            <li><code>TWILIO_FROM_NUMBER</code></li>
            <li><code>TWILIO_PUBLIC_BASE_URL</code> (or <code>APP_URL</code>)</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4, fontSize: fontSize.sm, color: semantic.textMuted }}>
      {label}
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: CallStatus }) {
  const map = {
    queued:    { label: 'Queued',    color: semantic.accentInfo,    icon: <Clock size={12} /> },
    ringing:   { label: 'Ringing',   color: semantic.accentWarning, icon: <PhoneCall size={12} /> },
    completed: { label: 'Completed', color: semantic.accentSuccess, icon: <CheckCircle2 size={12} /> },
    failed:    { label: 'Failed',    color: semantic.accentDanger,  icon: <AlertTriangle size={12} /> },
  }[status];
  return (
    <span
      data-testid={`status-callcommand-${status}`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 999,
        border: `1px solid ${map.color}55`, color: map.color,
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4,
      }}
    >
      {map.icon} {map.label}
    </span>
  );
}

const inputStyle: React.CSSProperties = {
  background: semantic.bg,
  color: semantic.text,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
  padding: '8px 10px',
  fontSize: fontSize.body,
  outline: 'none',
};
