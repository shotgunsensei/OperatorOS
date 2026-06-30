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

function routeForLog(request: any): string {
  return request.routeOptions?.url || request.routerPath || String(request.url || '').split('?')[0] || 'unknown';
}

function extractErrorCode(payload: unknown, statusCode: number): string {
  if (payload && typeof payload === 'object' && 'code' in (payload as Record<string, unknown>)) {
    const code = (payload as Record<string, unknown>).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (typeof payload === 'string' && payload.length > 0) {
    try {
      const parsed = JSON.parse(payload);
      if (typeof parsed?.code === 'string' && parsed.code.length > 0) return parsed.code;
    } catch {
      // Non-JSON responses still get a stable HTTP code below.
    }
  }
  if (Buffer.isBuffer(payload)) {
    return extractErrorCode(payload.toString('utf8'), statusCode);
  }
  return `HTTP_${statusCode}`;
}

// onSend hook: log failed privileged Platform Command calls with sanitized,
// stable metadata only. This intentionally excludes request bodies, headers,
// tokens, Stripe payloads, and other operator/customer secrets.
export function registerPlatformFailureLogging(app: any, options: { prefixes: string[] }) {
  const prefixes = options.prefixes;
  app.addHook('onSend', async (request: any, reply: any, payload: unknown) => {
    const route = routeForLog(request);
    const url = String(request.url || '');
    if (!prefixes.some(p => route.startsWith(p) || url.startsWith(p))) return payload;

    const statusCode = reply.statusCode;
    if (statusCode < 400) return payload;

    request.log?.warn?.({
      route,
      method: request.method,
      actorUserId: request.user?.id ?? null,
      statusCode,
      code: extractErrorCode(payload, statusCode),
    }, 'platform_command_failure');
    return payload;
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
