'use client';

/**
 * Task #72 — first-screen for Ninjamation, backed by the API.
 *
 * Activating a template POSTs to `/v1/modules/ninjamation/automations`,
 * which persists the activation per-tenant AND writes an entry to the
 * activity feed so the activation shows up across the platform.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Workflow, ArrowRight, Play, Check } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';
import { moduleShellApi } from '@/lib/auth';

interface AutomationTemplate {
  id: string;
  name: string;
  trigger: string;
  action: string;
  modules: string[];
}

interface ActivationRow {
  id: string;
  templateId: string;
  name: string;
  trigger: string;
  action: string;
  modules: string[];
  enabled: boolean;
}

const TEMPLATES: AutomationTemplate[] = [
  {
    id: 'tradeflow-photo-ticket',
    name: 'New job → photo request → ticket',
    trigger: 'TradeFlowKit job created',
    action: 'SnapProofOS asks for photos, opens PulseDesk ticket',
    modules: ['TradeFlowKit', 'SnapProofOS', 'PulseDesk'],
  },
  {
    id: 'callcommand-followup',
    name: 'Missed call → SMS follow-up',
    trigger: 'CallCommand AI marks call missed',
    action: 'Send templated SMS, log to CRM after 1h',
    modules: ['CallCommand AI'],
  },
  {
    id: 'studyforge-daily-drill',
    name: 'Daily mastery drill',
    trigger: 'Every weekday at 8am tenant time',
    action: 'StudyForge AI assembles 10-question recall set per learner',
    modules: ['StudyForge AI'],
  },
  {
    id: 'invoice-overdue-escalate',
    name: 'Overdue invoice → owner ping',
    trigger: 'Invoice unpaid >7 days',
    action: 'Notify tenant owner in Slack, schedule reminder call',
    modules: ['Billing', 'CallCommand AI'],
  },
  {
    id: 'launchkit-deploy-announce',
    name: 'New deploy → release note',
    trigger: 'Ninja Launch Kit ships a tool',
    action: 'Generate changelog, post to #releases, tag affected users',
    modules: ['Ninja Launch Kit'],
  },
];

export default function NinjamationShell({ baseUrl }: { baseUrl?: string }) {
  const [activations, setActivations] = useState<ActivationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    moduleShellApi.ninjamation.list()
      .then((res: any) => { if (!cancelled) setActivations(res.automations ?? []); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load automations'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const activeByTemplate = useMemo(() => {
    const map = new Map<string, ActivationRow>();
    for (const a of activations) if (a.enabled) map.set(a.templateId, a);
    return map;
  }, [activations]);

  async function activate(t: AutomationTemplate) {
    if (pending) return;
    setError(null);
    setPending(t.id);
    try {
      const row: ActivationRow = await moduleShellApi.ninjamation.activate({
        templateId: t.id,
        name: t.name,
        trigger: t.trigger,
        action: t.action,
        modules: t.modules,
      });
      setActivations((prev) => {
        const without = prev.filter((p) => p.id !== row.id);
        return [row, ...without];
      });
    } catch (err: any) {
      setError(err?.message || 'Could not activate automation');
    } finally {
      setPending(null);
    }
  }

  async function deactivate(id: string) {
    if (pending) return;
    setError(null);
    setPending(id);
    try {
      await moduleShellApi.ninjamation.deactivate(id);
      setActivations((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Could not deactivate automation');
    } finally {
      setPending(null);
    }
  }

  const activeList = activations.filter((a) => a.enabled);

  return (
    <div style={{ padding: space.xxl, maxWidth: 960, margin: '0 auto' }} data-testid="shell-ninjamation">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
        <Workflow size={28} color={semantic.accent} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Ninjamation</h1>
            <ShellLiveBadge />
          </div>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Pick a starter automation and activate it for your tenant.
          </p>
        </div>
        <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-ninjamation" label="Open the automation canvas" />
      </header>

      {error && (
        <div data-testid="text-ninjamation-error" style={{ ...cardStyle, color: semantic.accentDanger, marginBottom: space.lg, fontSize: fontSize.sm }}>
          {error}
        </div>
      )}

      <section style={{ marginBottom: space.xl }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          Active automations
          <span style={{ marginLeft: 8, color: semantic.textMuted, fontSize: fontSize.sm, fontWeight: 400 }}>
            ({activeList.length})
          </span>
        </h2>
        {loading ? (
          <div data-testid="text-ninjamation-loading" style={{ ...cardStyle, color: semantic.textMuted }}>
            Loading active automations…
          </div>
        ) : activeList.length === 0 ? (
          <div
            data-testid="text-ninjamation-active-empty"
            style={{ ...cardStyle, color: semantic.textMuted, fontSize: fontSize.body }}
          >
            None yet. Activate a template below to spin one up.
          </div>
        ) : (
          <ul data-testid="list-ninjamation-active" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}>
            {activeList.map((t) => (
              <li
                key={t.id}
                data-testid={`row-ninjamation-active-${t.templateId}`}
                style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <Play size={14} color={semantic.accentSuccess} />
                <span style={{ color: '#fff', fontWeight: 600, flex: 1 }}>{t.name}</span>
                <button
                  type="button"
                  data-testid={`button-ninjamation-deactivate-${t.templateId}`}
                  onClick={() => deactivate(t.id)}
                  disabled={pending === t.id}
                  style={{
                    padding: '6px 12px', borderRadius: radius.sm,
                    border: `1px solid ${semantic.border}`, background: 'transparent',
                    color: semantic.textMuted, cursor: pending === t.id ? 'wait' : 'pointer', fontSize: fontSize.sm,
                  }}
                >
                  {pending === t.id ? 'Removing…' : 'Deactivate'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          Starter automations
        </h2>
        <ul
          data-testid="list-ninjamation-templates"
          style={{
            listStyle: 'none', padding: 0, margin: 0,
            display: 'grid', gap: space.lg,
            gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
          }}
        >
          {TEMPLATES.map((t) => {
            const activation = activeByTemplate.get(t.id);
            const on = !!activation;
            const busy = pending === t.id || (activation && pending === activation.id);
            return (
              <li key={t.id} data-testid={`card-ninjamation-template-${t.id}`} style={{ ...cardStyle }}>
                <h3 style={{ margin: 0, color: '#fff', fontSize: fontSize.md, fontWeight: 600 }}>
                  {t.name}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: space.sm, color: semantic.textMuted, fontSize: fontSize.sm }}>
                  <span>{t.trigger}</span>
                  <ArrowRight size={12} />
                  <span>{t.action}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: space.sm }}>
                  {t.modules.map((m) => (
                    <span
                      key={m}
                      style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 999,
                        border: `1px solid ${semantic.border}`, color: semantic.textMuted,
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  data-testid={`button-ninjamation-use-${t.id}`}
                  onClick={() => on && activation ? deactivate(activation.id) : activate(t)}
                  aria-pressed={on}
                  disabled={!!busy}
                  style={{
                    marginTop: space.md,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: radius.sm,
                    border: on ? `1px solid ${semantic.accentSuccess}55` : 'none',
                    background: on ? 'transparent' : semantic.accent,
                    color: on ? semantic.accentSuccess : '#fff',
                    cursor: busy ? 'wait' : 'pointer', fontWeight: 600, fontSize: fontSize.sm,
                  }}
                >
                  {busy ? 'Saving…' : on ? (<><Check size={14} /> Active</>) : 'Use template'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
