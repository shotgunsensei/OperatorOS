/**
 * Task #108 — Recompute + propagate pipeline.
 *
 * Triggered after any event that may change a user's effective
 * entitlements:
 *   - Stripe subscription state change (created/updated/deleted)
 *   - Add-on subscription promote / cancel
 *   - Tenant admin grant change (tenant_user_module_access set)
 *   - Tenant module enable/disable
 *
 * For each receiver module that has registered a webhook URL
 * (`modules.entitlement_webhook_url`), we POST a signed snapshot. The
 * HMAC signature reuses MODULE_SSO_SECRET (same trust boundary as the
 * SSO JWT) and is sent as `X-Operatoros-Signature: sha256=<hex>`.
 *
 * Propagation is FIRE-AND-FORGET and best-effort. A failure to reach
 * a receiver MUST NOT block the originating user mutation — receivers
 * are expected to re-introspect on-demand if they suspect drift.
 */

import crypto from 'node:crypto';
import { db } from '../db.js';
import { eq, isNotNull, and, ne } from 'drizzle-orm';
import { modules } from '../schema.js';
import { writeAudit } from './audit.js';
import { resolveEntitlements, type EntitlementSnapshot } from './entitlement-resolver.js';

function signPayload(body: string): string | null {
  const secret = process.env.MODULE_SSO_SECRET;
  if (!secret || secret.length < 16) return null;
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

interface PushTarget {
  slug: string;
  url: string;
}

async function loadPushTargets(restrictToSlugs?: string[]): Promise<PushTarget[]> {
  const rows = await db.select({
    slug: modules.slug,
    url: modules.entitlementWebhookUrl,
    status: modules.status,
  })
    .from(modules)
    .where(and(
      isNotNull(modules.entitlementWebhookUrl),
      ne(modules.status, 'disabled'),
    ));
  const out: PushTarget[] = [];
  for (const r of rows) {
    if (!r.url) continue;
    if (restrictToSlugs && !restrictToSlugs.includes(r.slug)) continue;
    out.push({ slug: r.slug, url: r.url });
  }
  return out;
}

async function pushOne(target: PushTarget, body: string, signature: string | null): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'OperatorOS-Entitlement-Webhook/1',
    };
    if (signature) headers['X-Operatoros-Signature'] = signature;
    // 5-second hard timeout; downstream is best-effort.
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
  pushed: number;
  succeeded: number;
  failed: number;
  snapshot: EntitlementSnapshot | null;
}

/**
 * Recompute the snapshot and push it to every registered receiver.
 * `restrictToSlugs` narrows the push to specific modules (e.g. after a
 * single-module grant change).
 */
export async function recomputeAndPropagateEntitlements(
  userId: string,
  tenantId: string,
  opts: { restrictToSlugs?: string[]; reason?: string } = {},
): Promise<PropagationResult> {
  let snapshot: EntitlementSnapshot | null = null;
  try {
    snapshot = await resolveEntitlements(userId, tenantId);
  } catch (err) {
    console.warn('[entitlement-propagate] resolve failed:', err);
    return { pushed: 0, succeeded: 0, failed: 0, snapshot: null };
  }
  if (!snapshot) {
    // Tenant doesn't exist or user isn't a member — nothing to push.
    return { pushed: 0, succeeded: 0, failed: 0, snapshot: null };
  }

  const targets = await loadPushTargets(opts.restrictToSlugs);
  if (targets.length === 0) {
    // Still audit the recompute so admins see the cause/effect chain.
    try {
      await writeAudit({
        actorUserId: userId, tenantId,
        targetType: 'user', targetId: userId,
        action: 'entitlement_recomputed',
        extra: { reason: opts.reason ?? null, pushTargets: 0 },
      });
    } catch (err) {
      console.warn('[entitlement-propagate] audit failed:', err);
    }
    return { pushed: 0, succeeded: 0, failed: 0, snapshot };
  }

  const payload = {
    event: 'entitlements.changed',
    reason: opts.reason ?? null,
    tenant_id: tenantId,
    user_id: userId,
    snapshot,
  };
  const body = JSON.stringify(payload);
  const signature = signPayload(body);

  const results = await Promise.all(targets.map(t => pushOne(t, body, signature)));
  const succeeded = results.filter(r => r.ok).length;
  const failed = results.length - succeeded;

  try {
    await writeAudit({
      actorUserId: userId, tenantId,
      targetType: 'user', targetId: userId,
      action: 'entitlement_change',
      extra: {
        reason: opts.reason ?? null,
        pushTargets: targets.length,
        succeeded, failed,
        receivers: targets.map((t, i) => ({
          slug: t.slug,
          ok: results[i].ok,
          status: results[i].status ?? null,
          error: results[i].error ?? null,
        })),
      },
    });
  } catch (err) {
    console.warn('[entitlement-propagate] audit failed:', err);
  }

  return { pushed: targets.length, succeeded, failed, snapshot };
}

/** Fire-and-forget wrapper: never throws, never blocks. */
export function schedulePropagation(
  userId: string,
  tenantId: string,
  opts: { restrictToSlugs?: string[]; reason?: string } = {},
): void {
  recomputeAndPropagateEntitlements(userId, tenantId, opts).catch(err => {
    console.warn('[entitlement-propagate] background error:', err);
  });
}

/**
 * Propagate to every tenant the user is a member of. Used after plan-
 * level (per-user) subscription changes since the same plan affects
 * entitlements in every membership.
 */
export function schedulePropagationForUser(
  userId: string,
  opts: { reason?: string } = {},
): void {
  (async () => {
    try {
      const { tenantUsers } = await import('../schema.js');
      const rows = await db.select({ tenantId: tenantUsers.tenantId })
        .from(tenantUsers)
        .where(eq(tenantUsers.userId, userId));
      await Promise.all(rows.map(r =>
        recomputeAndPropagateEntitlements(userId, r.tenantId, opts),
      ));
    } catch (err) {
      console.warn('[entitlement-propagate] schedulePropagationForUser error:', err);
    }
  })();
}
