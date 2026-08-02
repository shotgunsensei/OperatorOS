'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  FileCode2,
  Loader2,
  Plus,
  Save,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { cardStyle, fontSize, radius, semantic, space } from '@/lib/design-tokens';
import { ShellLiveBadge } from './ShellChrome';

type Row = Record<string, any>;
type Workspace = {
  scripts: Row[];
  reviews: Row[];
  downloads: Row[];
  generations: Row[];
  executionSupported: false;
  approvalRequiredForDownload: true;
};
type Detail = {
  script: Row;
  versions: Row[];
  reviews: Row[];
  executionSupported: false;
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  color: semantic.text,
  background: semantic.bg,
  border: `1px solid ${semantic.border}`,
  borderRadius: radius.sm,
  padding: '10px 12px',
  fontSize: fontSize.body,
};

const buttonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  border: 0,
  borderRadius: radius.sm,
  padding: '9px 14px',
  background: semantic.accent,
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  border: `1px solid ${semantic.border}`,
  background: 'transparent',
  color: semantic.text,
};

const languages = ['powershell', 'python', 'batch', 'bash'] as const;
const extensions: Record<string, string> = {
  powershell: 'ps1',
  python: 'py',
  batch: 'bat',
  bash: 'sh',
};

function message(error: unknown, fallback: string) {
  return (error as any)?.error || (error as any)?.message || fallback;
}

function badge(status: string): React.CSSProperties {
  const color = status === 'approved'
    ? semantic.accentSuccess
    : status === 'review'
      ? '#d29922'
      : status === 'retired'
        ? semantic.textMuted
        : semantic.accent;
  return {
    color,
    border: `1px solid ${color}66`,
    background: `${color}15`,
    borderRadius: 999,
    padding: '3px 8px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
  };
}

function downloadName(script: Row) {
  const stem = String(script.name || 'ninjamation-script')
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100) || 'ninjamation-script';
  return `${stem}.${extensions[String(script.language)] ?? 'txt'}`;
}

export default function NinjamationShell() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    language: 'powershell',
    category: 'General',
    riskTier: 'medium',
    content: '',
  });
  const [generateForm, setGenerateForm] = useState({
    prompt: '',
    name: '',
    language: 'powershell',
    category: 'AI generated',
    riskTier: 'medium',
  });

  const load = useCallback(async (preferredId?: string | null) => {
    setError(null);
    try {
      const root = await moduleShellApi.ninjamation.workspace() as Workspace;
      setWorkspace(root);
      const id = preferredId ?? selectedId ?? root.scripts?.[0]?.id ?? null;
      if (id) {
        const next = await moduleShellApi.ninjamation.detail(id) as Detail;
        setDetail(next);
        setSelectedId(id);
        setForm({
          name: next.script.name ?? '',
          description: next.script.description ?? '',
          language: next.script.language ?? 'powershell',
          category: next.script.category ?? 'General',
          riskTier: next.script.riskTier ?? 'medium',
          content: next.script.content ?? '',
        });
      } else {
        setDetail(null);
        setSelectedId(null);
      }
    } catch (caught) {
      setError(message(caught, 'Could not load the Ninjamation library'));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const scripts = workspace?.scripts ?? [];
    return {
      total: scripts.length,
      draft: scripts.filter((row) => row.status === 'draft').length,
      review: scripts.filter((row) => row.status === 'review').length,
      approved: scripts.filter((row) => row.status === 'approved').length,
    };
  }, [workspace]);

  function resetCreate() {
    setSelectedId(null);
    setDetail(null);
    setForm({
      name: '',
      description: '',
      language: 'powershell',
      category: 'General',
      riskTier: 'medium',
      content: '',
    });
    setNotice('New draft ready.');
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        language: form.language as any,
        category: form.category,
        riskTier: form.riskTier as any,
        content: form.content,
      };
      const result = selectedId && detail
        ? await moduleShellApi.ninjamation.update(selectedId, {
            ...payload,
            expectedVersion: detail.script.version,
          }) as any
        : await moduleShellApi.ninjamation.create(payload) as any;
      const id = result.script.id;
      setNotice(selectedId ? 'Draft saved. Any approval was reset for review.' : 'Draft created.');
      await load(id);
    } catch (caught) {
      setError(message(caught, 'Could not save the script'));
    } finally {
      setBusy(null);
    }
  }

  async function lifecycle(action: 'review' | 'approve' | 'reject' | 'retire') {
    if (!detail || busy) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const id = detail.script.id;
      const version = detail.script.version;
      if (action === 'review') await moduleShellApi.ninjamation.submitReview(id, version);
      if (action === 'approve') await moduleShellApi.ninjamation.approve(id, version);
      if (action === 'reject') await moduleShellApi.ninjamation.reject(id, version, 'Changes requested');
      if (action === 'retire') await moduleShellApi.ninjamation.retire(id, version);
      setNotice(
        action === 'review' ? 'Submitted for tenant-admin review.'
          : action === 'approve' ? 'Approved current version for audited download.'
            : action === 'reject' ? 'Returned to draft.'
              : 'Script retired.',
      );
      await load(id);
    } catch (caught) {
      setError(message(caught, `Could not ${action} the script`));
    } finally {
      setBusy(null);
    }
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('generate');
    setError(null);
    setNotice(null);
    try {
      const result = await moduleShellApi.ninjamation.generate({
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `generate-${Date.now()}`,
        prompt: generateForm.prompt,
        name: generateForm.name || undefined,
        language: generateForm.language as any,
        category: generateForm.category,
        riskTier: generateForm.riskTier as any,
      }) as any;
      setGenerateForm((current) => ({ ...current, prompt: '', name: '' }));
      setNotice('AI draft generated. Static findings and human review are required before download.');
      await load(result.script.id);
    } catch (caught) {
      setError(message(caught, 'Could not generate the script'));
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!detail || busy) return;
    setBusy('download');
    setError(null);
    try {
      const blob = await moduleShellApi.ninjamation.download(detail.script.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = downloadName(detail.script);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('Approved version downloaded and recorded in the tenant audit trail.');
      await load(detail.script.id);
    } catch (caught) {
      setError(message(caught, 'Could not download the approved script'));
    } finally {
      setBusy(null);
    }
  }

  const findings = detail?.script?.staticAnalysis?.findings ?? [];

  return (
    <div
      data-testid="shell-ninjamation"
      style={{ padding: space.xxl, maxWidth: 1180, margin: '0 auto' }}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: space.lg }}>
        <FileCode2 size={30} color={semantic.accent} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, color: semantic.text, fontSize: 28 }}>Ninjamation</h1>
            <ShellLiveBadge />
          </div>
          <p style={{ margin: '4px 0 0', color: semantic.textMuted }}>
            Build, review, approve, and download tenant-owned PC automation scripts.
          </p>
        </div>
        <button
          type="button"
          data-testid="button-ninjamation-new"
          onClick={resetCreate}
          style={buttonStyle}
        >
          <Plus size={15} /> New script
        </button>
      </header>

      <div
        role="note"
        data-testid="notice-ninjamation-no-execution"
        style={{
          ...cardStyle,
          marginBottom: space.lg,
          color: '#d29922',
          borderColor: '#d2992266',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <ShieldCheck size={19} />
        <span>
          OperatorOS never executes these scripts. AI and manual scripts remain drafts until
          static analysis and tenant-admin approval are complete; only the approved current
          version can be downloaded.
        </span>
      </div>

      {error && (
        <div
          role="alert"
          data-testid="text-ninjamation-error"
          style={{ ...cardStyle, color: semantic.accentDanger, marginBottom: space.lg }}
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          data-testid="text-ninjamation-notice"
          style={{ ...cardStyle, color: semantic.accentSuccess, marginBottom: space.lg }}
        >
          {notice}
        </div>
      )}

      <section
        id="ninjamation-dashboard"
        data-testid="section-ninjamation-dashboard"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit,minmax(145px,1fr))',
          gap: space.md,
          marginBottom: space.xl,
        }}
      >
        {[
          ['Scripts', counts.total],
          ['Drafts', counts.draft],
          ['In review', counts.review],
          ['Approved', counts.approved],
          ['Downloads', workspace?.downloads?.length ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} style={cardStyle}>
            <div style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>{label}</div>
            <div style={{ color: semantic.text, fontSize: 26, fontWeight: 800 }}>{value}</div>
          </div>
        ))}
      </section>

      {loading ? (
        <div data-testid="text-ninjamation-loading" style={{ ...cardStyle, color: semantic.textMuted }}>
          <Loader2 size={16} /> Loading your script library…
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(230px,0.7fr) minmax(0,2fr)', gap: space.lg }}>
          <aside id="ninjamation-scripts" style={cardStyle}>
            <h2 style={{ color: semantic.text, margin: '0 0 12px', fontSize: fontSize.lg }}>
              Script library
            </h2>
            {(workspace?.scripts?.length ?? 0) === 0 ? (
              <p data-testid="text-ninjamation-empty" style={{ color: semantic.textMuted }}>
                No scripts yet. Create a manual draft or generate one with the testable AI workflow.
              </p>
            ) : (
              <div data-testid="list-ninjamation-scripts" style={{ display: 'grid', gap: 8 }}>
                {workspace!.scripts.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    data-testid={`button-ninjamation-script-${row.id}`}
                    onClick={() => void load(row.id)}
                    style={{
                      textAlign: 'left',
                      border: `1px solid ${selectedId === row.id ? semantic.accent : semantic.border}`,
                      borderRadius: radius.sm,
                      background: selectedId === row.id ? `${semantic.accent}18` : semantic.bg,
                      padding: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ color: semantic.text, fontWeight: 700 }}>{row.name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                      <span style={badge(row.status)}>{row.status}</span>
                      <span style={{ color: semantic.textMuted, fontSize: 11 }}>{row.language}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <main style={{ display: 'grid', gap: space.lg }}>
            <section id="ninjamation-editor" style={cardStyle}>
              <h2 style={{ color: semantic.text, margin: '0 0 12px', fontSize: fontSize.lg }}>
                {selectedId ? 'Script editor' : 'Create a manual draft'}
              </h2>
              <form onSubmit={save} style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                  <input
                    required
                    maxLength={180}
                    aria-label="Script name"
                    data-testid="input-ninjamation-name"
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    placeholder="Script name"
                    style={inputStyle}
                  />
                  <select
                    aria-label="Language"
                    data-testid="select-ninjamation-language"
                    value={form.language}
                    onChange={(event) => setForm({ ...form, language: event.target.value })}
                    style={inputStyle}
                  >
                    {languages.map((value) => <option key={value}>{value}</option>)}
                  </select>
                  <select
                    aria-label="Risk tier"
                    data-testid="select-ninjamation-risk"
                    value={form.riskTier}
                    onChange={(event) => setForm({ ...form, riskTier: event.target.value })}
                    style={inputStyle}
                  >
                    <option value="low">low risk</option>
                    <option value="medium">medium risk</option>
                    <option value="high">high risk</option>
                  </select>
                </div>
                <input
                  maxLength={80}
                  aria-label="Category"
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                  placeholder="Category"
                  style={inputStyle}
                />
                <textarea
                  maxLength={4000}
                  aria-label="Description"
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Purpose, prerequisites, and expected result"
                  rows={2}
                  style={inputStyle}
                />
                <textarea
                  required
                  maxLength={100000}
                  aria-label="Script content"
                  data-testid="textarea-ninjamation-content"
                  value={form.content}
                  onChange={(event) => setForm({ ...form, content: event.target.value })}
                  placeholder="Enter reviewed script source code"
                  rows={14}
                  spellCheck={false}
                  style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <button
                    type="submit"
                    data-testid="button-ninjamation-save"
                    disabled={!!busy}
                    style={buttonStyle}
                  >
                    {busy === 'save' ? <Loader2 size={15} /> : <Save size={15} />}
                    {selectedId ? 'Save new draft version' : 'Create draft'}
                  </button>
                  {detail && <span style={badge(detail.script.status)}>{detail.script.status}</span>}
                  {detail && (
                    <span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                      record v{detail.script.version} · script v{detail.script.currentVersionNumber}
                    </span>
                  )}
                </div>
              </form>
            </section>

            {detail && (
              <section id="ninjamation-review" style={cardStyle}>
                <h2 style={{ color: semantic.text, margin: '0 0 10px', fontSize: fontSize.lg }}>
                  Static analysis and approval
                </h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  <span style={{ color: semantic.textMuted }}>
                    SHA-256: <code>{String(detail.script.contentSha256).slice(0, 16)}…</code>
                  </span>
                  <span style={{ color: semantic.accentDanger }}>
                    {detail.script.staticAnalysis?.criticalCount ?? 0} critical
                  </span>
                  <span style={{ color: '#d29922' }}>
                    {detail.script.staticAnalysis?.warningCount ?? 0} warnings
                  </span>
                </div>
                {findings.length === 0 ? (
                  <div data-testid="text-ninjamation-analysis-clean" style={{ color: semantic.accentSuccess }}>
                    <CheckCircle2 size={15} /> No static rules matched. Human review is still required.
                  </div>
                ) : (
                  <div data-testid="list-ninjamation-findings" style={{ display: 'grid', gap: 7 }}>
                    {findings.map((finding: Row) => (
                      <div
                        key={finding.code}
                        style={{
                          borderLeft: `3px solid ${finding.severity === 'critical' ? semantic.accentDanger : '#d29922'}`,
                          paddingLeft: 9,
                          color: semantic.textMuted,
                        }}
                      >
                        <strong style={{ color: semantic.text }}>{finding.code}</strong>
                        {finding.line ? ` · line ${finding.line}` : ''}: {finding.message}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                  {detail.script.status === 'draft' && (
                    <button
                      type="button"
                      data-testid="button-ninjamation-submit-review"
                      onClick={() => void lifecycle('review')}
                      disabled={!!busy}
                      style={buttonStyle}
                    >
                      <Send size={14} /> Submit for review
                    </button>
                  )}
                  {detail.script.status === 'review' && (
                    <>
                      <button
                        type="button"
                        data-testid="button-ninjamation-approve"
                        onClick={() => void lifecycle('approve')}
                        disabled={!!busy}
                        style={buttonStyle}
                      >
                        <ShieldCheck size={14} /> Tenant admin approve
                      </button>
                      <button
                        type="button"
                        data-testid="button-ninjamation-reject"
                        onClick={() => void lifecycle('reject')}
                        disabled={!!busy}
                        style={secondaryButtonStyle}
                      >
                        <XCircle size={14} /> Request changes
                      </button>
                    </>
                  )}
                  {detail.script.status === 'approved' && (
                    <button
                      type="button"
                      data-testid="button-ninjamation-download"
                      onClick={() => void download()}
                      disabled={!!busy}
                      style={buttonStyle}
                    >
                      <Download size={14} /> Download approved version
                    </button>
                  )}
                  {detail.script.status !== 'retired' && (
                    <button
                      type="button"
                      data-testid="button-ninjamation-retire"
                      onClick={() => void lifecycle('retire')}
                      disabled={!!busy}
                      style={secondaryButtonStyle}
                    >
                      Retire
                    </button>
                  )}
                </div>
              </section>
            )}

            <section id="ninjamation-generations" style={cardStyle}>
              <h2 style={{ color: semantic.text, margin: '0 0 8px', fontSize: fontSize.lg }}>
                <Bot size={18} /> AI draft generator
              </h2>
              <p style={{ color: semantic.textMuted, marginTop: 0 }}>
                Uses the shared OperatorOS provider and usage ledger. Prompts are hashed in the
                Ninjamation generation record; generated code is never auto-approved or executed.
              </p>
              <form onSubmit={generate} style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                  <input
                    maxLength={180}
                    aria-label="Generated script name"
                    value={generateForm.name}
                    onChange={(event) => setGenerateForm({ ...generateForm, name: event.target.value })}
                    placeholder="Optional script name"
                    style={inputStyle}
                  />
                  <select
                    aria-label="Generated script language"
                    value={generateForm.language}
                    onChange={(event) => setGenerateForm({ ...generateForm, language: event.target.value })}
                    style={inputStyle}
                  >
                    {languages.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </div>
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  aria-label="Generation prompt"
                  data-testid="textarea-ninjamation-prompt"
                  value={generateForm.prompt}
                  onChange={(event) => setGenerateForm({ ...generateForm, prompt: event.target.value })}
                  placeholder="Describe the local maintenance task, inputs, validation, safe failure behavior, and expected output."
                  rows={4}
                  style={inputStyle}
                />
                <button
                  type="submit"
                  data-testid="button-ninjamation-generate"
                  disabled={!!busy}
                  style={{ ...buttonStyle, width: 'fit-content' }}
                >
                  {busy === 'generate' ? <Loader2 size={15} /> : <Bot size={15} />}
                  Generate unapproved draft
                </button>
              </form>
            </section>

            <section id="ninjamation-downloads" style={cardStyle}>
              <h2 style={{ color: semantic.text, margin: '0 0 8px', fontSize: fontSize.lg }}>
                Download audit
              </h2>
              {(workspace?.downloads?.length ?? 0) === 0 ? (
                <p style={{ color: semantic.textMuted }}>No approved script downloads recorded.</p>
              ) : (
                <div style={{ display: 'grid', gap: 7 }}>
                  {workspace!.downloads.slice(0, 8).map((row) => (
                    <div key={row.id} style={{ color: semantic.textMuted }}>
                      <Download size={13} /> {row.fileName} · {row.downloadedBy} ·{' '}
                      {new Date(row.createdAt).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      )}
    </div>
  );
}
