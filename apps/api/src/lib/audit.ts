// Centralized audit writer. Packs targetType/targetId/before/after into the
// existing admin_audit_logs.details JSONB so no migration is needed.

import { db } from '../db.js';
import { adminAuditLogs } from '../schema.js';

export interface AuditEntry {
  actorUserId: string;
  tenantId?: string | null;
  targetType: string;
  targetId?: string | null;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
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
  if (request) request[AUDIT_FLAG] = true;
}

export const AUDIT_FLAG = Symbol.for('operatoros.requestAudited');

// onResponse hook: any 2xx privileged mutation under `prefixes` that didn't
// call writeAudit() gets a console error + a fallback `audit_missing` row.
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
    console.error('[audit-enforcement] privileged mutation completed without audit', { method, url, status, actor });
    if (actor) {
      try {
        await db.insert(adminAuditLogs).values({
          adminId: actor,
          action: 'audit_missing',
          targetUserId: null,
          tenantId: null,
          details: { method, url, status },
          ipAddress: request.ip ?? null,
        });
      } catch (err) {
        console.error('[audit-enforcement] failed to write fallback audit', err);
      }
    }
  });
}

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
  'componentId',
] as const;

export const TENANT_MODULE_SAFE_FIELDS = [
  'id', 'tenantId', 'moduleId', 'status', 'source', 'allowAllMembers',
] as const;

export const TENANT_USER_ACCESS_SAFE_FIELDS = [
  'id', 'tenantId', 'userId', 'moduleId', 'accessLevel', 'grantedByUserId',
] as const;
