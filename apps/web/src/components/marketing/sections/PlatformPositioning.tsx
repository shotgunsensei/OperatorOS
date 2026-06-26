'use client';

import React from 'react';
import {
  BadgeDollarSign,
  Bot,
  Briefcase,
  Building2,
  ChartNoAxesCombined,
  KeyRound,
  LayoutDashboard,
  LogIn,
  Server,
  Sparkles,
  Stethoscope,
  Wrench,
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
    outcome: 'Keep tickets, scripts, endpoint context, and technician work in one operator surface.',
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
    outcome: 'Plan offers, assets, pages, and rollout work from one creative command system.',
    accent: brand.accentViolet,
  },
  {
    icon: Bot,
    title: 'AI Automation',
    outcome: 'Automate repetitive handoffs without separating them from tenants, roles, and access.',
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
    outcome: 'Stripe checkout maps to module access without fake client-side unlocks.',
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
    outcome: 'Operators see account, module, billing, and workflow state in one place.',
    accent: brand.accentViolet,
  },
  {
    icon: ChartNoAxesCombined,
    title: 'Operator analytics',
    outcome: 'Usage and audit signals create the foundation for admin control and growth.',
    accent: brand.accentRed,
  },
];

export default function PlatformPositioning() {
  return (
    <section
      data-testid="marketing-positioning"
      style={{
        position: 'relative',
        padding: '66px 24px',
        maxWidth: 1360,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .operatoros-positioning-shell {
          display: grid;
          grid-template-columns: minmax(0, 0.92fr) minmax(420px, 1.08fr);
          gap: 28px;
          align-items: stretch;
        }
        .operatoros-domain-grid {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .operatoros-capability-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .operatoros-domain-card,
        .operatoros-capability-card {
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .operatoros-domain-card:hover,
        .operatoros-capability-card:hover {
          transform: translateY(-3px);
          border-color: ${brand.borderStrong};
          box-shadow: 0 20px 60px rgba(0,0,0,0.24);
        }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-domain-card,
          .operatoros-capability-card {
            transition: none;
          }
          .operatoros-domain-card:hover,
          .operatoros-capability-card:hover {
            transform: none;
          }
        }
        @media (max-width: 1040px) {
          .operatoros-positioning-shell {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 700px) {
          .operatoros-domain-grid,
          .operatoros-capability-grid {
            grid-template-columns: 1fr;
          }
        }
      ` }} />

      <div className="operatoros-positioning-shell">
        <div
          style={{
            position: 'relative',
            borderRadius: 26,
            padding: '34px clamp(22px, 4vw, 40px)',
            border: `1px solid ${brand.borderStrong}`,
            background:
              'linear-gradient(145deg, rgba(18,24,38,0.96), rgba(8,11,18,0.92)), radial-gradient(circle at 20% 20%, rgba(0,229,255,0.15), transparent 34%)',
            overflow: 'hidden',
            minHeight: 470,
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'url(/media/operatoros/operatoros-command-grid-bg.png)',
              backgroundSize: 'cover',
              opacity: 0.26,
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              width: 420,
              height: 420,
              right: -130,
              bottom: -150,
              borderRadius: '50%',
              border: `1px dashed ${brand.borderSoft}`,
              boxShadow: 'inset 0 0 80px rgba(0,229,255,0.08)',
            }}
          />
          <div style={{ position: 'relative' }}>
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
                fontWeight: 800,
                textTransform: 'uppercase',
                marginBottom: 16,
              }}
            >
              From chaos to command
            </span>
            <h2
              data-testid="positioning-title"
              style={{
                fontFamily: brand.fontDisplay,
                fontSize: 'clamp(34px, 4vw, 56px)',
                fontWeight: 800,
                color: brand.textPrimary,
                margin: '0 0 16px',
                lineHeight: 1.02,
                letterSpacing: '-0.045em',
              }}
            >
              One parent platform. Every operating lane connected.
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.7, color: brand.textSecondary, margin: '0 0 26px', maxWidth: 620 }}>
              Pick the operations you actually run. OperatorOS gives each one a focused
              module while the parent platform keeps identity, billing, tenants, and
              access under command.
            </p>
            <div style={{ display: 'grid', gap: 10 }}>
              {['Identity enters once', 'Billing activates access', 'Tenant scope follows the user', 'Modules launch with SSO'].map((step, index) => (
                <div
                  key={step}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '34px minmax(0, 1fr)',
                    gap: 12,
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 14,
                    background: 'rgba(8,11,18,0.66)',
                    border: `1px solid ${brand.borderSoft}`,
                  }}
                >
                  <span
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: index % 2 === 0 ? brand.accentCyan : brand.accentRed,
                      background: index % 2 === 0 ? 'rgba(0,229,255,0.11)' : 'rgba(239,35,60,0.11)',
                      border: `1px solid ${index % 2 === 0 ? 'rgba(0,229,255,0.35)' : 'rgba(239,35,60,0.35)'}`,
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span style={{ color: brand.textPrimary, fontWeight: 800, fontSize: 14 }}>
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div className="operatoros-domain-grid">
            {CARDS.map((card) => (
              <DomainCard key={card.title} card={card} />
            ))}
          </div>
          <div
            style={{
              padding: '24px clamp(18px, 3vw, 28px)',
              borderRadius: 22,
              background: `linear-gradient(135deg, rgba(0,229,255,0.08), rgba(124,58,237,0.08)), ${brand.bgSecondary}`,
              border: `1px solid ${brand.borderStrong}`,
            }}
          >
            <div style={{ marginBottom: 18 }}>
              <p
                style={{
                  margin: '0 0 8px',
                  color: brand.accentCyan,
                  fontSize: 12,
                  fontWeight: 800,
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
                  letterSpacing: '-0.03em',
                }}
              >
                The command layer behind every module.
              </h3>
            </div>
            <div className="operatoros-capability-grid">
              {CAPABILITIES.map((card) => (
                <CapabilityCard key={card.title} card={card} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DomainCard({ card }: { card: PositioningCard }) {
  const Icon = card.icon;
  return (
    <div
      className="operatoros-domain-card"
      data-testid={`positioning-card-${card.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`}
      style={{
        padding: 18,
        borderRadius: 18,
        background: `linear-gradient(150deg, ${card.accent}12, rgba(13,17,23,0.92))`,
        border: `1px solid ${brand.borderSoft}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: `${card.accent}1A`,
          border: `1px solid ${card.accent}45`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: card.accent,
        }}
      >
        <Icon size={19} />
      </div>
      <h3 style={{ fontFamily: brand.fontDisplay, fontSize: 16, fontWeight: 800, color: brand.textPrimary, margin: 0 }}>
        {card.title}
      </h3>
      <p style={{ fontSize: 13, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
        {card.outcome}
      </p>
    </div>
  );
}

function CapabilityCard({ card }: { card: PositioningCard }) {
  const Icon = card.icon;
  return (
    <div
      className="operatoros-capability-card"
      style={{
        display: 'grid',
        gridTemplateColumns: '34px minmax(0, 1fr)',
        gap: 12,
        alignItems: 'start',
        padding: 14,
        borderRadius: 14,
        background: 'rgba(8,11,18,0.52)',
        border: `1px solid ${brand.borderSoft}`,
      }}
    >
      <span
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: card.accent,
          background: `${card.accent}18`,
          border: `1px solid ${card.accent}35`,
        }}
      >
        <Icon size={17} />
      </span>
      <div>
        <h4 style={{ margin: '0 0 5px', color: brand.textPrimary, fontSize: 14 }}>
          {card.title}
        </h4>
        <p style={{ margin: 0, color: brand.textSecondary, fontSize: 12, lineHeight: 1.5 }}>
          {card.outcome}
        </p>
      </div>
    </div>
  );
}
