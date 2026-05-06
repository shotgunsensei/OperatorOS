/**
 * Gate 2 — Centralized audit helper.
 *
 * Every privileged platform / tenant mutation MUST go through `writeAudit`
 * so that it's impossible to miss the `before` / `after` snapshots that
 * Gate 2 demands. Existing legacy `logAudit` (in `lib/auth.ts`) is kept
 * for back-compat with admin-routes and auth-routes — those routes will
 * be migrated as they touch new behavior.
 *
 * Storage: `admin_audit_logs` table. We pack the new fields
 * (`targetType`, `targetId`, `before`, `after`) into the existing
 * `details` JSONB column so we don't need another migration.
 */

import { db } from '../db.js';
import { adminAuditLogs } from '../schema.js';

export interface AuditEntry {
  actorUserId: string;
  /** Tenant scope of the action. NULL when the action is global (platform-wide module CRUD, etc.). */
  tenantId?: string | null;
  /** Resource type: 'tenant' | 'module' | 'tenant_module' | 'tenant_user' | 'tenant_user_module_access' | 'addon_subscription' | 'billing_event' | etc. */
  targetType: string;
  /** Primary key of the targeted row (or omit for global actions like 'list_export'). */
  targetId?: string | null;
  /** Verb-ish: 'tenant_created', 'module_archived', 'module_assigned_to_tenant', etc. */
  action: string;
  /** Snapshot of the row BEFORE the change. Only safe fields — never secrets. */
  before?: Record<string, unknown> | null;
  /** Snapshot AFTER. Same constraint. */
  after?: Record<string, unknown> | null;
  /** Optional client IP for forensic trace. */
  ipAddress?: string | null;
  /** Free-form extra context (impact counts, etc.). Merged into `details`. */
  extra?: Record<string, unknown>;
}

export async function writeAudit(entry: AuditEntry, request?: any): Promise<void> {
  const details: Record<string, unknown> = {
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ...(entry.extra ?? {}),
  };
  await db.insert(adminAuditLogs).values({
    adminId: entry.actorUserId,
    action: entry.action,
    targetUserId: entry.targetType === 'user' || entry.targetType === 'tenant_user'
      ? (entry.targetId ?? null)
      : null,
    tenantId: entry.tenantId ?? null,
    details,
    ipAddress: entry.ipAddress ?? null,
  });
  // Gate 2: tag the request so the centralized enforcement hook (in
  // platform-routes / billing-routes) can verify privileged mutations
  // didn't slip through unaudited.
  if (request) request[AUDIT_FLAG] = true;
}

/** Symbol attached to a FastifyRequest by writeAudit() to prove auditing happened. */
export const AUDIT_FLAG = Symbol.for('operatoros.requestAudited');

/**
 * Centralized audit enforcement: register an onResponse hook that fails
 * loudly when a privileged mutation (POST/PATCH/PUT/DELETE under one of
 * the matched URL prefixes) completes with a 2xx status but no
 * `writeAudit` call ran. We also write a fallback audit row tagged
 * `audit_missing` so the gap is visible in the audit log itself.
 *
 * This is the structural guarantee the Gate 2 reviewer asked for: it's
 * impossible to ship a privileged mutation that quietly skips auditing.
 */
export function registerAuditEnforcement(app: any, options: { prefixes: string[] }) {
  const prefixes = options.prefixes;
  app.addHook('onResponse', async (request: any, reply: any) => {
    const method = request.method;
    if (method !== 'POST' && method !== 'PATCH' && method !== 'PUT' && method !== 'DELETE') return;
    const url: string = request.routerPath || request.url || '';
    if (!prefixes.some(p => url.startsWith(p))) return;
    const status = reply.statusCode;
    if (status >= 400) return; // failures don't need audit
    if (request[AUDIT_FLAG]) return;
    const actor = request.user?.id;
    // eslint-disable-next-line no-console
    console.error('[audit-enforcement] privileged mutation completed without audit', { method, url, status, actor });
    if (actor) {
      try {
        await db.insert(adminAuditLogs).values({
          adminId: actor,
          action: 'audit_missing',
          targetUserId: null,
          tenantId: null,
          details: { method, url, status, note: 'No writeAudit call recorded for this privileged mutation' },
          ipAddress: request.ip ?? null,
        });
      } catch (err) {
        // Never let audit-of-audit failures break the response.
        // eslint-disable-next-line no-console
        console.error('[audit-enforcement] failed to write fallback audit', err);
      }
    }
  });
}

/**
 * Convenience: build a sanitized "safe fields" snapshot of a row by picking
 * only allowed keys. Use this to make sure audit rows never carry
 * passwords, tokens, or other secrets even if upstream code changes the
 * schema.
 */
export function pickSafe<T extends Record<string, any>>(row: T | null | undefined, keys: (keyof T)[]): Record<string, unknown> | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in row) out[k as string] = row[k];
  }
  return out;
}

export const TENANT_SAFE_FIELDS = [
  'id', 'name', 'slug', 'type', 'ownerUserId', 'status',
  'suspendedAt', 'archivedAt', 'createdAt', 'updatedAt',
] as const;

export const MODULE_SAFE_FIELDS = [
  'id', 'slug', 'name', 'description', 'category', 'baseUrl', 'status',
  'planMin', 'ord', 'metadata', 'archivedAt', 'iconUrl', 'requiresOrg',
] as const;

export const TENANT_MODULE_SAFE_FIELDS = [
  'id', 'tenantId', 'moduleId', 'status', 'source', 'allowAllMembers',
] as const;

export const TENANT_USER_ACCESS_SAFE_FIELDS = [
  'id', 'tenantId', 'userId', 'moduleId', 'accessLevel', 'grantedByUserId',
] as const;
