'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, Layers3, Lock, Users } from 'lucide-react';
import { billingApi } from '@/lib/auth';
import { colors } from '../SaasLayout';
import { useTenant } from '../TenantProvider';
import { CORE_PRODUCTS_BY_KEY, FREE_WITH_ANY_ACCOUNT } from '@operatoros/sdk';
import { brand } from '@/lib/brand';
import { EmptyState, ErrorState, PageHeader } from '../ExperiencePrimitives';

function UsageBar({ label, used, limit, percentage }: { label: string; used: number; limit: number; percentage: number }) {
  const isUnlimited = limit >= 999;
  const displayLimit = isUnlimited ? '\u221e' : limit;
  const barColor = percentage > 90 ? colors.accentRed : percentage > 70 ? colors.accentYellow : colors.accent;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
        <span style={{ color: colors.text, fontWeight: 500 }}>{label}</span>
        <span style={{ color: percentage > 80 ? colors.accentYellow : colors.textMuted }}>{used} / {displayLimit}</span>
      </div>
      <div style={{ height: 6, background: colors.bg, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, width: isUnlimited ? '5%' : `${percentage}%`, background: barColor, transition: 'width 0.3s' }} />
      </div>
      {percentage >= 90 && !isUnlimited && (
        <div style={{ fontSize: 11, color: colors.accentYellow, marginTop: 4 }}>
          {percentage >= 100 ? 'Limit reached — ask the organization owner to review capacity' : 'Approaching limit'}
        </div>
      )}
    </div>
  );
}

function readableDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function readableBillingStatus(status: string): string {
  if (status === 'checkout_failed') return 'Checkout failed';
  if (status === 'canceled' || status === 'expired' || status === 'incomplete_expired') return 'Ended';
  if (status === 'past_due' || status === 'unpaid') return 'Payment needed';
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

export default function BillingPage() {
  const { activeRole, loading: tenantLoading } = useTenant();
  const isOwner = activeRole === 'owner';
  const canViewBilling = isOwner || activeRole === 'admin';
  const [usageData, setUsageData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [billingMode, setBillingMode] = useState<any>(null);
  const [stackData, setStackData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [portalBusy, setPortalBusy] = useState(false);

  const loadData = async () => {
    try {
      const [usage, historyData, mode, stack] = await Promise.all([
        billingApi.getUsage(),
        billingApi.getHistory(),
        billingApi.getMode(),
        billingApi.getStack().catch(() => null),
      ]);
      setUsageData(usage);
      setHistory(historyData.events ?? []);
      setBillingMode(mode);
      setStackData(stack);
    } catch {
      setUsageData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantLoading) return;
    if (!canViewBilling) {
      setLoading(false);
      return;
    }
    void loadData();
  // Loading is intentionally tied to the server-confirmed organization role.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewBilling, tenantLoading]);

  const handleManageSubscription = async () => {
    if (!isOwner) {
      setActionError('Billing is read-only for your role. Only the organization owner can make billing changes.');
      return;
    }
    setActionError('');
    setPortalBusy(true);
    try {
      const result = await billingApi.createPortalSession();
      if (!result?.url) {
        setActionError('Billing management is temporarily unavailable. Nothing changed.');
        return;
      }
      const { openExternalDocument } = await import('@/lib/launch');
      await openExternalDocument(result.url);
    } catch {
      setActionError('We could not open secure billing management. The subscription and payment method are unchanged.');
    } finally {
      setPortalBusy(false);
    }
  };

  if (tenantLoading || loading) return <div className="ops-page" style={{ color: colors.textMuted }}>Loading organization billing…</div>;
  if (!canViewBilling) return (
    <div className="ops-page">
      <ErrorState
        title="Billing is limited to organization administrators"
        description="Ask an organization owner or administrator to review the subscription, invoices, paid applications, or seat capacity. Your application access has not changed."
      />
    </div>
  );
  if (!usageData) return (
    <div className="ops-page">
      <ErrorState
        title="Billing details could not be loaded"
        description="No plan or payment information was changed. Refresh the page and try again."
        action={<button type="button" onClick={() => { setLoading(true); void loadData(); }} style={{ minHeight: 40, padding: '8px 14px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bgHover, color: colors.text, cursor: 'pointer', fontWeight: 700 }}>Reload billing details</button>}
      />
    </div>
  );

  const { plan: workspacePlan, usage, features } = usageData;
  const applicationSubscriptionRecord = stackData?.applicationSubscription ?? stackData?.billingAccount ?? null;
  const currentStackStatuses = new Set(['active', 'trialing', 'past_due', 'incomplete', 'canceling']);
  const applicationSubscription = applicationSubscriptionRecord?.coreProduct
    && currentStackStatuses.has(applicationSubscriptionRecord.status ?? '')
    ? applicationSubscriptionRecord
    : null;
  const legacyContract = stackData?.legacyContract?.grandfathered ? stackData.legacyContract : null;
  const legacyAddonContracts = Array.isArray(stackData?.legacyAddonContracts) ? stackData.legacyAddonContracts : [];
  const hasManagedBilling = Boolean(applicationSubscriptionRecord || legacyContract || legacyAddonContracts.length > 0);
  const activeEntitlements = (stackData?.entitlements ?? []).filter((row: any) => row.active !== false);
  const coreEntitlement = activeEntitlements.find((row: any) => row.entitlementType === 'core_product');
  const coreKey = applicationSubscriptionRecord?.coreProduct ?? coreEntitlement?.entitlementKey ?? null;
  const coreProduct = coreKey ? CORE_PRODUCTS_BY_KEY[coreKey as keyof typeof CORE_PRODUCTS_BY_KEY] : null;
  const coreProductName = coreProduct?.name ?? coreKey ?? null;
  const includedCompanionKey = applicationSubscription?.includedCompanionKey ?? null;
  const paidCompanionKeys: string[] = applicationSubscription?.additionalModuleKeys ?? [];
  const seatLimit = applicationSubscription
    ? stackData?.seatLimit ?? (5 + Math.max(0, applicationSubscription.additionalSeats ?? 0))
    : null;
  const extraSeats = applicationSubscription ? Math.max(0, applicationSubscription.additionalSeats ?? ((seatLimit ?? 5) - 5)) : 0;
  const displayName = coreProductName ?? legacyContract?.planName ?? (legacyAddonContracts.length > 0 ? 'Grandfathered individual add-on access' : 'Free OperatorOS account');
  const billingStatus = applicationSubscriptionRecord?.status ?? legacyContract?.status ?? null;
  const periodEnd = readableDate(applicationSubscriptionRecord?.currentPeriodEnd ?? legacyContract?.currentPeriodEnd);

  return (
    <div className="ops-page" style={{ maxWidth: 1200 }} data-testid="billing-page">
      <style>{`
        .billing-stack-hero { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(300px, .8fr); }
        @media (max-width: 820px) { .billing-stack-hero { grid-template-columns: 1fr; } }
      `}</style>
      <PageHeader
        eyebrow="Account"
        title="Organization billing"
        description="Review current paid access, invoices, seats, and Application Stack. Only the organization owner can change billing; organization administrators have read-only visibility."
      />

      {actionError && <div role="alert" style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 10, border: `1px solid ${colors.accentRed}66`, background: 'rgba(255,107,99,.08)', color: colors.text, lineHeight: 1.5 }}>{actionError}</div>}

      <section className="billing-stack-hero" data-testid="billing-ecosystem-stack" style={{ marginBottom: 28, borderRadius: 18, border: `1px solid ${brand.borderStrong}`, background: 'linear-gradient(135deg, rgba(0,229,255,.09), rgba(124,58,237,.08) 54%, rgba(13,17,23,.98))', overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.24)' }}>
        <div style={{ padding: 'clamp(22px, 4vw, 34px)' }}>
          <div style={{ color: brand.accentCyan, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>
            {applicationSubscription ? 'Active Application Stack' : applicationSubscriptionRecord ? 'Previous Application Stack' : legacyContract || legacyAddonContracts.length > 0 ? 'Grandfathered paid access' : 'Free account access'}
          </div>
          <h2 style={{ margin: '9px 0 8px', color: '#fff', fontSize: 28, fontWeight: 800, letterSpacing: '-.03em' }}>{displayName}</h2>
          <p style={{ margin: 0, color: brand.textSecondary, fontSize: 14, lineHeight: 1.6, maxWidth: 620 }}>
            {applicationSubscription
              ? 'One flagship application, five included seats, and one eligible companion cover the whole organization. Paid capacity stays on one monthly subscription.'
              : applicationSubscriptionRecord
                ? 'This prior Application Stack is not in an active billing state. Its history remains visible, and the owner can start a new monthly Stack when eligible.'
                : legacyContract || legacyAddonContracts.length > 0
                ? 'This legacy contract remains visible and manageable, but Starter, Pro, Elite, and per-application checkout are closed to new sales.'
                : `The free home base and all ${FREE_WITH_ANY_ACCOUNT.length} free applications remain available without a paid subscription. Application Stack is the only new-sale path.`}
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 18 }}>
            <StackMetric icon={<CheckCircle2 size={14} />} label={`${FREE_WITH_ANY_ACCOUNT.length} free applications`} />
            {applicationSubscription && <StackMetric icon={<Users size={14} />} label={`${seatLimit ?? 5} seats`} />}
            {applicationSubscription && <StackMetric icon={<Layers3 size={14} />} label={includedCompanionKey ? '1 included companion' : 'Included companion not selected'} />}
            {applicationSubscription && <StackMetric icon={<Layers3 size={14} />} label={`${paidCompanionKeys.length} paid companion${paidCompanionKeys.length === 1 ? '' : 's'}`} />}
            {extraSeats > 0 && <StackMetric icon={<Users size={14} />} label={`${extraSeats} extra seat${extraSeats === 1 ? '' : 's'}`} />}
          </div>

          <button
            data-testid="button-build-ecosystem-stack"
            onClick={() => { window.location.href = applicationSubscription ? '/app?page=tenant-billing' : '/pricing#build-stack'; }}
            disabled={!isOwner && !applicationSubscription}
            title={!isOwner && !applicationSubscription ? 'Only the organization owner can start Application Stack checkout' : undefined}
            style={{ marginTop: 22, minHeight: 42, padding: '10px 16px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg, ${brand.accentCyan}, ${brand.accentViolet})`, color: brand.accentInk, fontSize: 13, fontWeight: 800, cursor: !isOwner && !applicationSubscription ? 'not-allowed' : 'pointer', opacity: !isOwner && !applicationSubscription ? .55 : 1, display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: brand.ctaGlowSoft }}
          >
            {applicationSubscription ? 'View Application Stack details' : isOwner ? 'Build Application Stack' : 'Owner action required'} <ArrowRight size={14} />
          </button>
        </div>
        <div style={{ position: 'relative', minHeight: 260, background: brand.bgPrimary }}>
          <img src="/media/operatoros/operatoros-command-nexus.png" alt="OperatorOS applications connected to one secure organization account." style={{ width: '100%', height: '100%', minHeight: 260, objectFit: 'cover', display: 'block', opacity: .82 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(8,11,18,.96), transparent 48%), linear-gradient(0deg, rgba(8,11,18,.42), transparent)' }} />
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 32 }}>
        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {applicationSubscriptionRecord ? 'Application subscription' : legacyContract ? 'Grandfathered legacy contract' : legacyAddonContracts.length > 0 ? 'Grandfathered individual add-on' : 'No paid subscription'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>{displayName}</span>
            {legacyContract && typeof workspacePlan?.price === 'number' && workspacePlan.price > 0 && <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(210,153,34,.12)', color: colors.accentYellow }}>${(workspacePlan.price / 100).toFixed(0)}/month legacy price</span>}
          </div>
          {billingStatus && <div style={{ marginTop: 10, fontSize: 12, color: colors.textMuted }}>Status: <span style={{ color: billingStatus === 'active' ? colors.accentGreen : colors.accentYellow }}>{readableBillingStatus(billingStatus)}{(applicationSubscriptionRecord?.cancelAtPeriodEnd || legacyContract?.cancelAtPeriodEnd) ? ' (ends after current period)' : ''}</span></div>}
          {periodEnd && <div style={{ marginTop: 5, fontSize: 12, color: colors.textDim }}>{(applicationSubscriptionRecord?.cancelAtPeriodEnd || legacyContract?.cancelAtPeriodEnd) ? 'Access until' : 'Current period ends'}: {periodEnd}</div>}
          {legacyContract && <p style={{ margin: '13px 0 0', padding: '10px 12px', borderRadius: 8, border: `1px solid ${colors.accentYellow}55`, background: 'rgba(210,153,34,.08)', color: colors.textMuted, fontSize: 12, lineHeight: 1.5 }}>This explicit grandfathered contract remains available for provider management and invoices. It is not offered to new customers and cannot be switched into another legacy plan.</p>}
          {!hasManagedBilling && <p style={{ margin: '12px 0 0', color: colors.textMuted, fontSize: 12, lineHeight: 1.5 }}>No paid plan is inferred from the workspace-capacity record. The account still includes OperatorOS, TorqueShed, FaultlineLab, and Operator Pool Hall.</p>}

          {billingMode?.mode === 'stripe' && hasManagedBilling && (
            <button data-testid="button-manage-stripe" onClick={handleManageSubscription} disabled={!isOwner || portalBusy} title={!isOwner ? 'Only the organization owner can manage payment methods and invoices' : undefined} style={{ marginTop: 16, padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.accent, fontSize: 13, cursor: isOwner ? 'pointer' : 'not-allowed', opacity: isOwner ? 1 : .55 }}>
              {portalBusy ? 'Opening secure billing…' : 'Manage payment method, invoices, or cancellation'}
            </button>
          )}
          {!isOwner && <p style={{ margin: '14px 0 0', color: colors.accentYellow, fontSize: 12, lineHeight: 1.5 }}>Read-only billing view. Ask the organization owner to manage paid access.</p>}
        </div>

        <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Workspace usage</div>
          <p style={{ color: colors.textMuted, fontSize: 12, margin: '0 0 16px', lineHeight: 1.5 }}>These workspace limits do not establish that a paid subscription exists.</p>
          <UsageBar label="Workspaces" {...usage.workspaces} />
          <UsageBar label="Projects" {...usage.projects} />
          <UsageBar label="Tasks" {...usage.tasks} />
          <UsageBar label="Team Members" {...usage.teamMembers} />
          <UsageBar label="AI Actions (this month)" {...usage.aiActions} />
        </div>
      </div>

      <section style={{ marginBottom: 32, padding: 24, borderRadius: 14, border: `1px solid ${colors.border}`, background: colors.bgSecondary }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#fff', margin: '0 0 8px' }}>Application Stack is the forward offer</h3>
        <p style={{ color: colors.textMuted, fontSize: 13, lineHeight: 1.6, margin: 0, maxWidth: 820 }}>One flagship application per organization for this release. Monthly billing includes five seats and one eligible organization-wide companion; extra companions are $29/month each and extra seats are $15/month each. Starter, Pro, Elite, and per-application checkout paths are closed to new purchases.</p>
        <button type="button" onClick={() => { window.location.href = '/pricing#build-stack'; }} disabled={!isOwner || Boolean(applicationSubscription)} title={!isOwner ? 'Only the organization owner can start checkout' : applicationSubscription ? 'This organization already has its one flagship application' : undefined} style={{ marginTop: 16, padding: '9px 14px', borderRadius: 8, border: `1px solid ${colors.accent}`, background: 'transparent', color: colors.accent, fontWeight: 700, cursor: isOwner && !applicationSubscription ? 'pointer' : 'not-allowed', opacity: isOwner && !applicationSubscription ? 1 : .55 }}>
          {applicationSubscription ? 'One flagship already active' : isOwner ? 'Build Application Stack' : 'Owner action required'}
        </button>
      </section>

      <div style={{ marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 8px' }}>Current workspace features</h3>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: '0 0 16px' }}>Locked workspace-capacity features remain read-only here; they are not legacy purchase options.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {Object.entries(features).map(([key, enabled]: [string, any]) => (
            <div key={key} style={{ padding: '12px 16px', borderRadius: 8, background: enabled ? 'rgba(63,185,80,0.06)' : 'rgba(139,148,158,0.06)', border: `1px solid ${enabled ? colors.accentGreen + '33' : colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" style={{ display: 'inline-flex', fontSize: 14, color: enabled ? colors.accentGreen : colors.textDim }}>{enabled ? <CheckCircle2 size={15} /> : <Lock size={15} />}</span>
              <span style={{ fontSize: 13, color: enabled ? colors.text : colors.textDim }}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, value => value.toUpperCase())}</span>
              {!enabled && <span style={{ marginLeft: 'auto', color: colors.textDim, fontSize: 10, fontWeight: 700 }}>Not included</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: colors.bgSecondary, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 24, marginBottom: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Billing history</h3>
        {history.length === 0 ? <EmptyState title="No billing activity yet" description="Invoices and subscription changes will appear here after Stripe confirms them." /> : (
          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Date', 'Event', 'Amount', 'Details'].map(heading => <th key={heading} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 11, fontWeight: 600, color: colors.textMuted, borderBottom: `1px solid ${colors.border}`, textTransform: 'uppercase' }}>{heading}</th>)}</tr></thead>
              <tbody>{history.map((event: any) => (
                <tr key={event.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: colors.textMuted }}>{new Date(event.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: colors.text }}>{String(event.eventType).replace(/_/g, ' ')}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: event.amount > 0 ? colors.accentGreen : colors.textDim }}>{event.amount > 0 ? `$${(event.amount / 100).toFixed(2)}` : '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: colors.textDim }}>{event.metadata?.coreProduct ?? event.metadata?.planSlug ?? ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ padding: 16, borderRadius: 8, background: colors.bgHover, fontSize: 12, color: colors.textDim }}>Opening checkout does not complete a purchase. This page updates after Stripe confirms the payment and subscription change.</div>
    </div>
  );
}

function StackMetric({ icon, label }: { icon: ReactNode; label: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '6px 10px', borderRadius: 999, border: `1px solid ${brand.borderSoft}`, background: 'rgba(8,11,18,.54)', color: brand.textSecondary, fontSize: 12, fontWeight: 700 }}><span style={{ color: brand.accentCyan, display: 'inline-flex' }}>{icon}</span>{label}</span>;
}
