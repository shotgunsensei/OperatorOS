'use client';

/**
 * Task #69 — real first-screen for Ninja Launch Kit.
 *
 * Pick a starter stack → name the project → preview the scaffold. The
 * scaffold preview is generated locally (no backend yet) so the surface
 * shows a tangible artifact instead of marketing copy.
 */

import React, { useState } from 'react';
import { Rocket, FolderTree, Sparkles, ChevronRight } from 'lucide-react';
import {
  semantic, space, fontSize, radius, cardStyle,
} from '@/lib/design-tokens';
import { ShellLiveBadge, ShellLaunchButton } from './ShellChrome';

interface StackTemplate {
  id: string;
  name: string;
  summary: string;
  files: string[];
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

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'untitled';
}

export default function NinjaLaunchKitShell({ baseUrl }: { baseUrl?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scaffolded, setScaffolded] = useState<{ stack: StackTemplate; slug: string } | null>(null);

  function scaffold() {
    const stack = STACKS.find((s) => s.id === selected);
    if (!stack) return;
    setScaffolded({ stack, slug: slugify(name || stack.name) });
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
            Pick a stack, name it, and preview the scaffold before spinning up a workspace.
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
            disabled={!selected}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '10px 18px', borderRadius: radius.sm, border: 'none',
              background: selected ? semantic.accent : 'rgba(139,148,158,0.18)',
              color: selected ? '#fff' : semantic.textMuted,
              cursor: selected ? 'pointer' : 'not-allowed',
              fontWeight: 600, fontSize: fontSize.body,
            }}
          >
            <Sparkles size={14} /> Generate scaffold
          </button>
        </div>
        {!selected && (
          <p data-testid="text-launchkit-pick-hint" style={{ margin: `${space.sm}px 0 0`, color: semantic.textMuted, fontSize: fontSize.sm }}>
            Pick a stack above to enable scaffold generation.
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
                · {scaffolded.stack.name}
              </span>
            </div>
            <ul data-testid="list-launchkit-scaffold-files" style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: fontSize.sm }}>
              {scaffolded.stack.files.map((f) => (
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
    </div>
  );
}
