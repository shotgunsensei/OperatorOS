/**
 * Task #108 — Recompute + propagate pipeline (TENANT-SCOPED).
 *
 * `recomputeAndPropagateEntitlements(tenantId, opts)` is the canonical
 * way to push entitlement state to receivers. It:
 *
 *   1. Looks up the tenant owner's active subscription, derives the
 *      currently-included plan_modules set.
 *   2. For each tenant_modules row marked source='included' whose module
 *      is no longer in the plan: marks the row 'disabled' and revokes
 *      every tenant_user_module_access row pointing at it (audited).
 *   3. Computes a fresh snapshot per member.
 *   4. POSTs the per-member snapshot to EVERY tenant-enabled module that
 *      has registered an entitlement_webhook_url. Modules whose
 *      tenant_modules row is disabled / missing are NOT notified.
 *
 * The HMAC signature reuses MODULE_SSO_SECRET and is sent as
 * `X-Operatoros-Signature: sha256=<hex>`.
 *
 * Propagation is FIRE-AND-FORGET and best-effort. A failure to reach
 * a receiver MUST NOT block the originating user mutation — receivers
 * are expected to re-introspect on-demand if they suspect drift.
 */

import crypto from 'node:crypto';
import { db } from '../db.js';
import { eq, and, inArray, isNotNull, ne } from 'drizzle-orm';
import {
  modules, planModules, subscriptions, subscriptionPlans,
  tenants, tenantUsers, tenantModules, tenantUserModuleAccess,
} from '../schema.js';
import { writeAudit } from './audit.js';
import { resolveEntitlements, type EntitlementSnapshot } from './entitlement-resolver.js';

function signPayload(body: string): string | null {
  const secret = process.env.MODULE_SSO_SECRET;
  if (!secret || secret.length < 16) return null;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

interface PushTarget {
  moduleId: string;
  moduleSlug: string;
  url: string;
}

async function pushOne(target: PushTarget, body: string, signature: string | null): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OperatorOS-Entitlement-Webhook/1',
    };
    if (signature) headers['X-Operatoros-Signature'] = signature;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(target.url, {
        method: 'POST', headers, body, signal: controller.signal,
      });
      return { ok: res.ok, status: res.status };
    } finally {
      clearTimeout(t);
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export interface PropagationResult {
  tenantId: string;
  reason: string | null;
  membersComputed: number;
  receiversPushed: number;
  pushAttempts: number;
  pushSucceeded: number;
  pushFailed: number;
  droppedModuleSlugs: string[];
  revokedAccessRows: number;
}

/**
 * Recompute + propagate for a SINGLE tenant. Spec-aligned trigger surface.
 */
export async function recomputeAndPropagateEntitlements(
  tenantId: string,
  opts: { reason?: string; actorUserId?: string | null } = {},
): Promise<PropagationResult> {
  const reason = opts.reason ?? null;
  const result: PropagationResult = {
    tenantId, reason,
    membersComputed: 0,
    receiversPushed: 0,
    pushAttempts: 0,
    pushSucceeded: 0,
    pushFailed: 0,
    droppedModuleSlugs: [],
    revokedAccessRows: 0,
  };

  // -------------------------------------------------------------------
  // 1. Tenant + owner + active plan_modules set.
  // -------------------------------------------------------------------
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) return result;
  const ownerId = tenant.ownerUserId;
  const actor = opts.actorUserId ?? ownerId;

  // Owner's active subscription drives plan inclusion for the tenant.
  const [ownerSub] = await db.select().from(subscriptions)
    .where(and(
      eq(subscriptions.userId, ownerId),
      inArray(subscriptions.status, ['active', 'trialing']),
    )).limit(1);
  const includedModuleIds = new Set<string>();
  if (ownerSub) {
    const pmRows = await db.select({ moduleId: planModules.moduleId })
      .from(planModules)
      .where(eq(planModules.planId, ownerSub.planId));
    for (const r of pmRows) includedModuleIds.add(r.moduleId);
  }

  // -------------------------------------------------------------------
  // 2. Find dropped modules: tenant_modules.source='included' AND status='enabled'
  //    AND moduleId NOT IN includedModuleIds. Disable each and revoke
  //    every per-user access row attached to it.
  // -------------------------------------------------------------------
  const tmRows = await db.select().from(tenantModules)
    .where(eq(tenantModules.tenantId, tenantId));
  const dropped = tmRows.filter(tm =>
    tm.source === 'included' &&
    tm.status === 'enabled' &&
    !includedModuleIds.has(tm.moduleId),
  );

  if (dropped.length > 0) {
    const droppedIds = dropped.map(d => d.moduleId);
    // Disable tenant_modules row(s).
    await db.update(tenantModules)
      .set({ status: 'disabled', updatedAt: new Date() })
      .where(and(
        eq(tenantModules.tenantId, tenantId),
        inArray(tenantModules.moduleId, droppedIds),
      ));

    // Snapshot module slug map for audit details.
    const modSlugRows = await db.select({ id: modules.id, slug: modules.slug })
      .from(modules).where(inArray(modules.id, droppedIds));
    const slugById = new Map(modSlugRows.map(r => [r.id, r.slug]));
    result.droppedModuleSlugs = droppedIds.map(id => slugById.get(id) ?? id);

    // Revoke per-user access rows pointing at dropped modules.
    const accessRows = await db.select().from(tenantUserModuleAccess)
      .where(and(
        eq(tenantUserModuleAccess.tenantId, tenantId),
        inArray(tenantUserModuleAccess.moduleId, droppedIds),
        ne(tenantUserModuleAccess.accessLevel, 'none'),
      ));
    for (const row of accessRows) {
      await db.update(tenantUserModuleAccess)
        .set({ accessLevel: 'none', updatedAt: new Date() })
        .where(eq(tenantUserModuleAccess.id, row.id));
      result.revokedAccessRows += 1;
      try {
        await writeAudit({
          actorUserId: actor, tenantId,
          targetType: 'user', targetId: row.userId,
          action: 'entitlement_change',
          extra: {
            kind: 'access_revoked',
            moduleSlug: slugById.get(row.moduleId) ?? row.moduleId,
            before: row.accessLevel,
            after: 'none',
            reason,
          },
        });
      } catch (err) {
        console.warn('[entitlement-propagate] audit failed for revoke:', err);
      }
    }

    // Audit the tenant-level drop too.
    try {
      await writeAudit({
        actorUserId: actor, tenantId,
        targetType: 'tenant', targetId: tenantId,
        action: 'entitlement_change',
        extra: {
          kind: 'modules_dropped',
          droppedModuleSlugs: result.droppedModuleSlugs,
          reason,
        },
      });
    } catch (err) {
      console.warn('[entitlement-propagate] audit failed for drop:', err);
    }
  }

  // -------------------------------------------------------------------
  // 3. Compute receiver targets — modules that are (a) tenant-enabled
  //    after the drop pass AND (b) have a webhook URL registered.
  // -------------------------------------------------------------------
  const tmAfter = await db.select().from(tenantModules)
    .where(and(
      eq(tenantModules.tenantId, tenantId),
      eq(tenantModules.status, 'enabled'),
    ));
  const enabledModuleIds = tmAfter.map(tm => tm.moduleId);
  let targets: PushTarget[] = [];
  if (enabledModuleIds.length > 0) {
    const modRows = await db.select({
      id: modules.id, slug: modules.slug,
      url: modules.entitlementWebhookUrl, status: modules.status,
    }).from(modules).where(and(
      inArray(modules.id, enabledModuleIds),
      isNotNull(modules.entitlementWebhookUrl),
      ne(modules.status, 'disabled'),
    ));
    targets = modRows
      .filter(r => !!r.url)
      .map(r => ({ moduleId: r.id, moduleSlug: r.slug, url: r.url as string }));
  }
  result.receiversPushed = targets.length;

  // -------------------------------------------------------------------
  // 4. Compute per-member snapshots and push.
  // -------------------------------------------------------------------
  const members = await db.select().from(tenantUsers).where(eq(tenantUsers.tenantId, tenantId));
  const memberSnapshots: Array<{ userId: string; snapshot: EntitlementSnapshot }> = [];
  for (const m of members) {
    try {
      const snap = await resolveEntitlements(m.userId, tenantId);
      if (snap) {
        memberSnapshots.push({ userId: m.userId, snapshot: snap });
        result.membersComputed += 1;
      }
    } catch (err) {
      console.warn(`[entitlement-propagate] resolve failed for ${m.userId}:`, err);
    }
  }

  if (targets.length === 0 || memberSnapshots.length === 0) {
    try {
      await writeAudit({
        actorUserId: actor, tenantId,
        targetType: 'tenant', targetId: tenantId,
        action: 'entitlement_recomputed',
        extra: {
          reason,
          members: result.membersComputed,
          receivers: 0,
          droppedModuleSlugs: result.droppedModuleSlugs,
          revokedAccessRows: result.revokedAccessRows,
        },
      });
    } catch (err) {
      console.warn('[entitlement-propagate] audit failed:', err);
    }
    return result;
  }

  // One push per (member × receiver). The body is per-receiver so the
  // child app only sees the entry for its own module slug.
  const allResults: Array<{ ok: boolean; status?: number; error?: string; receiver: string; userId: string }> = [];
  for (const target of targets) {
    for (const { userId, snapshot } of memberSnapshots) {
      const moduleEntry = snapshot.modules.find(m => m.slug === target.moduleSlug);
      const payload = {
        event: 'entitlements.changed',
        reason,
        tenant: snapshot.tenant,
        user: snapshot.user,
        subscription: snapshot.subscription,
        module: moduleEntry ?? null,
        all_enabled_modules: snapshot.modules.filter(m => m.enabled).map(m => m.slug),
        version: snapshot.version,
        computed_at: snapshot.computedAt,
      };
      const body = JSON.stringify(payload);
      const signature = signPayload(body);
      const r = await pushOne(target, body, signature);
      allResults.push({ ...r, receiver: target.moduleSlug, userId });
      result.pushAttempts += 1;
      if (r.ok) result.pushSucceeded += 1; else result.pushFailed += 1;
    }
  }

  try {
    await writeAudit({
      actorUserId: actor, tenantId,
      targetType: 'tenant', targetId: tenantId,
      action: 'entitlement_change',
      extra: {
        kind: 'propagation',
        reason,
        members: result.membersComputed,
        receivers: result.receiversPushed,
        pushAttempts: result.pushAttempts,
        pushSucceeded: result.pushSucceeded,
        pushFailed: result.pushFailed,
        droppedModuleSlugs: result.droppedModuleSlugs,
        revokedAccessRows: result.revokedAccessRows,
      },
    });
  } catch (err) {
    console.warn('[entitlement-propagate] audit failed:', err);
  }

  return result;
}

/** Fire-and-forget single-tenant scheduler. */
export function schedulePropagation(
  tenantId: string,
  opts: { reason?: string; actorUserId?: string | null } = {},
): void {
  recomputeAndPropagateEntitlements(tenantId, opts).catch(err => {
    console.warn('[entitlement-propagate] background error:', err);
  });
}

/**
 * Trigger recompute for every tenant where the given user is the OWNER.
 * Used after billing webhooks since plan is per-user but materially
 * affects every tenant that user owns.
 */
export function schedulePropagationForUser(
  userId: string,
  opts: { reason?: string } = {},
): void {
  (async () => {
    try {
      const ownedTenants = await db.select({ id: tenants.id })
        .from(tenants).where(eq(tenants.ownerUserId, userId));
      await Promise.all(ownedTenants.map(t =>
        recomputeAndPropagateEntitlements(t.id, { ...opts, actorUserId: userId }),
      ));
    } catch (err) {
      console.warn('[entitlement-propagate] schedulePropagationForUser error:', err);
    }
  })();
}
