'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  Code2,
  Download,
  FileClock,
  FileCode2,
  Filter,
  GitBranch,
  Heart,
  History,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Star,
  TerminalSquare,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';
import { moduleShellApi } from '@/lib/auth';
import { useModuleDeepLinkTarget } from '@/app/apps/[slug]/ModuleDeepLinkTarget';
import { EmptyState, ErrorState, LoadingState } from '@/components/ExperiencePrimitives';
import { ShellLiveBadge } from './ShellChrome';

type Row = Record<string, any>;
type Section = 'dashboard' | 'library' | 'generate' | 'sync' | 'account' | 'admin';
type Workspace = {
  metrics: Row;
  categories: Row[];
  syncRuns: Row[];
  recentScripts: Row[];
  access: Row;
  planUsage: Row;
  execution: Row;
  catalog: Row;
};
type Library = { scripts: Row[]; page: number; total: number; totalPages: number };
type Detail = {
  script: Row;
  versions: Row[];
  reviews: Row[];
  downloads: Row[];
  syncHistory: Row[];
  favorite: boolean;
  execution: Row;
};

const colors = {
  bg: '#020711',
  panel: '#061025',
  panel2: '#08182e',
  border: 'rgba(56,189,248,.19)',
  text: '#e8f4ff',
  muted: '#8ba3bf',
  blue: '#2997ff',
  blueSoft: '#7dd3fc',
  red: '#ef4444',
  green: '#4ade80',
  amber: '#fbbf24',
  violet: '#a78bfa',
};
const card: React.CSSProperties = {
  border: `1px solid ${colors.border}`,
  borderRadius: 18,
  background: 'linear-gradient(145deg,rgba(8,24,46,.96),rgba(3,10,22,.98))',
  padding: 18,
  boxShadow: '0 18px 54px rgba(0,0,0,.22)',
};
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: `1px solid ${colors.border}`,
  borderRadius: 10,
  background: '#030a17',
  color: colors.text,
  padding: '10px 12px',
  outline: 'none',
};
const button: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: '10px 14px',
  background: 'linear-gradient(135deg,#137ee8,#0754b5)',
  color: '#fff',
  fontWeight: 850,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
};
const secondary: React.CSSProperties = {
  ...button,
  background: 'rgba(41,151,255,.08)',
  border: `1px solid ${colors.border}`,
  color: '#dbeafe',
};

const sections: Array<{ id: Section; label: string; icon: React.ComponentType<any> }> = [
  { id: 'dashboard', label: 'Operations Dashboard', icon: TerminalSquare },
  { id: 'library', label: 'Script Library', icon: FileCode2 },
  { id: 'generate', label: 'AI Drafting', icon: Bot },
  { id: 'sync', label: 'GitHub Sync', icon: GitBranch },
  { id: 'account', label: 'Account', icon: UserRound },
  { id: 'admin', label: 'Admin', icon: Settings2 },
];
const languages = ['powershell', 'python', 'batch', 'bash'] as const;

function errorMessage(error: unknown, fallback: string) {
  return (error as any)?.error || (error as any)?.message || fallback;
}
function date(value: unknown) {
  if (!value) return '—';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf()) ? '—' : parsed.toLocaleString();
}
function badge(value: string): React.CSSProperties {
  const color =
    value === 'approved' || value === 'completed' || value === 'active'
      ? colors.green
      : value === 'failed' || value === 'critical_findings' || value === 'deprecated'
        ? colors.red
        : value === 'review' || value === 'running' || value === 'queued'
          ? colors.amber
          : colors.blueSoft;
  return {
    color,
    border: `1px solid ${color}66`,
    background: `${color}16`,
    borderRadius: 999,
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 900,
    letterSpacing: '.06em',
    textTransform: 'uppercase',
  };
}
function sectionFromTarget(sectionId?: string): Section {
  if (sectionId?.includes('generation')) return 'generate';
  if (
    sectionId?.includes('download') ||
    sectionId?.includes('script') ||
    sectionId?.includes('editor') ||
    sectionId?.includes('review')
  )
    return 'library';
  if (sectionId?.includes('sync')) return 'sync';
  if (sectionId?.includes('account') || sectionId?.includes('billing')) return 'account';
  if (sectionId?.includes('admin')) return 'admin';
  return 'dashboard';
}

function sectionFromView(view?: string): Section {
  if (['library', 'review', 'runs', 'versions'].includes(view || '')) return 'library';
  if (view === 'generate') return 'generate';
  if (view === 'sources') return 'sync';
  if (view === 'settings') return 'account';
  if (view === 'admin') return 'admin';
  return 'dashboard';
}

export default function NinjamationShell({
  routePath,
  embedded = false,
  view,
}: {
  baseUrl?: string;
  routePath?: string;
  embedded?: boolean;
  view?: string;
}) {
  const router = useRouter();
  const deepLink = useModuleDeepLinkTarget();
  const [active, setActive] = useState<Section>(() =>
    view ? sectionFromView(view) : sectionFromTarget(deepLink.sectionId),
  );
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [library, setLibrary] = useState<Library | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [account, setAccount] = useState<Row | null>(null);
  const [admin, setAdmin] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState({
    search: '',
    format: '',
    category: '',
    sort: 'name',
    favoritesOnly: false,
    ownedOnly: false,
    includeDeprecated: false,
  });
  const [generation, setGeneration] = useState({
    prompt: '',
    name: '',
    language: 'powershell',
    category: 'AI generated',
    riskTier: 'medium',
  });
  const [manual, setManual] = useState({
    name: '',
    description: '',
    language: 'powershell',
    category: 'General',
    riskTier: 'medium',
    content: '',
  });
  const routeHref = (path: string) =>
    typeof window !== 'undefined' && window.location.pathname.startsWith('/modules/ninjamation')
      ? `/modules/ninjamation${path}`
      : path;
  const navigateSection = (next: Section) => {
    if (!embedded) {
      setActive(next);
      return;
    }
    router.push(
      routeHref(
        next === 'dashboard'
          ? '/'
          : next === 'sync'
            ? '/sources'
            : next === 'account' || next === 'admin'
              ? '/settings'
              : `/${next}`,
      ),
    );
  };

  const deepScriptId = useMemo(() => {
    const match = /^\/scripts\/([A-Za-z0-9-]+)$/.exec(routePath ?? deepLink.routePath ?? '');
    return match?.[1] ?? null;
  }, [deepLink.routePath, routePath]);

  const loadWorkspace = useCallback(async () => {
    const value = (await moduleShellApi.ninjamation.productWorkspace()) as Workspace;
    setWorkspace(value);
    return value;
  }, []);
  const loadLibrary = useCallback(async () => {
    const value = (await moduleShellApi.ninjamation.productScripts(query)) as Library;
    setLibrary(value);
    return value;
  }, [query]);
  const loadDetail = useCallback(async (id: string) => {
    const value = (await moduleShellApi.ninjamation.productDetail(id)) as Detail;
    setDetail(value);
    setActive('library');
    return value;
  }, []);
  const refresh = useCallback(async () => {
    setError(null);
    try {
      await loadWorkspace();
      if (active === 'library' || deepScriptId) await loadLibrary();
      if (deepScriptId) await loadDetail(deepScriptId);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not load Script Ops'));
    } finally {
      setLoading(false);
    }
  }, [active, deepScriptId, loadDetail, loadLibrary, loadWorkspace]);

  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setActive(view ? sectionFromView(view) : sectionFromTarget(deepLink.sectionId));
  }, [deepLink.sectionId, view]);
  useEffect(() => {
    if (active === 'account' && !account)
      moduleShellApi.ninjamation
        .account()
        .then(setAccount)
        .catch((caught) => setError(errorMessage(caught, 'Could not load account')));
    if (active === 'admin' && !admin)
      moduleShellApi.ninjamation
        .admin()
        .then(setAdmin)
        .catch((caught) => setError(errorMessage(caught, 'Could not load administration')));
  }, [active, account, admin]);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy('search');
    setError(null);
    try {
      await loadLibrary();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not search the script library'));
    } finally {
      setBusy(null);
    }
  }
  async function toggleFavorite() {
    if (!detail || busy) return;
    setBusy('favorite');
    try {
      if (detail.favorite) await moduleShellApi.ninjamation.unfavorite(detail.script.id);
      else await moduleShellApi.ninjamation.favorite(detail.script.id);
      await Promise.all([loadDetail(detail.script.id), loadWorkspace(), loadLibrary()]);
      setNotice(detail.favorite ? 'Removed from saved scripts.' : 'Saved to your favorites.');
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update the favorite'));
    } finally {
      setBusy(null);
    }
  }
  async function copySource() {
    if (!detail?.script.content) return;
    try {
      await navigator.clipboard.writeText(String(detail.script.content));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard permission was not available.');
    }
  }
  async function downloadSource() {
    if (!detail || busy) return;
    setBusy('download');
    setError(null);
    try {
      const blob = await moduleShellApi.ninjamation.productDownload(detail.script.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download =
        detail.script.fileName || `${detail.script.displayName || 'ninjamation-script'}.txt`;
      link.hidden = true;
      document.body.append(link);
      link.click();
      globalThis.setTimeout(() => {
        URL.revokeObjectURL(url);
        link.remove();
      }, 1_000);
      setNotice(
        `Downloaded exact approved version ${detail.script.currentVersionNumber}; SHA-256 ${detail.script.contentSha256}.`,
      );
      await Promise.all([loadDetail(detail.script.id), loadWorkspace()]);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not download the approved script'));
    } finally {
      setBusy(null);
    }
  }
  async function lifecycle(action: 'review' | 'approve' | 'reject' | 'retire') {
    if (!detail || busy) return;
    setBusy(action);
    setError(null);
    try {
      const id = String(detail.script.id),
        version = Number(detail.script.version);
      if (action === 'review') await moduleShellApi.ninjamation.submitReview(id, version);
      if (action === 'approve') await moduleShellApi.ninjamation.approve(id, version);
      if (action === 'reject') await moduleShellApi.ninjamation.reject(id, version);
      if (action === 'retire') await moduleShellApi.ninjamation.retire(id, version);
      setNotice(
        action === 'review'
          ? 'Submitted for organization-admin review.'
          : action === 'approve'
            ? 'Approved current immutable version.'
            : action === 'reject'
              ? 'Returned to draft.'
              : 'Script retired.',
      );
      await Promise.all([loadDetail(id), loadWorkspace(), loadLibrary()]);
    } catch (caught) {
      setError(errorMessage(caught, `Could not ${action} the script`));
    } finally {
      setBusy(null);
    }
  }
  async function generateScript(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('generate');
    setError(null);
    setNotice(null);
    try {
      const result = (await moduleShellApi.ninjamation.productGenerate({
        ...generation,
        language: generation.language as any,
        riskTier: generation.riskTier as any,
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `generate-${Date.now()}`,
      })) as Row;
      setNotice(
        'Validated AI draft created. Static analysis and human approval are still required.',
      );
      setGeneration({ ...generation, prompt: '', name: '' });
      await Promise.all([loadWorkspace(), loadLibrary()]);
      await loadDetail(result.script.id);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not generate the script'));
    } finally {
      setBusy(null);
    }
  }
  async function createManual(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy('manual');
    setError(null);
    try {
      const result = (await moduleShellApi.ninjamation.create({
        ...manual,
        language: manual.language as any,
        riskTier: manual.riskTier as any,
      })) as Row;
      setNotice('Manual script draft created.');
      setManual({ ...manual, name: '', description: '', content: '' });
      await Promise.all([loadWorkspace(), loadLibrary()]);
      await loadDetail(result.script?.id ?? result.id);
    } catch (caught) {
      setError(errorMessage(caught, 'Could not create the draft'));
    } finally {
      setBusy(null);
    }
  }
  async function queueSync() {
    if (busy) return;
    setBusy('sync');
    setError(null);
    try {
      const result = (await moduleShellApi.ninjamation.queueSync({
        idempotencyKey: globalThis.crypto?.randomUUID?.() ?? `sync-${Date.now()}`,
      })) as Row;
      setNotice(
        result.replayed
          ? 'Existing sync request returned.'
          : 'Allowlisted AutomationPacks sync queued through the shared job worker.',
      );
      await loadWorkspace();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not queue GitHub sync'));
    } finally {
      setBusy(null);
    }
  }
  async function retrySync(id: string) {
    if (busy) return;
    setBusy(`retry:${id}`);
    setError(null);
    try {
      await moduleShellApi.ninjamation.retrySync(
        id,
        globalThis.crypto?.randomUUID?.() ?? `retry-${Date.now()}`,
      );
      setNotice('Failed sync queued for bounded retry.');
      await loadWorkspace();
    } catch (caught) {
      setError(errorMessage(caught, 'Could not retry GitHub sync'));
    } finally {
      setBusy(null);
    }
  }
  async function setSchedule(enabled: boolean) {
    if (busy) return;
    setBusy('schedule');
    setError(null);
    try {
      await moduleShellApi.ninjamation.updateSyncSchedule({ intervalSeconds: 86_400, enabled });
      setNotice(
        enabled
          ? 'Daily shared-job synchronization enabled.'
          : 'Automatic synchronization disabled.',
      );
      setAdmin(await moduleShellApi.ninjamation.admin());
    } catch (caught) {
      setError(errorMessage(caught, 'Could not update the sync schedule'));
    } finally {
      setBusy(null);
    }
  }

  const metrics = workspace?.metrics ?? {};
  const selectedFindings = detail?.script.staticAnalysis?.findings ?? [];

  return (
    <div
      data-testid="shell-ninjamation"
      aria-busy={Boolean(busy)}
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 12% 0%,rgba(41,151,255,.16),transparent 34%),radial-gradient(circle at 88% 10%,rgba(185,28,28,.1),transparent 28%),#020711',
        color: colors.text,
        colorScheme: 'dark',
        padding: 'clamp(16px,3vw,34px)',
        boxSizing: 'border-box',
      }}
    >
      {!embedded && (
        <header
          style={{
            maxWidth: 1480,
            margin: '0 auto 18px',
            display: 'flex',
            gap: 16,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 14,
              background: 'linear-gradient(145deg,#1688ff,#06142d)',
              border: '1px solid #38bdf866',
              boxShadow: '0 0 34px #1688ff2f',
            }}
          >
            <TerminalSquare />
          </div>
          <div>
            <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
              <h1 style={{ margin: 0, fontSize: 'clamp(25px,4vw,40px)', letterSpacing: '-.045em' }}>
                SCRIPT OPS
              </h1>
              <ShellLiveBadge />
            </div>
            <p style={{ margin: '4px 0 0', color: colors.muted }}>
              Script intelligence, provenance, review, and controlled delivery.
            </p>
          </div>
          <div
            data-testid="notice-ninjamation-no-execution"
            style={{
              marginLeft: 'auto',
              maxWidth: 460,
              padding: '9px 12px',
              borderRadius: 10,
              background: '#312e8129',
              border: '1px solid #8b5cf666',
              color: '#ddd6fe',
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <LockKeyhole size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Script Ops never executes script source in the browser, web server, or API process.
          </div>
        </header>
      )}

      {!embedded && (
        <nav
          aria-label="Script Ops workspace"
          style={{
            maxWidth: 1480,
            margin: '0 auto 18px',
            display: 'flex',
            gap: 8,
            overflowX: 'auto',
            paddingBottom: 4,
          }}
        >
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-testid={`nav-ninjamation-${id}`}
              onClick={() => navigateSection(id)}
              disabled={Boolean(busy)}
              style={{
                ...secondary,
                whiteSpace: 'nowrap',
                background:
                  active === id
                    ? 'linear-gradient(135deg,#137ee8,#6d28d9)'
                    : 'rgba(41,151,255,.06)',
                borderColor: active === id ? '#2997ff88' : colors.border,
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
      )}

      <div style={{ maxWidth: 1480, margin: '0 auto' }}>
        {error && (
          <div data-testid="text-ninjamation-error" style={{ marginBottom: 14 }}>
            <ErrorState
              title="Script Ops request failed"
              description={error}
              action={
                <button style={secondary} onClick={() => void refresh()}>
                  Try again
                </button>
              }
            />
          </div>
        )}
        {notice && (
          <div
            data-testid="text-ninjamation-notice"
            role="status"
            style={{
              marginBottom: 14,
              padding: '11px 14px',
              borderRadius: 11,
              background: '#14532d3b',
              border: '1px solid #4ade8055',
              color: '#bbf7d0',
            }}
          >
            {notice}
          </div>
        )}
        {loading ? (
          <LoadingState label="Loading the automation arsenal" />
        ) : (
          <>
            {active === 'dashboard' && (
              <section
                id="ninjamation-dashboard"
                data-testid="section-ninjamation-dashboard"
                style={{ display: 'grid', gap: 16 }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
                    gap: 12,
                  }}
                >
                  {[
                    ['Scripts', metrics.scripts ?? 0, FileCode2],
                    ['Approved', metrics.approved ?? 0, ShieldCheck],
                    ['In review', metrics.inReview ?? 0, FileClock],
                    ['Favorites', metrics.favorites ?? 0, Heart],
                    ['Downloads', metrics.downloads ?? 0, Download],
                    ['AI drafts', metrics.generated ?? 0, Bot],
                  ].map(([label, value, Icon]: any) => (
                    <article key={label} style={card}>
                      <Icon size={18} color={colors.blueSoft} />
                      <strong style={{ display: 'block', fontSize: 30, marginTop: 9 }}>
                        {value}
                      </strong>
                      <span style={{ color: colors.muted }}>{label}</span>
                    </article>
                  ))}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,330px),1fr))',
                    gap: 14,
                  }}
                >
                  <article style={card}>
                    <span
                      style={{
                        color: colors.blueSoft,
                        fontWeight: 900,
                        letterSpacing: '.12em',
                        fontSize: 11,
                      }}
                    >
                      CATALOG PROVENANCE
                    </span>
                    <h2>AutomationPacks</h2>
                    <p style={{ color: colors.muted }}>
                      {workspace?.catalog.repository} · {workspace?.catalog.branch}
                    </p>
                    <code style={{ color: '#bfdbfe', overflowWrap: 'anywhere' }}>
                      {workspace?.catalog.pinnedCommit}
                    </code>
                    <p style={{ color: colors.muted, fontSize: 13 }}>
                      Incremental synchronization versions changed files, restores reappearing
                      paths, and deprecates missing paths without destructive deletion.
                    </p>
                    <button style={button} onClick={() => navigateSection('sync')}>
                      <GitBranch size={15} />
                      Open sync control
                    </button>
                  </article>
                  <article style={card}>
                    <span
                      style={{
                        color: colors.blueSoft,
                        fontWeight: 900,
                        letterSpacing: '.12em',
                        fontSize: 11,
                      }}
                    >
                      PLAN + USAGE
                    </span>
                    <h2 style={{ textTransform: 'capitalize' }}>{workspace?.access.plan}</h2>
                    <p style={{ color: colors.muted }}>
                      Downloads this month: {workspace?.planUsage.downloadCount ?? 0}
                      {workspace?.access.limits?.monthlyDownloads === null
                        ? ' · unlimited'
                        : ` / ${workspace?.access.limits?.monthlyDownloads ?? 0}`}
                    </p>
                    <p style={{ color: colors.muted }}>
                      AI generations: {workspace?.planUsage.generationCount ?? 0}
                      {workspace?.access.limits?.monthlyGenerations === null
                        ? ' · unlimited'
                        : ` / ${workspace?.access.limits?.monthlyGenerations ?? 0}`}
                    </p>
                    <a href="/app/billing" style={{ ...button, textDecoration: 'none' }}>
                      Manage in OperatorOS
                    </a>
                  </article>
                  <article style={{ ...card, borderColor: '#8b5cf666' }}>
                    <span
                      style={{
                        color: '#fca5a5',
                        fontWeight: 900,
                        letterSpacing: '.12em',
                        fontSize: 11,
                      }}
                    >
                      EXECUTION BOUNDARY
                    </span>
                    <h2>Library, not remote shell</h2>
                    <p style={{ color: colors.muted }}>
                      Display, review, copy, and download do not imply execution or universal
                      safety. Any future execution must use a separately approved runner-gateway
                      policy and isolated signed jobs.
                    </p>
                    <span style={badge('deprecated')}>web/API execution denied</span>
                  </article>
                </div>
              </section>
            )}

            {active === 'library' && (
              <section id="ninjamation-scripts" style={{ display: 'grid', gap: 14 }}>
                <span id="ninjamation-library" tabIndex={-1} />
                <span id="ninjamation-downloads" tabIndex={-1} />
                <form
                  onSubmit={search}
                  style={{
                    ...card,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))',
                    gap: 9,
                    alignItems: 'end',
                  }}
                >
                  <label>
                    <span style={{ color: colors.muted, fontSize: 12 }}>Search scripts</span>
                    <div style={{ position: 'relative' }}>
                      <Search
                        size={15}
                        style={{ position: 'absolute', left: 11, top: 12, color: colors.muted }}
                      />
                      <input
                        aria-label="Search scripts"
                        data-testid="input-ninjamation-search"
                        value={query.search}
                        onChange={(e) => setQuery({ ...query, search: e.target.value })}
                        style={{ ...input, paddingLeft: 34 }}
                        placeholder="Name, purpose, or category"
                      />
                    </div>
                  </label>
                  <label>
                    <span style={{ color: colors.muted, fontSize: 12 }}>Format</span>
                    <select
                      aria-label="Script format"
                      value={query.format}
                      onChange={(e) => setQuery({ ...query, format: e.target.value })}
                      style={input}
                    >
                      <option value="">All formats</option>
                      {[
                        'powershell',
                        'python',
                        'batch',
                        'bash',
                        'vbscript',
                        'javascript',
                        'typescript',
                        'autohotkey',
                        'registry',
                        'xml',
                        'json',
                        'yaml',
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span style={{ color: colors.muted, fontSize: 12 }}>Category</span>
                    <select
                      aria-label="Script category"
                      value={query.category}
                      onChange={(e) => setQuery({ ...query, category: e.target.value })}
                      style={input}
                    >
                      <option value="">All categories</option>
                      {workspace?.categories.map((row) => (
                        <option key={row.category}>{row.category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span style={{ color: colors.muted, fontSize: 12 }}>Sort</span>
                    <select
                      aria-label="Sort scripts"
                      value={query.sort}
                      onChange={(e) => setQuery({ ...query, sort: e.target.value })}
                      style={input}
                    >
                      <option value="name">Name</option>
                      <option value="updated">Recently updated</option>
                      <option value="newest">Newest</option>
                      <option value="downloads">Most downloaded</option>
                    </select>
                  </label>
                  <button
                    data-testid="button-ninjamation-search"
                    style={button}
                    disabled={busy === 'search'}
                  >
                    <Filter size={15} />
                    {busy === 'search' ? 'Filtering…' : 'Apply'}
                  </button>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                    {[
                      ['favoritesOnly', 'Favorites'],
                      ['ownedOnly', 'My generated'],
                      ['includeDeprecated', 'Include deprecated'],
                    ].map(([key, label]) => (
                      <label
                        key={key}
                        style={{
                          color: colors.muted,
                          fontSize: 13,
                          display: 'inline-flex',
                          gap: 6,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={(query as any)[key]}
                          onChange={(e) => setQuery({ ...query, [key]: e.target.checked })}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </form>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))',
                    gap: 14,
                    alignItems: 'start',
                  }}
                >
                  <aside style={{ ...card, maxHeight: 780, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <h2 style={{ marginTop: 0 }}>Script arsenal</h2>
                      <span style={{ color: colors.muted }}>{library?.total ?? 0}</span>
                    </div>
                    {(library?.scripts.length ?? 0) === 0 ? (
                      <EmptyState
                        title="No matching scripts"
                        description="Change the filters or have an organization administrator synchronize the allowlisted catalog."
                      />
                    ) : (
                      <div
                        data-testid="list-ninjamation-scripts"
                        style={{ display: 'grid', gap: 8 }}
                      >
                        {library?.scripts.map((script) => (
                          <button
                            key={script.id}
                            data-testid={`button-ninjamation-script-${script.id}`}
                            onClick={() =>
                              embedded
                                ? router.push(routeHref(`/scripts/${script.id}`))
                                : void loadDetail(script.id)
                            }
                            style={{
                              textAlign: 'left',
                              border: `1px solid ${detail?.script.id === script.id ? '#2997ff99' : colors.border}`,
                              borderRadius: 12,
                              background: detail?.script.id === script.id ? '#0b2b52' : '#030b19',
                              color: colors.text,
                              padding: 12,
                              cursor: 'pointer',
                            }}
                          >
                            <div
                              style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
                            >
                              <strong>{script.displayName}</strong>
                              {script.favorite && (
                                <Heart size={14} fill="#ef4444" color="#ef4444" />
                              )}
                            </div>
                            <div
                              style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}
                            >
                              <span style={badge(script.status)}>{script.status}</span>
                              <span style={badge(script.language)}>{script.language}</span>
                              {script.syncState === 'deprecated' && (
                                <span style={badge('deprecated')}>deprecated</span>
                              )}
                            </div>
                            <small style={{ color: colors.muted, display: 'block', marginTop: 7 }}>
                              {script.category} · {script.downloadCount} downloads
                            </small>
                          </button>
                        ))}
                      </div>
                    )}
                  </aside>
                  <article id="ninjamation-editor" style={{ ...card, minWidth: 0 }}>
                    {!detail ? (
                      <EmptyState
                        title="Select a script"
                        description="Open a script to inspect inert source, exact checksum, immutable versions, safety metadata, and provenance."
                      />
                    ) : (
                      <>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 12,
                            flexWrap: 'wrap',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <span
                              style={{
                                color: colors.blueSoft,
                                fontSize: 11,
                                fontWeight: 900,
                                letterSpacing: '.12em',
                              }}
                            >
                              {detail.script.category} / {detail.script.language}
                            </span>
                            <h2 style={{ fontSize: 26, margin: '6px 0' }}>
                              {detail.script.displayName}
                            </h2>
                            <p style={{ color: colors.muted }}>{detail.script.description}</p>
                          </div>
                          <button
                            aria-label={detail.favorite ? 'Remove favorite' : 'Add favorite'}
                            style={secondary}
                            onClick={() => void toggleFavorite()}
                          >
                            <Heart
                              size={16}
                              fill={detail.favorite ? '#ef4444' : 'none'}
                              color={detail.favorite ? '#ef4444' : 'currentColor'}
                            />
                            {detail.favorite ? 'Saved' : 'Save'}
                          </button>
                        </div>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
                            gap: 8,
                            margin: '14px 0',
                          }}
                        >
                          {[
                            ['Status', detail.script.status],
                            ['Version', detail.script.currentVersionNumber],
                            ['SHA-256', String(detail.script.contentSha256).slice(0, 16) + '…'],
                            ['Safety', detail.script.safetyStatus],
                            ['Downloads', detail.script.downloadCount],
                            ['Source', detail.script.source],
                          ].map(([label, value]) => (
                            <div
                              key={String(label)}
                              style={{ background: '#020813', borderRadius: 9, padding: 10 }}
                            >
                              <small style={{ color: colors.muted }}>{label}</small>
                              <strong
                                style={{ display: 'block', marginTop: 4, overflowWrap: 'anywhere' }}
                              >
                                {value}
                              </strong>
                            </div>
                          ))}
                        </div>
                        <div style={{ position: 'relative' }}>
                          <div
                            style={{
                              position: 'absolute',
                              right: 9,
                              top: 9,
                              display: 'flex',
                              gap: 7,
                            }}
                          >
                            <button
                              data-testid="button-ninjamation-copy"
                              aria-label="Copy script source"
                              style={secondary}
                              onClick={() => void copySource()}
                            >
                              {copied ? <Check size={14} /> : <Clipboard size={14} />}{' '}
                              {copied ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <pre
                            data-testid="code-ninjamation-source"
                            style={{
                              background: '#01050c',
                              border: '1px solid #183657',
                              borderRadius: 12,
                              padding: '56px 16px 16px',
                              overflow: 'auto',
                              maxHeight: 500,
                              fontSize: 13,
                              lineHeight: 1.55,
                            }}
                          >
                            <code>{detail.script.content}</code>
                          </pre>
                        </div>
                        <div
                          id="ninjamation-review"
                          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
                        >
                          {detail.script.status === 'draft' && (
                            <button
                              data-testid="button-ninjamation-submit-review"
                              style={button}
                              onClick={() => void lifecycle('review')}
                              disabled={Boolean(busy)}
                            >
                              <Send size={14} />
                              Submit for review
                            </button>
                          )}
                          {detail.script.status === 'review' && (
                            <>
                              <button
                                data-testid="button-ninjamation-approve"
                                style={{ ...button, background: '#166534' }}
                                onClick={() => void lifecycle('approve')}
                                disabled={Boolean(busy)}
                              >
                                <ShieldCheck size={14} />
                                Admin approve
                              </button>
                              <button
                                data-testid="button-ninjamation-reject"
                                style={{ ...secondary, color: '#fecaca' }}
                                onClick={() => void lifecycle('reject')}
                                disabled={Boolean(busy)}
                              >
                                <XCircle size={14} />
                                Return to draft
                              </button>
                            </>
                          )}
                          {detail.script.status === 'approved' && (
                            <button
                              data-testid="button-ninjamation-download"
                              style={{
                                ...button,
                                background: 'linear-gradient(135deg,#15803d,#166534)',
                              }}
                              onClick={() => void downloadSource()}
                              disabled={Boolean(busy)}
                            >
                              <Download size={14} />
                              {busy === 'download' ? 'Preparing…' : 'Download verified version'}
                            </button>
                          )}
                          {detail.script.status !== 'retired' && (
                            <button
                              data-testid="button-ninjamation-retire"
                              style={{ ...secondary, color: '#fecaca' }}
                              onClick={() => void lifecycle('retire')}
                              disabled={Boolean(busy)}
                            >
                              <AlertTriangle size={14} />
                              Retire
                            </button>
                          )}
                        </div>
                        <div
                          style={{
                            marginTop: 18,
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
                            gap: 12,
                          }}
                        >
                          <section style={{ background: '#020813', borderRadius: 12, padding: 13 }}>
                            <h3>
                              <ShieldCheck size={16} /> Safety analysis
                            </h3>
                            {selectedFindings.length === 0 ? (
                              <p
                                data-testid="text-ninjamation-analysis-clean"
                                style={{ color: colors.green }}
                              >
                                <CheckCircle2 size={14} /> No static rule matched. Human review
                                remains required.
                              </p>
                            ) : (
                              selectedFindings.map((finding: Row, index: number) => (
                                <p
                                  key={`${finding.code}-${index}`}
                                  style={{
                                    color:
                                      finding.severity === 'critical' ? '#fca5a5' : colors.amber,
                                  }}
                                >
                                  <strong>{finding.code}</strong> · {finding.message}
                                </p>
                              ))
                            )}
                          </section>
                          <section style={{ background: '#020813', borderRadius: 12, padding: 13 }}>
                            <h3>
                              <GitBranch size={16} /> Source provenance
                            </h3>
                            <p style={{ color: colors.muted, overflowWrap: 'anywhere' }}>
                              {detail.script.sourceRepository || 'OperatorOS authored'}
                              {detail.script.sourcePath ? ` / ${detail.script.sourcePath}` : ''}
                            </p>
                            <p>
                              <small style={{ color: colors.muted }}>Commit</small>
                              <br />
                              <code style={{ overflowWrap: 'anywhere' }}>
                                {detail.script.sourceCommit || 'not applicable'}
                              </code>
                            </p>
                            <p>
                              <small style={{ color: colors.muted }}>Blob</small>
                              <br />
                              <code style={{ overflowWrap: 'anywhere' }}>
                                {detail.script.sourceBlobSha || 'not applicable'}
                              </code>
                            </p>
                          </section>
                        </div>
                        <details style={{ marginTop: 14 }}>
                          <summary style={{ cursor: 'pointer', fontWeight: 800 }}>
                            <History size={14} /> Version and sync history ({detail.versions.length}
                            )
                          </summary>
                          <div style={{ display: 'grid', gap: 7, marginTop: 10 }}>
                            {detail.versions.map((version) => (
                              <div
                                key={version.id}
                                style={{ background: '#020813', padding: 10, borderRadius: 9 }}
                              >
                                v{version.versionNumber} ·{' '}
                                <code>{String(version.contentSha256).slice(0, 20)}…</code> ·{' '}
                                {version.safetyStatus} · {date(version.createdAt)}
                              </div>
                            ))}
                            {detail.syncHistory.map((item, index) => (
                              <div
                                key={`${item.createdAt}-${index}`}
                                style={{ background: '#020813', padding: 10, borderRadius: 9 }}
                              >
                                {item.action} · {item.sourcePath} · {date(item.createdAt)}
                              </div>
                            ))}
                          </div>
                        </details>
                      </>
                    )}
                  </article>
                </div>
              </section>
            )}

            {active === 'generate' && (
              <section
                id="ninjamation-generations"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,340px),1fr))',
                  gap: 14,
                }}
              >
                <article style={card}>
                  <span
                    style={{
                      color: colors.violet,
                      fontWeight: 900,
                      letterSpacing: '.12em',
                      fontSize: 11,
                    }}
                  >
                    SHARED AI / VALIDATED JSON
                  </span>
                  <h2>Forge a defensive draft</h2>
                  <p style={{ color: colors.muted }}>
                    PowerShell, Python, Batch, and Bash output is persisted with provider, model,
                    prompt hash, output hash, usage, and safety provenance. It is never
                    auto-approved.
                  </p>
                  {workspace?.access.limits?.aiGeneration ? (
                    <form onSubmit={generateScript} style={{ display: 'grid', gap: 10 }}>
                      <label>
                        Name (optional)
                        <input
                          aria-label="Generated script name"
                          value={generation.name}
                          onChange={(e) => setGeneration({ ...generation, name: e.target.value })}
                          style={input}
                        />
                      </label>
                      <label>
                        Format
                        <select
                          aria-label="AI script format"
                          value={generation.language}
                          onChange={(e) =>
                            setGeneration({ ...generation, language: e.target.value })
                          }
                          style={input}
                        >
                          {languages.map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Describe the automation
                        <textarea
                          data-testid="textarea-ninjamation-prompt"
                          aria-label="Automation description"
                          value={generation.prompt}
                          onChange={(e) => setGeneration({ ...generation, prompt: e.target.value })}
                          style={{ ...input, minHeight: 150, resize: 'vertical' }}
                          minLength={10}
                          maxLength={2000}
                          required
                        />
                      </label>
                      <button
                        data-testid="button-ninjamation-generate"
                        style={button}
                        disabled={busy === 'generate'}
                      >
                        {busy === 'generate' ? <Loader2 size={15} /> : <Bot size={15} />}Generate
                        unapproved draft
                      </button>
                    </form>
                  ) : (
                    <div
                      style={{
                        padding: 18,
                        borderRadius: 12,
                        border: '1px solid #fbbf2455',
                        background: '#78350f22',
                      }}
                    >
                      <h3>Pro entitlement required</h3>
                      <p style={{ color: colors.muted }}>
                        The library remains available. AI generation is enforced server-side by
                        OperatorOS.
                      </p>
                      <a href="/app/billing" style={{ ...button, textDecoration: 'none' }}>
                        Review OperatorOS plans
                      </a>
                    </div>
                  )}
                </article>
                <article style={card}>
                  <h2>Generation boundary</h2>
                  {[
                    'Strict structured response validation',
                    'No raw prompt stored; SHA-256 provenance only',
                    'Potential secret and dangerous-pattern detection',
                    'Atomic monthly plan usage',
                    'Idempotent replay without duplicate script',
                    'Provider-disabled state returns unavailable',
                    'Human review before approved download',
                    'No execution claim or command interpolation',
                  ].map((item) => (
                    <p key={item} style={{ display: 'flex', gap: 8, color: colors.muted }}>
                      <Check size={15} color={colors.green} />
                      {item}
                    </p>
                  ))}
                </article>
              </section>
            )}

            {active === 'sync' && (
              <section id="ninjamation-sync" style={{ display: 'grid', gap: 14 }}>
                <article
                  style={{
                    ...card,
                    display: 'flex',
                    gap: 14,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  <GitBranch size={26} color={colors.blueSoft} />
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <h2 style={{ margin: '0 0 5px' }}>AutomationPacks synchronization</h2>
                    <p style={{ margin: 0, color: colors.muted }}>
                      Fixed repository and branch; full commit, tree, blob, content checksum,
                      update, restore, deprecation, and failure evidence.
                    </p>
                  </div>
                  <button
                    data-testid="button-ninjamation-sync"
                    style={button}
                    onClick={() => void queueSync()}
                    disabled={busy === 'sync'}
                  >
                    {busy === 'sync' ? <Loader2 size={15} /> : <RefreshCw size={15} />}Queue
                    incremental sync
                  </button>
                </article>
                <div style={{ display: 'grid', gap: 9 }}>
                  {(workspace?.syncRuns.length ?? 0) === 0 ? (
                    <EmptyState
                      title="No sync history"
                      description="Queue the initial allowlisted catalog synchronization."
                    />
                  ) : (
                    workspace?.syncRuns.map((run) => (
                      <article
                        key={run.id}
                        style={{
                          ...card,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,115px),1fr))',
                          gap: 10,
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <strong>
                            {String(run.resolvedCommit || run.requestedCommit || 'pending').slice(
                              0,
                              12,
                            )}
                          </strong>
                          <small style={{ display: 'block', color: colors.muted }}>
                            {date(run.createdAt)}
                          </small>
                          <span style={badge(run.status)}>{run.status}</span>
                        </div>
                        {[
                          ['Found', run.discoveredCount],
                          ['New', run.createdCount],
                          ['Updated', run.updatedCount],
                          ['Same', run.unchangedCount],
                          ['Restored', run.restoredCount],
                          ['Deprecated', run.deprecatedCount],
                        ].map(([label, value]) => (
                          <div key={String(label)}>
                            <small style={{ color: colors.muted }}>{label}</small>
                            <strong style={{ display: 'block' }}>{value ?? 0}</strong>
                          </div>
                        ))}
                        {run.status === 'failed' && (
                          <button
                            style={secondary}
                            onClick={() => void retrySync(run.id)}
                            disabled={busy === `retry:${run.id}`}
                          >
                            <RefreshCw size={14} />
                            Retry
                          </button>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
            )}

            {active === 'account' && (
              <section
                id="ninjamation-account"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,320px),1fr))',
                  gap: 14,
                }}
              >
                {!account ? (
                  <LoadingState label="Loading account and usage" />
                ) : (
                  <>
                    <article style={card}>
                      <Star color={colors.blueSoft} />
                      <h2>{account.profile.name || account.profile.email}</h2>
                      <p style={{ color: colors.muted }}>{account.profile.email}</p>
                      <span style={badge(account.access.plan)}>{account.access.plan}</span>
                      <p style={{ color: colors.muted }}>
                        OperatorOS owns identity, tenant membership, entitlements, and profile
                        changes.
                      </p>
                    </article>
                    <article style={card}>
                      <h2>Current period</h2>
                      <p>
                        Downloads <strong>{account.usage.downloadCount ?? 0}</strong>
                        {account.access.limits.monthlyDownloads === null
                          ? ' / unlimited'
                          : ` / ${account.access.limits.monthlyDownloads}`}
                      </p>
                      <p>
                        Generations <strong>{account.usage.generationCount ?? 0}</strong>
                        {account.access.limits.monthlyGenerations === null
                          ? ' / unlimited'
                          : ` / ${account.access.limits.monthlyGenerations}`}
                      </p>
                      <a
                        href={account.billingManagementPath}
                        style={{ ...button, textDecoration: 'none' }}
                      >
                        Manage billing in OperatorOS
                      </a>
                    </article>
                    <article style={card}>
                      <h2>Generation history</h2>
                      {account.generationHistory.length === 0 ? (
                        <p style={{ color: colors.muted }}>No generated scripts yet.</p>
                      ) : (
                        account.generationHistory.slice(0, 8).map((row: Row) => (
                          <p key={row.id} style={{ color: colors.muted }}>
                            {row.language} · {row.provider}/{row.model} · {row.tokenCount} tokens ·{' '}
                            {date(row.createdAt)}
                          </p>
                        ))
                      )}
                    </article>
                  </>
                )}
              </section>
            )}

            {active === 'admin' && (
              <section id="ninjamation-admin" style={{ display: 'grid', gap: 14 }}>
                {!admin ? (
                  <LoadingState label="Loading Script Ops administration" />
                ) : (
                  <>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
                        gap: 12,
                      }}
                    >
                      {Object.entries(admin.stats).map(([label, value]) => (
                        <article key={label} style={card}>
                          <strong style={{ fontSize: 28 }}>{String(value)}</strong>
                          <span
                            style={{
                              display: 'block',
                              color: colors.muted,
                              textTransform: 'capitalize',
                            }}
                          >
                            {label.replace(/([A-Z])/g, ' $1')}
                          </span>
                        </article>
                      ))}
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))',
                        gap: 14,
                      }}
                    >
                      <article style={card}>
                        <h2>
                          <Users size={17} /> Users and tiers
                        </h2>
                        <p style={{ color: colors.muted }}>
                          Script Ops projects parent membership, module access, and tenant plan. It
                          cannot mutate child billing or invent a local tier.
                        </p>
                        {admin.users.map((user: Row) => (
                          <div
                            key={user.id}
                            style={{ padding: '9px 0', borderBottom: `1px solid ${colors.border}` }}
                          >
                            <strong>{user.email}</strong>
                            <small style={{ display: 'block', color: colors.muted }}>
                              {user.role} · {user.accessLevel || 'inherited'} · {user.plan} via{' '}
                              {user.planAuthority}
                            </small>
                          </div>
                        ))}
                        <a
                          href={admin.management.users}
                          style={{ ...button, textDecoration: 'none', marginTop: 12 }}
                        >
                          Manage in OperatorOS
                        </a>
                      </article>
                      <article style={card}>
                        <h2>
                          <RefreshCw size={17} /> Background sync
                        </h2>
                        <p style={{ color: colors.muted }}>
                          Recurrence uses the shared scheduler and job retry/dead-letter system. It
                          never spawns a shell or executes imported content.
                        </p>
                        {admin.schedules.length === 0 ? (
                          <p style={{ color: colors.muted }}>
                            No automatic sync schedule configured.
                          </p>
                        ) : (
                          admin.schedules.map((row: Row) => (
                            <p key={row.id}>
                              {row.enabled ? 'Enabled' : 'Disabled'} · every{' '}
                              {Math.round(row.intervalSeconds / 3600)}h · next {date(row.nextRunAt)}
                            </p>
                          ))
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button style={button} onClick={() => void setSchedule(true)}>
                            <Check size={14} />
                            Enable daily
                          </button>
                          <button style={secondary} onClick={() => void setSchedule(false)}>
                            <XCircle size={14} />
                            Disable
                          </button>
                        </div>
                      </article>
                      <article style={card}>
                        <h2>
                          <Plus size={17} /> Admin script draft
                        </h2>
                        <form onSubmit={createManual} style={{ display: 'grid', gap: 8 }}>
                          <input
                            data-testid="input-ninjamation-name"
                            aria-label="Script name"
                            value={manual.name}
                            onChange={(e) => setManual({ ...manual, name: e.target.value })}
                            style={input}
                            placeholder="Script name"
                            required
                          />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <select
                              data-testid="select-ninjamation-language"
                              aria-label="Script language"
                              value={manual.language}
                              onChange={(e) => setManual({ ...manual, language: e.target.value })}
                              style={input}
                            >
                              {languages.map((value) => (
                                <option key={value}>{value}</option>
                              ))}
                            </select>
                            <select
                              data-testid="select-ninjamation-risk"
                              aria-label="Risk tier"
                              value={manual.riskTier}
                              onChange={(e) => setManual({ ...manual, riskTier: e.target.value })}
                              style={input}
                            >
                              <option>low</option>
                              <option>medium</option>
                              <option>high</option>
                            </select>
                          </div>
                          <textarea
                            data-testid="textarea-ninjamation-content"
                            aria-label="Script source"
                            value={manual.content}
                            onChange={(e) => setManual({ ...manual, content: e.target.value })}
                            style={{ ...input, minHeight: 120 }}
                            required
                          />
                          <button type="submit" data-testid="button-ninjamation-save" style={button}>
                            <Save size={14} />
                            Create draft
                          </button>
                        </form>
                      </article>
                    </div>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
