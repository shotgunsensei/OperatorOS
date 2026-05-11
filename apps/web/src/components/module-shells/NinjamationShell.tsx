'use client';

import React from 'react';
import { Workflow, Zap, GitMerge, ArrowRight } from 'lucide-react';
import { semantic, space, fontSize, radius, cardStyle } from '@/lib/design-tokens';

export default function NinjamationShell({ baseUrl }: { baseUrl?: string }) {
  return (
    <div style={{ padding: space.xxl, maxWidth: 960, margin: '0 auto' }} data-testid="shell-ninjamation">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
        <Workflow size={28} color={semantic.accent} />
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>Ninjamation</h1>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Cross-app workflow automation. Wire together every module in your tenant with a few clicks.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: space.lg, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <FeatureCard
          icon={<GitMerge size={18} color={semantic.accent} />}
          title="Visual builder"
          body="Drag triggers and actions across modules; preview a run before publishing."
        />
        <FeatureCard
          icon={<Zap size={18} color={semantic.accent} />}
          title="Pre-built recipes"
          body="\u201CNew TradeFlowKit job \u2192 SnapProofOS photo request \u2192 PulseDesk ticket\u201D in one click."
        />
        <FeatureCard
          icon={<Workflow size={18} color={semantic.accent} />}
          title="Audited every step"
          body="Each run lands in the tenant activity feed; failures alert your owners."
        />
      </div>

      <div style={{ marginTop: space.xl }}>
        <a
          href={baseUrl && baseUrl.startsWith('http') ? baseUrl : '#'}
          target={baseUrl && baseUrl.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          data-testid="link-launch-ninjamation"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: radius.sm,
            background: semantic.accent, color: '#fff', textDecoration: 'none',
            fontWeight: 600, fontSize: fontSize.body,
          }}
        >
          Open the automation canvas <ArrowRight size={14} />
        </a>
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
