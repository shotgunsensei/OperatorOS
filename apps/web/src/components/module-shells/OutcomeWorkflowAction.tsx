'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, ExternalLink, Loader2, ShieldCheck, X } from 'lucide-react';
import { getActiveTenantId, sharedPlatformApi } from '@/lib/auth';
import { DEFAULT_OPERATOROS_NAVIGATION_URLS } from '../../../../../packages/modules/navigation.js';

export type DataFabricWorkflowKey =
  | 'tradeflowkit.job_to_snapproof'
  | 'callcommand.analysis_to_tradeflowkit'
  | 'callcommand.analysis_to_pulsedesk'
  | 'callcommand.analysis_to_techdeck'
  | 'support.resolved_to_faultlinelab'
  | 'brandforgeos.campaign_to_launchkit'
  | 'ninjamation.script_to_techdeck'
  | 'snapproof.approved_report_to_tradeflowkit'
  | 'torqueshed.diagnostic_to_snapproof'
  | 'torqueshed.diagnostic_to_faultlinelab';

export type OutcomeWorkflowPreviewItem = {
  label: string;
  detail?: string;
};

export type OutcomeWorkflowActionProps = {
  workflowKey: DataFabricWorkflowKey;
  aggregateId: string;
  sourceDeepLink: string;
  sourceModuleSlug?: string;
  sourceType?: string;
  sourceKind?: string;
  title: string;
  description: string;
  destinationLabel: string;
  confirmationText: string;
  previewItems: OutcomeWorkflowPreviewItem[];
  actionLabel?: string;
  tenantId?: string | null;
  sourceVersion: string | number;
  idempotencyScope?: string;
  payload?: Record<string, unknown>;
  disabled?: boolean;
  disabledReason?: string;
  testId?: string;
};

type WorkflowStage = 'idle' | 'review' | 'working' | 'waiting' | 'complete' | 'partial' | 'failed';
type WorkflowLink = {
  destination_deep_link?: unknown;
  destinationDeepLink?: unknown;
  destination_type?: unknown;
  destinationType?: unknown;
  destination_resource_type?: unknown;
  destinationResourceType?: unknown;
};
type WorkflowRun = {
  id?: unknown;
  status?: unknown;
  delivery_error_code?: unknown;
  deliveryErrorCode?: unknown;
  last_error_code?: unknown;
  lastErrorCode?: unknown;
  details_json?: { summary?: unknown };
  detailsJson?: { summary?: unknown };
};
type WorkflowModuleReadiness = {
  moduleSlug?: unknown;
  hasAccess?: unknown;
  accessLevel?: unknown;
  canWrite?: unknown;
  canManage?: unknown;
};
type WorkflowReadiness = {
  available?: unknown;
  blocker?: unknown;
  managerAccessRequired?: unknown;
  source?: WorkflowModuleReadiness;
  destination?: WorkflowModuleReadiness;
};
type AccessCheck =
  | { status: 'checking'; message: string }
  | { status: 'ready'; message: string }
  | { status: 'blocked' | 'unavailable'; message: string };

const panel: React.CSSProperties = {
  border: '1px solid rgba(56,189,248,.3)',
  borderRadius: 14,
  background: 'linear-gradient(145deg,rgba(8,20,39,.96),rgba(8,12,27,.98))',
  padding: 16,
  color: '#f8fafc',
};
const button: React.CSSProperties = {
  border: 0,
  borderRadius: 9,
  minHeight: 40,
  padding: '9px 14px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  background: 'linear-gradient(135deg,#0284c7,#6d28d9)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
};
const quiet: React.CSSProperties = {
  ...button,
  background: '#111827',
  border: '1px solid rgba(148,163,184,.28)',
};
const POLL_DELAYS = [0, 450, 700, 1_000, 1_400, 2_000, 2_700, 3_500, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000, 4_000];

function safeDeepLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

function friendlyLinkLabel(link: WorkflowLink, fallback: string, index: number) {
  const raw = String(link.destination_type ?? link.destinationType ?? link.destination_resource_type ?? link.destinationResourceType ?? '')
    .replace(/[._-]+/g, ' ')
    .trim();
  if (!raw) return `Open ${fallback}${index > 0 ? ` result ${index + 1}` : ''}`;
  return `Open ${raw.replace(/\b\w/g, character => character.toUpperCase())}`;
}

function friendlyFailure(error: unknown) {
  const status = Number((error as { status?: unknown })?.status ?? 0);
  if (status === 401) return 'Sign in again, then reopen this record to finish creating the connected items.';
  if (status === 403) return 'Your current organization access does not allow you to create these items. Ask an organization owner or administrator for access to both applications.';
  if (status === 404) return 'The original record is no longer available.';
  if (status === 409) return 'The original record changed or is not ready. Refresh it, then review the requirements again.';
  return 'The connected items could not be created. No publishing, deployment, purchase, or script execution was performed.';
}

function readinessMessage(readiness: WorkflowReadiness, destinationLabel: string): string {
  switch (String(readiness.blocker ?? '')) {
    case 'source_unavailable':
      return 'This application is not available to you in the selected organization.';
    case 'source_write_required':
      return 'You can view this application, but creating connected items requires contributor or manager access.';
    case 'source_manager_required':
      return 'A manager in this application must complete this step.';
    case 'destination_unavailable':
      return `${destinationLabel} is not available to you in the selected organization.`;
    case 'destination_write_required':
      return `You can view ${destinationLabel}, but creating these items requires contributor or manager access.`;
    case 'destination_manager_required':
      return `A ${destinationLabel} manager must complete this step.`;
    default:
      return `We could not confirm that you can create items in ${destinationLabel}.`;
  }
}

function workflowRunErrorCode(run: WorkflowRun | undefined) {
  const value = run?.delivery_error_code
    ?? run?.deliveryErrorCode
    ?? run?.last_error_code
    ?? run?.lastErrorCode;
  return typeof value === 'string' ? value.trim() : '';
}

function keySegment(value: string | number | undefined, fallback: string) {
  const result = String(value ?? '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32);
  return result || fallback;
}

function storageKey(
  tenantId: string,
  workflowKey: string,
  aggregateId: string,
  sourceModuleSlug: string | undefined,
  sourceVersion: string | number | undefined,
  idempotencyScope: string | undefined,
) {
  return `operatoros:outcome-handoff:${tenantId}:${workflowKey}:${sourceModuleSlug ?? 'contract'}:${aggregateId}:${sourceVersion ?? 'current'}:${idempotencyScope ?? 'default'}`;
}

function readStoredRun(key: string): { idempotencyKey: string; runId: string | null } | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null') as Record<string, unknown> | null;
    return value && typeof value.idempotencyKey === 'string'
      ? { idempotencyKey: value.idempotencyKey, runId: typeof value.runId === 'string' ? value.runId : null }
      : null;
  } catch {
    return null;
  }
}

function storeRun(key: string, value: { idempotencyKey: string; runId: string | null }) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A privacy-restricted browser can disable session storage. Server-side
    // idempotency still protects the accepted request within this component instance.
  }
}

function clearStoredRun(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Privacy-restricted browsers can disable session storage. The server's
    // semantic idempotency still prevents a second destination record.
  }
}

export default function OutcomeWorkflowAction({
  workflowKey,
  aggregateId,
  sourceDeepLink,
  sourceModuleSlug,
  sourceType,
  sourceKind,
  title,
  description,
  destinationLabel,
  confirmationText,
  previewItems,
  actionLabel = 'Review what will be created',
  tenantId,
  sourceVersion,
  idempotencyScope,
  payload,
  disabled = false,
  disabledReason,
  testId = 'outcome-workflow-action',
}: OutcomeWorkflowActionProps) {
  const [stage, setStage] = useState<WorkflowStage>('idle');
  const [confirmed, setConfirmed] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [links, setLinks] = useState<Array<{ href: string; label: string }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [accessCheck, setAccessCheck] = useState<AccessCheck>({
    status: 'checking',
    message: `Checking access to ${destinationLabel}…`,
  });
  const [accessCheckAttempt, setAccessCheckAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const stopPolling = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => {
    stopPolling();
    setStage('idle');
    setConfirmed(false);
    setRunId(null);
    setLinks([]);
    setMessage(null);
  }, [aggregateId, workflowKey, sourceModuleSlug, sourceVersion, idempotencyScope, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    let current = true;
    const activeTenantId = tenantId ?? getActiveTenantId();
    if (!activeTenantId) {
      setAccessCheck({ status: 'blocked', message: 'Choose an organization before reviewing what will be created.' });
      return () => { current = false; };
    }
    setAccessCheck({ status: 'checking', message: `Checking access to ${destinationLabel}…` });
    void sharedPlatformApi.dataFabricWorkflowReadiness(activeTenantId, workflowKey, sourceModuleSlug)
      .then((result) => {
        if (!current) return;
        const readiness = (result as { readiness?: WorkflowReadiness })?.readiness;
        if (!readiness || typeof readiness.available !== 'boolean') {
          setAccessCheck({ status: 'unavailable', message: 'Application access could not be checked right now.' });
          return;
        }
        setAccessCheck(readiness.available
          ? { status: 'ready', message: `You can create these items in ${destinationLabel}.` }
          : { status: 'blocked', message: readinessMessage(readiness, destinationLabel) });
      })
      .catch(() => {
        if (current) setAccessCheck({ status: 'unavailable', message: 'Application access could not be checked right now.' });
      });
    return () => { current = false; };
  }, [accessCheckAttempt, destinationLabel, sourceModuleSlug, tenantId, workflowKey]);

  const pollRun = useCallback((activeTenantId: string, activeRunId: string, pollGeneration: number, attempt = 0): void => {
    if (pollGeneration !== generation.current) return;
    const delay = POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]!;
    timer.current = setTimeout(async () => {
      if (pollGeneration !== generation.current) return;
      try {
        const result = await sharedPlatformApi.dataFabricRun(activeTenantId, activeRunId) as {
          run?: WorkflowRun;
          links?: WorkflowLink[];
        };
        if (pollGeneration !== generation.current) return;
        const status = String(result.run?.status ?? 'queued');
        if (status === 'completed' || status === 'partial') {
          const destinationLinks = (result.links ?? []).flatMap((link, index) => {
            const href = safeDeepLink(link.destination_deep_link ?? link.destinationDeepLink);
            return href ? [{ href, label: friendlyLinkLabel(link, destinationLabel, index) }] : [];
          });
          setLinks(destinationLinks);
          setMessage(
            typeof (result.run?.details_json?.summary ?? result.run?.detailsJson?.summary) === 'string'
              ? String(result.run?.details_json?.summary ?? result.run?.detailsJson?.summary)
              : status === 'completed'
                ? `Your items are ready in ${destinationLabel}.`
                : `Some items are ready in ${destinationLabel}; one optional item could not be created.`,
          );
          setStage(status === 'completed' ? 'complete' : 'partial');
          return;
        }
        if (status === 'dead_letter' || status === 'failed' || status === 'cancelled') {
          const errorCode = workflowRunErrorCode(result.run);
          setMessage(
            errorCode === 'FABRIC_SOURCE_VERSION_CHANGED'
              ? 'The original record changed after this preview was prepared. Refresh it, review the latest details, and confirm again.'
              : 'The connected items could not be created. No publishing, deployment, purchase, or script execution was performed.',
          );
          setStage('failed');
          return;
        }
        if (attempt + 1 >= POLL_DELAYS.length) {
          setMessage('These items are still being created. Check again shortly; another copy will not be created.');
          setStage('waiting');
          return;
        }
        pollRun(activeTenantId, activeRunId, pollGeneration, attempt + 1);
      } catch (error) {
        const status = Number((error as { status?: unknown })?.status ?? 0);
        if ([401, 403, 404].includes(status)) {
          setMessage(friendlyFailure(error));
          setStage('failed');
          return;
        }
        if (attempt + 1 >= POLL_DELAYS.length) {
          setMessage('These items are still being created. Check again shortly; another copy will not be created.');
          setStage('waiting');
          return;
        }
        pollRun(activeTenantId, activeRunId, pollGeneration, attempt + 1);
      }
    }, delay);
  }, [destinationLabel]);

  const start = async () => {
    const activeTenantId = tenantId ?? getActiveTenantId();
    if (!activeTenantId) {
      setMessage('Choose an organization before creating these items.');
      setStage('failed');
      return;
    }
    stopPolling();
    const pollGeneration = generation.current;
    setStage('working');
    setMessage(null);
    setLinks([]);
    const persistedKey = storageKey(activeTenantId, workflowKey, aggregateId, sourceModuleSlug, sourceVersion, idempotencyScope);
    const stored = readStoredRun(persistedKey);
    if (stored?.runId) {
      setRunId(stored.runId);
      pollRun(activeTenantId, stored.runId, pollGeneration);
      return;
    }
    const idempotencyKey = stored?.idempotencyKey ?? `ui:${keySegment(sourceModuleSlug, 'contract')}:${keySegment(idempotencyScope ?? sourceVersion, 'default')}:${crypto.randomUUID()}`;
    storeRun(persistedKey, { idempotencyKey, runId: null });
    try {
      const result = await sharedPlatformApi.startDataFabricWorkflow(activeTenantId, workflowKey, {
        aggregateId,
        sourceDeepLink,
        idempotencyKey,
        ...(sourceModuleSlug ? { sourceModuleSlug } : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(sourceKind ? { sourceKind } : {}),
        expectedSourceVersion: sourceVersion,
        ...(payload ? { payload } : {}),
      }) as { run?: WorkflowRun };
      if (pollGeneration !== generation.current) return;
      const nextRunId = typeof result.run?.id === 'string' ? result.run.id : null;
      if (!nextRunId) throw new Error('Missing workflow run');
      setRunId(nextRunId);
      storeRun(persistedKey, { idempotencyKey, runId: nextRunId });
      pollRun(activeTenantId, nextRunId, pollGeneration);
    } catch (error) {
      if (pollGeneration !== generation.current) return;
      setMessage(friendlyFailure(error));
      setStage('failed');
    }
  };

  const checkAgain = () => {
    const activeTenantId = tenantId ?? getActiveTenantId();
    if (!activeTenantId || !runId) return;
    stopPolling();
    const pollGeneration = generation.current;
    setStage('working');
    setMessage(null);
    pollRun(activeTenantId, runId, pollGeneration);
  };

  const reset = (forgetFailedRun = false) => {
    stopPolling();
    if (forgetFailedRun) {
      const activeTenantId = tenantId ?? getActiveTenantId();
      if (activeTenantId) {
        clearStoredRun(storageKey(activeTenantId, workflowKey, aggregateId, sourceModuleSlug, sourceVersion, idempotencyScope));
      }
    }
    setStage('idle');
    setConfirmed(false);
    setRunId(null);
    setLinks([]);
    setMessage(null);
  };

  return (
    <section data-testid={testId} style={panel} aria-label={title}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: '#7dd3fc', textTransform: 'uppercase', letterSpacing: '.12em', fontSize: 11, fontWeight: 900 }}>
            Create in another app
          </div>
          <h3 style={{ margin: '5px 0 4px', fontSize: 18 }}>{title}</h3>
          <p style={{ margin: 0, color: '#aebdce', lineHeight: 1.55 }}>{description}</p>
        </div>
        {stage !== 'idle' && stage !== 'working' && (
          <button type="button" onClick={() => reset(stage === 'failed')} aria-label="Close workflow preview" style={{ ...quiet, minWidth: 40, padding: 8 }}>
            <X size={16} />
          </button>
        )}
      </div>

      {stage === 'idle' && (
        <div style={{ marginTop: 14 }}>
          {disabledReason && <p style={{ color: '#fcd34d', margin: '0 0 10px' }}>{disabledReason}</p>}
          {accessCheck.status !== 'ready' && (
            <div data-testid={`${testId}-readiness`} role="status" aria-live="polite" style={{ margin: '0 0 11px', color: accessCheck.status === 'checking' ? '#bae6fd' : '#fcd34d' }}>
              <p style={{ margin: '0 0 8px' }}>{accessCheck.message}</p>
              {(accessCheck.status === 'blocked' || accessCheck.status === 'unavailable') && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link href={DEFAULT_OPERATOROS_NAVIGATION_URLS.appsUrl} style={{ ...quiet, minHeight: 34, padding: '6px 10px', textDecoration: 'none' }}>
                    Open My Apps
                  </Link>
                  {accessCheck.status === 'unavailable' && (
                    <button type="button" style={{ ...quiet, minHeight: 34, padding: '6px 10px' }} onClick={() => setAccessCheckAttempt(value => value + 1)}>
                      Check access again
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            style={{ ...button, opacity: disabled || accessCheck.status !== 'ready' ? .5 : 1 }}
            disabled={disabled || accessCheck.status !== 'ready'}
            onClick={() => setStage('review')}
          >
            {actionLabel} <ArrowRight size={16} />
          </button>
        </div>
      )}

      {stage === 'review' && (
        <div style={{ marginTop: 16 }}>
          <strong>This will create:</strong>
          <ul style={{ margin: '9px 0 13px', paddingLeft: 20, color: '#dbeafe' }}>
            {previewItems.map(item => (
              <li key={`${item.label}:${item.detail ?? ''}`} style={{ marginBottom: 7 }}>
                <strong>{item.label}</strong>{item.detail ? <span style={{ color: '#aebdce' }}> — {item.detail}</span> : null}
              </li>
            ))}
          </ul>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: 11, borderRadius: 9, background: 'rgba(15,23,42,.72)', color: '#dbeafe' }}>
            <input
              data-testid={`${testId}-confirmation`}
              type="checkbox"
              checked={confirmed}
              onChange={event => setConfirmed(event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>{confirmationText}</span>
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
            <button data-testid={`${testId}-confirm`} type="button" style={{ ...button, opacity: confirmed ? 1 : .5 }} disabled={!confirmed} onClick={() => void start()}>
              <ShieldCheck size={16} /> Confirm and create
            </button>
            <button type="button" style={quiet} onClick={() => reset()}>Cancel</button>
          </div>
        </div>
      )}

      {stage === 'working' && (
        <div role="status" aria-live="polite" style={{ display: 'flex', gap: 9, alignItems: 'center', marginTop: 15, color: '#bae6fd' }}>
          <Loader2 size={18} className="spin" /> Creating the confirmed items in {destinationLabel}…
        </div>
      )}

      {(stage === 'complete' || stage === 'partial') && (
        <div role="status" aria-live="polite" style={{ marginTop: 15 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: stage === 'complete' ? '#86efac' : '#fde68a' }}>
            <CheckCircle2 size={18} /> <strong>{stage === 'complete' ? 'Items created' : 'Some items created'}</strong>
          </div>
          {message && <p style={{ color: '#cbd5e1', margin: '8px 0 11px' }}>{message}</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {links.map(link => (
              <a key={link.href} href={link.href} style={{ ...button, textDecoration: 'none' }}>
                {link.label} <ExternalLink size={15} />
              </a>
            ))}
          </div>
        </div>
      )}

      {stage === 'waiting' && (
        <div role="status" aria-live="polite" style={{ marginTop: 15 }}>
          <p style={{ color: '#cbd5e1' }}>{message}</p>
          <button type="button" style={quiet} onClick={checkAgain}>Check status</button>
        </div>
      )}

      {stage === 'failed' && (
        <div role="alert" style={{ marginTop: 15 }}>
          <p style={{ color: '#fecaca' }}>{message}</p>
          <button type="button" style={quiet} onClick={() => reset(true)}>Review again</button>
        </div>
      )}
    </section>
  );
}
