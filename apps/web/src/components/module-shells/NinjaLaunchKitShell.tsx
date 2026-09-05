'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Circle,
  Download,
  FileText,
  Loader2,
  Rocket,
  Sparkles,
  Target,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { ShellWorkspaceBadge, ShellLaunchButton } from './ShellChrome';

type Row = Record<string, any>;
type Workspace = {
  summary: { launches: number; launched: number; overdue: number };
  launches: Row[];
  selected?: Row | null;
  phases?: Row[];
  milestones?: Row[];
  tasks?: Row[];
  artifacts?: Row[];
  exports?: Row[];
  readiness?: {
    score: number;
    complete: number;
    total: number;
    blocked: boolean;
    rules: Row[];
  } | null;
  ai?: { name: string; configured: boolean };
  assets?: Row[];
  timeline?: { events: Row[] };
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  background: semantic.bg,
  color: semantic.text,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
  padding: '10px 12px',
  fontSize: fontSize.body,
};

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: radius.sm,
  padding: '9px 14px',
  background: 'linear-gradient(135deg,#0284c7,#6d28d9)',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

function errorMessage(error: unknown, fallback: string) {
  return (error as any)?.message || fallback;
}

const READ_ONLY_MESSAGE = 'Your Deploy Ops access is read-only. Ask an organization owner or administrator for edit access.';

export default function NinjaLaunchKitShell({
  baseUrl,
  idPrefix,
  canWrite = true,
}: {
  baseUrl?: string;
  idPrefix?: string;
  canWrite?: boolean;
}) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportResult, setExportResult] = useState<Row | null>(null);
  const [externalLaunchConfirmed, setExternalLaunchConfirmed] = useState(false);
  const [externalLaunchEvidence, setExternalLaunchEvidence] = useState('');
  const [form, setForm] = useState({
    title: '',
    productType: 'service',
    templateSlug: '',
    audience: '',
    painPoint: '',
    positioning: '',
    offer: '',
    price: '',
    channels: 'Email, Social',
    targetDate: '',
  });

  const load = useCallback(
    async (preferredId?: string | null) => {
      setError(null);
      try {
        const [root, catalog] = await Promise.all([
          moduleShellApi.launchkit.workspace() as Promise<Workspace>,
          moduleShellApi.launchkit.templates() as Promise<{ templates: Row[] }>,
        ]);
        setTemplates(catalog.templates ?? []);
        const id = preferredId ?? selectedId ?? root.launches?.[0]?.id ?? null;
        if (id) {
          const detail = (await moduleShellApi.launchkit.detail(id)) as Workspace;
          setWorkspace(detail);
          setSelectedId(id);
        } else {
          setWorkspace(root);
          setSelectedId(null);
        }
      } catch (caught) {
        setError(errorMessage(caught, 'Could not load campaign launch workspaces'));
      } finally {
        setLoading(false);
      }
    },
    [selectedId],
  );

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const readiness = workspace?.readiness;
  const selected = workspace?.selected;
  const draftingAvailable = workspace?.ai?.name === 'test'
    || (workspace?.ai?.configured === true && workspace.ai.name !== 'disabled');
  const channels = useMemo(
    () =>
      form.channels
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    [form.channels],
  );
  const sectionId = useCallback((id: string) => (idPrefix ? `${idPrefix}-${id}` : id), [idPrefix]);

  async function createLaunch(event: React.FormEvent) {
    event.preventDefault();
    if (!canWrite) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    if (busy) return;
    setBusy('create');
    setError(null);
    try {
      const response = (await moduleShellApi.launchkit.create({
        title: form.title,
        productType: form.productType,
        templateSlug: form.templateSlug || undefined,
        audience: form.audience || undefined,
        painPoint: form.painPoint || undefined,
        positioning: form.positioning || undefined,
        offer: form.offer || undefined,
        priceMinor: form.price ? Math.round(Number(form.price) * 100) : undefined,
        channels,
        targetDate: form.targetDate || undefined,
      })) as { launch: Row };
      setForm((current) => ({
        ...current,
        title: '',
        audience: '',
        painPoint: '',
        positioning: '',
        offer: '',
        price: '',
      }));
      await load(response.launch.id);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create campaign launch workspace'));
    } finally {
      setBusy(null);
    }
  }

  async function toggleTask(task: Row) {
    if (!canWrite) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    if (busy) return;
    setBusy(`task:${task.id}`);
    setError(null);
    try {
      await moduleShellApi.launchkit.updateTask(task.id, {
        status: task.status === 'complete' ? 'pending' : 'complete',
        expectedVersion: task.version,
      });
      await load(selectedId);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update task'));
    } finally {
      setBusy(null);
    }
  }

  async function advanceArtifact(artifact: Row) {
    if (!canWrite) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    if (busy) return;
    const next =
      artifact.status === 'draft' ? 'review' : artifact.status === 'review' ? 'approved' : 'draft';
    setBusy(`artifact:${artifact.id}`);
    setError(null);
    try {
      await moduleShellApi.launchkit.updateArtifact(artifact.id, {
        status: next,
        expectedVersion: artifact.version,
      });
      await load(selectedId);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update the campaign item'));
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    if (!canWrite) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    if (!draftingAvailable) {
      setError('AI-assisted drafting is not set up. Use the complete campaign builder or ask an administrator to enable the drafting service.');
      return;
    }
    if (!selectedId || busy) return;
    setBusy('generate');
    setError(null);
    try {
      await moduleShellApi.launchkit.generate(
        selectedId,
        `ui-${selectedId}-${selected?.version}-${Date.now()}`,
      );
      await load(selectedId);
      document
        .getElementById(sectionId('launchkit-artifacts'))
        ?.scrollIntoView({ behavior: 'smooth' });
    } catch (caught) {
      setError(errorMessage(caught, 'Could not generate the campaign materials'));
    } finally {
      setBusy(null);
    }
  }

  async function exportLaunch(format: 'json' | 'markdown' | 'csv') {
    if (!canWrite) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    if (!selectedId || busy) return;
    setBusy(`export:${format}`);
    setError(null);
    try {
      const result = (await moduleShellApi.launchkit.export(selectedId, format)) as Row;
      setExportResult(result);
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${selected?.title || 'launch'}.${format === 'markdown' ? 'md' : format}`;
      link.click();
      URL.revokeObjectURL(url);
      await load(selectedId);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create export'));
    } finally {
      setBusy(null);
    }
  }

  async function markLaunched() {
    if (!canWrite) {
      setError(READ_ONLY_MESSAGE);
      return;
    }
    if (!selected || busy) return;
    setBusy('launch');
    setError(null);
    try {
      await moduleShellApi.launchkit.update(selected.id, {
        status: 'launched',
        expectedVersion: selected.version,
        externalLaunchConfirmed,
        externalLaunchEvidence: externalLaunchEvidence.trim(),
      });
      setExternalLaunchConfirmed(false);
      setExternalLaunchEvidence('');
      await load(selected.id);
    } catch (caught) {
      setError(errorMessage(caught, 'The required launch checks are not complete'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-testid="shell-ninja-launch-kit"
      data-can-write={canWrite ? 'true' : 'false'}
      style={{ padding: space.xl, maxWidth: 1240, margin: '0 auto' }}
    >
      <header
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: space.xl,
        }}
      >
        <Rocket size={30} color="#67e8f9" />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ color: '#fff', fontSize: 28, margin: 0 }}>Deploy Ops</h1>
            <ShellWorkspaceBadge />
          </div>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0' }}>
            Plan, produce, review, and confirm that a campaign is ready.
          </p>
        </div>
        <ShellLaunchButton
          baseUrl={baseUrl}
          testId="link-launch-ninja-launch-kit"
          label="Open launch workspace"
        />
      </header>

      {error && (
        <div
          data-testid="text-launchkit-error"
          role="alert"
          style={{
            ...cardStyle,
            borderColor: semantic.accentDanger,
            color: semantic.accentDanger,
            marginBottom: space.lg,
          }}
        >
          <AlertTriangle size={16} style={{ verticalAlign: 'text-bottom', marginRight: 8 }} />
          {error}
        </div>
      )}
      {!canWrite && (
        <div
          data-testid="deployops-execution-read-only"
          role="status"
          style={{ ...cardStyle, borderColor: '#fbbf24', color: '#fde68a', marginBottom: space.lg }}
        >
          Read-only access: you can review campaign plans, launch checks, materials, and saved exports, but changes and new exports are disabled.
        </div>
      )}

      <section
        id={sectionId('launchkit-dashboard')}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
          gap: space.md,
          marginBottom: space.xl,
        }}
      >
        {[
          ['Launches', workspace?.summary?.launches ?? 0, Rocket],
          ['Launched', workspace?.summary?.launched ?? 0, CheckCircle2],
          ['Overdue', workspace?.summary?.overdue ?? 0, CalendarDays],
          ['Launch checks complete', readiness ? `${readiness.score}%` : '—', Target],
        ].map(([label, value, Icon]: any) => (
          <article key={label} style={cardStyle}>
            <Icon size={18} color="#67e8f9" />
            <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, marginTop: 8 }}>
              {value}
            </div>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{label}</div>
          </article>
        ))}
      </section>

      <section id={sectionId('launchkit-builder')} style={{ ...cardStyle, marginBottom: space.xl }}>
        <h2 style={{ color: '#fff', marginTop: 0 }}>Create a campaign launch workspace</h2>
        <form
          onSubmit={createLaunch}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))',
            gap: space.md,
          }}
        >
          <fieldset disabled={!canWrite} style={{ border: 0, padding: 0, margin: 0, display: 'contents' }}>
          <label style={{ color: semantic.textMuted }}>
            Launch name
            <input
              data-testid="input-launchkit-title"
              required
              maxLength={180}
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ color: semantic.textMuted }}>
            Product type
            <input
              data-testid="input-launchkit-product-type"
              required
              maxLength={80}
              value={form.productType}
              onChange={(event) => setForm({ ...form, productType: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label id={sectionId('launchkit-templates')} style={{ color: semantic.textMuted }}>
            Template
            <select
              data-testid="select-launchkit-template"
              value={form.templateSlug}
              onChange={(event) => setForm({ ...form, templateSlug: event.target.value })}
              style={inputStyle}
            >
              <option value="">Blank launch</option>
              {templates.map((template) => (
                <option key={template.slug} value={template.slug}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ color: semantic.textMuted }}>
            Audience
            <input
              data-testid="input-launchkit-audience"
              value={form.audience}
              onChange={(event) => setForm({ ...form, audience: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ color: semantic.textMuted }}>
            Customer problem
            <input
              data-testid="input-launchkit-problem"
              value={form.painPoint}
              onChange={(event) => setForm({ ...form, painPoint: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ color: semantic.textMuted }}>
            Positioning
            <input
              value={form.positioning}
              onChange={(event) => setForm({ ...form, positioning: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ color: semantic.textMuted }}>
            Offer
            <input
              data-testid="input-launchkit-offer"
              value={form.offer}
              onChange={(event) => setForm({ ...form, offer: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ color: semantic.textMuted }}>
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ color: semantic.textMuted }}>
            Channels, comma separated
            <input
              value={form.channels}
              onChange={(event) => setForm({ ...form, channels: event.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={{ color: semantic.textMuted }}>
            Target date
            <input
              type="date"
              value={form.targetDate}
              onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
              style={inputStyle}
            />
          </label>
          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button
              data-testid="button-launchkit-create"
              disabled={busy === 'create' || !canWrite}
              style={{ ...buttonStyle, width: '100%', opacity: busy === 'create' || !canWrite ? 0.6 : 1 }}
            >
              {busy === 'create' ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <Rocket size={15} />
              )}{' '}
              Create launch
            </button>
          </div>
          </fieldset>
        </form>
      </section>

      <section id={sectionId('launchkit-launches')} style={{ marginBottom: space.xl }}>
        <h2 style={{ color: '#fff' }}>Campaign launch workspaces</h2>
        {loading ? (
          <div
            data-testid="text-launchkit-loading"
            style={{ ...cardStyle, color: semantic.textMuted }}
          >
            Loading your launches…
          </div>
        ) : !workspace?.launches?.length ? (
          <div
            data-testid="text-launchkit-empty"
            style={{ ...cardStyle, color: semantic.textMuted }}
          >
            No launches yet. Complete the brief above to create one.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))',
              gap: space.md,
            }}
          >
            {workspace.launches.map((item) => (
              <button
                key={item.id}
                data-testid={`button-launchkit-open-${item.id}`}
                onClick={() => void load(item.id)}
                style={{
                  ...cardStyle,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderColor: item.id === selectedId ? '#67e8f9' : semantic.border,
                }}
              >
                <strong style={{ color: '#fff' }}>{item.title}</strong>
                <div style={{ color: semantic.textMuted, marginTop: 6 }}>
                  {item.productType} · {item.status}
                </div>
                <div style={{ color: semantic.textDim, fontSize: fontSize.sm, marginTop: 5 }}>
                  {item.targetDate || 'Target date not set'}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <>
          <section
            id={sectionId('launchkit-readiness')}
            style={{ ...cardStyle, marginBottom: space.xl }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Target size={25} color="#67e8f9" />
              <div style={{ flex: 1 }}>
                <h2 style={{ color: '#fff', margin: 0 }}>{selected.title}: launch checks</h2>
                <p style={{ color: semantic.textMuted, margin: '4px 0 0' }}>
                  {readiness?.complete ?? 0} of {readiness?.total ?? 0} required items are complete.
                </p>
              </div>
              <strong
                data-testid="text-launchkit-readiness"
                style={{
                  color: readiness?.score === 100 ? semantic.accentSuccess : '#67e8f9',
                  fontSize: 28,
                }}
              >
                {readiness?.score ?? 0}%
              </strong>
              <button
                data-testid="button-launchkit-mark-launched"
                disabled={!canWrite || readiness?.score !== 100 || !!busy || !externalLaunchConfirmed || externalLaunchEvidence.trim().length < 8}
                onClick={markLaunched}
                style={{ ...buttonStyle, opacity: readiness?.score === 100 && externalLaunchConfirmed && externalLaunchEvidence.trim().length >= 8 ? 1 : 0.45 }}
              >
                Record externally confirmed launch
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px,1fr) auto', gap: 12, alignItems: 'end', marginTop: 16 }}>
              <label style={{ display: 'grid', gap: 5, color: semantic.textMuted, fontSize: fontSize.sm }}>
                External confirmation reference
                <input
                  data-testid="input-launchkit-external-evidence"
                  disabled={!canWrite}
                  value={externalLaunchEvidence}
                  onChange={event => setExternalLaunchEvidence(event.target.value)}
                  placeholder="Publishing receipt, campaign URL or post ID, or reviewer and timestamp"
                  maxLength={500}
                  style={inputStyle}
                />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: semantic.textMuted, paddingBottom: 10 }}>
                <input
                  data-testid="checkbox-launchkit-external-confirmed"
                  type="checkbox"
                  disabled={!canWrite}
                  checked={externalLaunchConfirmed}
                  onChange={event => setExternalLaunchConfirmed(event.target.checked)}
                />
                I verified the launch outside Deploy Ops
              </label>
            </div>
            <p style={{ color: semantic.textDim, fontSize: fontSize.sm, margin: '8px 0 0' }}>Deploy Ops prepares the campaign materials; it does not publish them or change another service.</p>
            <div
              style={{
                height: 8,
                borderRadius: 10,
                background: semantic.bg,
                margin: '16px 0',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${readiness?.score ?? 0}%`,
                  height: '100%',
                  background: readiness?.score === 100 ? semantic.accentSuccess : '#67e8f9',
                }}
              />
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))',
                gap: 7,
              }}
            >
              {readiness?.rules?.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    color: rule.complete
                      ? semantic.accentSuccess
                      : rule.blocked
                        ? semantic.accentDanger
                        : semantic.textMuted,
                    fontSize: fontSize.sm,
                  }}
                >
                  {rule.complete ? '✓' : rule.blocked ? '!' : '○'} {rule.label}
                </div>
              ))}
            </div>
          </section>

          <section id={sectionId('launchkit-plan')} style={{ marginBottom: space.xl }}>
            <h2 style={{ color: '#fff' }}>Launch plan and checklist</h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))',
                gap: space.md,
              }}
            >
              {(workspace.phases ?? []).map((phase) => (
                <article key={phase.id} style={cardStyle}>
                  <h3 style={{ color: '#fff', marginTop: 0 }}>{phase.title}</h3>
                  {(workspace.tasks ?? [])
                    .filter((task) => {
                      const milestone = workspace.milestones?.find(
                        (item) => item.id === task.milestoneId,
                      );
                      return milestone?.phaseId === phase.id;
                    })
                    .map((task) => (
                      <button
                        key={task.id}
                        data-testid={`button-launchkit-task-${task.id}`}
                        onClick={() => void toggleTask(task)}
                        disabled={!canWrite || busy === `task:${task.id}`}
                        aria-pressed={task.status === 'complete'}
                        style={{
                          display: 'flex',
                          width: '100%',
                          gap: 8,
                          border: 0,
                          background: 'transparent',
                          color:
                            task.status === 'complete' ? semantic.accentSuccess : semantic.text,
                          padding: '7px 0',
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        {task.status === 'complete' ? (
                          <CheckCircle2 size={17} />
                        ) : (
                          <Circle size={17} />
                        )}
                        <span>{task.title}</span>
                      </button>
                    ))}
                </article>
              ))}
            </div>
          </section>

          <section id={sectionId('launchkit-artifacts')} style={{ marginBottom: space.xl }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ color: '#fff', marginBottom: 4 }}>Campaign materials</h2>
                <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                  Generated content stays draft until review and approval. AI-assisted drafting is{' '}
                  {draftingAvailable ? 'ready' : 'not set up'}.
                </div>
              </div>
              <button
                data-testid="button-launchkit-generate"
                onClick={generate}
                disabled={!canWrite || !draftingAvailable || !!busy}
                title={!draftingAvailable ? 'AI-assisted drafting is not set up. Use the complete campaign builder or ask an administrator for help.' : undefined}
                style={buttonStyle}
              >
                {busy === 'generate' ? <Loader2 size={15} /> : <Sparkles size={15} />} Generate
                draft kit
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))',
                gap: space.md,
                marginTop: space.md,
              }}
            >
              {(workspace.artifacts ?? []).map((artifact) => (
                <article key={artifact.id} style={cardStyle}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <FileText size={17} color="#67e8f9" />
                    <strong style={{ color: '#fff', flex: 1 }}>{artifact.title}</strong>
                    <span
                      style={{
                        color:
                          artifact.status === 'approved'
                            ? semantic.accentSuccess
                            : semantic.textMuted,
                        textTransform: 'uppercase',
                        fontSize: 11,
                      }}
                    >
                      {artifact.status}
                    </span>
                  </div>
                  <pre
                    style={{
                      color: semantic.textMuted,
                      whiteSpace: 'pre-wrap',
                      maxHeight: 160,
                      overflow: 'auto',
                      fontFamily: 'inherit',
                      fontSize: fontSize.sm,
                    }}
                  >
                    {artifact.body}
                  </pre>
                  <button
                    data-testid={`button-launchkit-artifact-${artifact.id}`}
                    onClick={() => void advanceArtifact(artifact)}
                    disabled={!canWrite || artifact.status === 'archived' || !!busy}
                    style={{
                      ...buttonStyle,
                      background: artifact.status === 'approved' ? semantic.bgPanel : '#0284c7',
                    }}
                  >
                    {artifact.status === 'draft'
                      ? 'Send to review'
                      : artifact.status === 'review'
                        ? 'Approve'
                        : 'Return to draft'}
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section
            id={sectionId('launchkit-exports')}
            style={{ ...cardStyle, marginBottom: space.xl }}
          >
            <h2 style={{ color: '#fff', marginTop: 0 }}>Campaign downloads</h2>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['markdown', 'json', 'csv'] as const).map((format) => (
                <button
                  key={format}
                  data-testid={`button-launchkit-export-${format}`}
                  disabled={!canWrite || !!busy}
                  onClick={() => void exportLaunch(format)}
                  style={buttonStyle}
                >
                  <Download size={15} /> {format.toUpperCase()}
                </button>
              ))}
            </div>
            {exportResult && (
              <details
                data-testid="text-launchkit-export-hash"
                style={{ color: semantic.textMuted, overflowWrap: 'anywhere' }}
              >
                <summary>Technical file details</summary>
                <code>SHA-256 {exportResult.export?.contentSha256}</code>
              </details>
            )}
            {!!workspace.exports?.length && (
              <p style={{ color: semantic.textMuted, marginBottom: 0 }}>
                {workspace.exports.length} download(s) ready for this campaign.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
