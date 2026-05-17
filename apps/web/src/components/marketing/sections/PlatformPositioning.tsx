'use client';

import React from 'react';
import {
  Briefcase, Server, Wrench, Stethoscope, Sparkles, Bot,
  type LucideIcon,
} from 'lucide-react';
import { brand } from '@/lib/brand';

interface PositioningCard {
  icon: LucideIcon;
  title: string;
  outcome: string;
  accent: string;
}

const CARDS: PositioningCard[] = [
  {
    icon: Briefcase,
    title: 'Business Operations',
    outcome: 'Quote, schedule, dispatch, and invoice without bouncing between five tools.',
    accent: brand.accentBlue,
  },
  {
    icon: Server,
    title: 'IT & MSP Operations',
    outcome: 'Triage tickets and ship fixes from a shared inbox built for small teams.',
    accent: brand.accentCyan,
  },
  {
    icon: Wrench,
    title: 'Automotive & Diagnostics',
    outcome: 'Move every vehicle through the shop with the diagnostic trail intact.',
    accent: brand.accentAmber,
  },
  {
    icon: Stethoscope,
    title: 'Healthcare Workflow Coordination',
    outcome: 'Coordinate patient touchpoints across the team without losing the thread.',
    accent: brand.accentGreen,
  },
  {
    icon: Sparkles,
    title: 'Branding & Launch Systems',
    outcome: 'Stand up the next launch — pages, assets, and rollout — in a single weekend.',
    accent: brand.accentViolet,
  },
  {
    icon: Bot,
    title: 'AI Automation',
    outcome: 'Hand off the repetitive work to AI agents that fit your existing flows.',
    accent: brand.accentRed,
  },
];

/**
 * Platform Positioning — outcome-led six-card grid that anchors the
 * homepage's "one platform, many operating systems" claim. Each card
 * names a domain and the outcome you get, not the feature list.
 */
export default function PlatformPositioning() {
  return (
    <section
      data-testid="marketing-positioning"
      style={{
        padding: '64px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h2
          data-testid="positioning-title"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(28px, 4vw, 40px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}
        >
          One platform. Multiple operating systems inside.
        </h2>
        <p style={{ fontSize: 16, color: brand.textSecondary, margin: 0 }}>
          Pick the operations you actually run. OperatorOS gives each its own surface.
        </p>
      </div>
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        {CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              data-testid={`positioning-card-${c.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
              style={{
                padding: 22,
                borderRadius: 14,
                background: brand.bgElevated,
                border: `1px solid ${brand.borderSoft}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${c.accent}1A`,
                  border: `1px solid ${c.accent}40`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: c.accent,
                }}
              >
                <Icon size={20} />
              </div>
              <h3
                style={{
                  fontFamily: brand.fontDisplay,
                  fontSize: 17,
                  fontWeight: 600,
                  color: brand.textPrimary,
                  margin: 0,
                }}
              >
                {c.title}
              </h3>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
                {c.outcome}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
