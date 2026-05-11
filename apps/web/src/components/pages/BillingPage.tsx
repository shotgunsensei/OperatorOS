'use client';

import { useEffect, useState } from 'react';
import { billingApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import UpgradeModal from '../UpgradeModal';

function UsageBar({ label, used, limit, percentage }: { label: string; used: number; limit: number; percentage: number }) {
  const isUnlimited = limit >= 999;
  const displayLimit = isUnlimited ? '\u221e' : limit;
  const barColor = percentage > 90 ? colors.accentRed : percentage > 70 ? colors.accentYellow : colors.accent;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: colors.text, fontWeight: 500 }}>{label}</span>
        <span style={{ color: percentage > 80 ? colors.accentYellow : colors.textMuted }}>
          {used} / {displayLimit}
        </span>
      </div>
      <div style={{ height: 6, background: colors.bg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 3, width: isUnlimited ? '5%' : `${percentage}%`,
          background: barColor, transition: 'width 0.3s',
        }} />
      </div>
      {percentage >= 90 && !isUnlimited && (
        <div style={{ fontSize: 11, color: colors.accentYellow, marginTop: 4 }}>
          {percentage >= 100 ? 'Limit reached \u2014 upgrade to continue creating' : 'Approaching limit'}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [usageData, setUsageData] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [downgradeCheck, setDowngradeCheck] = useState<{ slug: string; violations: any[] } | null>(null);

  const [billingMode, setBillingMode] = useState<any>(null);
  const [interval, setInterval] = useState<'month' | 'year'>('month');

  const loadData = async () => {
    try {
      const [usage, plansData, historyData, mode] = await Promise.all([
        billingApi.getUsage(),
        billingApi.getPlans(),
        billingApi.getHistory(),
        billingApi.getMode(),
      ]);
      setUsageData(usage);
      setPlans(plansData.plans);
      setHistory(historyData.events);
      setBillingMode(mode);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handlePlanSwitch = async (slug: string) => {
    if (!usageData) return;
    const currentIdx = ['starter', 'pro', 'elite'].indexOf(usageData.plan.slug);
    const targetIdx = ['starter', 'pro', 'elite'].indexOf(slug);

    if (targetIdx < currentIdx) {
      try {
        const { violations } = await billingApi.checkDowngrade(slug);
        if (violations.length > 0) {
          setDowngradeCheck({ slug, violations });
          return;
        }
      } catch {}
    }

    await doSubscribe(slug);
  };

  const doSubscribe = async (slug: string) => {
    setSwitching(slug);
    setDowngradeCheck(null);
    try {
      const result = await billingApi.subscribe(slug, interval);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      await loadData();
    } catch {} finally { setSwitching(''); }
  };

  const handleManageSubscription = async () => {
    try {
      const result = await billingApi.createPortalSession();
      if (result.url) {
        window.location.href = result.url;
      }
    } catch {
    }
  };

  const handleCancel = async () => {
    await billingApi.cancel();
    setCancelConfirm(false);
    await loadData();
  };

  const handleReactivate = async () => {
    await billingApi.reactivate();
    await loadData();
  };

  if (loading) return <div style={{ padding: 40, color: colors.textMuted }}>Loading billing...</div>;
  if (!usageData) return <div style={{ padding: 40, color: colors.accentRed }}>Failed to load billing data</div>;

  const { plan: currentPlan, usage, features, subscription } = usageData;
  const currentSlug = currentPlan.slug;
  const planOrder = ['starter', 'pro', 'elite'];
  const currentIdx = planOrder.indexOf(currentSlug);

  const renewalDate = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 40px)', maxWidth: 1200 }} data-testid="billing-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Billing & Subscription</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px' }}>Manage your plan, usage, and billing history</p>

      {downgradeCheck && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 16, padding: 32, maxWidth: 520, width: '90%' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', margin: '0 0 12px' }}>Downgrade Warning</h3>
            <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>
              Your current usage exceeds the limits of this plan. Your data will be preserved, but you won't be able to create new items until you're within the limits.
            </p>
            {downgradeCheck.violations.map((v, i) => (
              <div key={i} style={{ padding: '10px 14px', marginBottom: 8, borderRadius: 8, background: 'rgba(210,153,34,0.08)', border: `1px solid ${colors.accentYellow}33`, fontSize: 12, color: colors.text }}>
                {v.message}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setDowngradeCheck(null)}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 13 }}>
                Cancel
              </button>
              <button data-testid="button-confirm-downgrade" onClick={() => doSubscribe(downgradeCheck.slug)}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accentYellow, color: '#000', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {switching ? 'Processing...' : 'Downgrade anyway'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 32 }}>
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Plan</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{currentPlan.name}</span>
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
              background: currentSlug === 'elite' ? 'rgba(188,140,255,0.15)' : currentSlug === 'pro' ? 'rgba(88,166,255,0.15)' : 'rgba(139,148,158,0.15)',
              color: currentSlug === 'elite' ? colors.accentPurple : currentSlug === 'pro' ? colors.accent : colors.textMuted,
            }}>${(currentPlan.price / 100).toFixed(0)}/mo</span>
          </div>
          <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8 }}>{currentPlan.description}</div>

          {subscription && (
            <>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 4 }}>
                Status: <span style={{ color: subscription.status === 'active' ? colors.accentGreen : colors.accentYellow }}>
                  {subscription.status}{subscription.cancelAtPeriodEnd ? ' (canceling)' : ''}
                </span>
              </div>
              {renewalDate && (
                <div style={{ fontSize: 12, color: colors.textDim }}>
                  {subscription.cancelAtPeriodEnd ? 'Access until' : 'Renews'}: {renewalDate}
                </div>
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            {currentSlug !== 'elite' && (
              <button data-testid="button-upgrade-plan" onClick={() => setShowUpgradeModal(true)}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #58a6ff, #bc8cff)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Upgrade plan
              </button>
            )}
            {billingMode?.mode === 'stripe' && (
              <button data-testid="button-manage-stripe" onClick={handleManageSubscription}
                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.accent, fontSize: 13, cursor: 'pointer' }}>
                Manage via Stripe
              </button>
            )}
            {subscription && !subscription.cancelAtPeriodEnd && currentSlug !== 'starter' && (
              cancelConfirm ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.accentYellow }}>Are you sure?</span>
                  <button onClick={handleCancel}
                    style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: colors.accentRed, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
                    Yes, cancel
                  </button>
                  <button onClick={() => setCancelConfirm(false)}
                    style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.text, fontSize: 12, cursor: 'pointer' }}>
                    No
                  </button>
                </div>
              ) : (
                <button data-testid="button-cancel-sub" onClick={() => setCancelConfirm(true)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.accentRed, fontSize: 13, cursor: 'pointer' }}>
                  Cancel plan
                </button>
              )
            )}
            {subscription?.cancelAtPeriodEnd && (
              <button onClick={handleReactivate}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accentGreen, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Reactivate
              </button>
            )}
          </div>
        </div>

        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Usage Summary</div>
          <UsageBar label="Workspaces" {...usage.workspaces} />
          <UsageBar label="Projects" {...usage.projects} />
          <UsageBar label="Tasks" {...usage.tasks} />
          <UsageBar label="Team Members" {...usage.teamMembers} />
          <UsageBar label="AI Actions (this month)" {...usage.aiActions} />
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: 0 }}>Plan Comparison</h3>
          <div role="group" aria-label="Billing interval"
               style={{ display: 'inline-flex', borderRadius: 8, border: `1px solid ${colors.border}`, overflow: 'hidden' }}>
            {(['month', 'year'] as const).map((v) => (
              <button key={v} data-testid={`button-interval-${v}`}
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
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {plans.sort((a: any, b: any) => a.price - b.price).map((p: any) => {
            const isCurrent = p.slug === currentSlug;
            const planIdx = planOrder.indexOf(p.slug);
            const isUpgradeOption = planIdx > currentIdx;
            const isHighlighted = p.highlight;

            // Task #66 round 3 fix: consume catalog-driven display
            // pricing from /v1/billing/plans rather than re-deriving
            // annual price as monthly*10 in the UI. The catalog
            // (PLAN_CATALOG) is the single source of truth across
            // both surfaces; if a slug somehow lacks an annual entry
            // (e.g. a legacy free Starter), we fall back to the
            // monthly*10 heuristic so the UI never crashes.
            const monthlyCents = p.displayMonthlyPriceCents ?? p.price;
            const annualCents  = p.displayAnnualPriceCents ?? (monthlyCents * 10);

            return (
              <div key={p.slug} data-testid={`plan-card-${p.slug}`}
                style={{
                  background: colors.bgSecondary,
                  border: `2px solid ${isCurrent ? colors.accent : isHighlighted ? colors.accentPurple + '44' : colors.border}`,
                  borderRadius: 16, padding: 28, position: 'relative',
                }}>
                {isHighlighted && (
                  <div style={{
                    position: 'absolute', top: -10, right: 20,
                    background: 'linear-gradient(135deg, #58a6ff, #bc8cff)',
                    color: '#fff', fontSize: 10, fontWeight: 700,
                    padding: '3px 10px', borderRadius: 10, textTransform: 'uppercase',
                  }}>Popular</div>
                )}
                <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 12 }}>{p.description}</div>
                <div style={{ marginBottom: 20 }}>
                  {interval === 'year' ? (
                    <>
                      <span style={{ fontSize: 36, fontWeight: 800, color: '#fff' }} data-testid={`price-${p.slug}-year`}>
                        ${(annualCents / 100).toFixed(0)}
                      </span>
                      <span style={{ fontSize: 14, color: colors.textMuted }}>/yr</span>
                      <div style={{ fontSize: 11, color: colors.accentGreen, marginTop: 4 }}>
                        2 months free vs monthly
                      </div>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 36, fontWeight: 800, color: '#fff' }} data-testid={`price-${p.slug}-month`}>
                        ${(monthlyCents / 100).toFixed(0)}
                      </span>
                      <span style={{ fontSize: 14, color: colors.textMuted }}>/mo</span>
                    </>
                  )}
                </div>

                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase' }}>Limits</div>
                  {[
                    { label: 'Workspaces', val: p.limits.maxWorkspaces },
                    { label: 'Projects', val: p.limits.maxProjects },
                    { label: 'Tasks', val: p.limits.maxTasks },
                    { label: 'Team members', val: p.limits.maxTeamMembers },
                    { label: 'AI actions/mo', val: p.limits.maxAiActionsPerMonth },
                  ].map(item => (
                    <div key={item.label} style={{ fontSize: 13, padding: '3px 0', color: colors.text }}>
                      {item.val >= 999 ? 'Unlimited' : item.val === 0 ? 'None' : item.val} {item.label.toLowerCase()}
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 16, marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase' }}>Features</div>
                  {Object.entries(p.features).map(([key, enabled]: [string, any]) => (
                    <div key={key} style={{
                      fontSize: 13, padding: '3px 0',
                      color: enabled ? colors.accentGreen : colors.textDim,
                    }}>
                      {enabled ? '\u2713' : '\u2717'} {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </div>
                  ))}
                </div>

                {isCurrent ? (
                  <div style={{
                    width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${colors.accent}`,
                    textAlign: 'center', color: colors.accent, fontSize: 13, fontWeight: 600, boxSizing: 'border-box',
                  }}>Current plan</div>
                ) : (
                  <button data-testid={`button-subscribe-${p.slug}`} onClick={() => handlePlanSwitch(p.slug)} disabled={switching === p.slug}
                    style={{
                      width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                      background: isUpgradeOption
                        ? (isHighlighted ? 'linear-gradient(135deg, #58a6ff, #bc8cff)' : colors.accent)
                        : colors.bgHover,
                      color: isUpgradeOption ? '#fff' : colors.text,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', boxSizing: 'border-box',
                    }}>
                    {switching === p.slug ? 'Processing...' : isUpgradeOption ? 'Upgrade' : 'Downgrade'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>Feature Access</h3>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>Your current plan includes these features:</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {Object.entries(features).map(([key, enabled]: [string, any]) => (
            <div key={key} style={{
              padding: '12px 16px', borderRadius: 8,
              background: enabled ? 'rgba(63,185,80,0.06)' : 'rgba(139,148,158,0.06)',
              border: `1px solid ${enabled ? colors.accentGreen + '33' : colors.border}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: 14, color: enabled ? colors.accentGreen : colors.textDim }}>
                {enabled ? '\u2713' : '\ud83d\udd12'}
              </span>
              <span style={{ fontSize: 13, color: enabled ? colors.text : colors.textDim }}>
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
              </span>
              {!enabled && (
                <button onClick={() => setShowUpgradeModal(true)}
                  style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 4, border: 'none', background: colors.accent + '22', color: colors.accent, fontSize: 10, cursor: 'pointer', fontWeight: 600 }}>
                  Unlock
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Billing History</h3>
        {history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 24, color: colors.textMuted, fontSize: 13 }}>No billing history yet</div>
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Event', 'Amount', 'Details'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: colors.textMuted, borderBottom: `1px solid ${colors.border}`, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((e: any) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: colors.textMuted }}>{new Date(e.createdAt).toLocaleDateString()}</td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: colors.text }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11,
                        background: e.eventType.includes('upgrade') ? 'rgba(63,185,80,0.1)' : e.eventType.includes('cancel') ? 'rgba(248,81,73,0.1)' : 'rgba(88,166,255,0.1)',
                        color: e.eventType.includes('upgrade') ? colors.accentGreen : e.eventType.includes('cancel') ? colors.accentRed : colors.accent,
                      }}>{e.eventType.replace(/_/g, ' ')}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 13, color: e.amount > 0 ? colors.accentGreen : colors.textDim }}>
                      {e.amount > 0 ? `$${(e.amount / 100).toFixed(2)}` : '\u2014'}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: colors.textDim }}>
                      {e.metadata?.fromPlan ? `${e.metadata.fromPlan} \u2192 ${e.metadata.toPlan || e.metadata.planSlug}` : e.metadata?.planSlug || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ padding: 16, borderRadius: 8, background: colors.bgHover, fontSize: 12, color: colors.textDim }}>
        <strong>Stripe Integration:</strong> This billing system is Stripe-ready. Connect Stripe by adding STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables.
      </div>

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        onUpgraded={() => loadData()}
      />
    </div>
  );
}
