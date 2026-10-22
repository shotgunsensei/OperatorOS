'use client';

import { useEffect, useRef, useState } from 'react';
import { isToolBridgeUuid } from '@operatoros/sdk';
import { useAuth } from './AuthProvider';
import { useTenant, type TenantSummary } from './TenantProvider';
import { toolModulesApi } from '@/lib/auth';
import { colors } from '@/lib/design-tokens';

type Review = Awaited<ReturnType<typeof toolModulesApi.resolveOfficeexitLink>>;
export default function OfficeExitTenantLink() {
  const { user, loading: authLoading, captureIdentity } = useAuth();
  const { activeTenant, loading: tenantLoading } = useTenant();
  const latestTenant = useRef(activeTenant);
  latestTenant.current = activeTenant;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    tenant: TenantSummary; identityCurrent: () => boolean; attempt: number; requestId: string;
    origin?: string; review?: Review; error?: string;
  } | null>(null);
  const [approved, setApproved] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  useEffect(() => {
    setApproved(false); setSending(false); setSendError('');
    if (!user || !activeTenant || authLoading || tenantLoading) return;
    const controller = new AbortController(), identityCurrent = captureIdentity(user);
    const current = () => !controller.signal.aborted && identityCurrent() && latestTenant.current === activeTenant;
    const requestId = new URLSearchParams(window.location.search).get('request') ?? '';
    const state = { tenant: activeTenant, identityCurrent: current, attempt, requestId };
    void (async () => {
      try {
        if (!isToolBridgeUuid(requestId)) throw new Error('Start this connection from your OfficeExit organization.');
        const configuration = await toolModulesApi.officeexitLinkConfiguration(activeTenant.id, controller.signal);
        if (!current()) return;
        if (configuration.tenantId !== activeTenant.id || !configuration.enabled || !configuration.officeexitOrigin) {
          throw new Error('OfficeExit account linking is not open yet. No connection changed.');
        }
        const origin = new URL(configuration.officeexitOrigin);
        if (origin.protocol !== 'https:' || origin.origin !== configuration.officeexitOrigin) throw new Error('Link configuration is unavailable.');
        const review = await toolModulesApi.resolveOfficeexitLink(activeTenant.id, requestId, controller.signal);
        if (review.tenantId !== activeTenant.id || review.requestId !== requestId) throw new Error('The organization context changed. Start again.');
        if (current()) setResult({ ...state, origin: origin.origin, review });
      } catch (error) {
        if (current()) setResult({ ...state, error: error instanceof Error ? error.message : 'This connection could not be reviewed. Start again in OfficeExit.' });
      }
    })();
    return () => controller.abort();
  }, [user, activeTenant, authLoading, tenantLoading, captureIdentity, attempt]);
  const visible = !authLoading && !tenantLoading && result?.tenant === activeTenant && result.attempt === attempt
    && result.identityCurrent() ? result : null;
  const review = visible?.review;
  async function confirm() {
    if (!visible || !review || !approved || sending || !visible.origin || !visible.identityCurrent()) return;
    setSending(true); setSendError('');
    try {
      const response = await toolModulesApi.approveOfficeexitLink(visible.tenant.id, visible.requestId);
      if (!visible.identityCurrent()) return;
      const url = new URL(response.redirectUrl);
      if (url.origin !== visible.origin || url.pathname !== '/operatoros/link' || url.searchParams.size !== 1
        || url.searchParams.get('request') !== visible.requestId || url.hash || url.username || url.password) {
        throw new Error('The return destination could not be verified.');
      }
      window.location.assign(url.href);
    } catch {
      if (visible.identityCurrent()) { setSendError('Approval could not be confirmed. Start again in OfficeExit; no completed connection is being assumed.'); setSending(false); }
    }
  }
  return <main style={{ maxWidth: 700, margin: '48px auto', padding: 24, color: colors.text }}>
    <h1>Connect your OfficeExit organization</h1>
    <p style={{ lineHeight: 1.7 }}>Review both organizations before linking this tenant purchase. Linking does not make a purchase or change your subscription.</p>
    {!user ? <p>Sign in to OperatorOS, then reopen this request from OfficeExit.</p> : !activeTenant ? <p>Select your organization in OperatorOS, then start again from OfficeExit.</p>
      : !visible ? <p role="status">Checking the connection request.</p>
        : visible.error ? <><p role="alert">{visible.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)} style={{ minHeight: 44 }}>Check again</button></>
          : review ? <>
            <dl style={{ lineHeight: 1.8 }}>
              <dt>OperatorOS tenant</dt><dd>{review.tenantName} ({review.tenantId})</dd>
              <dt>OfficeExit organization</dt><dd>{review.officeexitOrganizationName} ({review.officeexitOrganizationId})</dd>
              <dt>OfficeExit account</dt><dd>{review.officeexitUserId}</dd>
            </dl>
            <label style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 48 }}>
              <input type="checkbox" checked={approved} disabled={sending} onChange={event => setApproved(event.target.checked)} />
              I own these organizations and approve this connection.
            </label>
            <p style={{ lineHeight: 1.6 }}>Continue to OfficeExit to confirm there within one minute. Both confirmations are required.</p>
            <button type="button" disabled={!approved || sending} onClick={() => void confirm()} style={{ minHeight: 44, padding: '10px 18px' }}>{sending ? 'Preparing confirmation…' : 'Approve and continue to OfficeExit'}</button>
            {sendError && <p role="alert">{sendError}</p>}
          </> : null}
  </main>;
}
