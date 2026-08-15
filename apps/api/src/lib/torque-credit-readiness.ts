import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { getPaymentProviderAdapter, type ProviderState } from './shared-provider-adapters.js';
import { loadReleaseMetadata } from './release-metadata.js';
import { isOperatorOSDeterministicProviderTestEnvironment } from './shared-service-safety.js';

export const TORQUE_CREDIT_REQUIRED_WEBHOOK_EVENTS = Object.freeze([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'payment_intent.payment_failed',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
]);

export type TorqueCreditCatalogReadiness = {
  state: 'validated' | 'stale' | 'unavailable' | 'test';
  version: string | null;
  mode: 'test' | 'live' | null;
};

type ReleaseReadiness =
  | { status: 'identified'; commit: string; expectedCommit?: string | null }
  | { status: 'unavailable'; expectedCommit?: string | null };

export interface TorqueCreditReadinessInput {
  env: NodeJS.ProcessEnv;
  paymentProviderState: ProviderState;
  databaseReady: boolean;
  moduleBaseUrl: string | null;
  catalog: TorqueCreditCatalogReadiness;
  release: ReleaseReadiness;
}

export interface TorqueCreditReadinessCheck {
  key: 'feature' | 'stripe' | 'mode' | 'catalog' | 'webhook' | 'database' | 'returnRoute' | 'release';
  ready: boolean;
  code: string;
}

export interface TorqueCreditPurchaseReadiness {
  ready: boolean;
  code: string;
  userMessage: string;
  retryable: boolean;
  administratorAction: string;
  providerMode: 'test' | 'live' | 'disabled';
  catalogVersion: string | null;
  checks: TorqueCreditReadinessCheck[];
}

const OUTCOMES: Record<string, Omit<TorqueCreditPurchaseReadiness, 'ready' | 'providerMode' | 'catalogVersion' | 'checks'>> = {
  TORQUE_CREDIT_PURCHASES_READY: {
    code: 'TORQUE_CREDIT_PURCHASES_READY',
    userMessage: 'Credit checkout is ready. Credits are granted only after verified payment settlement.',
    retryable: false,
    administratorAction: 'No action required.',
  },
  TORQUE_CREDIT_PURCHASES_DISABLED: {
    code: 'TORQUE_CREDIT_PURCHASES_DISABLED',
    userMessage: 'Credit purchases are temporarily unavailable. Nothing was charged.',
    retryable: false,
    administratorAction: 'Keep the purchase kill switch closed until every revenue readiness check is green.',
  },
  TORQUE_PAYMENT_PROVIDER_DISABLED: {
    code: 'TORQUE_PAYMENT_PROVIDER_DISABLED',
    userMessage: 'Credit checkout is temporarily unavailable. Nothing was charged.',
    retryable: false,
    administratorAction: 'Configure the approved Stripe account, mode, and canonical webhook secret.',
  },
  TORQUE_PAYMENT_MODE_MISMATCH: {
    code: 'TORQUE_PAYMENT_MODE_MISMATCH',
    userMessage: 'Credit checkout is unavailable because its payment environment is not validated. Nothing was charged.',
    retryable: false,
    administratorAction: 'Align the approved TorqueShed purchase mode with STRIPE_MODE and the catalog mapping.',
  },
  TORQUE_CATALOG_UNAVAILABLE: {
    code: 'TORQUE_CATALOG_UNAVAILABLE',
    userMessage: 'The credit-pack catalog is unavailable. Nothing was charged.',
    retryable: false,
    administratorAction: 'Provision and validate the durable environment-specific TorqueShed Stripe catalog.',
  },
  TORQUE_WEBHOOK_NOT_READY: {
    code: 'TORQUE_WEBHOOK_NOT_READY',
    userMessage: 'Credit purchases are unavailable while payment confirmation is not ready. Nothing was charged.',
    retryable: false,
    administratorAction: 'Validate the canonical Stripe webhook URL and all required event subscriptions.',
  },
  TORQUE_DATABASE_RELEASE_REQUIRED: {
    code: 'TORQUE_DATABASE_RELEASE_REQUIRED',
    userMessage: 'Credit purchases are unavailable while billing storage is being updated. Nothing was charged.',
    retryable: true,
    administratorAction: 'Apply and verify the current OperatorOS database release before enabling purchases.',
  },
  TORQUE_RETURN_ROUTE_INVALID: {
    code: 'TORQUE_RETURN_ROUTE_INVALID',
    userMessage: 'Credit checkout cannot start because the safe return route is unavailable. Nothing was charged.',
    retryable: false,
    administratorAction: 'Correct the canonical HTTPS TorqueShed module base URL and diagnostic return route.',
  },
  TORQUE_RELEASE_IDENTITY_MISMATCH: {
    code: 'TORQUE_RELEASE_IDENTITY_MISMATCH',
    userMessage: 'Credit purchases are unavailable while the deployed release is being verified. Nothing was charged.',
    retryable: false,
    administratorAction: 'Deploy and verify the exact reviewed release identity before enabling purchases.',
  },
};

function webhookReady(env: NodeJS.ProcessEnv, deterministic: boolean): boolean {
  if (deterministic) return true;
  try {
    const endpoint = new URL(env.STRIPE_WEBHOOK_ENDPOINT_URL ?? '');
    if (endpoint.protocol !== 'https:' || endpoint.pathname !== '/v1/billing/webhook') return false;
  } catch {
    return false;
  }
  const configuredEvents = new Set(
    String(env.STRIPE_WEBHOOK_EVENTS ?? '')
      .split(/[\s,]+/)
      .map((event) => event.trim())
      .filter(Boolean),
  );
  return TORQUE_CREDIT_REQUIRED_WEBHOOK_EVENTS.every((event) => configuredEvents.has(event));
}

function returnRouteReady(baseUrl: string | null, deterministic: boolean): boolean {
  try {
    const url = new URL(baseUrl ?? '');
    return (url.protocol === 'https:' || (deterministic && url.protocol === 'http:'))
      && !url.username
      && !url.password
      && (url.pathname === '/' || url.pathname === '');
  } catch {
    return false;
  }
}

export function evaluateTorqueCreditPurchaseReadiness(
  input: TorqueCreditReadinessInput,
): TorqueCreditPurchaseReadiness {
  const deterministic = isOperatorOSDeterministicProviderTestEnvironment(input.env);
  const configuredMode = ['test', 'live'].includes(input.env.STRIPE_MODE ?? '')
    ? input.env.STRIPE_MODE as 'test' | 'live'
    : 'disabled';
  const expectedMode = input.env.TORQUESHED_CREDIT_PURCHASES_MODE;
  const featureReady = input.env.TORQUESHED_CREDIT_PURCHASES_ENABLED === '1'
    || (deterministic && input.env.TORQUESHED_CREDIT_PURCHASES_ENABLED !== '0');
  const releaseReady = deterministic || (
    input.release.status === 'identified'
    && (!input.release.expectedCommit || input.release.commit === input.release.expectedCommit)
  );
  const checks: TorqueCreditReadinessCheck[] = [
    { key: 'feature', ready: featureReady, code: 'TORQUE_CREDIT_PURCHASES_DISABLED' },
    { key: 'stripe', ready: deterministic || input.paymentProviderState === 'configured', code: 'TORQUE_PAYMENT_PROVIDER_DISABLED' },
    {
      key: 'mode',
      ready: deterministic || (configuredMode !== 'disabled' && (expectedMode === 'test' || expectedMode === 'live') && configuredMode === expectedMode),
      code: 'TORQUE_PAYMENT_MODE_MISMATCH',
    },
    {
      key: 'catalog',
      ready: deterministic
        ? input.catalog.state === 'test' || input.catalog.state === 'validated'
        : input.catalog.state === 'validated' && input.catalog.mode === configuredMode,
      code: 'TORQUE_CATALOG_UNAVAILABLE',
    },
    { key: 'webhook', ready: webhookReady(input.env, deterministic), code: 'TORQUE_WEBHOOK_NOT_READY' },
    { key: 'database', ready: input.databaseReady, code: 'TORQUE_DATABASE_RELEASE_REQUIRED' },
    { key: 'returnRoute', ready: returnRouteReady(input.moduleBaseUrl, deterministic), code: 'TORQUE_RETURN_ROUTE_INVALID' },
    { key: 'release', ready: releaseReady, code: 'TORQUE_RELEASE_IDENTITY_MISMATCH' },
  ];
  const failure = checks.find((check) => !check.ready);
  const outcome = OUTCOMES[failure?.code ?? 'TORQUE_CREDIT_PURCHASES_READY']!;
  return {
    ready: !failure,
    ...outcome,
    providerMode: deterministic ? 'test' : configuredMode,
    catalogVersion: input.catalog.version,
    checks,
  };
}

export function compareTorqueRevenueReleaseIdentity(sourceCommit: string, deployedCommit: string) {
  const matches = /^[0-9a-f]{40}$/.test(sourceCommit)
    && /^[0-9a-f]{40}$/.test(deployedCommit)
    && sourceCommit === deployedCommit;
  return {
    matches,
    code: matches ? 'TORQUE_RELEASE_IDENTITY_MATCH' : 'TORQUE_RELEASE_IDENTITY_MISMATCH',
    sourceCommit,
    deployedCommit,
  } as const;
}

async function torqueBillingDatabaseReady(): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      SELECT
        to_regclass('public.operatoros_token_purchase_intents') IS NOT NULL AS purchases,
        to_regclass('public.torqueshed_token_ledger_entries') IS NOT NULL AS ledger,
        to_regclass('public.shared_webhook_receipts') IS NOT NULL AS receipts
    `);
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row?.purchases === true && row?.ledger === true && row?.receipts === true;
  } catch {
    return false;
  }
}

export async function getTorqueCreditPurchaseReadiness(input: {
  moduleBaseUrl: string | null;
  catalog?: TorqueCreditCatalogReadiness;
  env?: NodeJS.ProcessEnv;
}): Promise<TorqueCreditPurchaseReadiness> {
  const env = input.env ?? process.env;
  const deterministic = isOperatorOSDeterministicProviderTestEnvironment(env);
  const metadata = loadReleaseMetadata(env);
  const expectedCommit = env.TORQUESHED_CREDIT_PURCHASES_EXPECTED_RELEASE_COMMIT?.trim().toLowerCase() || null;
  const release: ReleaseReadiness = metadata.status === 'identified'
    ? { status: 'identified', commit: metadata.commit, expectedCommit }
    : { status: 'unavailable', expectedCommit };
  return evaluateTorqueCreditPurchaseReadiness({
    env,
    paymentProviderState: getPaymentProviderAdapter().status.state,
    databaseReady: await torqueBillingDatabaseReady(),
    moduleBaseUrl: input.moduleBaseUrl,
    // Phase 41 deliberately treats the existing inline price_data path as
    // unavailable outside deterministic tests. Phase 42 supplies the durable,
    // validated environment-specific catalog mapping.
    catalog: input.catalog ?? (deterministic
      ? { state: 'test', version: 'phase41-deterministic-v1', mode: 'test' }
      : { state: 'unavailable', version: null, mode: null }),
    release,
  });
}
