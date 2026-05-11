'use client';

/**
 * Task #69 — real first-screen for CallCommand AI.
 *
 * Paste-a-number test-call console:
 *   • phone + caller-name input
 *   • persona/script selector
 *   • "Place test call" runs a local simulation (no telephony backend
 *     yet) and appends the call to a recent-calls timeline so the
 *     surface feels live without lying about real outbound dialing.
 *
 * Entitlement is enforced by the parent route ([slug]/page.tsx); this
 * component only renders when the active tenant is unlocked.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Phone, PhoneCall, CheckCircle2, Clock } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';

type CallStatus = 'queued' | 'ringing' | 'completed';
interface TestCall {
  id: string;
  phone: string;
  name: string;
  persona: string;
  startedAt: number;
  status: CallStatus;
  summary?: string;
}

const PERSONAS = [
  { value: 'receptionist', label: 'Receptionist — books appointments' },
  { value: 'qualifier',    label: 'Lead qualifier — discovery questions' },
  { value: 'collector',    label: 'Payment reminder — friendly tone' },
];

function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, '');
  // Accept E.164-ish (+ then 8-15 digits) or 10-15 raw digits.
  if (/^\+\d{8,15}$/.test(digits)) return digits;
  if (/^\d{10,15}$/.test(digits)) return `+${digits}`;
  return null;
}

export default function CallCommandShell({ baseUrl }: { baseUrl?: string }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [persona, setPersona] = useState(PERSONAS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<TestCall[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => {
    // Clear any pending simulation timers when the shell unmounts so we
    // don't call setState on an unmounted component after navigating away.
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  function placeCall(e: React.FormEvent) {
    e.preventDefault();
    const tel = normalisePhone(phone);
    if (!tel) {
      setError('Enter a phone number with country code (e.g. +14155550123).');
      return;
    }
    setError(null);
    const id = `call_${Date.now()}`;
    const call: TestCall = {
      id,
      phone: tel,
      name: name.trim() || 'Unknown caller',
      persona,
      startedAt: Date.now(),
      status: 'queued',
    };
    setCalls((prev) => [call, ...prev].slice(0, 8));
    setPhone(''); setName('');

    // Local-only simulation: queued → ringing → completed.
    timersRef.current.push(setTimeout(() => setCalls((prev) =>
      prev.map((c) => c.id === id ? { ...c, status: 'ringing' } : c)
    ), 700));
    timersRef.current.push(setTimeout(() => setCalls((prev) =>
      prev.map((c) => c.id === id ? {
        ...c,
        status: 'completed',
        summary: personaSummary(persona, call.name),
      } : c)
    ), 2200));
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
          <div data-testid="text-callcommand-error" style={{ color: semantic.accentDanger, fontSize: fontSize.sm }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: space.sm }}>
          <button
            type="submit"
            data-testid="button-callcommand-place-test-call"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: radius.sm, border: 'none',
              background: semantic.accent, color: '#fff', cursor: 'pointer',
              fontWeight: 600, fontSize: fontSize.body,
            }}
          >
            <PhoneCall size={14} /> Place test call
          </button>
          <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-callcommand-ai" label="Open the call console" />
        </div>
      </form>

      <section style={{ marginTop: space.xl }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          Recent test calls
        </h2>
        {calls.length === 0 ? (
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
                    {c.name} · {PERSONAS.find((p) => p.value === c.persona)?.label}
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

function personaSummary(persona: string, who: string): string {
  switch (persona) {
    case 'qualifier':
      return `Qualified ${who}: budget mid-range, decision in 2 weeks. Routed to sales follow-up queue.`;
    case 'collector':
      return `Reminded ${who} of overdue invoice; agreed to pay by Friday. Reminder logged.`;
    default:
      return `Booked appointment for ${who} on the next open Tuesday slot. Confirmation SMS sent.`;
  }
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
