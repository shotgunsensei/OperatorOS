import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  getOutboundProviderAdapter,
  ProviderDisabledError,
  type OutboundProviderAdapter,
} from './shared-provider-adapters.js';
import {
  boundedRetryDelayMs,
  isOperatorOSTestEnvironment,
  safeFailureCode,
  sanitizeSharedMetadata,
} from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;
type Channel = 'email' | 'sms' | 'in_app';

export interface NotificationTemplateInput {
  tenantId: string;
  moduleId: string;
  templateKey: string;
  channel: Channel;
  name: string;
  subjectTemplate?: string | null;
  bodyTemplate: string;
  enabled?: boolean;
  actorUserId: string;
  expectedVersion?: number;
}

function validateTemplateInput(input: NotificationTemplateInput): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,119}$/.test(input.templateKey)) {
    throw Object.assign(new Error('Notification template key is invalid'), { code: 'INVALID_TEMPLATE_KEY' });
  }
  if (!input.name.trim() || input.name.length > 200) {
    throw Object.assign(new Error('Notification template name is invalid'), { code: 'INVALID_TEMPLATE_NAME' });
  }
  if (!input.bodyTemplate.trim() || input.bodyTemplate.length > 20_000) {
    throw Object.assign(new Error('Notification template body is invalid'), { code: 'INVALID_TEMPLATE_BODY' });
  }
  if (input.subjectTemplate && input.subjectTemplate.length > 500) {
    throw Object.assign(new Error('Notification template subject is invalid'), { code: 'INVALID_TEMPLATE_SUBJECT' });
  }
}

export async function saveNotificationTemplate(input: NotificationTemplateInput, executor: Executor = db) {
  validateTemplateInput(input);
  const result = await executor.execute(sql`
    INSERT INTO shared_notification_templates (
      tenant_id, module_id, template_key, channel, name, subject_template,
      body_template, enabled, created_by_user_id, updated_by_user_id
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.templateKey}, ${input.channel},
      ${input.name.trim()}, ${input.subjectTemplate ?? null}, ${input.bodyTemplate},
      ${input.enabled ?? true}, ${input.actorUserId}, ${input.actorUserId}
    )
    ON CONFLICT (tenant_id, module_id, template_key, channel)
      WHERE archived_at IS NULL
    DO UPDATE SET
      name = EXCLUDED.name, subject_template = EXCLUDED.subject_template,
      body_template = EXCLUDED.body_template, enabled = EXCLUDED.enabled,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      version = shared_notification_templates.version + 1, updated_at = NOW()
    WHERE shared_notification_templates.version = ${input.expectedVersion ?? 0}
    RETURNING *
  `);
  if (result.rows[0]) return result.rows[0] as Record<string, unknown>;
  const existing = await executor.execute(sql`
    SELECT id, version FROM shared_notification_templates
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND template_key = ${input.templateKey} AND channel = ${input.channel}
      AND archived_at IS NULL
    LIMIT 1
  `);
  if (existing.rows[0]) {
    throw Object.assign(new Error('Notification template version conflict'), {
      code: 'NOTIFICATION_TEMPLATE_VERSION_CONFLICT',
      currentVersion: Number(existing.rows[0].version),
    });
  }
  throw Object.assign(new Error('Notification template could not be saved'), { code: 'NOTIFICATION_TEMPLATE_SAVE_FAILED' });
}

function templateValue(values: Record<string, unknown>, path: string): string | null {
  let value: unknown = values;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || !(part in value)) return null;
    value = (value as Record<string, unknown>)[part];
  }
  return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : null;
}

function renderTemplateText(template: string, values: Record<string, unknown>, limit: number): string {
  const rendered = template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, path: string) => {
    const value = templateValue(values, path);
    if (value === null) {
      throw Object.assign(new Error(`Notification template variable is missing: ${path}`), {
        code: 'NOTIFICATION_TEMPLATE_VARIABLE_MISSING',
      });
    }
    return value;
  });
  if (rendered.length > limit) {
    throw Object.assign(new Error('Rendered notification template is too large'), {
      code: 'NOTIFICATION_TEMPLATE_RENDER_TOO_LARGE',
    });
  }
  return rendered;
}

export async function renderNotificationTemplate(input: {
  tenantId: string;
  moduleId: string;
  templateKey: string;
  channel: Channel;
  variables?: Record<string, unknown>;
}, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT template_key, channel, subject_template, body_template, version
    FROM shared_notification_templates
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND template_key = ${input.templateKey} AND channel = ${input.channel}
      AND enabled = TRUE AND archived_at IS NULL
    LIMIT 1
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    throw Object.assign(new Error('Notification template is unavailable'), { code: 'NOTIFICATION_TEMPLATE_NOT_FOUND' });
  }
  const values = sanitizeSharedMetadata(input.variables);
  return {
    templateKey: String(row.template_key),
    version: Number(row.version),
    subject: row.subject_template ? renderTemplateText(String(row.subject_template), values, 500) : null,
    body: renderTemplateText(String(row.body_template), values, 20_000),
  };
}

export interface OutboxMessageInput {
  tenantId: string;
  moduleId: string;
  requestedByUserId?: string | null;
  recipientUserId?: string | null;
  channel: Channel;
  destination?: string | null;
  templateKey?: string | null;
  subject?: string | null;
  body: string;
  context?: Record<string, unknown>;
  idempotencyKey: string;
  correlationId?: string | null;
  availableAt?: Date;
  maxAttempts?: number;
}

export async function enqueueOutboxMessage(input: OutboxMessageInput, executor: Executor = db) {
  if (!input.body.trim()) throw Object.assign(new Error('Outbound message body is required'), { code: 'OUTBOX_BODY_REQUIRED' });
  if (input.channel === 'in_app' && !input.recipientUserId) {
    throw Object.assign(new Error('In-app message requires a recipient user'), { code: 'OUTBOX_RECIPIENT_REQUIRED' });
  }
  if (input.channel !== 'in_app' && !input.destination) {
    throw Object.assign(new Error('Outbound message requires a destination'), { code: 'OUTBOX_DESTINATION_REQUIRED' });
  }
  const context = sanitizeSharedMetadata(input.context);
  const result = await executor.execute(sql`
    INSERT INTO shared_outbox_messages (
      tenant_id, module_id, requested_by_user_id, recipient_user_id, channel,
      destination, template_key, subject, body, context_json, idempotency_key,
      correlation_id, available_at, max_attempts
    ) VALUES (
      ${input.tenantId}, ${input.moduleId}, ${input.requestedByUserId ?? null},
      ${input.recipientUserId ?? null}, ${input.channel}, ${input.destination ?? null},
      ${input.templateKey ?? null}, ${input.subject ?? null}, ${input.body.slice(0, 20_000)},
      ${context}, ${input.idempotencyKey}, ${input.correlationId ?? null},
      ${input.availableAt ?? new Date()}, ${Math.max(1, Math.min(20, input.maxAttempts ?? 5))}
    )
    ON CONFLICT (tenant_id, module_id, idempotency_key) DO NOTHING
    RETURNING *
  `);
  if (result.rows[0]) return { message: result.rows[0], duplicate: false };
  const existing = await executor.execute(sql`
    SELECT * FROM shared_outbox_messages
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND idempotency_key = ${input.idempotencyKey}
    LIMIT 1
  `);
  return { message: existing.rows[0], duplicate: true };
}

export async function enqueueTemplatedOutboxMessage(input: Omit<
  OutboxMessageInput,
  'templateKey' | 'subject' | 'body'
> & {
  templateKey: string;
  variables?: Record<string, unknown>;
}, executor: Executor = db) {
  const rendered = await renderNotificationTemplate({
    tenantId: input.tenantId,
    moduleId: input.moduleId,
    templateKey: input.templateKey,
    channel: input.channel,
    variables: input.variables,
  }, executor);
  return enqueueOutboxMessage({
    ...input,
    templateKey: input.templateKey,
    subject: rendered.subject,
    body: rendered.body,
    context: {
      ...input.context,
      notificationTemplateVersion: rendered.version,
    },
  }, executor);
}

export async function claimOutboxMessages(input: {
  workerId: string;
  limit?: number;
  leaseMs?: number;
}, executor: Executor = db) {
  const limit = Math.max(1, Math.min(50, input.limit ?? 10));
  const leaseExpiresAt = new Date(Date.now() + Math.max(5_000, Math.min(5 * 60_000, input.leaseMs ?? 30_000)));
  const result = await executor.execute(sql`
    WITH candidates AS (
      SELECT id FROM shared_outbox_messages
      WHERE (
        (status IN ('pending','retry') AND available_at <= NOW()) OR
        (status = 'processing' AND lease_expires_at < NOW())
      )
      ORDER BY available_at, created_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE shared_outbox_messages AS message
    SET status = 'processing', lease_owner = ${input.workerId},
      lease_expires_at = ${leaseExpiresAt}, updated_at = NOW()
    FROM candidates
    WHERE message.id = candidates.id
    RETURNING message.*
  `);
  return result.rows as Array<Record<string, unknown>>;
}

type AdapterResolver = (channel: 'email' | 'sms') => Promise<OutboundProviderAdapter>;
let resolveAdapter: AdapterResolver = getOutboundProviderAdapter;

export function setOutboundAdapterResolverForTests(resolver: AdapterResolver | null): void {
  if (!isOperatorOSTestEnvironment()) throw new Error('Outbound adapter override is test-only');
  resolveAdapter = resolver ?? getOutboundProviderAdapter;
}

async function markOutboxFailure(
  row: Record<string, unknown>,
  error: unknown,
  executor: Executor,
): Promise<void> {
  const attempt = Number(row.attempt_count) + 1;
  const maxAttempts = Number(row.max_attempts);
  const disabled = error instanceof ProviderDisabledError;
  const terminal = disabled || attempt >= maxAttempts;
  const next = new Date(Date.now() + boundedRetryDelayMs(attempt));
  await executor.execute(sql`
    UPDATE shared_outbox_messages
    SET status = ${disabled ? 'disabled' : (terminal ? 'dead_letter' : 'retry')},
      attempt_count = ${attempt}, available_at = ${next}, lease_owner = NULL,
      lease_expires_at = NULL, last_error_code = ${safeFailureCode(error)}, updated_at = NOW()
    WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
      AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
  `);
}

export async function processOutboxMessage(row: Record<string, unknown>, executor: Executor = db): Promise<void> {
  try {
    const channel = String(row.channel) as Channel;
    if (channel === 'in_app') {
      const context = (row.context_json ?? {}) as Record<string, unknown>;
      const level = ['info', 'success', 'warning', 'error'].includes(String(context.level))
        ? String(context.level)
        : 'info';
      await executor.execute(sql`
        INSERT INTO shared_notifications (
          tenant_id, module_id, user_id, outbox_id, title, message, level
        ) VALUES (
          ${String(row.tenant_id)}, ${String(row.module_id)}, ${String(row.recipient_user_id)},
          ${String(row.id)}, ${String(row.subject || 'Notification').slice(0, 500)},
          ${String(row.body).slice(0, 20_000)}, ${level}
        )
        ON CONFLICT (outbox_id) DO NOTHING
      `);
      await executor.execute(sql`
        UPDATE shared_outbox_messages
        SET status = 'delivered', attempt_count = attempt_count + 1,
          provider_name = 'operatoros-in-app', provider_message_id = id,
          delivered_at = NOW(), lease_owner = NULL, lease_expires_at = NULL,
          last_error_code = NULL, updated_at = NOW()
        WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
          AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
      `);
      return;
    }

    const adapter = await resolveAdapter(channel);
    if (adapter.status.state === 'disabled') throw new ProviderDisabledError(channel);
    const delivery = await adapter.send({
      destination: String(row.destination),
      subject: row.subject ? String(row.subject) : null,
      body: String(row.body),
      idempotencyKey: String(row.idempotency_key),
    });
    await executor.execute(sql`
      UPDATE shared_outbox_messages
      SET status = 'delivered', attempt_count = attempt_count + 1,
        provider_name = ${adapter.status.name}, provider_message_id = ${delivery.providerMessageId},
        delivered_at = NOW(), lease_owner = NULL, lease_expires_at = NULL,
        last_error_code = NULL, updated_at = NOW()
      WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}
        AND status = 'processing' AND lease_owner = ${String(row.lease_owner)}
    `);
  } catch (error) {
    await markOutboxFailure(row, error, executor);
  }
}

export async function processOutboxBatch(input: {
  workerId?: string;
  limit?: number;
  leaseMs?: number;
} = {}, executor: Executor = db) {
  const rows = await claimOutboxMessages({
    workerId: input.workerId ?? `outbox-${randomUUID()}`,
    limit: input.limit,
    leaseMs: input.leaseMs,
  }, executor);
  for (const row of rows) await processOutboxMessage(row, executor);
  return rows.length;
}

export async function listUserNotifications(input: {
  tenantId: string;
  moduleId: string;
  userId: string;
  limit?: number;
  before?: Date | null;
}, executor: Executor = db) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 25));
  const result = await executor.execute(sql`
    SELECT id, title, message, level, created_at, read_at
    FROM shared_notifications
    WHERE tenant_id = ${input.tenantId} AND module_id = ${input.moduleId}
      AND user_id = ${input.userId}
      AND (${input.before ?? null}::timestamp IS NULL OR created_at < ${input.before ?? null})
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}
  `);
  return result.rows;
}

export async function markUserNotificationRead(input: {
  tenantId: string;
  moduleId: string;
  userId: string;
  notificationId: string;
}, executor: Executor = db): Promise<boolean> {
  const result = await executor.execute(sql`
    UPDATE shared_notifications
    SET read_at = COALESCE(read_at, NOW())
    WHERE id = ${input.notificationId} AND tenant_id = ${input.tenantId}
      AND module_id = ${input.moduleId} AND user_id = ${input.userId}
    RETURNING id
  `);
  return Boolean(result.rows[0]);
}
