'use client';

import React from 'react';
import { Phone, Headphones, MessageCircle, ArrowRight } from 'lucide-react';
import { semantic, space, fontSize, radius, cardStyle } from '@/lib/design-tokens';

export default function CallCommandShell({ baseUrl }: { baseUrl?: string }) {
  return (
    <div style={{ padding: space.xxl, maxWidth: 960, margin: '0 auto' }} data-testid="shell-callcommand-ai">
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: space.xl }}>
        <Phone size={28} color={semantic.accent} />
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, color: '#fff' }}>CallCommand AI</h1>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            AI phone agent + call automation for service businesses. Always-on intake, zero-miss followups.
          </p>
        </div>
      </header>

      <div style={{ display: 'grid', gap: space.lg, gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))' }}>
        <FeatureCard
          icon={<Headphones size={18} color={semantic.accent} />}
          title="24/7 AI receptionist"
          body="Books appointments, qualifies leads, and routes urgent calls to a human."
        />
        <FeatureCard
          icon={<MessageCircle size={18} color={semantic.accent} />}
          title="Auto-summaries"
          body="Every call returns a structured summary + next-action list pinned to the customer."
        />
        <FeatureCard
          icon={<Phone size={18} color={semantic.accent} />}
          title="Outbound campaigns"
          body="Schedule recall, payment-reminder, and review-request calls in batches."
        />
      </div>

      <div style={{ marginTop: space.xl }}>
        <a
          href={baseUrl && baseUrl.startsWith('http') ? baseUrl : '#'}
          target={baseUrl && baseUrl.startsWith('http') ? '_blank' : undefined}
          rel="noopener noreferrer"
          data-testid="link-launch-callcommand-ai"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: radius.sm,
            background: semantic.accent, color: '#fff', textDecoration: 'none',
            fontWeight: 600, fontSize: fontSize.body,
          }}
        >
          Open the call console <ArrowRight size={14} />
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
