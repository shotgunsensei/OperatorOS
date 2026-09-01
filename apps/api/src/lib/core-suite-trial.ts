import crypto from 'node:crypto';
import { and, eq, or, sql } from 'drizzle-orm';
import { MODULE_CATALOG_BY_SLUG } from '@operatoros/sdk';
import { db } from '../db.js';
import { accountTrials, tenants, users, type AccountTrialRow } from '../schema.js';

export const CORE_SUITE_TRIAL_OFFER_CODE = 'main-modules-7d-v1';
export const CORE_SUITE_TRIAL_POLICY_VERSION = 1;
export const CORE_SUITE_TRIAL_IDENTITY_KEY_VERSION = 1;
export const CORE_SUITE_TRIAL_DURATION_DAYS = 7;
export const CORE_SUITE_TRIAL_DURATION_HOURS = 168;
export const CORE_SUITE_TRIAL_MODULE_SLUGS = Object.freeze([
  'tradeflowkit',
  'techdeck',
  'pulsedesk',
] as const);

export type CoreSuiteTrialModuleSlug = (typeof CORE_SUITE_TRIAL_MODULE_SLUGS)[number];
export type CoreSuiteTrialState =
  | 'unavailable'
  | 'verification_required'
  | 'eligible'
  | 'active'
  | 'expired'
  | 'revoked'
  | 'already_used';

export interface CoreSuiteTrialStatus {
  offerCode: typeof CORE_SUITE_TRIAL_OFFER_CODE;
  policyVersion: typeof CORE_SUITE_TRIAL_POLICY_VERSION;
  durationDays: typeof CORE_SUITE_TRIAL_DURATION_DAYS;
  durationHours: typeof CORE_SUITE_TRIAL_DURATION_HOURS;
  modules: readonly CoreSuiteTrialModuleSlug[];
  featureEnabled: boolean;
  emailVerified: boolean;
  personalTenantId: string | null;
  state: CoreSuiteTrialState;
  startedAt: string | null;
  endsAt: string | null;
  remainingSeconds: number;
}

export interface CoreSuiteTrialStartResult {
  trial: CoreSuiteTrialStatus;
  created: boolean;
}

export class CoreSuiteTrialError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CoreSuiteTrialError';
  }
}

export function coreSuiteTrialsEnabled(): boolean {
  return ['1', 'true'].includes(String(process.env.OPERATOROS_SELF_SERVICE_TRIALS_ENABLED).toLowerCase());
}

function trialIdentitySecret(): string | null {
  const value = process.env.OPERATOROS_TRIAL_IDENTITY_HMAC_SECRET?.trim();
  return value && value.length >= 32 ? value : null;
}

export function assertCoreSuiteTrialCatalog(): void {
  for (const slug of CORE_SUITE_TRIAL_MODULE_SLUGS) {
    const entry = MODULE_CATALOG_BY_SLUG[slug];
    if (!entry || entry.applicationType !== 'main-module') {
      throw new Error(`Core Suite trial catalog invariant failed for ${slug}`);
    }
  }
}

export function coreSuiteTrialIdentityFingerprint(email: string, secret: string): string {
  return crypto.createHmac('sha256', secret)
    .update(email.trim().toLowerCase(), 'utf8')
    .digest('hex');
}

function publicStatus(args: {
  enabled: boolean;
  emailVerified: boolean;
  personalTenantId: string | null;
  state: CoreSuiteTrialState;
  trial?: AccountTrialRow | null;
  now?: Date;
}): CoreSuiteTrialStatus {
  const now = args.now ?? new Date();
  const endsAt = args.trial?.endsAt ?? null;
  return {
    offerCode: CORE_SUITE_TRIAL_OFFER_CODE,
    policyVersion: CORE_SUITE_TRIAL_POLICY_VERSION,
    durationDays: CORE_SUITE_TRIAL_DURATION_DAYS,
    durationHours: CORE_SUITE_TRIAL_DURATION_HOURS,
    modules: CORE_SUITE_TRIAL_MODULE_SLUGS,
    featureEnabled: args.enabled,
    emailVerified: args.emailVerified,
    personalTenantId: args.personalTenantId,
    state: args.state,
    startedAt: args.trial?.startedAt?.toISOString() ?? null,
    endsAt: endsAt?.toISOString() ?? null,
    remainingSeconds: endsAt ? Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000)) : 0,
  };
}

async function personalTenantForUser(userId: string) {
  const [tenant] = await db.select().from(tenants).where(and(
    eq(tenants.ownerUserId, userId),
    eq(tenants.type, 'personal'),
    eq(tenants.status, 'active'),
  )).limit(1);
  return tenant ?? null;
}

async function trialForIdentity(userId: string, fingerprint: string | null): Promise<AccountTrialRow | null> {
  const condition = fingerprint
    ? or(
        eq(accountTrials.subjectUserId, userId),
        eq(accountTrials.identityFingerprint, fingerprint),
      )
    : eq(accountTrials.subjectUserId, userId);
  const [trial] = await db.select().from(accountTrials).where(and(
    condition,
    eq(accountTrials.offerCode, CORE_SUITE_TRIAL_OFFER_CODE),
  )).limit(1);
  return trial ?? null;
}

function stateForTrial(trial: AccountTrialRow, now: Date): CoreSuiteTrialState {
  if (trial.status === 'revoked') return 'revoked';
  return trial.endsAt.getTime() > now.getTime() ? 'active' : 'expired';
}

export async function getCoreSuiteTrialStatus(userId: string): Promise<CoreSuiteTrialStatus> {
  assertCoreSuiteTrialCatalog();
  const enabled = coreSuiteTrialsEnabled();
  const [user, tenant] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1).then(rows => rows[0] ?? null),
    personalTenantForUser(userId),
  ]);
  if (!user || user.status !== 'active') {
    return publicStatus({ enabled, emailVerified: false, personalTenantId: null, state: 'unavailable' });
  }

  const secret = trialIdentitySecret();
  const fingerprint = user.emailVerifiedAt && secret
    ? coreSuiteTrialIdentityFingerprint(user.email, secret)
    : null;
  const trial = await trialForIdentity(user.id, fingerprint);
  const now = new Date();
  if (trial) {
    // A fingerprint match owned by another (or deleted) account proves the
    // offer was consumed, but it must never transfer the old trial window or
    // workspace to the current account.
    const belongsToCurrentPersonalWorkspace = !!tenant
      && trial.subjectUserId === user.id
      && trial.trialTenantId === tenant.id;
    return publicStatus({
      enabled,
      emailVerified: !!user.emailVerifiedAt,
      personalTenantId: tenant?.id ?? null,
      state: belongsToCurrentPersonalWorkspace ? stateForTrial(trial, now) : 'already_used',
      trial: belongsToCurrentPersonalWorkspace ? trial : null,
      now,
    });
  }
  if (!enabled || !tenant || !secret) {
    return publicStatus({
      enabled,
      emailVerified: !!user.emailVerifiedAt,
      personalTenantId: tenant?.id ?? null,
      state: 'unavailable',
    });
  }
  if (!user.emailVerifiedAt) {
    return publicStatus({ enabled, emailVerified: false, personalTenantId: tenant.id, state: 'verification_required' });
  }
  return publicStatus({ enabled, emailVerified: true, personalTenantId: tenant.id, state: 'eligible' });
}

export async function startCoreSuiteTrial(userId: string): Promise<CoreSuiteTrialStartResult> {
  assertCoreSuiteTrialCatalog();
  if (!coreSuiteTrialsEnabled()) {
    throw new CoreSuiteTrialError(503, 'TRIAL_UNAVAILABLE', 'The evaluation trial is not currently available.');
  }
  const secret = trialIdentitySecret();
  if (!secret) {
    throw new CoreSuiteTrialError(503, 'TRIAL_CONFIGURATION_ERROR', 'The evaluation trial is not configured.');
  }

  return db.transaction(async tx => {
    const locked = await tx.execute(sql<{
      id: string;
      email: string;
      status: string;
      email_verified_at: Date | null;
    }>`SELECT id,email,status,email_verified_at FROM users WHERE id = ${userId} FOR UPDATE`);
    const user = locked.rows[0] as {
      id: string;
      email: string;
      status: string;
      email_verified_at: Date | null;
    } | undefined;
    if (!user || user.status !== 'active') {
      throw new CoreSuiteTrialError(403, 'TRIAL_UNAVAILABLE', 'The evaluation trial is not available for this account.');
    }
    if (!user.email_verified_at) {
      throw new CoreSuiteTrialError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Verify your email address before starting the trial.');
    }

    const [tenant] = await tx.select().from(tenants).where(and(
      eq(tenants.ownerUserId, userId),
      eq(tenants.type, 'personal'),
      eq(tenants.status, 'active'),
    )).limit(1);
    if (!tenant) {
      throw new CoreSuiteTrialError(409, 'PERSONAL_WORKSPACE_REQUIRED', 'An active personal workspace is required.');
    }

    const fingerprint = coreSuiteTrialIdentityFingerprint(user.email, secret);
    const existing = await tx.select().from(accountTrials).where(and(
      or(
        eq(accountTrials.subjectUserId, userId),
        eq(accountTrials.identityFingerprint, fingerprint),
      ),
      eq(accountTrials.offerCode, CORE_SUITE_TRIAL_OFFER_CODE),
    )).limit(1);
    if (existing[0]) {
      const state = stateForTrial(existing[0], new Date());
      if (state === 'active' && existing[0].subjectUserId === userId && existing[0].trialTenantId === tenant.id) {
        return {
          trial: publicStatus({ enabled: true, emailVerified: true, personalTenantId: tenant.id, state, trial: existing[0] }),
          created: false,
        };
      }
      throw new CoreSuiteTrialError(409, 'TRIAL_ALREADY_USED', 'This verified email has already used the evaluation trial.');
    }

    try {
      const [trial] = await tx.insert(accountTrials).values({
        subjectUserId: userId,
        trialTenantId: tenant.id,
        identityFingerprint: fingerprint,
        identityKeyVersion: CORE_SUITE_TRIAL_IDENTITY_KEY_VERSION,
        offerCode: CORE_SUITE_TRIAL_OFFER_CODE,
        policyVersion: CORE_SUITE_TRIAL_POLICY_VERSION,
        status: 'active',
        startedAt: sql`NOW()`,
        endsAt: sql`NOW() + (${CORE_SUITE_TRIAL_DURATION_HOURS} * INTERVAL '1 hour')`,
        metadata: { scope: 'personal_workspace', seat: 'single_user' },
        createdAt: sql`NOW()`,
        updatedAt: sql`NOW()`,
      }).returning();
      return {
        trial: publicStatus({ enabled: true, emailVerified: true, personalTenantId: tenant.id, state: 'active', trial }),
        created: true,
      };
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new CoreSuiteTrialError(409, 'TRIAL_ALREADY_USED', 'This verified email has already used the evaluation trial.');
      }
      throw error;
    }
  });
}

export async function resolveCoreSuiteTrialAccess(
  userId: string,
  tenantId: string,
  moduleSlug: string,
): Promise<{ granted: boolean; expiresAt: Date | null }> {
  if (!CORE_SUITE_TRIAL_MODULE_SLUGS.includes(moduleSlug as CoreSuiteTrialModuleSlug)) {
    return { granted: false, expiresAt: null };
  }
  const result = await db.execute(sql<{
    ends_at: Date;
  }>`SELECT account_trials.ends_at
      FROM account_trials
      JOIN tenants ON tenants.id = account_trials.trial_tenant_id
      WHERE account_trials.subject_user_id = ${userId}
        AND account_trials.trial_tenant_id = ${tenantId}
        AND account_trials.offer_code = ${CORE_SUITE_TRIAL_OFFER_CODE}
        AND account_trials.status = 'active'
        AND account_trials.ends_at > NOW()
        AND tenants.type = 'personal'
        AND tenants.owner_user_id = account_trials.subject_user_id
        AND tenants.status = 'active'
      LIMIT 1`);
  const row = result.rows[0] as { ends_at: Date | string } | undefined;
  return row
    ? { granted: true, expiresAt: row.ends_at instanceof Date ? row.ends_at : new Date(row.ends_at) }
    : { granted: false, expiresAt: null };
}
