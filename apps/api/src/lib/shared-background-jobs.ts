import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { boundedRetryDelayMs, safeFailureCode, sanitizeSharedMetadata } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;

export interface SharedJobContext {
  id: string;
  tenantId: string;
  moduleId: string;
  payload: Record<string, unknown>;
  correlationId: string | null;
}

export type SharedJobHandler = (context: SharedJobContext) => Promise<void>;
const handlers = new Map<string, SharedJobHandler>();

export function registerSharedJobHandler(handlerKey: string, handler: SharedJobHandler): void {
  if (handlers.has(handlerKey) && handlers.get(handlerKey) !== handler) {
    throw new Error(`Shared job handler already registered: ${handlerKey}`);
  }
  handlers.set(handlerKey, handler);
}

export async function enqueueSharedJob(input: {
  tenantId: string;
  moduleId: string;
  requestedByUserId?: string | null;
  handlerKey: string;
  payload?: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string | null;
  runAt?: Date;
  maxAttempts?: number;
}, executor: Executor = db) {
  const payload = sanitizeSharedMetadata(input.payload);
  const result = await executor.execute(sql`
    INSERT INTO shared_jobs (
      tenant_id, module_id, requested_by_user_id, handler_key, payload_json,
      idempotency_key, correlation_id, run_at, max_attempts
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.requestedByUserId ?? null},
      ${input.handlerKey}, ${payload}, ${input.idempotencyKey}, ${input.correlationId ?? null},
      ${input.runAt ?? new Date()}, ${Math.max(1, Math.min(20, input.maxAttempts ?? 5))}
    )
    ON CONFLICT (tenant_id, module_id, handler_key, idempotency_key) DO NOTHING
    RETURNING *
  `);
  if (result.rows[0]) return { job: result.rows[0], duplicate: false };
  const existing = await executor.execute(sql`
    SELECT * FROM shared_jobs
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND handler_key = ${input.handlerKey} AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `);
  return { job: existing.rows[0], duplicate: true };
}

export async function claimSharedJobs(input: {
  workerId: string;
  limit?: number;
  leaseMs?: number;
}, executor: Executor = db) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const leaseExpiresAt = new Date(Date.now() + Math.max(5_000, Math.min(5 * 60_000, input.leaseMs ?? 30_000)));
  const result = await executor.execute(sql`
    WITH candidates AS (
      SELECT id FROM shared_jobs
      WHERE (
        (status IN ('pending','retry') AND run_at <= NOW()) OR
        (status = 'processing' AND lease_expires_at < NOW())
      )
      ORDER BY run_at, created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE shared_jobs AS job
    SET status = 'processing', lease_owner = ${input.workerId},
      lease_expires_at = ${leaseExpiresAt}, updated_at = NOW()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  `);
  return result.rows as Array<Record<string, unknown>>;
}

export async function processSharedJob(row: Record<string, unknown>, executor: Executor = db): Promise<void> {
  try {
    const handler = handlers.get(String(row.handler_key));
    if (!handler) throw Object.assign(new Error('Shared job handler is not registered'), { code: 'JOB_HANDLER_NOT_REGISTERED' });
    await handler({
      id: String(row.id),
      tenantId: String(row.tenant_id),
      moduleId: String(row.module_id),
      payload: (row.payload_json ?? {}) as Record<string, unknown>,
      correlationId: row.correlation_id ? String(row.correlation_id) : null,
    });
    await executor.execute(sql`
      UPDATE shared_jobs
      SET status = 'completed', attempt_count = attempt_count + 1,
        completed_at = NOW(), lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = NULL, updated_at = NOW()
      WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
        AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
    `);
  } catch (error) {
    const attempt = Number(row.attempt_count) + 1;
    const terminal = attempt >= Number(row.max_attempts);
    const next = new Date(Date.now() + boundedRetryDelayMs(attempt));
    await executor.execute(sql`
      UPDATE shared_jobs
      SET status = ${terminal ? 'dead_letter' : 'retry'}, attempt_count = ${attempt},
        run_at = ${next}, lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = ${safeFailureCode(error)}, updated_at = NOW()
      WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
        AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
    `);
  }
}

export async function processSharedJobBatch(input: {
  workerId?: string;
  limit?: number;
  leaseMs?: number;
} = {}, executor: Executor = db) {
  const rows = await claimSharedJobs({
    workerId: input.workerId ?? `jobs-${randomUUID()}`,
    limit: input.limit,
    leaseMs: input.leaseMs,
  }, executor);
  for (const row of rows) await processSharedJob(row, executor);
  return rows.length;
}
