'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BarChart3,
  Check,
  Copy,
  Download,
  FileText,
  Layers3,
  Loader2,
  LockKeyhole,
  Palette,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import NinjaLaunchKitShell from './NinjaLaunchKitShell';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';
import CoreSuiteWorkdayBrief from './CoreSuiteWorkdayBrief';
import { buildDeployOpsWorkflowFocus, type DeployOpsExecutionSummary } from '@/lib/companion-workflow';

type Row = Record<string, any>;
type Overview = {
  metrics: { kits: number; archived: number; aiRefined: number };
  kits: Row[];
  exports: Row[];
  brands: Row[];
  usage: { generationCount: number };
  access: { plan: 'free' | 'pro' | 'agency'; limits: Row; source: string };
  sourceCounts: { templates: number; visualPromos: number };
};

const emptyForm = {
  title: '',
  templateSlug: '',
  brandProfileId: '',
  businessName: '',
  businessType: '',
  targetCustomer: '',
  offer: '',
  price: '',
  location: '',
  tone: 'bold',
  painPoint: '',
  desiredAction: 'Get started',
  promoDeadline: '',
  websiteUrl: '',
  socialLinks: '',
  generationMode: 'auto',
};

const panel: React.CSSProperties = {
  border: '1px solid rgba(103,232,249,.22)',
  borderRadius: 18,
  background: 'linear-gradient(145deg,rgba(7,24,43,.96),rgba(7,9,24,.98))',
  boxShadow: '0 18px 44px rgba(0,0,0,.28)',
};
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: 10,
  border: '1px solid rgba(103,232,249,.24)',
  background: '#07111f',
  color: '#fafafa',
  minHeight: 42,
  padding: '10px 12px',
  outline: 'none',
  colorScheme: 'dark',
};
const primary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  minHeight: 42,
  padding: '9px 14px',
  border: 0,
  borderRadius: 10,
  background: 'linear-gradient(135deg,#0284c7,#6d28d9)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};
const secondary: React.CSSProperties = {
  ...primary,
  background: '#10162c',
  border: '1px solid rgba(103,232,249,.25)',
};

function message(error: unknown, fallback: string) {
  return (error as any)?.error || (error as any)?.message || fallback;
}

function slugId() {
  return `ui-${crypto.randomUUID()}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, color: '#d4d4d8', fontSize: 13, fontWeight: 700 }}>
      {label}
      {children}
    </label>
  );
}

function Metric({
  label,
  value,
  Icon,
}: {
  label: string;
  value: React.ReactNode;
  Icon: LucideIcon;
}) {
  return (
    <article style={{ ...panel, padding: 18 }}>
      <Icon size={18} />
      <strong style={{ display: 'block', fontSize: 28, marginTop: 8 }}>{value}</strong>
      <span style={{ color: '#a1a1aa', fontSize: 13 }}>{label}</span>
    </article>
  );
}

function download(content: string, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function NinjaLaunchKitCompleteWorkspace({
  baseUrl,
  routePath,
  embedded = false,
  view = 'overview',
  hrefFor = path => path,
}: {
  baseUrl?: string;
  routePath?: string;
  embedded?: boolean;
  view?: string;
  hrefFor?: (path: string) => string;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [executionSummary, setExecutionSummary] = useState<DeployOpsExecutionSummary | null>(null);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [brand, setBrand] = useState({
    name: '',
    logoText: '',
    primaryColor: '#111827',
    accentColor: '#DC2626',
    voice: '',
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [admin, setAdmin] = useState<Row | null>(null);
  const deepLinkExecution = Boolean(
    routePath && /(?:launches|plan|artifacts|readiness|tasks|milestones|phases)/.test(routePath),
  );
  const [executionOpen, setExecutionOpen] = useState(deepLinkExecution);

  const load = useCallback(
    async (preferredId?: string | null) => {
      setError(null);
      try {
        const [root, catalog, execution] = await Promise.all([
          moduleShellApi.launchkit.productOverview() as Promise<Overview>,
          moduleShellApi.launchkit.productTemplates() as Promise<Row>,
          view === 'overview'
            ? moduleShellApi.launchkit.workspace().catch(() => null) as Promise<Row | null>
            : Promise.resolve(null),
        ]);
        setOverview(root);
        setTemplates(catalog.templates ?? []);
        setExecutionSummary(execution?.summary ?? null);
        const id = preferredId ?? selected?.id ?? root.kits?.[0]?.id;
        if (id) {
          const next = (await moduleShellApi.launchkit.productKit(id)) as Row;
          setSelected(next.kit);
          setDetail(next);
        } else {
          setSelected(null);
          setDetail(null);
        }
      } catch (caught) {
        setError(message(caught, 'Could not load the launch-generation workspace.'));
      } finally {
        setLoading(false);
      }
    },
    [selected?.id],
  );

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (deepLinkExecution) setExecutionOpen(true);
  }, [deepLinkExecution]);

  const formInput = useMemo(
    () => ({
      businessName: form.businessName,
      businessType: form.businessType,
      targetCustomer: form.targetCustomer,
      offer: form.offer,
      price: form.price || undefined,
      location: form.location || undefined,
      tone: form.tone,
      painPoint: form.painPoint,
      desiredAction: form.desiredAction,
      promoDeadline: form.promoDeadline || undefined,
      websiteUrl: form.websiteUrl || undefined,
      socialLinks: form.socialLinks || undefined,
      brandProfileId: form.brandProfileId || undefined,
    }),
    [form],
  );

  function chooseTemplate(template: Row) {
    if (template.locked || !template.prefill) return;
    setForm((current) => ({
      ...current,
      ...template.prefill,
      title: `${template.prefill.businessName} Launch Kit`,
      templateSlug: template.slug,
      price: template.prefill.price ?? '',
      location: template.prefill.location ?? '',
      promoDeadline: template.prefill.promoDeadline ?? '',
      websiteUrl: template.prefill.websiteUrl ?? '',
      socialLinks: template.prefill.socialLinks ?? '',
    }));
    setPreview(null);
    setNotice(`${template.name} loaded into the builder.`);
    document.getElementById('launchkit-builder')?.scrollIntoView({ behavior: 'smooth' });
  }

  async function previewKit() {
    setBusy('preview');
    setError(null);
    try {
      const result = (await moduleShellApi.launchkit.previewProductKit({
        title: form.title || undefined,
        input: formInput,
      })) as Row;
      setPreview(result);
      setNotice('Deterministic preview created without consuming monthly generation capacity.');
    } catch (caught) {
      setError(message(caught, 'Could not preview the release package.'));
    } finally {
      setBusy(null);
    }
  }

  async function createKit(event: React.FormEvent) {
    event.preventDefault();
    setBusy('create');
    setError(null);
    setNotice(null);
    try {
      const result = (await moduleShellApi.launchkit.createProductKit({
        title: form.title || undefined,
        templateSlug: form.templateSlug || undefined,
        input: formInput,
        generationMode: form.generationMode,
        idempotencyKey: slugId(),
      })) as Row;
      setPreview(null);
      setNotice(`Created ${result.kit.title}.`);
      await load(result.kit.id);
    } catch (caught) {
      setError(message(caught, 'Could not create the release package.'));
    } finally {
      setBusy(null);
    }
  }

  async function kitAction(action: 'duplicate' | 'regenerate' | 'archive' | 'restore' | 'delete') {
    if (!selected) return;
    setBusy(action);
    setError(null);
    try {
      if (action === 'duplicate') {
        const result = (await moduleShellApi.launchkit.duplicateProductKit(selected.id, {
          title: `${selected.title} Copy`,
          idempotencyKey: slugId(),
        })) as Row;
        await load(result.kit.id);
      } else if (action === 'regenerate') {
        const result = (await moduleShellApi.launchkit.regenerateProductKit(selected.id, {
          expectedVersion: selected.version,
          generationMode: 'auto',
        })) as Row;
        await load(result.kit.id);
      } else if (action === 'delete') {
        await moduleShellApi.launchkit.deleteProductKit(selected.id);
        setSelected(null);
        setDetail(null);
        await load(null);
      } else {
        const result = (await moduleShellApi.launchkit.productKitAction(
          selected.id,
          action,
        )) as Row;
        await load(result.kit.id);
      }
      setNotice(
        `Release package ${action === 'delete' ? 'moved to undo-safe deleted items' : `${action} complete`}.`,
      );
    } catch (caught) {
      setError(message(caught, `Could not ${action} the release package.`));
    } finally {
      setBusy(null);
    }
  }

  async function createBrand(event: React.FormEvent) {
    event.preventDefault();
    setBusy('brand');
    setError(null);
    try {
      await moduleShellApi.launchkit.createProductBrand(brand);
      setBrand({
        name: '',
        logoText: '',
        primaryColor: '#111827',
        accentColor: '#DC2626',
        voice: '',
      });
      setNotice('Reusable brand profile created.');
      await load(selected?.id);
    } catch (caught) {
      setError(message(caught, 'Could not create the brand profile.'));
    } finally {
      setBusy(null);
    }
  }

  async function exportKit(format: 'txt' | 'markdown' | 'json') {
    if (!selected) return;
    setBusy(`export:${format}`);
    setError(null);
    try {
      const result = (await moduleShellApi.launchkit.exportProductKit(selected.id, {
        format,
        idempotencyKey: slugId(),
      })) as Row;
      download(result.content, result.export.fileName, result.export.mimeType);
      setNotice(
        `${format.toUpperCase()} export generated and recorded with checksum ${result.export.contentSha256}.`,
      );
      await load(selected.id);
    } catch (caught) {
      setError(message(caught, `Could not create the ${format} export.`));
    } finally {
      setBusy(null);
    }
  }

  const plan = overview?.access.plan ?? 'free';
  const lockedVisuals = selected?.visualPromos?.filter((item: Row) => item.locked).length ?? 0;

  return (
    <div
      data-testid="shell-ninja-launch-kit-complete"
      data-launchkit-view={view}
      style={{
        minHeight: '100vh',
        overflowX: 'hidden',
        background: 'radial-gradient(circle at 12% 0%,rgba(2,132,199,.22),transparent 36%),radial-gradient(circle at 88% 8%,rgba(109,40,217,.14),transparent 30%),#020617',
        color: '#fafafa',
        colorScheme: 'dark',
      }}
    >
      <style>{`.nlk-workday-slot{min-width:0;min-height:382px}.nlk-workday-loading{min-height:382px;display:flex;align-items:center;justify-content:center;gap:8px;color:#a1a1aa}@media(max-width:1023px){.nlk-grid{grid-template-columns:1fr!important}.nlk-pad{padding:18px!important}.nlk-nav{width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow-x:auto;flex-wrap:nowrap!important}.nlk-workday-slot,.nlk-workday-loading{min-height:820px}} .nlk-button:focus-visible,.nlk-input:focus-visible{outline:3px solid #67e8f9;outline-offset:2px}[data-launchkit-view] #launchkit-dashboard,[data-launchkit-view] #launchkit-builder,[data-launchkit-view] #launchkit-templates,[data-launchkit-view] #launchkit-kits,[data-launchkit-view] #launchkit-visual-promos,[data-launchkit-view] #launchkit-outputs,[data-launchkit-view] #launchkit-brands,[data-launchkit-view] #launchkit-exports,[data-launchkit-view] #launchkit-account,[data-launchkit-view] #launchkit-execution{display:none}[data-launchkit-view="overview"] #launchkit-dashboard,[data-launchkit-view="projects"] #launchkit-builder,[data-launchkit-view="projects"] #launchkit-kits,[data-launchkit-view="templates"] #launchkit-templates,[data-launchkit-view="brief"] #launchkit-builder,[data-launchkit-view="brief"] #launchkit-brands,[data-launchkit-view="deliverables"] #launchkit-visual-promos,[data-launchkit-view="deliverables"] #launchkit-outputs,[data-launchkit-view="exports"] #launchkit-exports,[data-launchkit-view="settings"] #launchkit-account{display:block}`}</style>
      <div
        className="nlk-pad"
        style={{ maxWidth: 1380, margin: '0 auto', padding: '30px clamp(18px,4vw,52px) 72px' }}
      >
        {!embedded && (
          <header
            style={{
              display: 'flex',
              gap: 18,
              alignItems: 'center',
              flexWrap: 'wrap',
              paddingBottom: 22,
              borderBottom: '1px solid rgba(103,232,249,.2)',
            }}
          >
            <div
              style={{
                width: 54,
                height: 54,
                borderRadius: 16,
                display: 'grid',
                placeItems: 'center',
                background: 'linear-gradient(145deg,#0ea5e9,#6d28d9)',
                boxShadow: '0 0 36px rgba(34,211,238,.22)',
              }}
            >
              <Rocket size={28} />
            </div>
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    fontSize: 11,
                    letterSpacing: '.24em',
                    color: '#fca5a5',
                    fontWeight: 900,
                  }}
                >
                  TACTICAL LAUNCH GENERATION
                </span>
                <ShellLiveBadge />
              </div>
              <h1 style={{ fontSize: 'clamp(28px,5vw,46px)', margin: '4px 0', lineHeight: 1 }}>
                Deploy Ops
              </h1>
              <p style={{ margin: 0, color: '#a1a1aa', maxWidth: 780 }}>
                Build the complete campaign, generate nine production briefs, enforce the plan, and
                export a client-ready launch package from one controlled workspace.
              </p>
            </div>
            <ShellLaunchButton
              baseUrl={baseUrl}
              testId="link-launch-ninja-launch-kit"
              label="Open exact host"
            />
          </header>
        )}

        {!embedded && (
          <nav
            className="nlk-nav"
            aria-label="Deploy Ops product sections"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '16px 0 24px' }}
          >
            {[
              ['dashboard', 'Dashboard'],
              ['builder', 'Builder'],
              ['templates', '20 templates'],
              ['kits', 'Kits'],
              ['visual-promos', 'Visual promos'],
              ['brands', 'Brands'],
              ['exports', 'Exports'],
              ['account', 'Plan'],
              ['admin', 'Admin'],
            ].map(([id, label]) => (
              <a
                key={id}
                href={`#launchkit-${id}`}
                style={{
                  whiteSpace: 'nowrap',
                  color: routePath?.includes(id) ? '#fff' : '#d4d4d8',
                  textDecoration: 'none',
                  border: '1px solid rgba(103,232,249,.2)',
                  background: routePath?.includes(id) ? '#075985' : '#10162c',
                  padding: '8px 11px',
                  borderRadius: 999,
                  fontSize: 13,
                }}
              >
                {label}
              </a>
            ))}
          </nav>
        )}

        {error && (
          <div
            role="alert"
            style={{
              ...panel,
              padding: 14,
              borderColor: '#67e8f9',
              color: '#fecaca',
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}
        {notice && (
          <div
            role="status"
            style={{
              ...panel,
              padding: 14,
              borderColor: '#22c55e',
              color: '#bbf7d0',
              marginBottom: 16,
            }}
          >
            {notice}
          </div>
        )}

        <section id="launchkit-dashboard" tabIndex={-1} aria-labelledby="launchkit-dashboard-title">
          <div
            style={{
              display: 'flex',
              alignItems: 'end',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span
                style={{ color: '#67e8f9', fontWeight: 900, letterSpacing: '.14em', fontSize: 11 }}
              >
                MISSION CONTROL
              </span>
              <h2 id="launchkit-dashboard-title" style={{ margin: '5px 0 16px' }}>
                Launch command dashboard
              </h2>
            </div>
            <span style={{ color: '#a1a1aa' }}>
              {loading
                ? 'Loading verified product records…'
                : `${plan.toUpperCase()} · entitlement from ${overview?.access.source.replaceAll('_', ' ')}`}
            </span>
          </div>
          <div className="nlk-workday-slot" aria-busy={loading} style={{ marginBottom: 18 }}>
            {overview
              ? <CoreSuiteWorkdayBrief
                  moduleId="ninja-launch-kit"
                  eyebrow="Next best release actions"
                  brief={buildDeployOpsWorkflowFocus(overview, executionSummary)}
                  hrefFor={hrefFor}
                />
              : <div className="nlk-workday-loading" role="status"><Loader2 size={18} /> Preparing the next release actions…</div>}
          </div>
          <div
            className="nlk-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 12 }}
          >
            <Metric
              label="Active and archived kits"
              value={overview?.metrics.kits ?? 0}
              Icon={Rocket}
            />
            <Metric
              label="AI-refined kits"
              value={overview?.metrics.aiRefined ?? 0}
              Icon={Sparkles}
            />
            <Metric
              label="Compiler-derived templates"
              value={overview?.sourceCounts.templates ?? 20}
              Icon={Layers3}
            />
            <Metric
              label="Visual promo contracts"
              value={overview?.sourceCounts.visualPromos ?? 9}
              Icon={Palette}
            />
            <Metric
              label="Generations this month"
              value={overview?.usage.generationCount ?? 0}
              Icon={BarChart3}
            />
          </div>
        </section>

        <section
          id="launchkit-builder"
          tabIndex={-1}
          style={{ ...panel, padding: 22, marginTop: 28 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles color="#67e8f9" />
            <div>
              <h2 style={{ margin: 0 }}>Complete launch builder</h2>
              <p style={{ margin: '5px 0 0', color: '#a1a1aa' }}>
                A short business brief becomes landing copy, ads, email/SMS, social, FAQ, CTAs,
                flyer copy, checklist, and nine visual-promo contracts.
              </p>
            </div>
          </div>
          <form
            onSubmit={createKit}
            className="nlk-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
              gap: 14,
              marginTop: 20,
            }}
          >
            <Field label="Kit title">
              <input
                className="nlk-input"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                style={input}
                placeholder="Spring service launch"
              />
            </Field>
            <Field label="Business name">
              <input
                className="nlk-input"
                required
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Business type">
              <input
                className="nlk-input"
                required
                value={form.businessType}
                onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                style={input}
                placeholder="Auto repair shop"
              />
            </Field>
            <Field label="Target customer">
              <input
                className="nlk-input"
                required
                value={form.targetCustomer}
                onChange={(e) => setForm({ ...form, targetCustomer: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Offer">
              <input
                className="nlk-input"
                required
                value={form.offer}
                onChange={(e) => setForm({ ...form, offer: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Price">
              <input
                className="nlk-input"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                style={input}
                placeholder="$29"
              />
            </Field>
            <Field label="Customer pain point">
              <input
                className="nlk-input"
                required
                value={form.painPoint}
                onChange={(e) => setForm({ ...form, painPoint: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Desired action">
              <input
                className="nlk-input"
                required
                value={form.desiredAction}
                onChange={(e) => setForm({ ...form, desiredAction: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Location">
              <input
                className="nlk-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Tone">
              <select
                value={form.tone}
                onChange={(e) => setForm({ ...form, tone: e.target.value })}
                style={input}
              >
                {['bold', 'friendly', 'professional', 'playful', 'urgent', 'premium'].map(
                  (value) => (
                    <option key={value}>{value}</option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Reusable brand">
              <select
                value={form.brandProfileId}
                onChange={(e) => setForm({ ...form, brandProfileId: e.target.value })}
                style={input}
              >
                <option value="">Automatic tactical brand</option>
                {overview?.brands.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Generation policy">
              <select
                value={form.generationMode}
                onChange={(e) => setForm({ ...form, generationMode: e.target.value })}
                style={input}
              >
                <option value="auto">Shared AI with validated fallback</option>
                <option value="deterministic">Deterministic only</option>
                {plan !== 'free' && <option value="ai">Request AI refinement</option>}
              </select>
            </Field>
            <Field label="Website URL">
              <input
                className="nlk-input"
                type="url"
                value={form.websiteUrl}
                onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
                style={input}
                placeholder="https://example.com"
              />
            </Field>
            <Field label="Promo deadline">
              <input
                className="nlk-input"
                value={form.promoDeadline}
                onChange={(e) => setForm({ ...form, promoDeadline: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Social links">
              <input
                className="nlk-input"
                value={form.socialLinks}
                onChange={(e) => setForm({ ...form, socialLinks: e.target.value })}
                style={input}
              />
            </Field>
            <div style={{ gridColumn: '1/-1', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="nlk-button"
                type="button"
                onClick={previewKit}
                disabled={!!busy}
                style={secondary}
              >
                {busy === 'preview' ? <Loader2 size={16} /> : <FileText size={16} />} Preview
                without usage
              </button>
              <button className="nlk-button" type="submit" disabled={!!busy} style={primary}>
                {busy === 'create' ? <Loader2 size={16} /> : <Rocket size={16} />} Generate and
                persist full kit
              </button>
            </div>
          </form>
          {preview && (
            <article style={{ marginTop: 18, borderLeft: '3px solid #67e8f9', paddingLeft: 16 }}>
              <strong>Preview: {preview.content.heroHeadline}</strong>
              <p style={{ color: '#a1a1aa' }}>{preview.content.subheadline}</p>
              <span style={{ color: '#fca5a5', fontSize: 13 }}>
                {preview.visualPromos.filter((item: Row) => !item.locked).length} visual brief(s)
                unlocked · {preview.visualPromos.filter((item: Row) => item.locked).length} locked
                without leaked content
              </span>
            </article>
          )}
        </section>

        <section id="launchkit-templates" tabIndex={-1} style={{ marginTop: 32 }}>
          <div>
            <span
              style={{ color: '#67e8f9', fontWeight: 900, fontSize: 11, letterSpacing: '.14em' }}
            >
              PINNED SOURCE CATALOG
            </span>
            <h2 style={{ margin: '5px 0' }}>All 20 niche templates</h2>
            <p style={{ color: '#a1a1aa', marginTop: 4 }}>
              Search and category metadata remain visible; locked template prefills never cross the
              API boundary.
            </p>
          </div>
          <div
            className="nlk-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,minmax(0,1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            {templates.map((template) => (
              <article
                key={template.slug}
                style={{ ...panel, padding: 16, opacity: template.locked ? 0.72 : 1 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ color: '#fca5a5', fontSize: 11, fontWeight: 800 }}>
                    {template.category}
                  </span>
                  <span style={{ fontSize: 11 }}>
                    {template.locked ? (
                      <LockKeyhole size={14} aria-label="Locked" />
                    ) : (
                      template.tier.toUpperCase()
                    )}
                  </span>
                </div>
                <h3 style={{ margin: '10px 0 6px' }}>{template.name}</h3>
                <p style={{ color: '#a1a1aa', fontSize: 13, minHeight: 58 }}>
                  {template.description}
                </p>
                <button
                  className="nlk-button"
                  disabled={template.locked}
                  onClick={() => chooseTemplate(template)}
                  style={{ ...secondary, width: '100%', opacity: template.locked ? 0.45 : 1 }}
                >
                  {template.locked ? 'Upgrade in OperatorOS' : 'Use in builder'}
                </button>
              </article>
            ))}
          </div>
        </section>

        <section id="launchkit-kits" tabIndex={-1} style={{ marginTop: 32 }}>
          <h2>Launch-kit library</h2>
          {!overview?.kits.length ? (
            <div style={{ ...panel, padding: 20, color: '#a1a1aa' }}>
              No kits yet. Start with a niche template or enter a short business brief.
            </div>
          ) : (
            <div
              className="nlk-grid"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}
            >
              {overview.kits.map((kit) => (
                <button
                  className="nlk-button"
                  key={kit.id}
                  onClick={() => void load(kit.id)}
                  style={{
                    ...panel,
                    padding: 18,
                    color: '#fafafa',
                    textAlign: 'left',
                    cursor: 'pointer',
                    borderColor: selected?.id === kit.id ? '#67e8f9' : 'rgba(103,232,249,.22)',
                  }}
                >
                  <strong>{kit.title}</strong>
                  <span style={{ display: 'block', color: '#a1a1aa', marginTop: 7 }}>
                    {kit.businessType} · {kit.status}
                  </span>
                  <span style={{ display: 'block', color: '#fca5a5', marginTop: 7, fontSize: 12 }}>
                    {kit.generatorMode} · revision {kit.version}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <>
            <section
              id="launchkit-visual-promos"
              tabIndex={-1}
              style={{ ...panel, padding: 22, marginTop: 28 }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <span style={{ color: '#67e8f9', fontSize: 11, fontWeight: 900 }}>
                    SELECTED KIT
                  </span>
                  <h2 style={{ margin: '4px 0' }}>{selected.title}</h2>
                  <p style={{ margin: 0, color: '#a1a1aa' }}>{selected.content.heroHeadline}</p>
                </div>
                <ShieldCheck color="#4ade80" />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                <button
                  className="nlk-button"
                  onClick={() => void kitAction('regenerate')}
                  disabled={!!busy}
                  style={primary}
                >
                  <RefreshCw size={15} /> Regenerate
                </button>
                <button
                  className="nlk-button"
                  onClick={() => void kitAction('duplicate')}
                  disabled={!!busy}
                  style={secondary}
                >
                  <Copy size={15} /> Duplicate
                </button>
                <button
                  className="nlk-button"
                  onClick={() =>
                    void kitAction(selected.status === 'archived' ? 'restore' : 'archive')
                  }
                  disabled={!!busy}
                  style={secondary}
                >
                  {selected.status === 'archived' ? <RotateCcw size={15} /> : <Archive size={15} />}{' '}
                  {selected.status === 'archived' ? 'Restore' : 'Archive'}
                </button>
                <button
                  className="nlk-button"
                  onClick={() => void kitAction('delete')}
                  disabled={!!busy}
                  style={{ ...secondary, color: '#fca5a5' }}
                >
                  <Trash2 size={15} /> Soft delete
                </button>
              </div>
              <div
                className="nlk-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3,minmax(0,1fr))',
                  gap: 12,
                  marginTop: 18,
                }}
              >
                {selected.visualPromos.map((brief: Row) => (
                  <article
                    key={brief.id}
                    style={{
                      border: '1px solid rgba(103,232,249,.18)',
                      borderRadius: 14,
                      padding: 15,
                      background: '#0c0c0e',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{brief.title}</strong>
                      {brief.locked && <LockKeyhole size={16} />}
                    </div>
                    <p style={{ color: '#fca5a5', fontSize: 12 }}>
                      {brief.dimensions || 'Scalable brand system'} · {brief.tools.join(' / ')}
                    </p>
                    {brief.locked ? (
                      <p style={{ color: '#a1a1aa' }}>
                        Locked by the current OperatorOS plan. Brief content is withheld
                        server-side.
                      </p>
                    ) : (
                      <pre
                        style={{
                          whiteSpace: 'pre-wrap',
                          color: '#d4d4d8',
                          font: '12px/1.55 inherit',
                          maxHeight: 210,
                          overflow: 'auto',
                        }}
                      >
                        {brief.brief}
                      </pre>
                    )}
                  </article>
                ))}
              </div>
              {lockedVisuals > 0 && (
                <p style={{ color: '#fca5a5' }}>
                  {lockedVisuals} brief(s) are locked; none contains a hidden brief body.
                </p>
              )}
            </section>

            <section id="launchkit-outputs" tabIndex={-1} style={{ marginTop: 28 }}>
              <h2>Generated campaign assets</h2>
              <div
                className="nlk-grid"
                style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}
              >
                {[
                  [
                    'Landing copy',
                    selected.content.heroHeadline,
                    selected.content.valueProposition,
                  ],
                  [
                    'Ad set',
                    selected.content.adHeadlines.join('\n'),
                    selected.content.adDescriptions.join('\n'),
                  ],
                  [
                    'Email + SMS',
                    selected.content.emailSequence.map((item: Row) => item.subject).join('\n'),
                    selected.content.smsPromos.join('\n'),
                  ],
                  [
                    'Social sequence',
                    selected.content.socialPosts.join('\n'),
                    `${selected.content.socialPosts.length} persisted posts`,
                  ],
                  [
                    'FAQ + CTAs',
                    selected.content.faq.map((item: Row) => item.question).join('\n'),
                    selected.content.ctaButtons.join(' · '),
                  ],
                  [
                    'QR flyer + checklist',
                    selected.content.qrFlyerCopy,
                    selected.content.launchChecklist.join('\n'),
                  ],
                ].map(([title, bodyText, footer]) => (
                  <article key={title} style={{ ...panel, padding: 16 }}>
                    <h3>{title}</h3>
                    <pre
                      style={{
                        whiteSpace: 'pre-wrap',
                        color: '#d4d4d8',
                        font: '13px/1.55 inherit',
                        maxHeight: 190,
                        overflow: 'auto',
                      }}
                    >
                      {bodyText}
                    </pre>
                    <p style={{ color: '#a1a1aa', fontSize: 12 }}>{footer}</p>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <section
          id="launchkit-brands"
          tabIndex={-1}
          style={{ ...panel, padding: 22, marginTop: 28 }}
        >
          <h2>Reusable brand profiles</h2>
          <p style={{ color: '#a1a1aa' }}>
            Free supports 0, Pro supports 5, and Agency supports unlimited profiles. The server
            enforces the cap.
          </p>
          <form
            onSubmit={createBrand}
            className="nlk-grid"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 12 }}
          >
            <Field label="Brand name">
              <input
                required
                value={brand.name}
                onChange={(e) => setBrand({ ...brand, name: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Logo text">
              <input
                value={brand.logoText}
                onChange={(e) => setBrand({ ...brand, logoText: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Primary">
              <input
                type="color"
                value={brand.primaryColor}
                onChange={(e) => setBrand({ ...brand, primaryColor: e.target.value })}
                style={input}
              />
            </Field>
            <Field label="Accent">
              <input
                type="color"
                value={brand.accentColor}
                onChange={(e) => setBrand({ ...brand, accentColor: e.target.value })}
                style={input}
              />
            </Field>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button
                className="nlk-button"
                disabled={plan === 'free' || !!busy}
                style={{ ...primary, width: '100%', opacity: plan === 'free' ? 0.45 : 1 }}
              >
                <Palette size={15} /> Add brand
              </button>
            </div>
          </form>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
            {overview?.brands.map((item) => (
              <span
                key={item.id}
                style={{
                  border: '1px solid rgba(103,232,249,.2)',
                  borderRadius: 999,
                  padding: '8px 12px',
                }}
              >
                <i
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 99,
                    background: item.accentColor,
                    marginRight: 7,
                  }}
                />
                {item.name}
              </span>
            ))}
          </div>
        </section>

        <section
          id="launchkit-exports"
          tabIndex={-1}
          style={{ ...panel, padding: 22, marginTop: 28 }}
        >
          <h2>Audited export vault</h2>
          <p style={{ color: '#a1a1aa' }}>
            Every download is persisted with its exact bytes, checksum, watermark state, white-label
            state, and source kit.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['txt', 'markdown', 'json'] as const).map((format) => (
              <button
                key={format}
                className="nlk-button"
                disabled={
                  !selected ||
                  !(overview?.access.limits.exportFormats ?? []).includes(format) ||
                  !!busy
                }
                onClick={() => void exportKit(format)}
                style={format === 'txt' ? primary : secondary}
              >
                <Download size={15} /> {format.toUpperCase()}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 16 }}>
            {overview?.exports.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 12,
                  padding: '10px 0',
                  borderTop: '1px solid rgba(103,232,249,.12)',
                }}
              >
                <span>
                  {item.fileName}
                  <small style={{ display: 'block', color: '#a1a1aa' }}>{item.contentSha256}</small>
                </span>
                <span>{item.sizeBytes} bytes</span>
              </div>
            ))}
          </div>
        </section>

        <section
          id="launchkit-account"
          tabIndex={-1}
          className="nlk-grid"
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14, marginTop: 28 }}
        >
          <article style={{ ...panel, padding: 22 }}>
            <h2>Plan and usage</h2>
            <p>
              <strong>{plan.toUpperCase()}</strong> is resolved from OperatorOS, not a child billing
              record. OperatorOS remains the billing source of truth.
            </p>
            <ul style={{ color: '#d4d4d8', lineHeight: 1.9 }}>
              <li>
                {overview?.access.limits.kitsPerMonth ?? 'Unlimited'} kit generations per month
              </li>
              <li>{overview?.access.limits.brandProfiles ?? 'Unlimited'} brand profiles</li>
              <li>
                {overview?.access.limits.watermarked
                  ? 'Watermarked exports'
                  : 'Unwatermarked exports'}
              </li>
              <li>
                {overview?.access.limits.whiteLabel
                  ? 'White-label client delivery enabled'
                  : 'White-label delivery locked'}
              </li>
            </ul>
          </article>
          <article id="launchkit-admin" tabIndex={-1} style={{ ...panel, padding: 22 }}>
            <h2>Administration</h2>
            <p style={{ color: '#a1a1aa' }}>
              Tenant and platform statistics require OperatorOS admin authority. Billing and
              entitlement mutation stays in the parent.
            </p>
            <button
              className="nlk-button"
              style={secondary}
              onClick={async () => {
                try {
                  setAdmin((await moduleShellApi.launchkit.productAdmin()) as Row);
                } catch (caught) {
                  setError(message(caught, 'OperatorOS admin role is required.'));
                }
              }}
            >
              <ShieldCheck size={15} /> Load authorized stats
            </button>
            {admin && (
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(admin, null, 2)}</pre>
            )}
          </article>
        </section>

        <details
          id="launchkit-execution"
          open={executionOpen}
          onToggle={(event) => setExecutionOpen(event.currentTarget.open)}
          style={{ ...panel, padding: 18, marginTop: 28 }}
        >
          <summary style={{ cursor: 'pointer', fontWeight: 900 }}>
            Launch execution, review, readiness, tasks, assets, and release proof
          </summary>
          <p style={{ color: '#a1a1aa' }}>
            The restored generation product remains connected to the existing OperatorOS
            launch-execution console instead of erasing it.
          </p>
          <NinjaLaunchKitShell baseUrl={baseUrl} idPrefix="launchkit-execution" />
        </details>
      </div>
    </div>
  );
}
