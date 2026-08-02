'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Layers3, X } from 'lucide-react';
import { billingApi } from '@/lib/auth';
import { colors } from './SaasLayout';
import OperatorMark from './brand/OperatorMark';
import { brand } from '@/lib/brand';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgraded: () => void;
  resource?: string;
  message?: string;
  upgradeSlug?: string;
}

export default function UpgradeModal({ isOpen, onClose, onUpgraded, resource, message, upgradeSlug }: UpgradeModalProps) {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState('');
  const [currentPlan, setCurrentPlan] = useState('');
  const [downgradeWarnings, setDowngradeWarnings] = useState<string[]>([]);
  const [pendingDowngradeSlug, setPendingDowngradeSlug] = useState('');
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setActionError('');
    Promise.all([billingApi.getPlans(), billingApi.getUsage()])
      .then(([plansData, usageData]) => {
        setPlans(plansData.plans);
        setCurrentPlan(usageData.plan.slug);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !switching) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, switching, onClose]);

  const handleSubscribe = async (slug: string) => {
    setSwitching(slug);
    setDowngradeWarnings([]);
    setActionError('');
    try {
      const planIdx = ['starter', 'pro', 'elite'].indexOf(slug);
      const currentIdx = ['starter', 'pro', 'elite'].indexOf(currentPlan);
      if (planIdx < currentIdx) {
        const { violations } = await billingApi.checkDowngrade(slug);
        if (violations.length > 0) {
          setDowngradeWarnings(violations.map((v: any) => v.message));
          setPendingDowngradeSlug(slug);
          setSwitching('');
          return;
        }
      }

      const result = await billingApi.subscribe(slug, interval);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      if (result.downgradeWarnings?.length > 0) {
        setDowngradeWarnings(result.downgradeWarnings);
      }
      onUpgraded();
      if (!result.downgradeWarnings?.length) {
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err?.error || err?.message || 'We could not update your stack. Please try again.');
    } finally {
      setSwitching('');
    }
  };

  const confirmDowngrade = async (slug: string) => {
    setSwitching(slug);
    setActionError('');
    try {
      const result = await billingApi.subscribe(slug, interval);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      setDowngradeWarnings(result.downgradeWarnings || []);
      onUpgraded();
      onClose();
    } catch (err: any) {
      console.error(err);
      setActionError(err?.error || err?.message || 'We could not update your stack. Please try again.');
    } finally {
      setSwitching('');
    }
  };

  if (!isOpen) return null;

  const planOrder = ['starter', 'pro', 'elite'];
  const currentIdx = planOrder.indexOf(currentPlan);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(1,4,9,0.82)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 20,
    }} onClick={onClose} data-testid="upgrade-modal" role="presentation">
      <div style={{
        background: 'linear-gradient(180deg, rgba(18,24,38,0.99), rgba(8,11,18,0.99))',
        border: `1px solid ${brand.borderStrong}`,
        borderRadius: 20, padding: 'clamp(22px, 4vw, 34px)', maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 38px 120px rgba(0,0,0,.62), 0 0 70px rgba(124,58,237,.12)',
      }} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="upgrade-modal-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <OperatorMark size={40} glow />
            <div>
            <h2 id="upgrade-modal-title" style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0 }}>
              Compare OperatorOS plans
            </h2>
            {message ? (
              <p style={{ fontSize: 13, color: colors.accentYellow, margin: '8px 0 0' }}>{message}</p>
            ) : (
              <p style={{ fontSize: 13, color: colors.textMuted, margin: '6px 0 0' }}>
                Compare project, task, team, workspace, and AI limits. Your current tool access will not change on this screen.
              </p>
            )}
            </div>
          </div>
          <button onClick={onClose} data-testid="button-close-upgrade-modal" aria-label="Close upgrade options"
            style={{ minWidth: 40, minHeight: 40, display: 'grid', placeItems: 'center', background: 'none', border: 'none', color: colors.textDim, cursor: 'pointer', padding: 4 }}><X size={20} aria-hidden="true" /></button>
        </div>

        {resource && (
          <div style={{ margin: '-8px 0 18px 53px', color: brand.accentCyan, fontSize: 12, fontWeight: 700 }}>
            Capacity needed for: {resource}
          </div>
        )}

        {actionError && (
          <div role="alert" style={{
            padding: '11px 13px', marginBottom: 18, borderRadius: 9,
            background: 'rgba(239,35,60,.09)', border: `1px solid ${brand.accentRed}88`,
            color: '#FF7185', fontSize: 13,
          }}>
            {actionError}
          </div>
        )}

        <div
          data-testid="workspace-capacity-stack-note"
          style={{
            marginBottom: 20, padding: '13px 14px', borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            border: `1px solid ${brand.borderSoft}`,
            background: 'linear-gradient(105deg, rgba(0,229,255,.07), rgba(124,58,237,.08))',
          }}
        >
          <Layers3 size={18} color={brand.accentCyan} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 750 }}>Looking for another business tool?</div>
            <div style={{ color: brand.textSecondary, fontSize: 11, marginTop: 3 }}>
              Tool packages, included tools, add-ons, and team seats are compared on the pricing page.
            </div>
          </div>
          <Link
            href="/pricing#build-stack"
            onClick={onClose}
            style={{ color: brand.accentCyan, fontSize: 12, fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            Compare tool packages <ArrowRight size={13} />
          </Link>
        </div>

        <div role="group" aria-label="Billing interval"
             style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${colors.border}`, overflow: 'hidden', marginBottom: 20 }}>
          {(['month', 'year'] as const).map((v) => (
            <button key={v} data-testid={`button-modal-interval-${v}`}
              onClick={() => setInterval(v)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                border: 'none',
                background: interval === v ? colors.accent : 'transparent',
                color: interval === v ? '#fff' : colors.textMuted,
              }}>
              {v === 'month' ? 'Monthly' : 'Annual (save ~17%)'}
            </button>
          ))}
        </div>

        {downgradeWarnings.length > 0 && (
          <div style={{ padding: 16, marginBottom: 20, borderRadius: 8, background: 'rgba(210,153,34,0.1)', border: `1px solid ${colors.accentYellow}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.accentYellow, marginBottom: 8 }}>Reducing capacity will affect new work:</div>
            {downgradeWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: 12, color: colors.text, marginBottom: 4 }}>{w}</div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setDowngradeWarnings([]); setPendingDowngradeSlug(''); }} style={{ padding: '6px 16px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, fontSize: 12, cursor: 'pointer' }}>
                Keep current plan
              </button>
              <button onClick={() => {
                if (pendingDowngradeSlug) confirmDowngrade(pendingDowngradeSlug);
              }} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: colors.accentYellow, color: '#000', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {switching ? 'Updating plan…' : 'Reduce workspace capacity'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: colors.textMuted }}>Loading workspace plans…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {plans.sort((a: any, b: any) => a.price - b.price).map((p: any) => {
              const isCurrent = p.slug === currentPlan;
              const isHighlighted = upgradeSlug ? p.slug === upgradeSlug : p.highlight;
              const planIdx = planOrder.indexOf(p.slug);
              const isUpgradeOption = planIdx > currentIdx;

              return (
                <div key={p.slug} data-testid={`modal-plan-${p.slug}`}
                  style={{
                    background: colors.bg,
                    border: `2px solid ${isCurrent ? colors.accent : isHighlighted ? colors.accentPurple : colors.border}`,
                    borderRadius: 12, padding: 20, position: 'relative',
                  }}>
                  {isHighlighted && !isCurrent && (
                    <div style={{
                      position: 'absolute', top: -10, right: 16,
                      background: 'linear-gradient(135deg, #58a6ff, #bc8cff)',
                      color: '#fff', fontSize: 9, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 8, textTransform: 'uppercase',
                    }}>Recommended</div>
                  )}
                  <div style={{ fontSize: 10, fontWeight: 800, color: brand.accentCyan, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>
                    OperatorOS plan
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>{p.description}</div>
                  <div style={{ marginBottom: 16 }}>
                    {(() => {
                      const monthlyCents = p.displayMonthlyPriceCents ?? p.price;
                      const annualCents = p.displayAnnualPriceCents ?? (monthlyCents * 10);
                      if (interval === 'year') {
                        return (
                          <>
                            <span style={{ fontSize: 28, fontWeight: 800, color: '#fff' }} data-testid={`modal-price-${p.slug}-year`}>
                              ${(annualCents / 100).toFixed(0)}
                            </span>
                            <span style={{ fontSize: 12, color: colors.textMuted }}>/yr</span>
                            <div style={{ fontSize: 10, color: colors.accentGreen, marginTop: 2 }}>2 months free vs monthly</div>
                          </>
                        );
                      }
                      return (
                        <>
                          <span style={{ fontSize: 28, fontWeight: 800, color: '#fff' }} data-testid={`modal-price-${p.slug}-month`}>
                            ${(monthlyCents / 100).toFixed(0)}
                          </span>
                          <span style={{ fontSize: 12, color: colors.textMuted }}>/mo</span>
                        </>
                      );
                    })()}
                  </div>

                  <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, marginBottom: 16 }}>
                    {Object.entries(p.limits).map(([key, val]: [string, any]) => (
                      <div key={key} style={{ fontSize: 11, color: colors.text, padding: '2px 0' }}>
                        {val >= 999 ? 'Unlimited' : val} {key.replace(/^max/, '').replace(/PerMonth$/, '/mo').replace(/([A-Z])/g, ' $1').trim().toLowerCase()}
                      </div>
                    ))}
                  </div>

                  <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12, marginBottom: 16 }}>
                    {Object.entries(p.features).map(([key, enabled]: [string, any]) => (
                      <div key={key} style={{ fontSize: 11, padding: '2px 0', color: enabled ? colors.accentGreen : colors.textDim }}>
                        {enabled ? '\u2713' : '\u2717'} {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                      </div>
                    ))}
                  </div>

                  {isCurrent ? (
                    <div style={{
                      width: '100%', padding: '8px', borderRadius: 8, border: `1px solid ${colors.accent}`,
                      textAlign: 'center', color: colors.accent, fontSize: 12, fontWeight: 600, boxSizing: 'border-box',
                    }}>Current plan</div>
                  ) : (
                    <button data-testid={`modal-btn-${p.slug}`} onClick={() => handleSubscribe(p.slug)} disabled={switching === p.slug}
                      style={{
                        width: '100%', padding: '8px', borderRadius: 8, border: 'none',
                        background: isUpgradeOption ? 'linear-gradient(135deg, #58a6ff, #bc8cff)' : colors.bgHover,
                        color: isUpgradeOption ? '#fff' : colors.text,
                        fontSize: 12, fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box',
                      }}>
                      {switching === p.slug ? 'Updating plan…' : isUpgradeOption ? `Increase to ${p.name}` : `Reduce to ${p.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
