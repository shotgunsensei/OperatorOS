'use client';

import { useEffect, useState } from 'react';
import { billingApi, saasApi } from '@/lib/auth';
import { colors } from '../SaasLayout';

export default function BillingPage() {
  const [subscription, setSubscription] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [limits, setLimits] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState('');

  const loadData = async () => {
    try {
      const [subData, plansData, historyData] = await Promise.all([
        billingApi.getSubscription(),
        saasApi.plans(),
        billingApi.getHistory(),
      ]);
      setSubscription(subData.subscription);
      setPlan(subData.plan);
      setLimits(subData.limits);
      setPlans(plansData.plans);
      setHistory(historyData.events);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleSubscribe = async (slug: string) => {
    setSwitching(slug);
    try {
      await billingApi.subscribe(slug);
      await loadData();
    } catch {} finally { setSwitching(''); }
  };

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription? You will keep access until end of billing period.')) return;
    await billingApi.cancel();
    await loadData();
  };

  const handleReactivate = async () => {
    await billingApi.reactivate();
    await loadData();
  };

  if (loading) return <div style={{ padding: 40, color: colors.textMuted }}>Loading billing...</div>;

  const currentSlug = limits?.planSlug || 'starter';

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200 }} data-testid="billing-page">
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Billing & Plans</h1>
      <p style={{ fontSize: 14, color: colors.textMuted, margin: '0 0 32px' }}>Manage your subscription and billing</p>

      {subscription && (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: colors.textMuted, marginBottom: 4 }}>Current Plan</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>{plan?.name || 'Starter'}</div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                Status: <span style={{ color: subscription.status === 'active' ? colors.accentGreen : colors.accentYellow }}>{subscription.status}</span>
                {subscription.cancelAtPeriodEnd && <span style={{ color: colors.accentYellow }}> · canceling at period end</span>}
              </div>
              {subscription.currentPeriodEnd && (
                <div style={{ fontSize: 12, color: colors.textDim, marginTop: 2 }}>
                  Renews: {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {subscription.cancelAtPeriodEnd ? (
                <button onClick={handleReactivate}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: colors.accentGreen, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Reactivate
                </button>
              ) : (
                <button data-testid="button-cancel-sub" onClick={handleCancel}
                  style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.accentRed, fontSize: 13, cursor: 'pointer' }}>
                  Cancel plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, marginBottom: 32 }}>
        {plans.sort((a: any, b: any) => a.price - b.price).map((p: any) => {
          const isCurrent = p.slug === currentSlug;
          const isPopular = p.slug === 'pro';
          return (
            <div key={p.id} data-testid={`plan-card-${p.slug}`}
              style={{
                background: colors.bgSecondary,
                border: `2px solid ${isCurrent ? colors.accent : isPopular ? colors.accentPurple + '44' : colors.border}`,
                borderRadius: 16, padding: 28, position: 'relative',
              }}>
              {isPopular && (
                <div style={{
                  position: 'absolute', top: -10, right: 20,
                  background: 'linear-gradient(135deg, #58a6ff, #bc8cff)',
                  color: '#fff', fontSize: 10, fontWeight: 700,
                  padding: '3px 10px', borderRadius: 10, textTransform: 'uppercase',
                }}>Popular</div>
              )}
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{p.name}</div>
              <div style={{ marginBottom: 20 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: '#fff' }}>${(p.price / 100).toFixed(0)}</span>
                <span style={{ fontSize: 14, color: colors.textMuted }}>/mo</span>
              </div>
              <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 16, marginBottom: 20 }}>
                {[
                  `${p.maxWorkspaces >= 999 ? 'Unlimited' : p.maxWorkspaces} workspace${p.maxWorkspaces !== 1 ? 's' : ''}`,
                  `${p.maxProjects >= 9999 ? 'Unlimited' : p.maxProjects} projects`,
                  `${p.maxTasks >= 99999 ? 'Unlimited' : p.maxTasks} tasks`,
                  `${p.maxTeamMembers === 0 ? 'No' : p.maxTeamMembers >= 999 ? 'Unlimited' : p.maxTeamMembers} team members`,
                  `${p.maxAiActionsPerMonth >= 9999 ? 'Unlimited' : p.maxAiActionsPerMonth} AI actions/mo`,
                  p.hasExports ? '✓ Exports' : '✗ Exports',
                  p.hasAutomation ? '✓ Automation' : '✗ Automation',
                  p.hasTemplates ? '✓ Templates' : '✗ Templates',
                  p.hasAdvancedAnalytics ? '✓ Advanced analytics' : '✗ Advanced analytics',
                ].map((feat, i) => (
                  <div key={i} style={{
                    fontSize: 13, padding: '4px 0',
                    color: feat.startsWith('✗') ? colors.textDim : feat.startsWith('✓') ? colors.accentGreen : colors.text,
                  }}>{feat}</div>
                ))}
              </div>
              {isCurrent ? (
                <div style={{
                  width: '100%', padding: '10px', borderRadius: 8, border: `1px solid ${colors.accent}`,
                  textAlign: 'center', color: colors.accent, fontSize: 13, fontWeight: 600,
                }}>Current plan</div>
              ) : (
                <button data-testid={`button-subscribe-${p.slug}`} onClick={() => handleSubscribe(p.slug)} disabled={switching === p.slug}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 8, border: 'none',
                    background: isPopular ? 'linear-gradient(135deg, #58a6ff, #bc8cff)' : colors.accent,
                    color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>
                  {switching === p.slug ? 'Switching...' : p.price > (plan?.price || 0) ? 'Upgrade' : p.price === 0 ? 'Downgrade' : 'Switch'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {history.length > 0 && (
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Billing History</h3>
          {history.map((e: any) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${colors.border}`, fontSize: 13 }}>
              <span style={{ color: colors.text }}>{e.eventType.replace(/_/g, ' ')}</span>
              <div style={{ display: 'flex', gap: 16 }}>
                {e.amount > 0 && <span style={{ color: colors.accentGreen }}>${(e.amount / 100).toFixed(2)}</span>}
                <span style={{ color: colors.textDim }}>{new Date(e.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, borderRadius: 8, background: `${colors.bgHover}`, fontSize: 12, color: colors.textDim }}>
        <strong>Stripe Integration Note:</strong> This billing system is Stripe-ready. Connect Stripe by adding STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET environment variables. The webhook endpoint is at POST /api/billing/webhook.
      </div>
    </div>
  );
}
