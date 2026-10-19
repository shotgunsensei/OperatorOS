import { createHash, createHmac, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  boundedRetryDelayMs,
  isOperatorOSDeterministicProviderTestEnvironment,
  safeFailureCode,
  sanitizeSharedMetadata,
} from './shared-service-safety.js';
import { resolveEncryptedSecretReference, storeEncryptedSecretReference } from './shared-secret-vault.js';
import { postPublicWebhook, validateOutboundWebhookUrl } from './public-webhook-http.js';
export { validateOutboundWebhookUrl } from './public-webhook-http.js';

type Executor = Pick<typeof db, 'execute'>;

export async function createOutboundWebhookEndpoint(input: {
  tenantId: string;
  moduleId: string;
  actorUserId: string;
  name: string;
  endpointUrl: string;
  signingSecret: string;
  eventTypes: string[];
}, executor: Executor = db) {
  const url = validateOutboundWebhookUrl(input.endpointUrl);
  const eventTypes = [...new Set(input.eventTypes.map(v => v.trim()).filter(v => /^[a-z0-9][a-z0-9._:-]{1,159}$/i.test(v)))].slice(0, 50);
  if (!input.name.trim() || input.name.trim().length > 120 || eventTypes.length === 0) {
    throw Object.assign(new Error('Webhook name and at least one valid event type are required'), { code: 'WEBHOOK_ENDPOINT_INVALID' });
  }
  return db.transaction(async tx => {
    const secret = await storeEncryptedSecretReference({
      tenantId: input.tenantId,
      moduleId: input.moduleId,
      purpose: 'outbound-webhook-hmac',
      reference: input.signingSecret,
      actorUserId: input.actorUserId,
    }, tx);
    const result = await tx.execute(sql`
      INSERT INTO shared_webhook_endpoints (
        tenant_id, module_id, name, endpoint_url, secret_reference_id,
        event_types_json, created_by_user_id, updated_by_user_id
      ) VALUES (
        ${input.tenantId}, ${input.moduleId}, ${input.name.trim()}, ${url.toString()},
        ${String(secret?.id)}, ${JSON.stringify(eventTypes)}::jsonb, ${input.actorUserId}, ${input.actorUserId}
      ) RETURNING id, tenant_id, module_id, name, endpoint_url, event_types_json,
        enabled, version, created_at, updated_at
    `);
    return result.rows[0];
  });
}

export async function listOutboundWebhookEndpoints(input: { tenantId: string; moduleId?: string | null }, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT id, module_id, name, endpoint_url, event_types_json, enabled, version, created_at, updated_at
    FROM shared_webhook_endpoints
    WHERE tenant_id = ${input.tenantId} AND archived_at IS NULL
      AND (${input.moduleId ?? null}::text IS NULL OR module_id = ${input.moduleId ?? null})
    ORDER BY created_at DESC
  `);
  return result.rows;
}

export async function enqueueOutboundWebhook(input: {
  tenantId: string;
  moduleId: string;
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string | null;
  maxAttempts?: number;
}, executor: Executor = db) {
  const payload = sanitizeSharedMetadata(input.payload);
  const serialized = JSON.stringify(payload);
  const payloadSha256 = createHash('sha256').update(serialized).digest('hex');
  const result = await executor.execute(sql`
    INSERT INTO shared_webhook_deliveries (
      tenant_id, module_id, endpoint_id, event_type, payload_json, payload_sha256,
      idempotency_key, correlation_id, max_attempts
    ) SELECT ${input.tenantId}, ${input.moduleId}, endpoint.id, ${input.eventType.slice(0, 160)},
      ${payload}, ${payloadSha256}, ${input.idempotencyKey}, ${input.correlationId ?? null},
      ${Math.max(1, Math.min(20, input.maxAttempts ?? 5))}
    FROM shared_webhook_endpoints endpoint
    WHERE endpoint.tenant_id = ${input.tenantId} AND endpoint.module_id = ${input.moduleId}
      AND endpoint.id = ${input.endpointId} AND endpoint.enabled = TRUE AND endpoint.archived_at IS NULL
      AND endpoint.event_types_json ? ${input.eventType}
    ON CONFLICT (tenant_id, module_id, endpoint_id, idempotency_key) DO NOTHING
    RETURNING *
  `);
  if (result.rows[0]) return { delivery: result.rows[0], duplicate: false };
  const existing = await executor.execute(sql`
    SELECT * FROM shared_webhook_deliveries WHERE tenant_id = ${input.tenantId}
      AND module_id = ${input.moduleId} AND endpoint_id = ${input.endpointId}
      AND idempotency_key = ${input.idempotencyKey} LIMIT 1
  `);
  if (!existing.rows[0]) throw Object.assign(new Error('Webhook endpoint or subscribed event was not found'), { code: 'WEBHOOK_ENDPOINT_NOT_FOUND' });
  return { delivery: existing.rows[0], duplicate: true };
}

export async function claimOutboundWebhooks(input: { workerId: string; limit?: number; leaseMs?: number }, executor: Executor = db) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const leaseExpiresAt = new Date(Date.now() + Math.max(5_000, Math.min(300_000, input.leaseMs ?? 30_000)));
  const result = await executor.execute(sql`
    WITH candidates AS (
      SELECT id FROM shared_webhook_deliveries
      WHERE ((status IN ('pending','retry') AND available_at <= NOW()) OR
        (status = 'processing' AND lease_expires_at < NOW()))
      ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT ${limit}
    )
    UPDATE shared_webhook_deliveries delivery
    SET status = 'processing', lease_owner = ${input.workerId}, lease_expires_at = ${leaseExpiresAt}, updated_at = NOW()
    FROM candidates WHERE delivery.id = candidates.id RETURNING delivery.*
  `);
  return result.rows as Array<Record<string, unknown>>;
}

async function recordAttempt(row: Record<string, unknown>, input: {
  adapterName: string;
  externalDelivery: boolean;
  resultState: string;
  responseStatus?: number | null;
  errorCode?: string | null;
}, executor: Executor) {
  await executor.execute(sql`
    INSERT INTO shared_delivery_attempts (
      tenant_id, module_id, delivery_kind, delivery_id, attempt_number,
      adapter_name, external_delivery, result_state, response_status,
      safe_error_code, completed_at
    ) VALUES (
      ${String(row.tenant_id)}, ${String(row.module_id)}, 'webhook', ${String(row.id)},
      ${Number(row.attempt_count) + 1}, ${input.adapterName}, ${input.externalDelivery},
      ${input.resultState}, ${input.responseStatus ?? null}, ${input.errorCode ?? null}, NOW()
    ) ON CONFLICT (tenant_id, delivery_kind, delivery_id, attempt_number) DO NOTHING
  `);
}

export type OutboundWebhookProcessingResult = {
  status: 'recorded' | 'delivered' | 'retry' | 'dead_letter';
  resultState: 'recorded_not_delivered' | 'delivered' | 'retry' | 'dead_letter';
  externalDelivery: boolean;
};

export async function processOutboundWebhook(
  row: Record<string, unknown>,
  executor: Executor = db,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OutboundWebhookProcessingResult> {
  try {
    const endpointResult = await executor.execute(sql`
      SELECT endpoint_url, secret_reference_id, enabled FROM shared_webhook_endpoints
      WHERE tenant_id = ${String(row.tenant_id)} AND module_id = ${String(row.module_id)}
        AND id = ${String(row.endpoint_id)} AND archived_at IS NULL LIMIT 1
    `);
    const endpoint = endpointResult.rows[0] as any;
    if (!endpoint?.enabled) throw Object.assign(new Error('Webhook endpoint is disabled'), { code: 'WEBHOOK_ENDPOINT_DISABLED' });
    const url = validateOutboundWebhookUrl(String(endpoint.endpoint_url));
    if (isOperatorOSDeterministicProviderTestEnvironment(env)) {
      await recordAttempt(row, { adapterName: 'deterministic-test', externalDelivery: false, resultState: 'recorded_not_delivered' }, executor);
      await executor.execute(sql`
        UPDATE shared_webhook_deliveries SET status = 'recorded', attempt_count = attempt_count + 1,
          lease_owner = NULL, lease_expires_at = NULL, last_error_code = NULL, updated_at = NOW()
        WHERE tenant_id = ${String(row.tenant_id)} AND id = ${String(row.id)}
          AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
      `);
      return { status: 'recorded', resultState: 'recorded_not_delivered', externalDelivery: false };
    }
    const secret = await resolveEncryptedSecretReference({
      tenantId: String(row.tenant_id), moduleId: String(row.module_id), id: String(endpoint.secret_reference_id),
    }, executor);
    if (!secret) throw Object.assign(new Error('Webhook signing secret is unavailable'), { code: 'WEBHOOK_SECRET_UNAVAILABLE' });
    const body = JSON.stringify(row.payload_json ?? {});
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const response = await postPublicWebhook(url, {
      body,
      headers: {
        'content-type': 'application/json',
        'user-agent': 'OperatorOS-Webhook/1.0',
        'x-operatoros-event': String(row.event_type),
        'x-operatoros-delivery': String(row.id),
        'x-operatoros-timestamp': timestamp,
        'x-operatoros-signature': `sha256=${signature}`,
      },
    });
    if (response.status < 200 || response.status >= 300) throw Object.assign(new Error('Webhook endpoint rejected the delivery'), { code: `WEBHOOK_HTTP_${response.status}`, status: response.status });
    await recordAttempt(row, { adapterName: 'https-hmac-sha256', externalDelivery: true, resultState: 'delivered', responseStatus: response.status }, executor);
    await executor.execute(sql`
      UPDATE shared_webhook_deliveries SET status = 'delivered', attempt_count = attempt_count + 1,
        delivered_at = NOW(), last_response_status = ${response.status}, lease_owner = NULL,
        lease_expires_at = NULL, last_error_code = NULL, updated_at = NOW()
      WHERE tenant_id = ${String(row.tenant_id)} AND id = ${String(row.id)}
        AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
    `);
    return { status: 'delivered', resultState: 'delivered', externalDelivery: true };
  } catch (error) {
    const attempt = Number(row.attempt_count) + 1;
    const terminal = attempt >= Number(row.max_attempts) || safeFailureCode(error) === 'WEBHOOK_ENDPOINT_DISABLED';
    const next = new Date(Date.now() + boundedRetryDelayMs(attempt));
    const errorCode = safeFailureCode(error);
    await recordAttempt(row, { adapterName: 'https-hmac-sha256', externalDelivery: false, resultState: terminal ? 'dead_letter' : 'retry', responseStatus: (error as any)?.status, errorCode }, executor);
    await executor.execute(sql`
      UPDATE shared_webhook_deliveries SET status = ${terminal ? 'dead_letter' : 'retry'},
        attempt_count = ${attempt}, available_at = ${next}, lease_owner = NULL,
        lease_expires_at = NULL, last_response_status = ${(error as any)?.status ?? null},
        last_error_code = ${errorCode}, updated_at = NOW()
      WHERE tenant_id = ${String(row.tenant_id)} AND id = ${String(row.id)}
        AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
    `);
    return {
      status: terminal ? 'dead_letter' : 'retry',
      resultState: terminal ? 'dead_letter' : 'retry',
      externalDelivery: false,
    };
  }
}

export async function processOutboundWebhookBatch(input: { workerId?: string; limit?: number; leaseMs?: number } = {}, executor: Executor = db) {
  const rows = await claimOutboundWebhooks({
    workerId: input.workerId ?? `outbound-webhook-${randomUUID()}`,
    limit: input.limit,
    leaseMs: input.leaseMs,
  }, executor);
  for (const row of rows) await processOutboundWebhook(row, executor);
  return rows.length;
}
