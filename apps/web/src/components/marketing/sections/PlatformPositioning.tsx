'use client';

import React from 'react';
import {
  Briefcase, Server, Wrench, Stethoscope, Sparkles, Bot, BadgeDollarSign,
  Building2, ChartNoAxesCombined, KeyRound, LayoutDashboard, LogIn,
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

const CAPABILITIES: PositioningCard[] = [
  {
    icon: KeyRound,
    title: 'Parent authentication',
    outcome: 'Central login, account security, and role-aware access paths stay in OperatorOS.',
    accent: brand.accentCyan,
  },
  {
    icon: Building2,
    title: 'Tenant management',
    outcome: 'Teams, roles, memberships, and tenant context stay explicit across the platform.',
    accent: brand.accentGreen,
  },
  {
    icon: BadgeDollarSign,
    title: 'Purchases and subscriptions',
    outcome: 'Plan tiers and add-ons connect to module access without fake client-side unlocks.',
    accent: brand.accentAmber,
  },
  {
    icon: LogIn,
    title: 'SSO and app handoff',
    outcome: 'Child apps launch through the parent command layer instead of separate passwords.',
    accent: brand.accentBlue,
  },
  {
    icon: LayoutDashboard,
    title: 'Unified dashboard',
    outcome: 'Operators see account, plan, module, and workflow state in one place.',
    accent: brand.accentViolet,
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Operator analytics',
    outcome: 'Usage and audit signals create the foundation for admin control and growth.',
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
        <span
          style={{
            display: 'inline-flex',
            padding: '6px 12px',
            borderRadius: 999,
            border: `1px solid ${brand.borderSoft}`,
            background: brand.bgGlass,
            color: brand.accentCyan,
            fontFamily: brand.fontDisplay,
            fontSize: 12,
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          From chaos to command
        </span>
        <h2
          data-testid="positioning-title"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 38,
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: 0,
          }}
        >
          One platform. Multiple operating systems inside.
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: brand.textSecondary, margin: '0 auto', maxWidth: 680 }}>
          Pick the operations you actually run. OperatorOS gives each one a focused surface
          while the parent platform keeps auth, billing, tenants, and access centralized.
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
                background: `linear-gradient(180deg, ${brand.bgElevated}, rgba(13,17,23,0.94))`,
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
      <div
        style={{
          marginTop: 24,
          padding: '28px clamp(18px, 4vw, 34px)',
          borderRadius: 18,
          background: `linear-gradient(135deg, rgba(0,229,255,0.08), rgba(124,58,237,0.06)), ${brand.bgSecondary}`,
          border: `1px solid ${brand.borderStrong}`,
        }}
      >
        <div style={{ marginBottom: 22 }}>
          <p
            style={{
              margin: '0 0 8px',
              color: brand.accentCyan,
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
            }}
          >
            Parent platform capabilities
          </p>
          <h3
            style={{
              fontFamily: brand.fontDisplay,
              fontSize: 28,
              margin: 0,
              color: brand.textPrimary,
              letterSpacing: 0,
            }}
          >
            The command layer behind every module.
          </h3>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 14,
          }}
        >
          {CAPABILITIES.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.title}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '34px minmax(0, 1fr)',
                  gap: 12,
                  alignItems: 'start',
                  padding: 14,
                  borderRadius: 12,
                  background: 'rgba(8,11,18,0.5)',
                  border: `1px solid ${brand.borderSoft}`,
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: c.accent,
                    background: `${c.accent}18`,
                    border: `1px solid ${c.accent}35`,
                  }}
                >
                  <Icon size={17} />
                </span>
                <div>
                  <h4 style={{ margin: '0 0 5px', color: brand.textPrimary, fontSize: 14 }}>
                    {c.title}
                  </h4>
                  <p style={{ margin: 0, color: brand.textSecondary, fontSize: 12, lineHeight: 1.5 }}>
                    {c.outcome}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
