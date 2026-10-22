'use client';

import { useEffect, useState } from 'react';
import { TOOL_MODULE_CATALOG, type ToolModuleCatalogResponse } from '@operatoros/sdk';
import { useAuth } from './AuthProvider';
import { useTenant, type TenantSummary } from './TenantProvider';
import { toolModulesApi } from '@/lib/auth';
import { colors } from '@/lib/design-tokens';

const descriptions = {
  officeexit: 'All ten current OfficeExit 2026 features, including Publisher Rescue, for your entire tenant. No per-user, device or site limits.',
  vendortrust365: 'Review Microsoft 365 application permissions and prepare evidence reports on Windows.',
};

export default function IndependentToolsCatalog() {
  const { user, loading: authLoading, captureIdentity } = useAuth();
  const { activeTenant, loading: tenantLoading } = useTenant();
  const tenantId = activeTenant?.id ?? null;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    userId: string; tenant: TenantSummary; attempt: number; identityCurrent: () => boolean;
    data: ToolModuleCatalogResponse | null;
  } | null>(null);

  useEffect(() => {
    if (!user || !activeTenant || !tenantId || authLoading || tenantLoading) return;
    const controller = new AbortController();
    const identityCurrent = captureIdentity(user);
    const current = () => !controller.signal.aborted && identityCurrent();
    void toolModulesApi.catalog(tenantId, controller.signal).then(data => {
      if (data.contractVersion !== 1 || data.tenantId !== tenantId) throw new Error('Catalog context mismatch');
      if (current()) setResult({ userId: user.id, tenant: activeTenant, attempt, identityCurrent, data });
    }).catch(() => {
      if (current()) setResult({ userId: user.id, tenant: activeTenant, attempt, identityCurrent, data: null });
    });
    return () => controller.abort();
  }, [user, activeTenant, tenantId, authLoading, tenantLoading, captureIdentity, attempt]);

  // Clear presentation synchronously on identity/tenant changes, before effects
  // run. Aborting alone cannot stop an already fulfilled stale response.
  const visible = !authLoading && !tenantLoading && user && tenantId
    && result?.userId === user.id && result.tenant === activeTenant && result.attempt === attempt
    && result.identityCurrent()
    ? result : null;
  const message = authLoading || tenantLoading
    ? 'Checking your organization.'
    : !user || !tenantId
      ? 'Choose an organization to check purchase eligibility.'
      : !visible
        ? 'Checking purchase eligibility.'
        : !visible.data
          ? 'Purchase eligibility could not be checked. No purchase or access changed.'
          : visible.data.purchaseEligibility.eligible
            ? 'Your organization owner can purchase either tool once sales open. A paid base plan is not required.'
            : 'Only the current organization owner can make this purchase. A paid base plan is not required.';

  return (
    <section aria-labelledby="independent-tools-heading" data-testid="independent-tools-catalog" style={{ margin: '0 0 28px' }}>
      <h2 id="independent-tools-heading" style={{ fontSize: 20, margin: '0 0 8px', color: colors.text }}>One-time tools</h2>
      <p style={{ margin: '0 0 16px', color: colors.textDim, fontSize: 14, lineHeight: 1.6 }}>
        Separate tenant add-ons for free and paid accounts. Each tool is purchased independently,
        with no subscription renewal or bundled annual updates or support fee.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
        {TOOL_MODULE_CATALOG.map(tool => (
          <article key={tool.slug} data-testid={`independent-tool-${tool.slug}`} style={{ padding: 20, border: `1px solid ${colors.border}`, borderRadius: 12, background: colors.bgSecondary }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, color: colors.text }}>{tool.name}</h3>
            <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6, color: colors.textDim }}>{descriptions[tool.slug]}</p>
            <p style={{ margin: '0 0 10px', color: colors.text, fontSize: 15 }}>$99 USD once for your entire tenant.</p>
            <p style={{ margin: 0, color: colors.textMuted, fontSize: 13 }}>Purchase and download are not open yet. Future major-version coverage has not been decided.</p>
          </article>
        ))}
      </div>
      <p role="status" aria-live="polite" data-testid="independent-tool-eligibility" style={{ margin: '14px 0 0', fontSize: 13, color: colors.textDim }}>{message}</p>
      {visible && !visible.data && (
        <button type="button" onClick={() => setAttempt(value => value + 1)} style={{ minHeight: 44, marginTop: 10, padding: '8px 14px', border: `1px solid ${colors.border}`, borderRadius: 8, background: colors.bgHover, color: colors.text, cursor: 'pointer' }}>Check again</button>
      )}
    </section>
  );
}
