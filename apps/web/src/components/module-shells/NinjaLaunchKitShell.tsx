'use client';

import React from 'react';
import { Rocket, Layers, Zap } from 'lucide-react';
import { semantic, space, fontSize, cardStyle } from '@/lib/design-tokens';
import { ShellLiveBadge, ShellMvpNotice, ShellLaunchButton } from './ShellChrome';

export default function NinjaLaunchKitShell({ baseUrl }: { baseUrl?: string }) {
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
            Build & ship internal tools fast. Templated stacks, AI scaffolding, one-click deploys.
          </p>
        </div>
      </header>
      <ShellMvpNotice />

      <div style={{ display: 'grid', gap: space.lg, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <FeatureCard
          icon={<Layers size={18} color={semantic.accent} />}
          title="Stack templates"
          body="Next.js + Fastify, FastAPI + React, plain Express — all pre-wired to OperatorOS auth."
        />
        <FeatureCard
          icon={<Zap size={18} color={semantic.accent} />}
          title="AI scaffolding"
          body="Describe the screen; the kit drafts components, routes, and tests in one pass."
        />
        <FeatureCard
          icon={<Rocket size={18} color={semantic.accent} />}
          title="One-click deploy"
          body="Ship to your tenant\u2019s OperatorOS environment without leaving the workspace."
        />
      </div>

      <div style={{ marginTop: space.xl }}>
        <ShellLaunchButton baseUrl={baseUrl} testId="link-launch-ninja-launch-kit" label="Spin up a new tool" />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div style={{ ...cardStyle }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {icon}
        <h3 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>{title}</h3>
      </div>
      <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, margin: 0 }}>{body}</p>
    </div>
  );
}
