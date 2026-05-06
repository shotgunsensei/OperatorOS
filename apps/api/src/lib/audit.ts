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

export async function writeAudit(entry: AuditEntry): Promise<void> {
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
