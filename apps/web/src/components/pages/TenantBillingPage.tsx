'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, ExternalLink, Layers3, Package, Receipt, ShieldAlert, Users } from 'lucide-react';
import {
  colors, cardStyle, panelStyle, badgeStyles, buttonStyles,
  semantic, space, fontSize,
} from '@/lib/design-tokens';
import { billingApi, meApi } from '@/lib/auth';
import { COMPANION_MODULES, CORE_PRODUCTS_BY_KEY, FREE_WITH_ANY_ACCOUNT } from '@operatoros/sdk';
import { LoadingState } from '../ExperiencePrimitives';

interface ApplicationSubscriptionView {
  status?: string | null;
  coreProduct?: string | null;
  includedCompanionKey?: string | null;
  additionalModuleKeys?: string[];
  additionalSeats?: number;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | Date | null;
}

interface LegacyContractView {
  grandfathered?: boolean;
  planSlug?: string | null;
  planName?: string | null;
  status?: string | null;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | Date | null;
}

const companionByKey = new Map<string, (typeof COMPANION_MODULES)[number]>(
  COMPANION_MODULES.map((module) => [module.key, module]),
);

function formatDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatBillingStatus(status: string): string {
  if (status === 'checkout_failed') return 'Checkout failed';
  if (status === 'canceled' || status === 'expired' || status === 'incomplete_expired') return 'Ended';
  if (status === 'past_due' || status === 'unpaid') return 'Payment needed';
  if (status === 'free') return 'No paid subscription';
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

export default function TenantBillingPage() {
  const [tenantName, setTenantName] = useState('');
  const [tenantRole, setTenantRole] = useState<string | null>(null);
  const [usage, setUsage] = useState<any | null>(null);
  const [stack, setStack] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [companionBusy, setCompanionBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    const me = await meApi.tenants();
    const current = me.current ?? me.tenants?.[0]?.id ?? null;
    const tenant = current ? me.tenants.find((row: any) => row.id === current) : null;
    setTenantName(tenant?.name ?? '');
    setTenantRole(tenant?.role ?? null);

    const [stackData, usageData] = await Promise.all([
      billingApi.getStack().catch(() => null),
      billingApi.getUsage().catch(() => null),
    ]);
    setStack(stackData);
    setUsage(usageData);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await refresh();
      } catch {
        if (alive) setErr('Organization billing could not be loaded. No billing information was changed.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const isOwner = tenantRole === 'owner';
  const applicationSubscriptionRecord = (stack?.applicationSubscription ?? stack?.billingAccount ?? null) as ApplicationSubscriptionView | null;
  const currentStackStatuses = new Set(['active', 'trialing', 'past_due', 'incomplete', 'canceling']);
  const companionChangeStatuses = new Set(['active', 'trialing', 'past_due', 'canceling']);
  const applicationSubscription = applicationSubscriptionRecord?.coreProduct
    && currentStackStatuses.has(applicationSubscriptionRecord.status ?? '')
    ? applicationSubscriptionRecord
    : null;
  const canChangeIncludedCompanion = Boolean(
    applicationSubscriptionRecord
    && companionChangeStatuses.has(applicationSubscriptionRecord.status ?? ''),
  );
  const legacyContract = stack?.legacyContract?.grandfathered
    ? stack.legacyContract as LegacyContractView
    : null;
  const legacyAddonContracts = Array.isArray(stack?.legacyAddonContracts) ? stack.legacyAddonContracts : [];
  const hasProviderBilling = Boolean(applicationSubscriptionRecord || legacyContract || legacyAddonContracts.length > 0);

  const activeEntitlements = (stack?.entitlements ?? []).filter((row: any) => row.active !== false);
  const coreEntitlement = activeEntitlements.find((row: any) => row.entitlementType === 'core_product');
  const coreKey = applicationSubscriptionRecord?.coreProduct ?? coreEntitlement?.entitlementKey ?? null;
  const coreProduct = coreKey
    ? CORE_PRODUCTS_BY_KEY[coreKey as keyof typeof CORE_PRODUCTS_BY_KEY]
    : null;
  const applicationStatus = applicationSubscriptionRecord?.status ?? null;
  const applicationEndDate = formatDate(applicationSubscriptionRecord?.currentPeriodEnd);
  const legacyEndDate = formatDate(legacyContract?.currentPeriodEnd);
  const includedCompanionKey = applicationSubscription?.includedCompanionKey ?? null;
  const includedCompanion = includedCompanionKey ? companionByKey.get(includedCompanionKey) : null;
  const additionalCompanions = useMemo(
    () => (applicationSubscription?.additionalModuleKeys ?? [])
      .map((key) => companionByKey.get(key))
      .filter((module): module is NonNullable<typeof module> => Boolean(module)),
    [applicationSubscription?.additionalModuleKeys],
  );
  const seatLimit = applicationSubscription
    ? stack?.seatLimit ?? (5 + Math.max(0, applicationSubscription.additionalSeats ?? 0))
    : null;

  const openPortal = async () => {
    if (!isOwner) {
      setErr('Billing is read-only for your role. Only the organization owner can make billing changes.');
      return;
    }
    if (!hasProviderBilling) {
      setErr('There is no paid subscription to manage for this organization.');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const result = await billingApi.createPortalSession();
      if (!result?.url) {
        setErr('Billing management is temporarily unavailable. Nothing changed.');
        return;
      }
      const { openExternalDocument } = await import('@/lib/launch');
      await openExternalDocument(result.url);
    } catch {
      setErr('We could not open secure billing management. Your subscription and payment method are unchanged.');
    } finally {
      setBusy(false);
    }
  };

  const changeIncludedCompanion = async (moduleKey: string) => {
    if (!isOwner) {
      setErr('Billing is read-only for your role. Only the organization owner can change the included companion.');
      return;
    }
    if (!canChangeIncludedCompanion) {
      setErr('The included companion cannot be changed while this Application Stack is not active or in a manageable billing state.');
      return;
    }
    setErr(null);
    setCompanionBusy(true);
    try {
      await billingApi.changeFreeCompanion(moduleKey);
      await refresh();
    } catch {
      setErr('The included companion could not be changed. Provider and local billing state were not presented as updated; review secure billing before retrying.');
    } finally {
      setCompanionBusy(false);
    }
  };

  const status = applicationStatus ?? legacyContract?.status ?? (coreProduct ? 'active' : 'free');
  const statusBadge =
    status === 'active' ? badgeStyles.success
    : status === 'trialing' ? badgeStyles.info
    : status === 'past_due' ? badgeStyles.warning
    : ['canceled', 'unpaid', 'checkout_failed', 'expired', 'incomplete_expired'].includes(status) ? badgeStyles.danger
    : badgeStyles.neutral;

  return (
    <div style={{ padding: space.xxl, maxWidth: 1100, margin: '0 auto' }} data-testid="page-tenant-billing">
      <header style={{ marginBottom: space.xl, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Receipt size={24} color={semantic.accent} />
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: '#fff' }}>Billing and Application Stack</h1>
          <p style={{ color: semantic.textMuted, margin: '4px 0 0', fontSize: fontSize.body }}>
            Paid application access, team seats, and invoices for {tenantName ? <strong>{tenantName}</strong> : 'this organization'}.
            {!isOwner && <span style={{ marginLeft: 8, color: semantic.accentWarning }}>Read-only — only the organization owner can make billing changes.</span>}
          </p>
        </div>
      </header>

      {loading ? (
        <div data-testid="tenant-billing-loading"><LoadingState label="Loading organization billing…" /></div>
      ) : (
        <>
          {err && (
            <div role="alert" data-testid="tenant-billing-error" style={{ color: semantic.accentDanger, fontSize: fontSize.sm, marginBottom: space.md, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldAlert size={12} /> {err}
            </div>
          )}

          <div data-testid="tenant-billing-summary" style={{ display: 'grid', gap: space.lg, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', marginBottom: space.xl }}>
            <div style={cardStyle} data-testid="tenant-billing-plan">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: semantic.textMuted, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <CreditCard size={14} /> {applicationSubscriptionRecord ? 'Application Stack contract' : legacyContract ? 'Grandfathered legacy contract' : legacyAddonContracts.length > 0 ? 'Grandfathered individual add-on' : 'Free account'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginTop: space.sm }}>
                {coreProduct?.name ?? legacyContract?.planName ?? (legacyAddonContracts.length > 0 ? 'Legacy add-on access' : 'OperatorOS home base')}
              </div>
              <div style={{ marginTop: space.sm }}><span style={statusBadge}>{formatBillingStatus(status)}</span></div>
              {(applicationEndDate || legacyEndDate) && (
                <div style={{ marginTop: 8, color: semantic.textMuted, fontSize: fontSize.sm }}>
                  {(applicationSubscriptionRecord?.cancelAtPeriodEnd || legacyContract?.cancelAtPeriodEnd) ? 'Access until' : 'Current period ends'}: {applicationEndDate ?? legacyEndDate}
                </div>
              )}
            </div>

            <div style={cardStyle} data-testid="tenant-billing-usage">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: semantic.textMuted, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Users size={14} /> Team seats
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginTop: space.sm }}>{seatLimit ?? '—'}</div>
              <div style={{ marginTop: space.sm, fontSize: fontSize.sm, color: semantic.textMuted }}>
                Application Stack includes five seats; additional seats are $15/month.
              </div>
              {usage?.aiCallsThisMonth != null && (
                <div style={{ marginTop: space.sm, fontSize: fontSize.sm, color: semantic.textMuted }}>AI actions this month: {usage.aiCallsThisMonth}</div>
              )}
            </div>

            <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ color: semantic.textMuted, fontSize: fontSize.sm, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Secure management</div>
                <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, margin: `${space.sm}px 0 0`, lineHeight: 1.5 }}>
                  Owners use the billing provider portal for payment methods, invoices, and existing-subscription management.
                </p>
              </div>
              <button
                data-testid="button-open-portal"
                onClick={openPortal}
                disabled={!isOwner || !hasProviderBilling || busy}
                title={!isOwner ? 'Only the organization owner can manage billing' : !hasProviderBilling ? 'No paid subscription is active' : undefined}
                style={{ ...buttonStyles.primary, marginTop: space.md, opacity: isOwner && hasProviderBilling ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: isOwner && hasProviderBilling ? 'pointer' : 'not-allowed' }}
              >
                <ExternalLink size={14} /> {busy ? 'Opening…' : 'Manage billing securely'}
              </button>
            </div>
          </div>

          {legacyContract && (
            <section style={{ ...panelStyle, marginBottom: space.xl, padding: '14px 16px' }} data-testid="tenant-billing-legacy-contract">
              <h2 style={{ color: '#fff', fontSize: fontSize.md, margin: 0 }}>Grandfathered access remains manageable</h2>
              <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, lineHeight: 1.55, margin: '7px 0 0' }}>
                {legacyContract.planName ?? 'This legacy contract'} remains visible for invoices and provider management. Starter, Pro, Elite, legacy plan switching, and per-application purchases are closed to new sales.
              </p>
            </section>
          )}

          {legacyAddonContracts.length > 0 && (
            <section style={{ ...panelStyle, marginBottom: space.xl }} data-testid="tenant-billing-legacy-addons">
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}` }}>
                <h2 style={{ color: '#fff', fontSize: fontSize.md, margin: 0 }}>Grandfathered individual add-ons — read-only</h2>
                <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, lineHeight: 1.5, margin: '6px 0 0' }}>These explicit legacy contracts remain visible for existing-customer management. No new per-application purchase or replacement is available; owners manage the provider subscription through the secure portal.</p>
              </div>
              {legacyAddonContracts.map((contract: any) => {
                const moduleName = companionByKey.get(contract.moduleSlug)?.name
                  ?? String(contract.moduleSlug ?? 'Legacy add-on').replace(/[-_]/g, ' ');
                const endDate = formatDate(contract.currentPeriodEnd);
                return (
                  <div key={`${contract.moduleSlug}:${contract.currentPeriodEnd ?? ''}`} style={{ padding: '11px 16px', borderBottom: `1px solid ${semantic.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Package size={15} color={semantic.accentInfo} />
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontSize: fontSize.body }}>{moduleName}</div>
                      <div style={{ color: semantic.textMuted, fontSize: fontSize.xs }}>{contract.status ?? 'status unavailable'}{endDate ? ` · ${contract.cancelAtPeriodEnd ? 'access until' : 'period ends'} ${endDate}` : ''}</div>
                    </div>
                    <span style={badgeStyles.neutral}>Legacy</span>
                  </div>
                );
              })}
            </section>
          )}

          <section style={{ ...panelStyle, marginBottom: space.xl, padding: '14px 16px' }} data-testid="tenant-billing-forward-offer">
            <h2 style={{ color: '#fff', fontSize: fontSize.md, margin: 0 }}>Application Stack is the only new-sale offer</h2>
            <p style={{ color: semantic.textMuted, fontSize: fontSize.sm, lineHeight: 1.55, margin: '7px 0 0' }}>
              Choose one flagship application per organization for this release. Monthly billing includes five seats, the {FREE_WITH_ANY_ACCOUNT.length} free account applications, and one eligible organization-wide companion. Additional companions are $29/month each; additional seats are $15/month each.
            </p>
            {!applicationSubscription && isOwner && (
              <a href="/pricing#build-stack" style={{ color: semantic.accent, display: 'inline-block', marginTop: 10, fontSize: fontSize.sm, fontWeight: 700 }}>Build Application Stack</a>
            )}
          </section>

          {applicationSubscription && (
            <section style={{ ...panelStyle, marginBottom: space.xl }} data-testid="tenant-billing-companions">
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers3 size={14} color={semantic.accentInfo} />
                <h2 style={{ fontSize: fontSize.md, fontWeight: 600, margin: 0, color: '#fff' }}>Companion applications</h2>
              </div>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${semantic.border}` }}>
                <label htmlFor="included-companion" style={{ display: 'block', color: '#fff', fontSize: fontSize.body, marginBottom: 7 }}>
                  Included organization-wide companion — $0 additional
                </label>
                <select
                  id="included-companion"
                  value={includedCompanionKey ?? ''}
                  disabled={!isOwner || !canChangeIncludedCompanion || companionBusy}
                  onChange={(event) => void changeIncludedCompanion(event.target.value)}
                  title={!isOwner
                    ? 'Only the organization owner can change the included companion'
                    : !canChangeIncludedCompanion
                      ? 'The included companion is read-only while this subscription is not in a manageable billing state'
                      : undefined}
                  style={{ width: '100%', maxWidth: 430, padding: '9px 11px', borderRadius: 8, border: `1px solid ${semantic.border}`, background: colors.bgSecondary, color: '#fff', cursor: isOwner && canChangeIncludedCompanion ? 'pointer' : 'not-allowed' }}
                >
                  <option value="" disabled>{includedCompanion?.name ?? 'Select an eligible companion'}</option>
                  {COMPANION_MODULES.map((module) => <option key={module.key} value={module.key}>{module.name}</option>)}
                </select>
                {!isOwner && <div style={{ color: semantic.textMuted, fontSize: fontSize.xs, marginTop: 6 }}>Read-only for organization administrators.</div>}
                {isOwner && !canChangeIncludedCompanion && <div style={{ color: semantic.textMuted, fontSize: fontSize.xs, marginTop: 6 }}>Read-only until the Application Stack reaches an active or otherwise manageable billing state.</div>}
              </div>
              {additionalCompanions.map((module) => (
                <BillingLine key={module.key} name={module.name} detail="$29/month organization-wide" badge="Paid" />
              ))}
              {additionalCompanions.length === 0 && (
                <div style={{ padding: '0 16px 14px', color: semantic.textMuted, fontSize: fontSize.sm }}>No additional paid companions are active.</div>
              )}
              <div style={{ padding: '0 16px 14px', color: semantic.textMuted, fontSize: fontSize.xs }}>
                Companion charges are managed as part of the single Application Stack subscription, not as cancellable per-application purchases.
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function BillingLine({ name, detail, badge }: { name: string; detail: string; badge: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${semantic.border}` }}>
      <Package size={15} color={semantic.accentInfo} />
      <div style={{ flex: 1 }}>
        <div style={{ color: '#fff', fontSize: fontSize.body }}>{name}</div>
        <div style={{ color: semantic.textMuted, fontSize: fontSize.xs }}>{detail}</div>
      </div>
      <span style={badge === 'Included' ? badgeStyles.success : badgeStyles.info}>{badge}</span>
    </div>
  );
}
