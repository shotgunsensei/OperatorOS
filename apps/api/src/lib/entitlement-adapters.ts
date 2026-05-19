/**
 * Task #109 — Pluggable per-receiver entitlement push adapters.
 *
 * Different receivers want different wire shapes:
 *   - canonical_snapshot (default): the resolver snapshot at the top
 *     level + transport metadata, HMAC-signed, one POST per
 *     (member × receiver). This is the pre-#109 behaviour.
 *   - tradeflowkit_v1: a flat hub→TFK envelope
 *     `{tenantId, planSlug, subscriptionStatus, accessLevel, features,
 *       limits, members[]}` with a 12-key feature whitelist, bearer-token
 *     auth, ONE POST per receiver (members batched).
 *
 * Adapters are PRESENTATION-ONLY. They never alter what the resolver
 * computes — they only project the snapshot into the receiver's
 * expected envelope. Authorization, fail-closed signing, and dropped-
 * module reconciliation all stay in the propagation pipeline.
 */

import crypto from 'node:crypto';
import type { EntitlementSnapshot } from './entitlement-resolver.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface AdapterTarget {
  moduleId: string;
  moduleSlug: string;
  url: string;
  pushShape: PushShape;
  pushAuthMode: PushAuthMode;
  pushBearerEnvVar: string | null;
}

export interface MemberSnapshot {
  userId: string;
  snapshot: EntitlementSnapshot;
}

export interface AdapterRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  /** For logging / audit only — never sent on the wire. */
  debugLabel: string;
}

export interface AdapterContext {
  reason: string | null;
  /** Shared HMAC secret for `canonical_snapshot`. Adapters that don't
   *  need it ignore this value. */
  signingSecret: string | null;
}

export type PushShape = 'canonical_snapshot' | 'tradeflowkit_v1';
export type PushAuthMode = 'hmac_signature' | 'bearer_token';

export type AdapterBuildOutcome =
  | { kind: 'ok'; requests: AdapterRequest[] }
  | { kind: 'skipped'; reason: AdapterSkipReason; detail?: string };

export type AdapterSkipReason =
  | 'missing_signing_secret'
  | 'missing_bearer_env_var'
  | 'bearer_env_value_empty'
  | 'no_members';

export interface EntitlementPushAdapter {
  readonly shape: PushShape;
  buildRequests(
    members: MemberSnapshot[],
    target: AdapterTarget,
    ctx: AdapterContext,
  ): AdapterBuildOutcome;
}

// ---------------------------------------------------------------------------
// Canonical snapshot adapter — preserves the pre-#109 behaviour.
// ---------------------------------------------------------------------------

function signPayload(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export const canonicalSnapshotAdapter: EntitlementPushAdapter = {
  shape: 'canonical_snapshot',
  buildRequests(members, target, ctx) {
    if (!ctx.signingSecret) {
      return { kind: 'skipped', reason: 'missing_signing_secret' };
    }
    if (members.length === 0) {
      return { kind: 'skipped', reason: 'no_members' };
    }
    const requests: AdapterRequest[] = members.map(({ userId, snapshot }) => {
      const payload = {
        ...snapshot,
        event: 'entitlements.changed',
        reason: ctx.reason,
        receiver_slug: target.moduleSlug,
      };
      const body = JSON.stringify(payload);
      return {
        url: target.url,
        method: 'POST' as const,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OperatorOS-Entitlement-Webhook/1',
          'X-Operatoros-Signature': signPayload(body, ctx.signingSecret!),
        },
        body,
        debugLabel: `canonical:${target.moduleSlug}:${userId}`,
      };
    });
    return { kind: 'ok', requests };
  },
};

// ---------------------------------------------------------------------------
// TradeFlowKit v1 adapter — bearer-token, flat envelope, batched members.
// ---------------------------------------------------------------------------

/**
 * The exact 12-key whitelist TFK accepts. Pushing any key NOT in this
 * set is a contract violation (TFK responds 400 invalid_body). We pass
 * the whitelist through verbatim and drop everything else silently.
 */
export const TRADEFLOWKIT_FEATURE_KEYS = [
  'automations',
  'recurring_jobs',
  'analytics',
  'team_invites',
  'unlimited_entities',
  'call_recovery',
  'audit_log',
  'accounting_export',
  'customer_portal',
  'review_requests',
  'recurring_invoices',
  'stripe_connect',
] as const;
export type TradeFlowKitFeatureKey = (typeof TRADEFLOWKIT_FEATURE_KEYS)[number];
const TFK_FEATURE_KEY_SET: ReadonlySet<string> = new Set(TRADEFLOWKIT_FEATURE_KEYS);

export function isTradeFlowKitFeatureKey(k: string): k is TradeFlowKitFeatureKey {
  return TFK_FEATURE_KEY_SET.has(k);
}

/**
 * Resolve TFK's tenant-wide kill switch from the canonical subscription
 * status. TFK only treats these four statuses as "the tenant is paying
 * us right now" — every other status revokes access.
 */
const TFK_FULL_ACCESS_STATUSES = new Set([
  'active', 'trialing', 'grace', 'past_due_grace',
]);

function deriveAccessLevel(status: string | null | undefined): 'full' | 'revoked' {
  if (!status) return 'revoked';
  return TFK_FULL_ACCESS_STATUSES.has(status) ? 'full' : 'revoked';
}

function pickTfkFeatures(features: Record<string, unknown>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const key of TRADEFLOWKIT_FEATURE_KEYS) {
    const v = features[key];
    if (typeof v === 'boolean') out[key] = v;
  }
  return out;
}

function pickTfkLimits(limits: Record<string, unknown>): Record<string, number> {
  // Best-effort projection of canonical limits → TFK's named limits.
  // We only forward numeric values; unknown / non-numeric is dropped.
  const out: Record<string, number> = {};
  const map: Record<string, string> = {
    customers: 'customers',
    jobs: 'jobs',
    quotes: 'quotes',
    invoices: 'invoices',
    teamMembers: 'teamMembers',
    maxTeamMembers: 'teamMembers',
  };
  for (const [src, dst] of Object.entries(map)) {
    const v = limits[src];
    if (typeof v === 'number' && Number.isFinite(v)) out[dst] = v;
  }
  return out;
}

function findReceiverEntry(snapshot: EntitlementSnapshot, slug: string) {
  return snapshot.modules.find(m => m.slug === slug) ?? null;
}

/**
 * TFK has partial-update semantics: a payload that omits `planSlug`,
 * `features`, and `limits` is interpreted as "membership delta only,
 * do not touch tenant-wide subscription state". Tenant-admin grant
 * changes are member-scoped (they don't move the plan), so we project
 * them as member-only updates. Stripe-driven reasons keep the full
 * payload because subscription status / plan slug can change.
 */
const MEMBER_ONLY_REASON_PREFIXES = [
  'tenant_user_',          // per-user grant set/cleared by tenant admin
  'tenant_member_',        // member added/removed/role-changed
];

export function isMemberOnlyReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return MEMBER_ONLY_REASON_PREFIXES.some(p => reason.startsWith(p));
}

export const tradeflowkitAdapter: EntitlementPushAdapter = {
  shape: 'tradeflowkit_v1',
  buildRequests(members, target, ctx) {
    const envVar = target.pushBearerEnvVar;
    if (!envVar) return { kind: 'skipped', reason: 'missing_bearer_env_var' };
    const token = process.env[envVar];
    if (!token || token.length < 1) {
      return { kind: 'skipped', reason: 'bearer_env_value_empty', detail: envVar };
    }
    if (members.length === 0) {
      return { kind: 'skipped', reason: 'no_members' };
    }

    // Pull tenant-wide fields from the first snapshot (every member sees
    // the same subscription / tenant features for the same tenant).
    const head = members[0].snapshot;
    const tenantId = head.tenant.id;
    const planSlug = head.subscription?.planSlug ?? null;
    const subscriptionStatus = head.subscription?.status ?? null;
    const accessLevel = deriveAccessLevel(subscriptionStatus);

    // Tenant-level features come from the receiver's own module entry
    // (where plan defaults + tenant overrides are already merged).
    // Falling back to {} keeps the field present so receivers can rely
    // on its shape.
    const receiverEntry = findReceiverEntry(head, target.moduleSlug);
    const features = receiverEntry
      ? pickTfkFeatures(receiverEntry.features as Record<string, unknown>)
      : {};
    const limits = pickTfkLimits(
      (head.limits ?? {}) as Record<string, unknown>,
    );

    const membersOut = members.map(({ snapshot }) => {
      const mod = findReceiverEntry(snapshot, target.moduleSlug);
      return {
        operatorosUserId: snapshot.user.id,
        moduleRole: mod?.moduleRole ?? 'none',
        // Adapter responsibility: only push members who currently HAVE
        // access. Hub revokes are surfaced via the propagation pipeline
        // (which disables tenant_modules + sets access_level='none'),
        // so a member with moduleRole='none' is forwarded with
        // enabled:false so TFK mirrors the revoke instead of leaving
        // stale state.
        enabled: !!mod?.enabled,
        tenantRole: snapshot.tenant.roleAlias,
      };
    });

    // Task #109 — member-only partial updates. TFK's contract treats
    // payloads that OMIT `planSlug/features/limits` as a membership
    // delta and leaves tenant-wide state untouched. We use that mode
    // for reasons that don't reflect plan/subscription changes (e.g.
    // a tenant admin flipping a single user's module access).
    // Task #109 — TFK's documented envelope is strictly:
    // {tenantId, planSlug, subscriptionStatus, accessLevel, features,
    //  limits, members[]} (member-only variant drops the four tenant-
    //  wide keys). We do NOT add extra top-level keys: TFK's body
    //  validator rejects unknown fields with 400 invalid_body.
    const memberOnly = isMemberOnlyReason(ctx.reason);
    const payload: Record<string, unknown> = memberOnly
      ? { tenantId, accessLevel, members: membersOut }
      : {
          tenantId, planSlug, subscriptionStatus, accessLevel,
          features, limits, members: membersOut,
        };
    const body = JSON.stringify(payload);
    return {
      kind: 'ok',
      requests: [{
        url: target.url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OperatorOS-Entitlement-Webhook/1',
          'Authorization': `Bearer ${token}`,
        },
        body,
        debugLabel: `tradeflowkit_v1:${target.moduleSlug}:batch(${members.length})`,
      }],
    };
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ADAPTERS: Record<PushShape, EntitlementPushAdapter> = {
  canonical_snapshot: canonicalSnapshotAdapter,
  tradeflowkit_v1: tradeflowkitAdapter,
};

export function getAdapter(shape: string | null | undefined): EntitlementPushAdapter {
  if (shape && shape in ADAPTERS) return ADAPTERS[shape as PushShape];
  return canonicalSnapshotAdapter;
}

export function isKnownPushShape(shape: unknown): shape is PushShape {
  return typeof shape === 'string' && shape in ADAPTERS;
}
