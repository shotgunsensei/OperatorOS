'use client';

import React from 'react';
import { CreditCard, KeyRound, Network, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { brand } from '@/lib/brand';
import OperatorMark from '../../brand/OperatorMark';
import { MARKETING_MODULES, type MarketingPackageType } from '@/lib/marketing-catalog';

const RINGS: Array<{
  type: MarketingPackageType;
  label: string;
  radius: number;
  accent: string;
  testIdPrefix: string;
}> = [
  { type: 'core', label: 'Core Products', radius: 24, accent: brand.accentCyan, testIdPrefix: 'orbit-node-core' },
  { type: 'included', label: 'Included With Any Core', radius: 34, accent: brand.accentGreen, testIdPrefix: 'orbit-node-included' },
  { type: 'companion', label: 'Companion Modules', radius: 40, accent: brand.accentViolet, testIdPrefix: 'orbit-node-companion' },
];

const COMMAND_RAILS = [
  { label: 'SSO', icon: KeyRound, accent: brand.accentCyan },
  { label: 'Stripe', icon: CreditCard, accent: brand.accentGreen },
  { label: 'Tenants', icon: ShieldCheck, accent: brand.accentAmber },
  { label: 'Entitlements', icon: SlidersHorizontal, accent: brand.accentViolet },
];

export default function CommandOrbit() {
  const modules = MARKETING_MODULES;

  return (
    <section
      data-testid="marketing-orbit"
      aria-label="OperatorOS ecosystem command map"
      style={{
        position: 'relative',
        padding: '44px 24px 78px',
        maxWidth: 1360,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes operatoros-rail-flow {
          from { background-position: 0 0; }
          to { background-position: 96px 0; }
        }
        @keyframes operatoros-orbit-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .operatoros-orbit-map {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 28px;
          align-items: stretch;
        }
        .operatoros-orbit-node {
          animation: operatoros-orbit-float 6s ease-in-out infinite;
        }
        .operatoros-orbit-node:nth-child(2n) {
          animation-delay: -2.4s;
        }
        .operatoros-command-rail::before {
          content: '';
          position: absolute;
          inset: auto 16px 15px 16px;
          height: 2px;
          border-radius: 999px;
          background: linear-gradient(90deg, transparent, rgba(0,229,255,0.72), transparent);
          background-size: 96px 2px;
          animation: operatoros-rail-flow 4.5s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-orbit-node,
          .operatoros-command-rail::before {
            animation: none !important;
          }
        }
        @media (max-width: 1040px) {
          .operatoros-orbit-map {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 640px) {
          .operatoros-orbit-canvas {
            min-height: 520px !important;
          }
          .operatoros-orbit-node {
            font-size: 10px !important;
            padding: 5px 8px !important;
            max-width: 118px !important;
          }
        }
      ` }} />

      <div style={{ textAlign: 'center', marginBottom: 34 }}>
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
          <Network size={14} />
          Ecosystem command map
        </span>
        <h2
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(34px, 4vw, 54px)',
            fontWeight: 800,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: '-0.04em',
          }}
        >
          One command core. Every module in formation.
        </h2>
        <p style={{ color: brand.textSecondary, fontSize: 16, lineHeight: 1.65, margin: '0 auto', maxWidth: 760 }}>
          OperatorOS sits in the center while product access, tenant context, billing state,
          and child-app launch rails stay synchronized across the ecosystem.
        </p>
      </div>

      <div className="operatoros-orbit-map">
        <div
          className="operatoros-orbit-canvas"
          data-testid="orbit-canvas"
          style={{
            position: 'relative',
            minHeight: 650,
            borderRadius: 28,
            border: `1px solid ${brand.borderStrong}`,
            background:
              'linear-gradient(145deg, rgba(18,24,38,0.94), rgba(8,11,18,0.92)), radial-gradient(circle at 50% 50%, rgba(0,229,255,0.16), transparent 30%)',
            boxShadow: '0 36px 110px rgba(0,0,0,0.38), inset 0 0 90px rgba(0,229,255,0.05)',
            overflow: 'hidden',
            contain: 'paint',
          }}
        >
          <img
            src="/media/operatoros/operatoros-ecosystem-orbit.png"
            alt="OperatorOS ecosystem orbit artwork showing connected module rings around a central command core."
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.38,
              filter: 'saturate(1.14) contrast(1.05)',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 50% 50%, transparent 0 28%, rgba(0,229,255,0.05) 29% 30%, transparent 31% 39%, rgba(34,197,94,0.05) 40% 41%, transparent 42% 50%, rgba(124,58,237,0.06) 51% 52%, transparent 53%), linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
              backgroundSize: 'auto, 32px 32px, 32px 32px',
            }}
          />

          <div
            data-testid="orbit-core"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 154,
              height: 154,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle at 50% 42%, rgba(0,229,255,0.18), rgba(8,11,18,0.96) 68%)',
              border: `1px solid ${brand.borderStrong}`,
              boxShadow: `${brand.ctaGlowLarge}, 0 0 120px rgba(239,35,60,0.16)`,
              zIndex: 4,
            }}
          >
            <OperatorMark size={82} />
          </div>

          {RINGS.map((ring) => (
            <OrbitRing
              key={ring.type}
              modules={modules.filter((module) => module.packageType === ring.type)}
              radius={ring.radius}
              accent={ring.accent}
              testIdPrefix={ring.testIdPrefix}
            />
          ))}
        </div>

        <aside
          aria-label="OperatorOS command rails"
          style={{
            display: 'grid',
            gap: 14,
            alignContent: 'center',
          }}
        >
          {COMMAND_RAILS.map((rail) => {
            const Icon = rail.icon;
            return (
              <div
                key={rail.label}
                className="operatoros-command-rail"
                style={{
                  position: 'relative',
                  minHeight: 122,
                  padding: 18,
                  borderRadius: 18,
                  border: `1px solid ${brand.borderSoft}`,
                  background: `linear-gradient(135deg, ${rail.accent}18, rgba(8,11,18,0.78))`,
                  overflow: 'hidden',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: rail.accent,
                      background: `${rail.accent}1F`,
                      border: `1px solid ${rail.accent}55`,
                    }}
                  >
                    <Icon size={18} />
                  </span>
                  <div>
                    <div style={{ color: brand.textPrimary, fontFamily: brand.fontDisplay, fontWeight: 800, fontSize: 17 }}>
                      {rail.label}
                    </div>
                    <div style={{ color: brand.textMuted, fontSize: 12, marginTop: 3 }}>
                      Routed through OperatorOS
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </aside>
      </div>
    </section>
  );
}

function OrbitRing({
  modules,
  radius,
  accent,
  testIdPrefix,
}: {
  modules: typeof MARKETING_MODULES;
  radius: number;
  accent: string;
  testIdPrefix: string;
}) {
  return (
    <>
      {modules.map((module, index) => {
        const angle = (-92 + (360 / modules.length) * index) * (Math.PI / 180);
        const x = 50 + Math.cos(angle) * radius;
        const y = 50 + Math.sin(angle) * radius;
        return (
          <div
            key={module.slug}
            className="operatoros-orbit-node"
            data-testid={`${testIdPrefix}-${module.slug}`}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              zIndex: 5,
              maxWidth: 164,
              padding: '7px 11px',
              borderRadius: 999,
              background: 'rgba(8,11,18,0.78)',
              border: `1px solid ${accent}66`,
              color: brand.textPrimary,
              fontFamily: brand.fontDisplay,
              fontSize: 12,
              fontWeight: 800,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              backdropFilter: 'blur(12px)',
              boxShadow: `0 0 24px ${accent}22`,
            }}
          >
            {module.name}
          </div>
        );
      })}
    </>
  );
}
