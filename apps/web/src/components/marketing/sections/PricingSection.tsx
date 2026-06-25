'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Minus, Plus } from 'lucide-react';
import {
  calculateStackMonthlyPrice,
  COMPANION_MODULES,
  COMPANION_MODULE_PRICE_CENTS,
  CORE_PRODUCTS,
  DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS,
  INCLUDED_WITH_ANY_PAID_CORE,
  type CompanionModuleKey,
  type CoreProductKey,
} from '@operatoros/sdk';
import { brand } from '@/lib/brand';
import { billingApi } from '@/lib/auth';
import { useAuth } from '../../AuthProvider';

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

export default function PricingSection() {
  const { user } = useAuth();
  const [coreProduct, setCoreProduct] = React.useState<CoreProductKey>('tradeflowkit');
  const [freeCompanion, setFreeCompanion] = React.useState<CompanionModuleKey>('snapproofos');
  const [additionalModules, setAdditionalModules] = React.useState<CompanionModuleKey[]>([]);
  const [additionalSeats, setAdditionalSeats] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const price = calculateStackMonthlyPrice({
    coreProduct,
    freeCompanionModule: freeCompanion,
    additionalModules,
    additionalSeats,
  }, DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS);

  const toggleAdditionalModule = (moduleKey: CompanionModuleKey) => {
    setAdditionalModules(current =>
      current.includes(moduleKey)
        ? current.filter(key => key !== moduleKey)
        : [...current, moduleKey],
    );
  };

  const chooseFreeCompanion = (moduleKey: CompanionModuleKey) => {
    setFreeCompanion(moduleKey);
    setAdditionalModules(current => current.filter(key => key !== moduleKey));
  };

  const continueToCheckout = async () => {
    if (!user) {
      window.location.href = '/login?next=/pricing%23build-stack';
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await billingApi.createStackCheckout({
        coreProduct,
        freeCompanionModule: freeCompanion,
        additionalModules,
        additionalSeats,
      });
      if (result?.url) window.location.href = result.url;
      else setError('Checkout did not return a redirect URL.');
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout is not available.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <style>{`
        .pricing-shell { width: 100%; max-width: ${brand.contentMaxWidth}px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
        .core-product-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
        .pricing-hero-grid { display: grid; grid-template-columns: minmax(0, .92fr) minmax(420px, 1.08fr); gap: 42px; align-items: center; text-align: left; }
        .pricing-hero-actions { justify-content: flex-start; }
        .stack-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, .65fr); gap: 28px; align-items: start; }
        .stack-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .included-app-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
        .pricing-control { transition: border-color 160ms ease, background 160ms ease, transform 160ms ease; }
        .pricing-control:hover { border-color: ${brand.borderStrong} !important; transform: translateY(-1px); }
        .pricing-control:focus-visible { outline: 2px solid ${brand.accentCyan}; outline-offset: 2px; }
        @media (max-width: 900px) {
          .core-product-grid, .included-app-grid { grid-template-columns: 1fr; }
          .pricing-hero-grid { grid-template-columns: 1fr; text-align: center; }
          .pricing-hero-actions { justify-content: center; }
          .stack-grid { grid-template-columns: 1fr; }
          .stack-summary { position: static !important; }
        }
        @media (max-width: 600px) {
          .pricing-shell { padding-left: 16px; padding-right: 16px; }
          .stack-options { grid-template-columns: 1fr; }
          .operatoros-free-layer { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pricing-control { transition: none; }
          .pricing-control:hover { transform: none; }
        }
      `}</style>

      <section className="pricing-shell" style={{ paddingTop: 72, paddingBottom: 42, textAlign: 'center' }}>
        <div className="pricing-hero-grid">
          <div>
            <h1 style={{
              fontFamily: brand.fontDisplay,
              fontSize: 'clamp(38px, 6vw, 66px)',
              lineHeight: 1.02,
              letterSpacing: '-0.04em',
              color: brand.textPrimary,
              margin: '0 0 22px',
            }}>
              Build the stack your operation needs.
            </h1>
            <p style={{ color: brand.textSecondary, fontSize: 18, lineHeight: 1.65, margin: '0 0 30px' }}>
              OperatorOS is free. Choose a fully unlocked core product, get 5 operator seats,
              included apps, and one companion module at no additional cost.
            </p>
            <div className="pricing-hero-actions" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <a href="#build-stack" style={primaryButtonStyle}>Build Your Stack <ArrowRight size={16} /></a>
              <Link href="/login" style={secondaryButtonStyle}>Sign In</Link>
            </div>
          </div>
          <div style={{
            minHeight: 350,
            borderRadius: 18,
            border: `1px solid ${brand.borderStrong}`,
            overflow: 'hidden',
            background: brand.bgSecondary,
            boxShadow: '0 28px 80px rgba(0,0,0,.42)',
          }}>
            <img
              src="/media/operatoros/operatoros-hero.png"
              alt="OperatorOS command layer visualization"
              style={{ width: '100%', height: '100%', minHeight: 350, objectFit: 'cover', display: 'block' }}
            />
          </div>
        </div>
      </section>

      <section className="pricing-shell" style={{ paddingTop: 28, paddingBottom: 70 }}>
        <div className="operatoros-free-layer" style={{
          padding: '28px clamp(22px, 4vw, 42px)',
          border: `1px solid ${brand.borderSoft}`,
          background: brand.bgSecondary,
          borderRadius: 16,
          display: 'grid',
          gap: 20,
          gridTemplateColumns: 'minmax(220px, .7fr) minmax(0, 1.3fr)',
        }}>
          <div>
            <div style={{ color: brand.accentCyan, fontWeight: 750, fontSize: 14 }}>OperatorOS command layer — $0</div>
            <p style={{ color: brand.textSecondary, fontSize: 14, lineHeight: 1.55, margin: '8px 0 0' }}>
              The parent authority stays free while your tenant pays only for the applications it operates.
            </p>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px 22px', alignContent: 'center' }}>
            {['SSO', 'Tenant Management', 'User Management', 'Billing', 'Entitlements', 'Audit Trail'].map(item => (
              <span key={item} style={{ color: brand.textPrimary, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                <Check size={14} color={brand.accentGreen} /> {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-shell" aria-labelledby="core-products-heading" style={{ paddingBottom: 90 }}>
        <header style={{ marginBottom: 30 }}>
          <h2 id="core-products-heading" style={sectionHeadingStyle}>Choose one fully unlocked core product.</h2>
          <p style={sectionCopyStyle}>No feature gates. No bundles to decode. Each product includes the same operator foundation.</p>
        </header>
        <div className="core-product-grid">
          {CORE_PRODUCTS.map(product => (
            <article key={product.key} data-testid={`pricing-card-${product.key}`} style={productCardStyle}>
              <div>
                <h3 style={{ color: brand.textPrimary, fontFamily: brand.fontDisplay, fontSize: 23, margin: 0 }}>{product.name}</h3>
                <p style={{ color: brand.textSecondary, fontSize: 13, lineHeight: 1.55, minHeight: 42 }}>{product.description}</p>
              </div>
              <div style={{ color: brand.textPrimary, fontFamily: brand.fontDisplay, fontWeight: 800, fontSize: 34 }}>
                {money(product.monthlyPriceCents)}<span style={{ color: brand.textMuted, fontSize: 13, fontWeight: 500 }}>/mo</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 9 }}>
                {[
                  'Fully Unlocked',
                  '5 Seats Included',
                  'TorqueShed + FaultlineLab + Ninja Pool Hall',
                  'Choose 1 free companion module',
                  'Extra modules $29/mo',
                  'Extra seats available',
                ].map(item => (
                  <li key={item} style={{ color: brand.textSecondary, fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <Check size={15} color={brand.accentCyan} style={{ marginTop: 2, flexShrink: 0 }} /> {item}
                  </li>
                ))}
              </ul>
              <a href="#build-stack" onClick={() => setCoreProduct(product.key)} style={{ ...secondaryButtonStyle, width: '100%', boxSizing: 'border-box' }}>
                Build Your Stack
              </a>
            </article>
          ))}
        </div>
      </section>

      <section id="build-stack" style={{ background: brand.bgSecondary, borderTop: `1px solid ${brand.borderSoft}`, borderBottom: `1px solid ${brand.borderSoft}` }}>
        <div className="pricing-shell" style={{ paddingTop: 88, paddingBottom: 88 }}>
          <header style={{ marginBottom: 34 }}>
            <h2 style={sectionHeadingStyle}>Build Your Stack</h2>
            <p style={sectionCopyStyle}>Choose one core product, one included companion module, and any additional capacity your team needs.</p>
          </header>
          <div className="stack-grid">
            <div style={{ display: 'grid', gap: 28 }}>
              <ConfiguratorStep number="1" title="Core Product">
                <div className="stack-options">
                  {CORE_PRODUCTS.map(product => (
                    <ChoiceButton key={product.key} selected={coreProduct === product.key} onClick={() => setCoreProduct(product.key)}>
                      <strong>{product.name}</strong><span>{money(product.monthlyPriceCents)}/mo</span>
                    </ChoiceButton>
                  ))}
                </div>
              </ConfiguratorStep>
              <ConfiguratorStep number="2" title="Included Companion Module">
                <div className="stack-options">
                  {COMPANION_MODULES.map(module => (
                    <ChoiceButton key={module.key} selected={freeCompanion === module.key} onClick={() => chooseFreeCompanion(module.key as CompanionModuleKey)}>
                      <strong>{module.name}</strong><span>{freeCompanion === module.key ? '$0 included' : 'Select'}</span>
                    </ChoiceButton>
                  ))}
                </div>
              </ConfiguratorStep>
              <ConfiguratorStep number="3" title="Additional Modules">
                <div className="stack-options">
                  {COMPANION_MODULES.filter(module => module.key !== freeCompanion).map(module => {
                    const moduleKey = module.key as CompanionModuleKey;
                    return (
                      <ChoiceButton key={module.key} selected={additionalModules.includes(moduleKey)} onClick={() => toggleAdditionalModule(moduleKey)}>
                        <strong>{module.name}</strong><span>+{money(COMPANION_MODULE_PRICE_CENTS)}/mo</span>
                      </ChoiceButton>
                    );
                  })}
                </div>
              </ConfiguratorStep>
              <ConfiguratorStep number="4" title="Additional Seats">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <button className="pricing-control" type="button" aria-label="Remove additional seat" onClick={() => setAdditionalSeats(value => Math.max(0, value - 1))} style={counterButtonStyle}>
                    <Minus size={16} />
                  </button>
                  <output data-testid="additional-seat-count" style={{ color: brand.textPrimary, fontSize: 22, fontWeight: 800, minWidth: 34, textAlign: 'center' }}>{additionalSeats}</output>
                  <button className="pricing-control" type="button" aria-label="Add additional seat" onClick={() => setAdditionalSeats(value => value + 1)} style={counterButtonStyle}>
                    <Plus size={16} />
                  </button>
                  <span style={{ color: brand.textSecondary, fontSize: 13 }}>+{money(DEFAULT_ADDITIONAL_SEAT_PRICE_CENTS)}/mo per seat</span>
                </div>
              </ConfiguratorStep>
            </div>

            <aside className="stack-summary" style={{ ...productCardStyle, position: 'sticky', top: 88 }} aria-live="polite">
              <div>
                <div style={{ color: brand.textMuted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.08em' }}>Estimated Monthly Total</div>
                <div data-testid="stack-monthly-total" style={{ color: brand.textPrimary, fontFamily: brand.fontDisplay, fontSize: 46, fontWeight: 850, marginTop: 8 }}>
                  {money(price.totalMonthlyCents)}<span style={{ color: brand.textMuted, fontSize: 14, fontWeight: 500 }}>/mo</span>
                </div>
              </div>
              <SummaryRow label="Base product" value={money(price.baseProductCents)} />
              <SummaryRow label="Included companion" value="$0" />
              <SummaryRow label={`${additionalModules.length} additional module${additionalModules.length === 1 ? '' : 's'}`} value={money(price.additionalModulesCents)} />
              <SummaryRow label={`${additionalSeats} additional seat${additionalSeats === 1 ? '' : 's'}`} value={money(price.additionalSeatsCents)} />
              <div style={{ borderTop: `1px solid ${brand.borderSoft}`, paddingTop: 16 }}>
                <div style={{ color: brand.textMuted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Included Apps</div>
                <div style={{ color: brand.textSecondary, fontSize: 13, lineHeight: 1.6 }}>TorqueShed · FaultlineLab · Ninja Pool Hall</div>
              </div>
              {error && <p role="alert" style={{ color: '#ff7b72', fontSize: 13, margin: 0 }}>{error}</p>}
              <button data-testid="stack-checkout-cta" type="button" onClick={continueToCheckout} disabled={busy} className="pricing-control" style={{ ...primaryButtonStyle, border: 0, width: '100%', cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'Preparing Checkout…' : user ? 'Continue to Checkout' : 'Sign In to Continue'}
              </button>
              {user ? <Link href="/app" style={{ color: brand.textSecondary, textAlign: 'center', fontSize: 13 }}>Return to OperatorOS</Link> : <Link href="/login" style={{ color: brand.textSecondary, textAlign: 'center', fontSize: 13 }}>Sign In Instead</Link>}
              <p style={{ color: brand.textMuted, fontSize: 11, textAlign: 'center', margin: 0 }}>Final price confirmed in Stripe Checkout.</p>
            </aside>
          </div>
        </div>
      </section>

      <section className="pricing-shell" style={{ paddingTop: 88, paddingBottom: 72 }}>
        <header style={{ marginBottom: 30 }}>
          <h2 style={sectionHeadingStyle}>Everything included with a paid core product</h2>
        </header>
        <div className="included-app-grid">
          {INCLUDED_WITH_ANY_PAID_CORE.map(app => (
            <div key={app.key} style={{ padding: '26px 0', borderTop: `1px solid ${brand.borderStrong}` }}>
              <h3 style={{ color: brand.textPrimary, fontSize: 18, margin: '0 0 9px' }}>{app.name}</h3>
              <p style={{ color: brand.textSecondary, fontSize: 14, lineHeight: 1.6, margin: 0 }}>{app.description}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 54, padding: '30px', background: brand.bgSecondary, border: `1px solid ${brand.borderSoft}`, borderRadius: 14 }}>
          <h3 style={{ color: brand.textPrimary, fontSize: 20, margin: '0 0 18px' }}>Choose one companion module at no additional cost</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {COMPANION_MODULES.map(module => (
              <span key={module.key} style={{ color: brand.textSecondary, padding: '8px 11px', border: `1px solid ${brand.borderSoft}`, borderRadius: 8, fontSize: 13 }}>{module.name}</span>
            ))}
          </div>
          <p style={{ color: brand.accentCyan, fontSize: 13, margin: '18px 0 0' }}>Additional modules are $29/mo each.</p>
        </div>
      </section>
    </>
  );
}

function ConfiguratorStep({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ color: brand.textPrimary, fontSize: 16, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: brand.accentCyan, fontSize: 12, fontWeight: 800 }}>{number.padStart(2, '0')}</span> {title}
      </h3>
      {children}
    </section>
  );
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="pricing-control" aria-pressed={selected} onClick={onClick} style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 52,
      padding: '13px 14px',
      borderRadius: 10,
      border: `1px solid ${selected ? brand.accentCyan : brand.borderSoft}`,
      background: selected ? 'rgba(57, 210, 255, .08)' : brand.bgPrimary,
      color: brand.textPrimary,
      cursor: 'pointer',
      textAlign: 'left',
      fontSize: 13,
    }}>
      {children}
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: brand.textSecondary, fontSize: 13 }}><span>{label}</span><strong style={{ color: brand.textPrimary }}>{value}</strong></div>;
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 46,
  padding: '12px 20px',
  borderRadius: 10,
  background: `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`,
  color: brand.accentInk,
  fontWeight: 750,
  fontSize: 14,
  textDecoration: 'none',
  boxShadow: brand.ctaGlowSoft,
};

const secondaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '11px 18px',
  borderRadius: 10,
  border: `1px solid ${brand.borderStrong}`,
  color: brand.textPrimary,
  fontWeight: 650,
  fontSize: 14,
  textDecoration: 'none',
  background: 'transparent',
};

const sectionHeadingStyle: React.CSSProperties = {
  color: brand.textPrimary,
  fontFamily: brand.fontDisplay,
  fontSize: 'clamp(28px, 4vw, 42px)',
  letterSpacing: '-.025em',
  margin: '0 0 12px',
};

const sectionCopyStyle: React.CSSProperties = {
  color: brand.textSecondary,
  fontSize: 16,
  lineHeight: 1.6,
  maxWidth: 720,
  margin: 0,
};

const productCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
  padding: 26,
  borderRadius: 16,
  border: `1px solid ${brand.borderSoft}`,
  background: brand.bgSecondary,
};

const counterButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 9,
  border: `1px solid ${brand.borderSoft}`,
  background: brand.bgPrimary,
  color: brand.textPrimary,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};
