'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  CreditCard,
  KeyRound,
  Network,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { brand } from '@/lib/brand';
import { useAuth } from '../../AuthProvider';
import { primaryCtaTarget } from '@/lib/marketing-cta';

const VALUE_STRIP = [
  { label: 'SSO handoff', icon: KeyRound },
  { label: 'Tenant scope', icon: ShieldCheck },
  { label: 'Stripe control', icon: CreditCard },
  { label: 'Entitlement rails', icon: SlidersHorizontal },
];

const STACK_LAYERS = [
  { label: 'Core products', value: 'TradeFlowKit · PulseDesk · TechDeck', accent: brand.accentCyan },
  { label: 'Included apps', value: 'TorqueShed · FaultlineLab · Ninja Pool Hall', accent: brand.accentGreen },
  { label: 'Companion modules', value: 'SnapProofOS · BrandForgeOS · Ninjamation', accent: brand.accentViolet },
];

const COMMAND_SIGNALS = ['Login', 'Billing', 'Tenants', 'SSO', 'Modules'];

export default function Hero() {
  const { user, loading } = useAuth();
  const primary = primaryCtaTarget(!!user);

  return (
    <section
      data-testid="marketing-hero"
      style={{
        position: 'relative',
        padding: '96px 24px 58px',
        maxWidth: 1360,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes operatoros-hero-pulse {
          0%, 100% { opacity: 0.58; transform: translate3d(0,0,0) scale(1); }
          50% { opacity: 0.92; transform: translate3d(0,-4px,0) scale(1.015); }
        }
        @keyframes operatoros-scanline {
          0% { transform: translateY(-100%); opacity: 0; }
          22% { opacity: 0.5; }
          100% { transform: translateY(100%); opacity: 0; }
        }
        .operatoros-hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.88fr) minmax(520px, 1.12fr);
          gap: 42px;
          align-items: center;
        }
        .operatoros-hero-title {
          font-size: clamp(52px, 6.1vw, 92px);
        }
        .operatoros-hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .operatoros-hero-actions a {
          box-sizing: border-box;
        }
        .operatoros-value-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .operatoros-hero-visual {
          min-height: 620px;
        }
        .operatoros-hero-visual::after {
          content: '';
          position: absolute;
          inset: -40% 0;
          background: linear-gradient(180deg, transparent, rgba(0,229,255,0.14), transparent);
          animation: operatoros-scanline 7s ease-in-out infinite;
          pointer-events: none;
        }
        .operatoros-command-node {
          animation: operatoros-hero-pulse 5.5s ease-in-out infinite;
        }
        .operatoros-command-node:nth-child(2n) {
          animation-delay: -1.8s;
        }
        @media (prefers-reduced-motion: reduce) {
          .operatoros-hero-visual::after,
          .operatoros-command-node {
            animation: none !important;
          }
        }
        @media (max-width: 1080px) {
          .operatoros-hero-grid {
            grid-template-columns: 1fr;
          }
          .operatoros-hero-visual {
            min-height: 540px;
          }
        }
        @media (max-width: 680px) {
          .operatoros-hero-title {
            font-size: clamp(42px, 15vw, 54px);
            overflow-wrap: anywhere;
          }
          .operatoros-hero-actions a {
            width: 100%;
            justify-content: center;
          }
          .operatoros-value-strip {
            grid-template-columns: 1fr 1fr;
          }
          .operatoros-hero-visual {
            min-height: 500px;
          }
          .operatoros-stack-layer {
            grid-template-columns: 1fr !important;
          }
          .operatoros-stack-layer span:last-child {
            text-align: left !important;
          }
        }
      ` }} />

      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage:
            'url(/media/operatoros/operatoros-command-grid-bg.png), radial-gradient(circle at 75% 12%, rgba(239,35,60,0.23), transparent 28%), radial-gradient(circle at 22% 16%, rgba(0,229,255,0.18), transparent 30%), linear-gradient(180deg, rgba(124,58,237,0.08), transparent 46%)',
          backgroundSize: 'cover, auto, auto, auto',
          backgroundPosition: 'center, center, center, center',
          opacity: 0.82,
          maskImage: 'linear-gradient(180deg, #000 0%, #000 72%, transparent 100%)',
        }}
      />

      <div className="operatoros-hero-grid" style={{ position: 'relative' }}>
        <div>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 12px',
              borderRadius: 999,
              background: brand.bgGlass,
              border: `1px solid ${brand.borderSoft}`,
              color: brand.accentCyan,
              fontFamily: brand.fontDisplay,
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              marginBottom: 18,
              boxShadow: '0 0 38px rgba(0,229,255,0.14)',
            }}
          >
            <Sparkles size={14} />
            Parent command nexus
          </span>

          <h1
            className="operatoros-hero-title"
            data-testid="marketing-hero-title"
            style={{
              fontFamily: brand.fontDisplay,
              fontWeight: 800,
              lineHeight: 0.94,
              letterSpacing: '-0.055em',
              color: brand.textPrimary,
              margin: '0 0 22px',
              maxWidth: 780,
              textShadow: '0 0 34px rgba(0,229,255,0.08), 0 0 52px rgba(239,35,60,0.08)',
            }}
          >
            Command Every Moving Part.
          </h1>

          <p
            data-testid="marketing-hero-subtitle"
            style={{
              fontSize: 18,
              lineHeight: 1.65,
              color: brand.textSecondary,
              margin: '0 0 30px',
              maxWidth: 660,
            }}
          >
            OperatorOS is the parent control layer for login, Stripe billing,
            tenant scope, entitlement checks, and SSO handoff across the entire
            Shotgun Ninjas software ecosystem.
          </p>

          <div className="operatoros-hero-actions">
            <Link
              href={loading ? '/login' : primary.href}
              data-testid="hero-cta-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '15px 24px',
                borderRadius: 12,
                minHeight: 46,
                background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
                color: brand.accentInk,
                fontWeight: 800,
                fontSize: 15,
                textDecoration: 'none',
                boxShadow: brand.ctaGlowLarge,
              }}
            >
              Launch OperatorOS <ArrowRight size={16} />
            </Link>
            <Link
              href="/modules"
              data-testid="hero-cta-secondary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '15px 24px',
                borderRadius: 12,
                minHeight: 46,
                background: 'rgba(8,11,18,0.72)',
                color: brand.textPrimary,
                fontWeight: 700,
                fontSize: 15,
                textDecoration: 'none',
                border: `1px solid ${brand.borderStrong}`,
                backdropFilter: 'blur(10px)',
              }}
            >
              View module ecosystem
            </Link>
          </div>

          <div className="operatoros-value-strip" aria-label="OperatorOS platform value" style={{ marginTop: 34 }}>
            {VALUE_STRIP.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 44,
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'rgba(8,11,18,0.68)',
                    border: `1px solid ${brand.borderSoft}`,
                    color: brand.textSecondary,
                    fontSize: 12,
                    fontWeight: 700,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Icon size={15} color={brand.accentCyan} />
                  {item.label}
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="operatoros-hero-visual"
          aria-label="OperatorOS command nexus preview"
          style={{
            position: 'relative',
            borderRadius: 28,
            border: `1px solid ${brand.borderStrong}`,
            background: 'linear-gradient(160deg, rgba(18,24,38,0.96), rgba(8,11,18,0.88))',
            boxShadow: '0 38px 120px rgba(0,0,0,0.54), 0 0 90px rgba(0,229,255,0.12)',
            overflow: 'hidden',
            padding: 18,
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle at 50% 44%, rgba(0,229,255,0.26), transparent 28%), radial-gradient(circle at 70% 24%, rgba(239,35,60,0.22), transparent 28%), linear-gradient(rgba(148,163,184,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.07) 1px, transparent 1px)',
              backgroundSize: 'auto, auto, 30px 30px, 30px 30px',
            }}
          />

          <img
            src="/media/operatoros/operatoros-command-nexus.png"
            alt="Cinematic OperatorOS command nexus connecting modules through glowing SSO, billing, tenant, and entitlement rails."
            onError={(event) => {
              event.currentTarget.src = '/media/operatoros/operatoros-hero.png';
            }}
            style={{
              position: 'absolute',
              inset: 18,
              width: 'calc(100% - 36px)',
              height: 'calc(100% - 36px)',
              objectFit: 'cover',
              borderRadius: 22,
              opacity: 0.82,
              filter: 'saturate(1.12) contrast(1.08)',
            }}
          />

          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 18,
              borderRadius: 22,
              background: 'linear-gradient(90deg, rgba(8,11,18,0.2), transparent 34%, rgba(8,11,18,0.56)), linear-gradient(180deg, transparent 46%, rgba(8,11,18,0.86))',
            }}
          />

          <div style={{ position: 'relative', minHeight: '100%', display: 'grid', alignContent: 'space-between', gap: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div
                style={{
                  maxWidth: 360,
                  padding: 16,
                  borderRadius: 16,
                  background: 'rgba(8,11,18,0.78)',
                  border: `1px solid ${brand.borderStrong}`,
                  backdropFilter: 'blur(14px)',
                }}
              >
                <div style={{ color: brand.accentCyan, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
                  OperatorOS command layer
                </div>
                <div style={{ color: brand.textPrimary, fontFamily: brand.fontDisplay, fontSize: 24, fontWeight: 800, lineHeight: 1.08 }}>
                  One login. Every operation.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {COMMAND_SIGNALS.map((signal) => (
                  <span
                    key={signal}
                    className="operatoros-command-node"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '8px 10px',
                      borderRadius: 999,
                      color: brand.textPrimary,
                      background: 'rgba(8,11,18,0.72)',
                      border: `1px solid ${brand.borderSoft}`,
                      fontSize: 11,
                      fontWeight: 800,
                      backdropFilter: 'blur(12px)',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: signal === 'Billing' ? brand.accentGreen : brand.accentCyan,
                        boxShadow: `0 0 14px ${signal === 'Billing' ? brand.accentGreen : brand.accentCyan}`,
                      }}
                    />
                    {signal}
                  </span>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gap: 10,
                padding: 14,
                borderRadius: 18,
                background: 'rgba(8,11,18,0.78)',
                border: `1px solid ${brand.borderStrong}`,
                backdropFilter: 'blur(14px)',
              }}
            >
              {STACK_LAYERS.map((layer) => (
                <div
                  key={layer.label}
                  className="operatoros-stack-layer"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '155px minmax(0, 1fr)',
                    gap: 14,
                    alignItems: 'center',
                    padding: '11px 12px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.035)',
                    border: `1px solid ${brand.borderSoft}`,
                  }}
                >
                  <span style={{ color: layer.accent, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                    {layer.label}
                  </span>
                  <span style={{ color: brand.textSecondary, fontSize: 13, lineHeight: 1.4, textAlign: 'right' }}>
                    {layer.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <Network
            aria-hidden
            size={150}
            style={{
              position: 'absolute',
              right: 26,
              bottom: 118,
              color: brand.accentCyan,
              opacity: 0.1,
              filter: 'drop-shadow(0 0 22px rgba(0,229,255,0.55))',
            }}
          />
        </div>
      </div>
    </section>
  );
}
