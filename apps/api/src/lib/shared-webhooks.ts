import { createHash, createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { boundedRetryDelayMs, safeFailureCode, sanitizeSharedMetadata } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;

export interface VerifiedWebhookEvent {
  tenantId: string;
  moduleId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  handlerKey: string;
  rawBody: string | Buffer;
  safePayload: Record<string, unknown>;
  correlationId?: string | null;
  maxAttempts?: number;
}

export interface WebhookVerificationInput {
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookVerifier {
  verify(input: WebhookVerificationInput): Promise<Omit<VerifiedWebhookEvent, 'rawBody' | 'handlerKey'>>;
}

export interface SharedWebhookContext {
  receiptId: string;
  tenantId: string;
  moduleId: string;
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  correlationId: string | null;
}

export type SharedWebhookHandler = (context: SharedWebhookContext) => Promise<void>;
const handlers = new Map<string, SharedWebhookHandler>();

export function registerSharedWebhookHandler(handlerKey: string, handler: SharedWebhookHandler): void {
  if (handlers.has(handlerKey) && handlers.get(handlerKey) !== handler) {
    throw new Error(`Shared webhook handler already registered: ${handlerKey}`);
  }
  handlers.set(handlerKey, handler);
}

export function verifyHmacSha256(input: {
  rawBody: string | Buffer;
  signature: string | undefined;
  secret: string;
  prefix?: string;
}): boolean {
  if (!input.signature || !input.secret) return false;
  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest('hex');
  const supplied = input.signature.startsWith(input.prefix || '')
    ? input.signature.slice((input.prefix || '').length)
    : input.signature;
  if (!/^[0-9a-f]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

export async function receiveWebhook(input: {
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
  handlerKey: string;
  verifier: WebhookVerifier;
  maxAttempts?: number;
}, executor: Executor = db) {
  const verified = await input.verifier.verify({ rawBody: input.rawBody, headers: input.headers });
  return receiveVerifiedWebhook({
    ...verified,
    rawBody: input.rawBody,
    handlerKey: input.handlerKey,
    maxAttempts: input.maxAttempts,
  }, executor);
}

export async function receiveVerifiedWebhook(input: VerifiedWebhookEvent, executor: Executor = db) {
  const payloadSha256 = createHash('sha256').update(input.rawBody).digest('hex');
  const safePayload = sanitizeSharedMetadata(input.safePayload);
  const inserted = await executor.execute(sql`
    INSERT INTO shared_webhook_receipts (
      tenant_id, module_id, provider, provider_event_id, event_type, handler_key,
      payload_sha256, safe_payload_json, signature_verified, correlation_id, max_attempts
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.provider}, ${input.providerEventId},
      ${input.eventType}, ${input.handlerKey}, ${payloadSha256}, ${safePayload}, TRUE,
      ${input.correlationId ?? null}, ${Math.max(1, Math.min(20, input.maxAttempts ?? 5))}
    )
    ON CONFLICT (provider, provider_event_id) DO NOTHING
    RETURNING *
  `);

  let row = inserted.rows[0] as Record<string, unknown> | undefined;
  const duplicate = !row;
  if (!row) {
    const existing = await executor.execute(sql`
      SELECT * FROM shared_webhook_receipts
      WHERE provider = ${input.provider} AND provider_event_id = ${input.providerEventId}
      LIMIT 1
    `);
    row = existing.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new Error('Webhook receipt claim failed');
    if (row.payload_sha256 !== payloadSha256) {
      throw Object.assign(new Error('Webhook event id was reused with a different payload'), { code: 'WEBHOOK_EVENT_CONFLICT' });
    }
    if (row.tenant_id !== input.tenantId || row.module_id !== input.moduleId) {
      throw Object.assign(new Error('Webhook event tenant/module binding mismatch'), { code: 'WEBHOOK_SCOPE_CONFLICT' });
    }
  }

  if (row.status === 'processed' || row.status === 'dead_letter') {
    return { receipt: row, duplicate, status: String(row.status) };
  }
  const processed = await processWebhookReceiptById(String(row.id), `inline-${randomUUID()}`, executor);
  return { receipt: processed ?? row, duplicate, status: String(processed?.status ?? row.status) };
}

async function markWebhookFailure(row: Record<string, unknown>, error: unknown, executor: Executor): Promise<void> {
  const attempt = Number(row.attempt_count) + 1;
  const terminal = attempt >= Number(row.max_attempts);
  const next = new Date(Date.now() + boundedRetryDelayMs(attempt));
  await executor.execute(sql`
    UPDATE shared_webhook_receipts
    SET status = ${terminal ? 'dead_letter' : 'retry'}, attempt_count = ${attempt},
      next_attempt_at = ${next}, lease_owner = NULL, lease_expires_at = NULL,
      last_error_code = ${safeFailureCode(error)}, updated_at = NOW()
    WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
      AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
  `);
}

export async function processWebhookReceipt(row: Record<string, unknown>, executor: Executor = db): Promise<Record<string, unknown>> {
  try {
    const handler = handlers.get(String(row.handler_key));
    if (!handler) throw Object.assign(new Error('Shared webhook handler is not registered'), { code: 'WEBHOOK_HANDLER_NOT_REGISTERED' });
    await handler({
      receiptId: String(row.id),
      tenantId: String(row.tenant_id),
      moduleId: String(row.module_id),
      provider: String(row.provider),
      providerEventId: String(row.provider_event_id),
      eventType: String(row.event_type),
      payload: (row.safe_payload_json ?? {}) as Record<string, unknown>,
      correlationId: row.correlation_id ? String(row.correlation_id) : null,
    });
    const completed = await executor.execute(sql`
      UPDATE shared_webhook_receipts
      SET status = 'processed', attempt_count = attempt_count + 1,
        processed_at = NOW(), lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = NULL, updated_at = NOW()
      WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
        AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
      RETURNING *
    `);
    return completed.rows[0] as Record<string, unknown>;
  } catch (error) {
    await markWebhookFailure(row, error, executor);
    const failed = await executor.execute(sql`
      SELECT * FROM shared_webhook_receipts
      WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
      LIMIT 1
    `);
    return failed.rows[0] as Record<string, unknown>;
  }
}

export async function processWebhookReceiptById(
  receiptId: string,
  workerId: string,
  executor: Executor = db,
): Promise<Record<string, unknown> | null> {
  const leaseExpiresAt = new Date(Date.now() + 30_000);
  const claimed = await executor.execute(sql`
    UPDATE shared_webhook_receipts
    SET status = 'processing', lease_owner = ${workerId}, lease_expires_at = ${leaseExpiresAt}, updated_at = NOW()
    WHERE id = ${receiptId}
      AND (
        (status IN ('pending','retry') AND next_attempt_at <= NOW()) OR
        (status = 'processing' AND lease_expires_at < NOW())
      )
    RETURNING *
  `);
  const row = claimed.rows[0] as Record<string, unknown> | undefined;
  return row ? processWebhookReceipt(row, executor) : null;
}

export async function claimWebhookReceipts(input: {
  workerId: string;
  limit?: number;
  leaseMs?: number;
}, executor: Executor = db) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const leaseExpiresAt = new Date(Date.now() + Math.max(5_000, Math.min(5 * 60_000, input.leaseMs ?? 30_000)));
  const claimed = await executor.execute(sql`
    WITH candidates AS (
      SELECT id FROM shared_webhook_receipts
      WHERE (
        (status IN ('pending','retry') AND next_attempt_at <= NOW()) OR
        (status = 'processing' AND lease_expires_at < NOW())
      )
      ORDER BY next_attempt_at, received_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE shared_webhook_receipts AS receipt
    SET status = 'processing', lease_owner = ${input.workerId},
      lease_expires_at = ${leaseExpiresAt}, updated_at = NOW()
    FROM candidates
    WHERE receipt.id = candidates.id
    RETURNING receipt.*
  `);
  return claimed.rows as Array<Record<string, unknown>>;
}

export async function processWebhookBatch(input: {
  workerId?: string;
  limit?: number;
  leaseMs?: number;
} = {}, executor: Executor = db) {
  const rows = await claimWebhookReceipts({
    workerId: input.workerId ?? `webhooks-${randomUUID()}`,
    limit: input.limit,
    leaseMs: input.leaseMs,
  }, executor);
  for (const row of rows) await processWebhookReceipt(row, executor);
  return rows.length;
}
