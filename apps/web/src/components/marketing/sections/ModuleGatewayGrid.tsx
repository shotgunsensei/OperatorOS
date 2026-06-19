'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowUpRight, Boxes, LockKeyhole, ShieldCheck } from 'lucide-react';
import { brand } from '@/lib/brand';
import {
  MARKETING_MODULES,
  applyEntitlements,
  statusBadgeColor,
  type MarketingModule,
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

/**
 * Module Gateway Grid — every Shotgun Ninjas module on a single card
 * grid, each card showing the outcome, a status badge, and an
 * auth-aware CTA. The same grid is reused as the primary content of
 * the `/modules` page.
 */
export default function ModuleGatewayGrid({
  heading = 'Modules that unlock as your operation grows.',
  subheading = 'Every module ships with the same single sign-on, billing, and admin surface. Turn one on and it joins your console.',
  testId = 'marketing-module-grid',
}: ModuleGatewayGridProps) {
  const { user } = useAuth();
  // Overlay live entitlement state onto the static catalog. Anonymous
  // viewers get null → static defaults. Signed-in viewers see every
  // module they aren't entitled to flip to "Locked", which routes the
  // CTA to /pricing instead of /app.
  const entitled = useEntitlements();
  const modules = applyEntitlements(MARKETING_MODULES, entitled);

  return (
    <section
      data-testid={testId}
      style={{
        padding: '72px 24px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .operatoros-module-grid {
          display: grid;
          gap: 18px;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        }
        .operatoros-module-card {
          transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
        }
        .operatoros-module-card:hover {
          transform: translateY(-3px);
          border-color: ${brand.borderStrong};
          box-shadow: 0 24px 70px rgba(0,0,0,0.28);
        }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-module-card {
            transition: none;
          }
          .operatoros-module-card:hover {
            transform: none;
          }
        }
        @media (max-width: 640px) {
          .operatoros-module-grid {
            grid-template-columns: 1fr;
          }
        }
      ` }} />
      <div style={{ textAlign: 'center', marginBottom: 42 }}>
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
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          <Boxes size={14} />
          Module Ecosystem
        </span>
        <h2
          data-testid={`${testId}-title`}
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 38,
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: 0,
          }}
        >
          {heading}
        </h2>
        <p style={{ fontSize: 16, color: brand.textSecondary, margin: '0 auto', maxWidth: 640 }}>
          {subheading}
        </p>
      </div>
      <div
        className="operatoros-module-grid"
        style={{
        }}
      >
        {modules.map((m) => (
          <ModuleCard key={m.slug} module={m} signedIn={!!user} />
        ))}
      </div>
    </section>
  );
}

function ModuleCard({ module: m, signedIn }: { module: MarketingModule; signedIn: boolean }) {
  const badge = statusBadgeColor(m.status);
  const cta = moduleCtaTarget(m.status, signedIn);
  const planLabel = `${m.source.planMin.charAt(0).toUpperCase()}${m.source.planMin.slice(1)}+`;

  return (
    <div
      data-testid={`module-gateway-card-${m.slug}`}
      className="operatoros-module-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 430,
        borderRadius: 16,
        background: `linear-gradient(180deg, rgba(18,24,38,0.98), rgba(13,17,23,0.94))`,
        border: `1px solid ${brand.borderSoft}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 154,
          background: `radial-gradient(circle at 28% 30%, ${brand.accentCyan}24, transparent 34%), ${brand.bgSecondary}`,
          overflow: 'hidden',
        }}
      >
        {m.imageSrc ? (
          <img
            src={m.imageSrc}
            alt={`${m.name} module visual for ${m.audience}.`}
            loading="lazy"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
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
        <span
          data-testid={`module-gateway-status-${m.slug}`}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            fontSize: 11,
            fontWeight: 700,
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
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 20, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3
              style={{
                fontFamily: brand.fontDisplay,
                fontSize: 19,
                fontWeight: 700,
                color: brand.textPrimary,
                margin: '0 0 6px',
                letterSpacing: 0,
              }}
            >
              {m.name}
            </h3>
            <p style={{ fontSize: 12, color: brand.textMuted, margin: 0 }}>
              {m.audience}
            </p>
          </div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 8px',
              borderRadius: 8,
              fontSize: 11,
              color: brand.textSecondary,
              border: `1px solid ${brand.borderSoft}`,
              background: 'rgba(255,255,255,0.03)',
              whiteSpace: 'nowrap',
            }}
          >
            {m.status === 'Locked' ? <LockKeyhole size={12} /> : <ShieldCheck size={12} />}
            {planLabel}
          </span>
        </div>

        <p style={{ fontSize: 14, lineHeight: 1.55, color: brand.textSecondary, margin: 0 }}>
          {m.outcome}
        </p>

        <div
          style={{
            padding: '11px 12px',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${brand.borderSoft}`,
          }}
        >
          <div style={{ fontSize: 11, color: brand.accentCyan, fontWeight: 700, textTransform: 'uppercase', marginBottom: 5 }}>
            Solves
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
          padding: '11px 14px',
          borderRadius: 10,
          minHeight: 44,
          background: m.status === 'Locked' ? 'rgba(124,58,237,0.08)' : 'rgba(255,255,255,0.035)',
          color: brand.textPrimary,
          fontSize: 13,
          fontWeight: 700,
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
