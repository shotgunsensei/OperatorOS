'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { brand } from '@/lib/brand';
import {
  MARKETING_MODULES,
  PACKAGE_DESCRIPTIONS,
  PACKAGE_LABELS,
  applyEntitlements,
  statusBadgeColor,
  type MarketingModule,
  type MarketingPackageType,
} from '@/lib/marketing-catalog';
import { moduleCtaTarget } from '@/lib/marketing-cta';
import { useAuth } from '../../AuthProvider';
import { useEntitlements } from '@/lib/use-entitlements';

interface ModuleGatewayGridProps {
  /** Optional heading override for use on `/modules` vs. the homepage. */
  heading?: string;
  subheading?: string;
  testId?: string;
}

const PACKAGE_ORDER: MarketingPackageType[] = ['core', 'included', 'companion'];

export default function ModuleGatewayGrid({
  heading = 'Tenant-aware modules under one parent platform.',
  subheading = 'Core products, bundled apps, and companion modules all launch through the same OperatorOS command layer.',
  testId = 'marketing-module-grid',
}: ModuleGatewayGridProps) {
  const { user } = useAuth();
  const entitled = useEntitlements();
  const modules = applyEntitlements(MARKETING_MODULES, entitled);

  return (
    <section
      data-testid={testId}
      style={{
        position: 'relative',
        padding: '76px 24px',
        maxWidth: 1360,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .operatoros-module-lanes {
          display: grid;
          gap: 26px;
        }
        .operatoros-module-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(auto-fit, minmax(276px, 1fr));
        }
        .operatoros-module-card {
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .operatoros-module-card::after {
          content: '';
          position: absolute;
          inset: 0;
          opacity: 0;
          background: linear-gradient(120deg, transparent 0%, rgba(0,229,255,0.12) 48%, transparent 58%);
          transform: translateX(-120%);
          transition: opacity 180ms ease, transform 460ms ease;
          pointer-events: none;
        }
        .operatoros-module-card:hover {
          transform: translateY(-4px);
          border-color: ${brand.borderStrong};
          box-shadow: 0 26px 84px rgba(0,0,0,0.34), 0 0 44px rgba(0,229,255,0.08);
        }
        .operatoros-module-card:hover::after {
          opacity: 1;
          transform: translateX(120%);
        }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-module-card,
          .operatoros-module-card::after {
            transition: none;
          }
          .operatoros-module-card:hover {
            transform: none;
          }
          .operatoros-module-card:hover::after {
            opacity: 0;
          }
        }
        @media (max-width: 640px) {
          .operatoros-module-grid {
            grid-template-columns: 1fr;
          }
          .operatoros-package-heading {
            grid-template-columns: 1fr !important;
          }
        }
      ` }} />

      <div style={{ textAlign: 'center', marginBottom: 46 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 999,
            background: brand.bgGlass,
            border: `1px solid ${brand.borderSoft}`,
            color: brand.accentCyan,
            fontFamily: brand.fontDisplay,
            fontSize: 12,
            fontWeight: 800,
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          <Boxes size={14} />
          Module ecosystem
        </span>
        <h2
          data-testid={`${testId}-title`}
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(34px, 4vw, 54px)',
            fontWeight: 800,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: '-0.04em',
          }}
        >
          {heading}
        </h2>
        <p style={{ fontSize: 16, lineHeight: 1.6, color: brand.textSecondary, margin: '0 auto', maxWidth: 720 }}>
          {subheading}
        </p>
      </div>

      <div className="operatoros-module-lanes">
        {PACKAGE_ORDER.map((packageType) => {
          const laneModules = modules.filter((module) => module.packageType === packageType);
          return (
            <section
              key={packageType}
              aria-label={PACKAGE_LABELS[packageType]}
              style={{
                padding: '22px clamp(14px, 2.2vw, 22px)',
                borderRadius: 24,
                background:
                  packageType === 'core'
                    ? 'linear-gradient(135deg, rgba(0,229,255,0.08), rgba(8,11,18,0.88))'
                    : packageType === 'included'
                      ? 'linear-gradient(135deg, rgba(34,197,94,0.075), rgba(8,11,18,0.88))'
                      : 'linear-gradient(135deg, rgba(124,58,237,0.08), rgba(8,11,18,0.88))',
                border: `1px solid ${brand.borderStrong}`,
                boxShadow: '0 24px 80px rgba(0,0,0,0.22)',
              }}
            >
              <div
                className="operatoros-package-heading"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 16,
                  alignItems: 'end',
                  marginBottom: 18,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <Sparkles
                      size={15}
                      color={
                        packageType === 'core'
                          ? brand.accentCyan
                          : packageType === 'included'
                            ? brand.accentGreen
                            : brand.accentViolet
                      }
                    />
                    <span style={{ color: brand.textPrimary, fontFamily: brand.fontDisplay, fontSize: 22, fontWeight: 800 }}>
                      {PACKAGE_LABELS[packageType]}
                    </span>
                  </div>
                  <p style={{ color: brand.textSecondary, fontSize: 14, lineHeight: 1.55, margin: 0, maxWidth: 760 }}>
                    {PACKAGE_DESCRIPTIONS[packageType]}
                  </p>
                </div>
                <span
                  style={{
                    justifySelf: 'start',
                    display: 'inline-flex',
                    alignItems: 'center',
                    minHeight: 32,
                    padding: '6px 10px',
                    borderRadius: 999,
                    color: brand.textSecondary,
                    background: 'rgba(255,255,255,0.035)',
                    border: `1px solid ${brand.borderSoft}`,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  {laneModules.length} module{laneModules.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="operatoros-module-grid">
                {laneModules.map((module) => (
                  <ModuleCard key={module.slug} module={module} signedIn={!!user} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function ModuleCard({ module: m, signedIn }: { module: MarketingModule; signedIn: boolean }) {
  const badge = statusBadgeColor(m.status);
  const cta = moduleCtaTarget(m.status, signedIn);
  const packageAccent =
    m.packageType === 'core'
      ? brand.accentCyan
      : m.packageType === 'included'
        ? brand.accentGreen
        : brand.accentViolet;

  return (
    <div
      data-testid={`module-gateway-card-${m.slug}`}
      className="operatoros-module-card"
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 460,
        borderRadius: 18,
        background: 'linear-gradient(180deg, rgba(18,24,38,0.98), rgba(8,11,18,0.94))',
        border: `1px solid ${brand.borderSoft}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 168,
          background: `radial-gradient(circle at 28% 30%, ${packageAccent}24, transparent 34%), ${brand.bgSecondary}`,
          overflow: 'hidden',
        }}
      >
        {m.imageSrc ? (
          <img
            src={m.imageSrc}
            alt={`${m.name} ${m.packageLabel.toLowerCase()} visual for ${m.audience}.`}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
              filter: 'saturate(1.08) contrast(1.04)',
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
            }}
          />
        )}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 42%, rgba(8,11,18,0.82))',
          }}
        />
        <span
          data-testid={`module-gateway-status-${m.slug}`}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            fontSize: 11,
            fontWeight: 800,
            padding: '5px 10px',
            borderRadius: 999,
            color: badge.text,
            background: badge.bg,
            border: `1px solid ${badge.border}`,
            whiteSpace: 'nowrap',
            backdropFilter: 'blur(8px)',
          }}
        >
          {m.status}
        </span>
        <span
          style={{
            position: 'absolute',
            left: 12,
            bottom: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '5px 9px',
            borderRadius: 999,
            fontSize: 11,
            color: brand.textPrimary,
            border: `1px solid ${packageAccent}66`,
            background: 'rgba(8,11,18,0.76)',
            backdropFilter: 'blur(8px)',
            fontWeight: 800,
          }}
        >
          {m.status === 'Locked' ? <LockKeyhole size={12} /> : <ShieldCheck size={12} />}
          {m.packageLabel}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20, flex: 1 }}>
        <div>
          <h3
            style={{
              fontFamily: brand.fontDisplay,
              fontSize: 20,
              fontWeight: 800,
              color: brand.textPrimary,
              margin: '0 0 6px',
              letterSpacing: '-0.02em',
            }}
          >
            {m.name}
          </h3>
          <p style={{ fontSize: 12, color: brand.textMuted, margin: 0 }}>
            {m.audience}
          </p>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
          {m.outcome}
        </p>

        <div
          style={{
            padding: '11px 12px',
            borderRadius: 12,
            background: 'rgba(255,255,255,0.035)',
            border: `1px solid ${brand.borderSoft}`,
          }}
        >
          <div style={{ fontSize: 11, color: packageAccent, fontWeight: 800, textTransform: 'uppercase', marginBottom: 5 }}>
            Operator value
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.45, color: brand.textSecondary, margin: 0 }}>
            {m.solves}
          </p>
        </div>

        <Link
          href={cta.href}
          data-testid={`module-gateway-cta-${m.slug}`}
          style={{
            marginTop: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: '12px 14px',
            borderRadius: 12,
            minHeight: 44,
            background: m.status === 'Locked' ? 'rgba(124,58,237,0.09)' : 'rgba(255,255,255,0.04)',
            color: brand.textPrimary,
            fontSize: 13,
            fontWeight: 800,
            textDecoration: 'none',
            border: `1px solid ${brand.borderStrong}`,
          }}
        >
          <span>{cta.label}</span>
          <ArrowUpRight size={14} />
        </Link>
      </div>
    </div>
  );
}
