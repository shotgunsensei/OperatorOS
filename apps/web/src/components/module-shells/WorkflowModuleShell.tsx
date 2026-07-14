'use client';

import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileCheck2, FlaskConical, Megaphone, Plus, Trash2, Wrench, type LucideIcon } from 'lucide-react';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import {
  moduleShellApi,
  type ModuleWorkflowItem,
  type NativeWorkflowModuleSlug,
} from '@/lib/auth';
import { ShellLiveBadge } from './ShellChrome';

const CONFIG: Record<NativeWorkflowModuleSlug, {
  name: string;
  eyebrow: string;
  description: string;
  titleLabel: string;
  titlePlaceholder: string;
  summaryLabel: string;
  summaryPlaceholder: string;
  contextLabel: string;
  contextPlaceholder: string;
  accent: string;
  Icon: LucideIcon;
}> = {
  torqueshed: {
    name: 'TorqueShed', eyebrow: 'Diagnostic case board',
    description: 'Move vehicle concerns through symptoms, testing, repair, and proof of fix.',
    titleLabel: 'Vehicle or system', titlePlaceholder: '2018 Ford F-150 — intermittent misfire',
    summaryLabel: 'Symptoms, codes, and initial theory', summaryPlaceholder: 'P0302 under load; coil swap moved the miss…',
    contextLabel: 'VIN / mileage / work order', contextPlaceholder: 'WO-1042 · 87,200 mi', accent: '#f59e0b', Icon: Wrench,
  },
  faultlinelab: {
    name: 'FaultlineLab', eyebrow: 'Evidence-driven troubleshooting',
    description: 'Capture hard failures as reusable diagnostic labs with evidence and validated conclusions.',
    titleLabel: 'Failure or challenge', titlePlaceholder: 'Branch office loses DNS every afternoon',
    summaryLabel: 'Evidence and working hypothesis', summaryPlaceholder: 'Packet captures show upstream SERVFAIL bursts…',
    contextLabel: 'Domain / environment', contextPlaceholder: 'Networking · Production', accent: '#a855f7', Icon: FlaskConical,
  },
  brandforgeos: {
    name: 'BrandForgeOS', eyebrow: 'Campaign production board',
    description: 'Turn positioning into tenant-owned campaign briefs, production work, review, and publication.',
    titleLabel: 'Campaign or asset set', titlePlaceholder: 'OperatorOS fall launch campaign',
    summaryLabel: 'Objective, audience, and offer', summaryPlaceholder: 'Position the unified app stack for MSP operators…',
    contextLabel: 'Channel / deliverable', contextPlaceholder: 'LinkedIn · 3 ads + landing page', accent: '#ec4899', Icon: Megaphone,
  },
  snapproofos: {
    name: 'SnapProofOS', eyebrow: 'Evidence and verification ledger',
    description: 'Record proof packages, review their context, and preserve a clear verification state.',
    titleLabel: 'Evidence package', titlePlaceholder: 'Rack cleanup — before and after',
    summaryLabel: 'What this evidence proves', summaryPlaceholder: 'Documents cable labeling, airflow clearance, and final port map…',
    contextLabel: 'Reference / source', contextPlaceholder: 'Ticket INC-2841 · onsite photos', accent: '#22d3ee', Icon: FileCheck2,
  },
};

export default function WorkflowModuleShell({ moduleSlug }: { moduleSlug: NativeWorkflowModuleSlug }) {
  const config = CONFIG[moduleSlug];
  const [items, setItems] = useState<ModuleWorkflowItem[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [context, setContext] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await moduleShellApi.workflows.list(moduleSlug);
      setItems(response.items);
      setStatuses(response.statuses);
    } catch (err: any) {
      setError(err?.error || err?.message || `Unable to load ${config.name}`);
    } finally {
      setLoading(false);
    }
  }, [config.name, moduleSlug]);

  useEffect(() => { void load(); }, [load]);

  async function createItem(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 2) return;
    setSaving(true);
    setError(null);
    try {
      const created = await moduleShellApi.workflows.create(moduleSlug, {
        title: title.trim(),
        summary: summary.trim() || null,
        data: { context: context.trim() },
      });
      setItems((current) => [created, ...current]);
      setTitle(''); setSummary(''); setContext('');
    } catch (err: any) {
      setError(err?.error || err?.message || 'Could not create workflow record');
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(item: ModuleWorkflowItem, status: string) {
    setPendingId(item.id);
    setError(null);
    try {
      const updated = await moduleShellApi.workflows.update(moduleSlug, item.id, {
        expectedVersion: item.version,
        status,
      });
      setItems((current) => current.map((row) => row.id === updated.id ? updated : row));
    } catch (err: any) {
      setError(err?.code === 'WORKFLOW_VERSION_CONFLICT'
        ? 'This record changed in another session. Reloaded the latest version.'
        : err?.error || err?.message || 'Could not update status');
      await load();
    } finally {
      setPendingId(null);
    }
  }

  async function removeItem(item: ModuleWorkflowItem) {
    if (typeof window !== 'undefined' && !window.confirm(`Remove “${item.title}”?`)) return;
    setPendingId(item.id);
    setError(null);
    try {
      await moduleShellApi.workflows.delete(moduleSlug, item.id);
      setItems((current) => current.filter((row) => row.id !== item.id));
    } catch (err: any) {
      setError(err?.error || err?.message || 'Could not remove workflow record');
    } finally {
      setPendingId(null);
    }
  }

  const Icon = config.Icon;
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', borderRadius: radius.sm,
    border: `1px solid ${semantic.border}`, background: semantic.bg,
    color: semantic.text, padding: '10px 12px', fontSize: fontSize.body,
  };

  return (
    <main data-testid={`${moduleSlug}-module-shell`} style={{ padding: space.xxl, maxWidth: 1180, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.lg, flexWrap: 'wrap', marginBottom: space.xl }}>
        <div style={{ display: 'flex', gap: space.md }}>
          <div style={{ width: 46, height: 46, borderRadius: radius.md, display: 'grid', placeItems: 'center', background: `${config.accent}18`, border: `1px solid ${config.accent}55` }}>
            <Icon size={23} color={config.accent} />
          </div>
          <div>
            <div style={{ color: config.accent, textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 11, fontWeight: 700 }}>{config.eyebrow}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 3 }}>
              <h1 style={{ margin: 0, color: semantic.text, fontSize: 28 }}>{config.name}</h1><ShellLiveBadge />
            </div>
            <p style={{ color: semantic.textMuted, margin: '7px 0 0', maxWidth: 680 }}>{config.description}</p>
          </div>
        </div>
      </header>

      {error && <div role="alert" style={{ ...cardStyle, borderColor: semantic.accentDanger, color: semantic.accentDanger, marginBottom: space.lg, display: 'flex', gap: 8 }}><AlertTriangle size={18} />{error}</div>}

      <section style={{ display: 'flex', flexWrap: 'wrap', gap: space.lg, alignItems: 'flex-start' }}>
        <form onSubmit={createItem} style={{ ...cardStyle, display: 'grid', gap: space.md, flex: '1 1 290px' }} data-testid={`${moduleSlug}-create-form`}>
          <div><h2 style={{ margin: 0, color: semantic.text, fontSize: 18 }}>New record</h2><p style={{ color: semantic.textMuted, margin: '5px 0 0', fontSize: fontSize.sm }}>Stored inside the active OperatorOS tenant.</p></div>
          <label style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{config.titleLabel}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required placeholder={config.titlePlaceholder} style={{ ...inputStyle, marginTop: 6 }} /></label>
          <label style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{config.summaryLabel}<textarea value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} rows={5} placeholder={config.summaryPlaceholder} style={{ ...inputStyle, marginTop: 6, resize: 'vertical' }} /></label>
          <label style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{config.contextLabel}<input value={context} onChange={(e) => setContext(e.target.value)} maxLength={2000} placeholder={config.contextPlaceholder} style={{ ...inputStyle, marginTop: 6 }} /></label>
          <button type="submit" disabled={saving || title.trim().length < 2} style={{ border: 0, borderRadius: radius.sm, background: config.accent, color: '#071017', padding: '11px 16px', fontWeight: 800, cursor: saving ? 'wait' : 'pointer', opacity: saving || title.trim().length < 2 ? 0.55 : 1, display: 'inline-flex', justifyContent: 'center', gap: 8 }}><Plus size={17} />{saving ? 'Saving…' : 'Create record'}</button>
        </form>

        <div style={{ display: 'grid', gap: space.md, flex: '2 1 360px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h2 style={{ margin: 0, color: semantic.text, fontSize: 18 }}>Active workflow</h2><span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{items.length} record{items.length === 1 ? '' : 's'}</span></div>
          {loading ? <div style={{ ...cardStyle, color: semantic.textMuted }}>Loading tenant workflow…</div> : items.length === 0 ? (
            <div style={{ ...cardStyle, textAlign: 'center', padding: space.xxl, color: semantic.textMuted }} data-testid={`${moduleSlug}-empty-state`}><CheckCircle2 size={28} color={config.accent} style={{ marginBottom: 8 }} /><div>No records yet.</div><div style={{ fontSize: fontSize.sm, marginTop: 4 }}>Create the first tenant-owned workflow record to get started.</div></div>
          ) : items.map((item) => (
            <article key={item.id} style={{ ...cardStyle, borderLeft: `3px solid ${config.accent}` }} data-testid={`${moduleSlug}-workflow-item`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: space.md, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}><h3 style={{ margin: 0, color: semantic.text, fontSize: 16 }}>{item.title}</h3>{item.summary && <p style={{ color: semantic.textMuted, margin: '7px 0', whiteSpace: 'pre-wrap' }}>{item.summary}</p>}{item.data?.context && <div style={{ color: config.accent, fontSize: fontSize.sm }}>{String(item.data.context)}</div>}</div>
                <button aria-label={`Remove ${item.title}`} onClick={() => void removeItem(item)} disabled={pendingId === item.id} style={{ border: 0, background: 'transparent', color: semantic.textMuted, cursor: 'pointer', padding: 4 }}><Trash2 size={16} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space.md, marginTop: space.md, flexWrap: 'wrap' }}>
                <select aria-label={`Status for ${item.title}`} value={item.status} disabled={pendingId === item.id} onChange={(e) => void changeStatus(item, e.target.value)} style={{ ...inputStyle, width: 'auto', textTransform: 'capitalize' }}>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select>
                <span style={{ color: semantic.textMuted, fontSize: 11 }}>v{item.version} · updated {new Date(item.updatedAt).toLocaleDateString()}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
