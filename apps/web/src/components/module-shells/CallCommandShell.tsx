'use client';

/**
 * Task #72 — first-screen for CallCommand AI, backed by the API.
 *
 * The form posts to `/v1/modules/callcommand-ai/calls`, the server runs
 * the (sandboxed) dialer + summary, persists the row, and we re-render
 * the recent-calls list from the server. No more in-memory only state.
 */

import React, { useEffect, useState } from 'react';
import { Phone, PhoneCall, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';
import { moduleShellApi } from '@/lib/auth';

type CallStatus = 'queued' | 'ringing' | 'completed' | 'failed';
interface TestCall {
  id: string;
  phone: string;
  callerName: string;
  persona: string;
  status: CallStatus;
  summary?: string | null;
  createdAt: string;
}

const PERSONAS = [
  { value: 'receptionist', label: 'Receptionist — books appointments' },
  { value: 'qualifier',    label: 'Lead qualifier — discovery questions' },
  { value: 'collector',    label: 'Payment reminder — friendly tone' },
];

export default function CallCommandShell({ baseUrl }: { baseUrl?: string }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<TestCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    moduleShellApi.callcommand.list()
      .then((res: any) => { if (!cancelled) setCalls(res.calls ?? []); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load calls'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
      const msg = err?.message || '';
      if (msg.includes('INVALID_PHONE')) {
        setError('Enter a phone number with country code (e.g. +14155550123).');
      } else {
        setError(msg || 'Could not place call');
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

      <form onSubmit={placeCall} style={{ ...cardStyle, display: 'grid', gap: space.md }}>
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
                {c.summary && (
                  <p style={{ margin: `${space.sm}px 0 0`, color: semantic.textMuted, fontSize: fontSize.sm }}>
                    {c.summary}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
