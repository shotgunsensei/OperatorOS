'use client';

import React from 'react';
import { brand } from '@/lib/brand';
import { marketingAddOns, marketingPricingTiers, type MarketingAddOn } from '@/lib/marketing-pricing';

/**
 * AddOnPriceTable — per-module add-on price reference for `/pricing`.
 *
 * Renders below the four tier cards so a visitor who has already
 * picked a tier can see, at a glance, what extra modules cost and
 * which tier already includes them.
 *
 * Layout notes:
 *   - Desktop: a real <table> for fast scanning and screen-reader
 *     comprehension.
 *   - Mobile (≤640px): the same rows fall back to stacked cards via
 *     CSS so the data stays legible without horizontal scrolling.
 *   - Brand tokens only — never raw hex/rgba — to stay consistent
 *     with the Phase 3 tier grid.
 */
export default function AddOnPriceTable({
  testId = 'marketing-addon-table',
}: { testId?: string } = {}) {
  const tierLabelBySlug = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const t of marketingPricingTiers) map.set(t.slug, t.tierName);
    return map;
  }, []);

  return (
    <section
      data-testid={testId}
      aria-labelledby="addon-table-heading"
      style={{
        padding: '24px 24px 64px',
        maxWidth: brand.contentMaxWidth,
        margin: '0 auto',
        width: '100%',
      }}
    >
      <header style={{ textAlign: 'center', marginBottom: 28 }}>
        <p style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: brand.accentCyan,
          margin: '0 0 10px',
        }}>
          Add-on modules
        </p>
        <h2
          id="addon-table-heading"
          style={{
            fontFamily: brand.fontDisplay,
            fontSize: 'clamp(24px, 3.4vw, 32px)',
            fontWeight: 700,
            color: brand.textPrimary,
            margin: '0 0 12px',
            letterSpacing: '-0.02em',
          }}
        >
          Add modules without leaving your tier.
        </h2>
        <p style={{
          fontSize: 15,
          lineHeight: 1.55,
          color: brand.textSecondary,
          maxWidth: 640,
          margin: '0 auto',
        }}>
          Every module is available as a stand-alone add-on. If your tier already
          includes it, the add-on cost drops to zero — you only pay for what your
          plan does not cover.
        </p>
      </header>

      <style>{`
        .addon-table-wrapper {
          border: 1px solid ${brand.borderSoft};
          border-radius: 16px;
          background: ${brand.bgSecondary};
          overflow: hidden;
        }
        .addon-table { width: 100%; border-collapse: collapse; }
        .addon-table thead th {
          text-align: left;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: ${brand.textMuted};
          padding: 14px 20px;
          background: ${brand.bgElevated};
          border-bottom: 1px solid ${brand.borderSoft};
        }
        .addon-table tbody td {
          padding: 16px 20px;
          border-top: 1px solid ${brand.borderSoft};
          font-size: 14px;
          color: ${brand.textPrimary};
          vertical-align: top;
        }
        .addon-table tbody tr:first-child td { border-top: none; }
        .addon-blurb { color: ${brand.textSecondary}; font-size: 13px; margin: 4px 0 0; line-height: 1.5; }
        .addon-cadence { color: ${brand.textMuted}; font-size: 12px; margin-top: 2px; }
        .addon-badge {
          display: inline-block;
          margin-left: 8px;
          padding: 2px 8px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          vertical-align: middle;
        }
        .addon-badge--beta {
          color: ${brand.statusBetaText};
          background: ${brand.statusBetaBg};
          border: 1px solid ${brand.statusBetaBorder};
        }
        .addon-badge--soon {
          color: ${brand.statusComingSoonText};
          background: ${brand.statusComingSoonBg};
          border: 1px solid ${brand.statusComingSoonBorder};
        }
        .addon-mobile-list { display: none; }
        @media (max-width: 640px) {
          .addon-table { display: none; }
          .addon-mobile-list { display: flex; flex-direction: column; }
          .addon-mobile-card {
            padding: 16px 18px;
            border-top: 1px solid ${brand.borderSoft};
          }
          .addon-mobile-card:first-child { border-top: none; }
        }
      `}</style>

      <div className="addon-table-wrapper">
        <table className="addon-table" aria-describedby="addon-table-heading">
          <thead>
            <tr>
              <th scope="col" style={{ width: '46%' }}>Module</th>
              <th scope="col" style={{ width: '28%' }}>Add-on price</th>
              <th scope="col" style={{ width: '26%' }}>Included from</th>
            </tr>
          </thead>
          <tbody>
            {marketingAddOns.map((addon) => (
              <AddOnRow
                key={addon.slug}
                addon={addon}
                tierLabel={addon.includedFromTierSlug
                  ? tierLabelBySlug.get(addon.includedFromTierSlug) ?? '—'
                  : 'Add-on only'}
              />
            ))}
          </tbody>
        </table>

        <div className="addon-mobile-list" role="list" aria-label="Add-on modules">
          {marketingAddOns.map((addon) => (
            <AddOnMobileCard
              key={addon.slug}
              addon={addon}
              tierLabel={addon.includedFromTierSlug
                ? tierLabelBySlug.get(addon.includedFromTierSlug) ?? '—'
                : 'Add-on only'}
            />
          ))}
        </div>
      </div>

      <p style={{
        marginTop: 16,
        fontSize: 12,
        color: brand.textMuted,
        textAlign: 'center',
      }}>
        Final per-module pricing is shown inside the console before you confirm any charge.
      </p>
    </section>
  );
}

function AddOnRow({ addon, tierLabel }: { addon: MarketingAddOn; tierLabel: string }) {
  return (
    <tr data-testid={`addon-row-${addon.slug}`}>
      <td>
        <div style={{ fontWeight: 600, color: brand.textPrimary }}>
          {addon.name}
          {addon.badge && <BadgePill badge={addon.badge} />}
        </div>
        <p className="addon-blurb">{addon.blurb}</p>
      </td>
      <td>
        <div style={{ fontWeight: 600 }} data-testid={`addon-price-${addon.slug}`}>
          {addon.priceLabel}
        </div>
        <div className="addon-cadence">{addon.priceCadence}</div>
      </td>
      <td>
        <div style={{ color: brand.textSecondary }} data-testid={`addon-tier-${addon.slug}`}>
          {tierLabel}
        </div>
      </td>
    </tr>
  );
}

function AddOnMobileCard({ addon, tierLabel }: { addon: MarketingAddOn; tierLabel: string }) {
  return (
    <div
      className="addon-mobile-card"
      role="listitem"
      data-testid={`addon-mobile-${addon.slug}`}
    >
      <div style={{ fontWeight: 600, color: brand.textPrimary, fontSize: 15 }}>
        {addon.name}
        {addon.badge && <BadgePill badge={addon.badge} />}
      </div>
      <p className="addon-blurb">{addon.blurb}</p>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: brand.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Add-on price
          </div>
          <div style={{ fontSize: 13, color: brand.textPrimary, fontWeight: 600 }}>{addon.priceLabel}</div>
          <div className="addon-cadence">{addon.priceCadence}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: brand.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Included from
          </div>
          <div style={{ fontSize: 13, color: brand.textSecondary }}>{tierLabel}</div>
        </div>
      </div>
    </div>
  );
}

function BadgePill({ badge }: { badge: 'Beta' | 'Coming soon' }) {
  const cls = badge === 'Beta' ? 'addon-badge addon-badge--beta' : 'addon-badge addon-badge--soon';
  return <span className={cls}>{badge}</span>;
}
