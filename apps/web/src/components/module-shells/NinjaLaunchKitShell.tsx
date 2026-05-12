'use client';

/**
 * Task #72 — first-screen for Ninja Launch Kit, backed by the API.
 *
 * "Generate scaffold" POSTs to `/v1/modules/ninja-launch-kit/scaffolds`
 * which persists a queued scaffold row, writes a `queued`
 * `entityType=scaffold` entry into the tenant activity feed, and returns
 * the row. Past scaffolds are listed below.
 */

import React, { useEffect, useState } from 'react';
import { Rocket, FolderTree, Sparkles, ChevronRight, Clock } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';
import { moduleShellApi } from '@/lib/auth';

interface StackTemplate {
  id: string;
  name: string;
  summary: string;
  files: string[];
}

interface ScaffoldRow {
  id: string;
  slug: string;
  stackId: string;
  stackName: string;
  files: string[];
  status: 'queued' | 'ready' | 'failed';
  createdAt: string;
}

const STACKS: StackTemplate[] = [
  {
    id: 'next-fastify',
    name: 'Next.js + Fastify',
    summary: 'Server-rendered web app with a Fastify API, Drizzle ORM, and OperatorOS auth wired in.',
    files: [
      'apps/web/src/app/page.tsx',
      'apps/web/src/app/layout.tsx',
      'apps/api/src/index.ts',
      'apps/api/src/routes/health.ts',
      'apps/api/src/schema.ts',
      'package.json',
      'tsconfig.json',
    ],
  },
  {
    id: 'fastapi-react',
    name: 'FastAPI + React',
    summary: 'Python backend with a Vite + React frontend; OperatorOS JWT verification middleware included.',
    files: [
      'backend/main.py',
      'backend/auth.py',
      'backend/requirements.txt',
      'frontend/src/App.tsx',
      'frontend/src/main.tsx',
      'frontend/index.html',
      'pyproject.toml',
    ],
  },
  {
    id: 'express-htmx',
    name: 'Express + HTMX',
    summary: 'Minimal Node + HTMX stack for internal tools — fast to ship, no SPA build step.',
    files: [
      'src/server.ts',
      'src/views/index.html',
      'src/views/layout.html',
      'src/middleware/auth.ts',
      'public/styles.css',
      'package.json',
    ],
  },
];

export default function NinjaLaunchKitShell({ baseUrl }: { baseUrl?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scaffolded, setScaffolded] = useState<ScaffoldRow | null>(null);
  const [history, setHistory] = useState<ScaffoldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    moduleShellApi.launchkit.list()
      .then((res: any) => {
        if (cancelled) return;
        const rows: ScaffoldRow[] = res.scaffolds ?? [];
        setHistory(rows);
        if (rows[0]) setScaffolded(rows[0]);
      })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Failed to load scaffolds'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function scaffold() {
    const stack = STACKS.find((s) => s.id === selected);
    if (!stack || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const row: ScaffoldRow = await moduleShellApi.launchkit.scaffold({
        stackId: stack.id,
        stackName: stack.name,
        files: stack.files,
        name: name || stack.name,
      });
      setScaffolded(row);
      setHistory((prev) => [row, ...prev].slice(0, 20));
      setName('');
    } catch (err: any) {
      setError(err?.message || 'Could not generate scaffold');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: space.xxl, maxWidth: 960, margin: '0 auto' }} data-testid="shell-ninja-launch-kit">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
        <Rocket size={28} color={semantic.accent} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Ninja Launch Kit</h1>
            <ShellLiveBadge />
          </div>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Pick a stack, name it, and queue a scaffold for your next workspace.
          </p>
        </div>
        <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-ninja-launch-kit" label="Open the launch console" />
      </header>

      <section style={{ marginBottom: space.xl }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          1. Choose a starter stack
        </h2>
        <ul
          data-testid="list-launchkit-stacks"
          style={{
            listStyle: 'none', padding: 0, margin: 0,
            display: 'grid', gap: space.lg,
            gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))',
          }}
        >
          {STACKS.map((s) => {
            const on = selected === s.id;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  data-testid={`button-launchkit-pick-${s.id}`}
                  onClick={() => setSelected(s.id)}
                  aria-pressed={on}
                  style={{
                    ...cardStyle,
                    width: '100%', textAlign: 'left', cursor: 'pointer',
                    border: `1px solid ${on ? semantic.accent : semantic.border}`,
                    background: on ? `${semantic.accent}10` : semantic.bgPanel,
                  }}
                >
                  <h3 style={{ margin: 0, color: '#fff', fontSize: fontSize.md, fontWeight: 600 }}>
                    {s.name}
                  </h3>
                  <p style={{ margin: `${space.sm}px 0 0`, color: semantic.textMuted, fontSize: fontSize.sm }}>
                    {s.summary}
                  </p>
                  <div style={{ marginTop: space.sm, color: on ? semantic.accent : semantic.textDim, fontSize: fontSize.sm, fontWeight: 600 }}>
                    {on ? 'Selected' : 'Pick this stack'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section style={{ marginBottom: space.xl }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          2. Name your project
        </h2>
        <div style={{ ...cardStyle, display: 'flex', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            data-testid="input-launchkit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ops-dashboard"
            style={{
              flex: 1, minWidth: 200,
              background: semantic.bg, color: semantic.text,
              border: `1px solid ${semantic.border}`, borderRadius: radius.sm,
              padding: '8px 10px', fontSize: fontSize.body, outline: 'none',
            }}
          />
          <button
            type="button"
            data-testid="button-launchkit-scaffold"
            onClick={scaffold}
            disabled={!selected || submitting}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: radius.sm, border: 'none',
              background: !selected || submitting ? 'rgba(139,148,158,0.18)' : semantic.accent,
              color: !selected || submitting ? semantic.textMuted : '#fff',
              cursor: !selected || submitting ? 'not-allowed' : 'pointer',
              fontWeight: 600, fontSize: fontSize.body,
            }}
          >
            <Sparkles size={14} /> {submitting ? 'Queueing…' : 'Generate scaffold'}
          </button>
        </div>
        {!selected && (
          <p data-testid="text-launchkit-pick-hint" style={{ margin: `${space.sm}px 0 0`, color: semantic.textMuted, fontSize: fontSize.sm }}>
            Pick a stack above to enable scaffold generation.
          </p>
        )}
        {error && (
          <p data-testid="text-launchkit-error" style={{ margin: `${space.sm}px 0 0`, color: semantic.accentDanger, fontSize: fontSize.sm }}>
            {error}
          </p>
        )}
      </section>

      {scaffolded && (
        <section data-testid="panel-launchkit-scaffold">
          <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
            3. Scaffold preview
          </h2>
          <div style={{ ...cardStyle }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: space.sm }}>
              <FolderTree size={16} color={semantic.accent} />
              <span data-testid="text-launchkit-scaffold-root" style={{ color: '#fff', fontWeight: 600 }}>
                {scaffolded.slug}/
              </span>
              <span style={{ color: semantic.textMuted, fontSize: fontSize.sm }}>
                · {scaffolded.stackName}
              </span>
              <ScaffoldStatus status={scaffolded.status} />
            </div>
            <ul data-testid="list-launchkit-scaffold-files" style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: fontSize.sm }}>
              {scaffolded.files.map((f) => (
                <li
                  key={f}
                  data-testid={`row-launchkit-file-${f}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', color: semantic.text }}
                >
                  <ChevronRight size={12} color={semantic.textMuted} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section style={{ marginTop: space.xl }}>
        <h2 style={{ margin: 0, fontSize: fontSize.lg, fontWeight: 600, color: '#fff', marginBottom: space.md }}>
          Past scaffolds
        </h2>
        {loading ? (
          <div data-testid="text-launchkit-loading" style={{ ...cardStyle, color: semantic.textMuted }}>
            Loading scaffolds…
          </div>
        ) : history.length === 0 ? (
          <div data-testid="text-launchkit-history-empty" style={{ ...cardStyle, color: semantic.textMuted }}>
            Generate a scaffold above and it will appear here.
          </div>
        ) : (
          <ul data-testid="list-launchkit-history" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: space.sm }}>
            {history.map((s) => (
              <li
                key={s.id}
                data-testid={`row-launchkit-history-${s.id}`}
                style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10 }}
              >
                <button
                  type="button"
                  data-testid={`button-launchkit-open-${s.id}`}
                  onClick={() => setScaffolded(s)}
                  style={{
                    flex: 1, textAlign: 'left', background: 'transparent', border: 'none',
                    color: '#fff', cursor: 'pointer', padding: 0, fontSize: fontSize.body, fontWeight: 600,
                  }}
                >
                  {s.slug}/
                  <span style={{ marginLeft: 8, color: semantic.textMuted, fontWeight: 400, fontSize: fontSize.sm }}>
                    {s.stackName} · {s.files.length} files
                  </span>
                </button>
                <ScaffoldStatus status={s.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ScaffoldStatus({ status }: { status: 'queued' | 'ready' | 'failed' }) {
  const map = {
    queued: { label: 'Queued', color: semantic.accentInfo, icon: <Clock size={12} /> },
    ready:  { label: 'Ready',  color: semantic.accentSuccess, icon: <ChevronRight size={12} /> },
    failed: { label: 'Failed', color: semantic.accentDanger,  icon: <ChevronRight size={12} /> },
  }[status];
  return (
    <span
      data-testid={`status-launchkit-${status}`}
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
