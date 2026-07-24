import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { sanitizeIdempotencyResponse, sanitizeSharedMetadata } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;

export interface UsageEventInput {
  tenantId: string;
  moduleId: string;
  userId?: string | null;
  operation: string;
  units: number;
  unitKind: string;
  idempotencyKey: string;
  externalReference?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}

export async function recordUsageEvent(input: UsageEventInput, executor: Executor = db) {
  if (!Number.isSafeInteger(input.units) || input.units <= 0) {
    throw Object.assign(new Error('Usage units must be a positive safe integer'), { code: 'INVALID_USAGE_UNITS' });
  }
  const metadata = sanitizeSharedMetadata(input.metadata);
  const result = await executor.execute(sql`
    INSERT INTO shared_usage_events (
      tenant_id, module_id, user_id, operation, units, unit_kind,
      idempotency_key, external_reference, metadata_json, occurred_at
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.userId ?? null}, ${input.operation},
      ${input.units}, ${input.unitKind}, ${input.idempotencyKey},
      ${input.externalReference ?? null}, ${metadata}, ${input.occurredAt ?? new Date()}
    )
    ON CONFLICT (tenant_id, module_id, operation, idempotency_key) DO NOTHING
    RETURNING id, tenant_id, module_id, user_id, operation, units, unit_kind,
      idempotency_key, external_reference, metadata_json, occurred_at, created_at
  `);
  if (result.rows[0]) return { event: result.rows[0], duplicate: false };
  const existing = await executor.execute(sql`
    SELECT id, tenant_id, module_id, user_id, operation, units, unit_kind,
      idempotency_key, external_reference, metadata_json, occurred_at, created_at
    FROM shared_usage_events
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND operation = ${input.operation} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `);
  return { event: existing.rows[0], duplicate: true };
}

export async function summarizeUsage(input: {
  tenantId: string;
  moduleId: string;
  userId?: string | null;
  since?: Date;
}, executor: Executor = db) {
  const since = input.since ?? new Date(0);
  const result = await executor.execute(sql`
    SELECT operation, unit_kind, SUM(units)::text AS units
    FROM shared_usage_events
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND occurred_at >= ${since}
      AND (${input.userId ?? null}::text IS NULL OR user_id = ${input.userId ?? null})
    GROUP BY operation, unit_kind
    ORDER BY operation, unit_kind
  `);
  return result.rows;
}

export interface ActivityEventInput {
  tenantId: string;
  moduleId: string;
  actorUserId?: string | null;
  objectType: string;
  objectId: string;
  eventType: string;
  summary: string;
  metadata?: Record<string, unknown>;
  correlationId?: string | null;
}

export async function appendActivityEvent(input: ActivityEventInput, executor: Executor = db) {
  const summary = input.summary.trim().slice(0, 500);
  if (!summary) throw Object.assign(new Error('Activity summary is required'), { code: 'INVALID_ACTIVITY_SUMMARY' });
  const metadata = sanitizeSharedMetadata(input.metadata);
  const result = await executor.execute(sql`
    INSERT INTO shared_activity_events (
      tenant_id, module_id, actor_user_id, object_type, object_id,
      event_type, summary, metadata_json, correlation_id
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.actorUserId ?? null},
      ${input.objectType}, ${input.objectId}, ${input.eventType}, ${summary},
      ${metadata}, ${input.correlationId ?? null}
    )
    RETURNING id, tenant_id, module_id, actor_user_id, object_type, object_id,
      event_type, summary, metadata_json, correlation_id, created_at
  `);
  return result.rows[0];
}

type ActivityCursor = { createdAt: string; id: string };

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeActivityCursor(raw?: string | null): ActivityCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as ActivityCursor;
    if (!parsed.id || Number.isNaN(Date.parse(parsed.createdAt))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function listActivityEvents(input: {
  tenantId: string;
  moduleId: string;
  objectType?: string | null;
  objectId?: string | null;
  cursor?: string | null;
  limit?: number;
}, executor: Executor = db) {
  const limit = Math.max(1, Math.min(100, Math.floor(input.limit ?? 25)));
  const cursor = decodeActivityCursor(input.cursor);
  const result = await executor.execute(sql`
    SELECT id, tenant_id, module_id, actor_user_id, object_type, object_id,
      event_type, summary, metadata_json, correlation_id, created_at
    FROM shared_activity_events
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND (${input.objectType ?? null}::text IS NULL OR object_type = ${input.objectType ?? null})
      AND (${input.objectId ?? null}::text IS NULL OR object_id = ${input.objectId ?? null})
      AND (
        ${cursor?.createdAt ?? null}::timestamp IS NULL OR
        (created_at, id) < (${cursor?.createdAt ?? null}::timestamp, ${cursor?.id ?? null}::text)
      )
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit + 1}
  `);
  const rows = result.rows.slice(0, limit) as Array<Record<string, unknown>>;
  const last = rows.at(-1);
  const nextCursor = result.rows.length > limit && last
    ? encodeActivityCursor({ createdAt: new Date(last.created_at as string | Date).toISOString(), id: String(last.id) })
    : null;
  return { events: rows, nextCursor };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function hashIdempotencyRequest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export type IdempotencyBeginResult =
  | { state: 'acquired'; id: string; requestSha256: string; leaseExpiresAt: Date }
  | { state: 'replay'; id: string; responseStatus: number; responseJson: unknown }
  | { state: 'in_progress'; id: string }
  | { state: 'conflict'; id: string };

export async function beginIdempotentOperation(input: {
  tenantId: string;
  moduleId: string;
  scope: string;
  idempotencyKey: string;
  request: unknown;
  leaseMs?: number;
}, executor: Executor = db): Promise<IdempotencyBeginResult> {
  const requestSha256 = hashIdempotencyRequest(input.request);
  const lockedUntil = new Date(Date.now() + Math.max(5_000, Math.min(15 * 60_000, input.leaseMs ?? 60_000)));
  const claimed = await executor.execute(sql`
    INSERT INTO shared_idempotency_keys (
      tenant_id, module_id, scope, idempotency_key, request_sha256, locked_until
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.scope}, ${input.idempotencyKey},
      ${requestSha256}, ${lockedUntil}
    )
    ON CONFLICT (tenant_id, module_id, scope, idempotency_key) DO UPDATE
      SET status = 'processing', locked_until = EXCLUDED.locked_until,
          response_status = NULL, response_json = NULL, completed_at = NULL
      WHERE shared_idempotency_keys.request_sha256 = EXCLUDED.request_sha256
        AND (
          shared_idempotency_keys.status = 'failed' OR
          (shared_idempotency_keys.status = 'processing' AND shared_idempotency_keys.locked_until < NOW())
        )
    RETURNING id, request_sha256, locked_until
  `);
  if (claimed.rows[0]) {
    return {
      state: 'acquired',
      id: String(claimed.rows[0].id),
      requestSha256,
      leaseExpiresAt: new Date(claimed.rows[0].locked_until as string | Date),
    };
  }

  const existing = await executor.execute(sql`
    SELECT id, request_sha256, status, response_status, response_json
    FROM shared_idempotency_keys
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND scope = ${input.scope} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `);
  const row = existing.rows[0] as Record<string, unknown>;
  if (row.request_sha256 !== requestSha256) return { state: 'conflict', id: String(row.id) };
  if (row.status === 'completed') {
    return {
      state: 'replay',
      id: String(row.id),
      responseStatus: Number(row.response_status),
      responseJson: row.response_json,
    };
  }
  return { state: 'in_progress', id: String(row.id) };
}

export async function completeIdempotentOperation(input: {
  tenantId: string;
  id: string;
  leaseExpiresAt: Date;
  responseStatus: number;
  responseJson: unknown;
}, executor: Executor = db): Promise<void> {
  const completed = await executor.execute(sql`
    UPDATE shared_idempotency_keys
    SET status = 'completed', response_status = ${input.responseStatus},
      response_json = ${sanitizeIdempotencyResponse(input.responseJson)}, completed_at = NOW()
    WHERE tenant_id = ${input.tenantId} AND id = ${input.id} AND status = 'processing'
      AND locked_until = ${input.leaseExpiresAt}
    RETURNING id
  `);
  if (!completed.rows[0]) {
    throw Object.assign(new Error('Idempotency operation lease is no longer owned'), {
      code: 'IDEMPOTENCY_LEASE_LOST',
    });
  }
}

export async function failIdempotentOperation(input: {
  tenantId: string;
  id: string;
  leaseExpiresAt: Date;
}, executor: Executor = db): Promise<void> {
  await executor.execute(sql`
    UPDATE shared_idempotency_keys
    SET status = 'failed', completed_at = NOW()
    WHERE tenant_id = ${input.tenantId} AND id = ${input.id} AND status = 'processing'
      AND locked_until = ${input.leaseExpiresAt}
  `);
}
