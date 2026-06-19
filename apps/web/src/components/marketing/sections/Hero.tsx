'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Boxes, KeyRound, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { brand } from '@/lib/brand';
import { useAuth } from '../../AuthProvider';
import { primaryCtaTarget } from '@/lib/marketing-cta';

const HERO_STATS = [
  { label: 'Parent layer', value: 'OperatorOS' },
  { label: 'Access model', value: 'Entitlements' },
  { label: 'Tenant model', value: 'Scoped modules' },
];

const VALUE_STRIP = [
  { label: 'One login', icon: KeyRound },
  { label: 'Tenant-aware modules', icon: ShieldCheck },
  { label: 'Modular business OS', icon: Boxes },
  { label: 'Entitlement-driven access', icon: SlidersHorizontal },
];

/**
 * Hero — first paint of the Phase 2 homepage.
 *
 * Headline + subhead + two CTAs. The primary CTA is auth-aware (signed-
 * out visitors land on /login first, then bounce to /app). Visuals come
 * from the shared brand tokens — no hardcoded hex.
 */
export default function Hero() {
  const { user, loading } = useAuth();
  const primary = primaryCtaTarget(!!user);

  return (
    <section
      data-testid="marketing-hero"
      style={{
        position: 'relative',
        padding: '84px 24px 44px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .operatoros-hero-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.95fr);
          gap: 40px;
          align-items: center;
        }
        .operatoros-hero-title {
          font-size: 64px;
        }
        .operatoros-hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .operatoros-hero-visual {
          min-height: 520px;
        }
        .operatoros-value-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .operatoros-hero-media {
          object-position: center;
        }
        .operatoros-hero-module-row {
          grid-template-columns: 112px minmax(0, 1fr) auto;
        }
        @media (max-width: 980px) {
          .operatoros-hero-grid {
            grid-template-columns: 1fr;
          }
          .operatoros-hero-visual {
            min-height: 460px;
          }
        }
        @media (max-width: 680px) {
          .operatoros-hero-title {
            font-size: 42px;
          }
          .operatoros-hero-actions a {
            width: 100%;
            justify-content: center;
          }
          .operatoros-value-strip {
            grid-template-columns: 1fr 1fr;
          }
          .operatoros-hero-visual {
            min-height: 420px;
          }
          .operatoros-hero-stat-grid {
            grid-template-columns: 1fr !important;
          }
          .operatoros-hero-module-row {
            grid-template-columns: minmax(0, 1fr) auto;
          }
          .operatoros-hero-module-row .operatoros-module-meter {
            display: none;
          }
          .operatoros-hero-floating {
            position: relative !important;
            left: auto !important;
            bottom: auto !important;
            width: auto !important;
            margin-top: 14px;
          }
          .operatoros-hero-media {
            height: 92px !important;
          }
        }
      ` }} />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `${brand.heroRadial}, linear-gradient(180deg, rgba(239,35,60,0.08), transparent 38%)`,
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
              letterSpacing: 0,
              textTransform: 'uppercase',
              marginBottom: 18,
            }}
          >
            Parent command layer
          </span>
          <h1
            className="operatoros-hero-title"
            data-testid="marketing-hero-title"
            style={{
              fontFamily: brand.fontDisplay,
              fontWeight: 700,
              lineHeight: 1.02,
              letterSpacing: 0,
              color: brand.textPrimary,
              margin: '0 0 22px',
              maxWidth: 720,
            }}
          >
            Command Every Moving Part.
          </h1>
          <p
            data-testid="marketing-hero-subtitle"
            style={{
              fontSize: 18,
              lineHeight: 1.6,
              color: brand.textSecondary,
              margin: '0 0 30px',
              maxWidth: 640,
            }}
          >
            OperatorOS is a modular business operating system for tenant-aware
            modules, entitlement-driven access, billing control, and child-app
            handoff.
          </p>
          <div className="operatoros-hero-actions">
            <Link
              href={loading ? '/login' : primary.href}
              data-testid="hero-cta-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '14px 24px',
                borderRadius: 10,
                minHeight: 44,
                background: `linear-gradient(135deg, ${brand.accentCyan} 0%, ${brand.accentViolet} 100%)`,
                color: brand.accentInk,
                fontWeight: 700,
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
                padding: '14px 24px',
                borderRadius: 10,
                minHeight: 44,
                background: 'rgba(255,255,255,0.03)',
                color: brand.textPrimary,
                fontWeight: 600,
                fontSize: 15,
                textDecoration: 'none',
                border: `1px solid ${brand.borderStrong}`,
              }}
            >
              View module ecosystem
            </Link>
          </div>
          <div
            className="operatoros-value-strip"
            aria-label="OperatorOS platform value"
            style={{ marginTop: 34 }}
          >
            {VALUE_STRIP.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minHeight: 42,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: `1px solid ${brand.borderSoft}`,
                    color: brand.textSecondary,
                    fontSize: 12,
                    fontWeight: 600,
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
          aria-label="OperatorOS command center preview"
          style={{
            position: 'relative',
            borderRadius: 18,
            border: `1px solid ${brand.borderStrong}`,
            background: `linear-gradient(160deg, rgba(18,24,38,0.96), rgba(8,11,18,0.86)), radial-gradient(circle at 22% 18%, rgba(0,229,255,0.18), transparent 28%)`,
            boxShadow: '0 30px 90px rgba(0,0,0,0.42)',
            overflow: 'hidden',
            padding: 18,
          }}
        >
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage:
                'linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)',
              backgroundSize: '28px 28px',
              maskImage: 'linear-gradient(180deg, #000, transparent 82%)',
            }}
          />
          <div style={{ position: 'relative', display: 'grid', gap: 14 }}>
            <img
              src="/media/operatoros/operatoros-hero.png"
              alt="OperatorOS brand command layer graphic with red and blue network energy."
              className="operatoros-hero-media"
              style={{
                width: '100%',
                height: 132,
                objectFit: 'cover',
                borderRadius: 14,
                border: `1px solid ${brand.borderSoft}`,
                boxShadow: '0 18px 42px rgba(0,0,0,0.32)',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'center',
                padding: 14,
                borderRadius: 12,
                background: 'rgba(8,11,18,0.76)',
                border: `1px solid ${brand.borderSoft}`,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: brand.textMuted, marginBottom: 4 }}>
                  Operator layer
                </div>
                <div style={{ fontFamily: brand.fontDisplay, fontSize: 20, color: brand.textPrimary, fontWeight: 700 }}>
                  One login. Every operation.
                </div>
              </div>
              <span
                style={{
                  padding: '5px 9px',
                  borderRadius: 999,
                  color: brand.statusAvailableText,
                  background: brand.statusAvailableBg,
                  border: `1px solid ${brand.statusAvailableBorder}`,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                LIVE
              </span>
            </div>

            <div className="operatoros-hero-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {HERO_STATS.map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    minHeight: 78,
                    padding: 12,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.035)',
                    border: `1px solid ${brand.borderSoft}`,
                  }}
                >
                  <div style={{ fontSize: 11, color: brand.textMuted, marginBottom: 8 }}>{stat.label}</div>
                  <div style={{ fontSize: 15, color: brand.textPrimary, fontWeight: 700 }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background: 'rgba(8,11,18,0.74)',
                border: `1px solid ${brand.borderSoft}`,
              }}
            >
              {['TradeFlowKit', 'TechDeck', 'PulseDesk', 'Ninjamation'].map((name, index) => (
                <div
                  key={name}
                  className="operatoros-hero-module-row"
                  style={{
                    display: 'grid',
                    gap: 10,
                    alignItems: 'center',
                    padding: index === 0 ? '0 0 12px' : '12px 0',
                    borderTop: index === 0 ? 'none' : `1px solid ${brand.borderSoft}`,
                  }}
                >
                  <span style={{ color: brand.textPrimary, fontWeight: 700, fontSize: 13 }}>{name}</span>
                  <span
                    className="operatoros-module-meter"
                    aria-hidden
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${brand.accentCyan}, rgba(124,58,237,0.32))`,
                      opacity: 0.8 - index * 0.09,
                    }}
                  />
                  <span style={{ color: brand.textMuted, fontSize: 11 }}>Ready</span>
                </div>
              ))}
            </div>
          </div>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 24,
              bottom: 24,
              width: 210,
              padding: 14,
              borderRadius: 14,
              background: 'rgba(8,11,18,0.82)',
              border: `1px solid ${brand.borderSoft}`,
              backdropFilter: 'blur(12px)',
            }}
            className="operatoros-hero-floating"
          >
            <div style={{ color: brand.accentCyan, fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
              From chaos to command
            </div>
            <div style={{ color: brand.textSecondary, fontSize: 12, lineHeight: 1.5, marginTop: 7 }}>
              Auth, tenants, modules, billing, and handoff signals in one parent platform.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
