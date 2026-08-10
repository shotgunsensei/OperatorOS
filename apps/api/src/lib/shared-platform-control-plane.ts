import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { getSharedProviderStatuses } from './shared-provider-adapters.js';
import { getSharedSecretVaultReadiness, storeEncryptedSecretReference } from './shared-secret-vault.js';
import { getAttachmentContent, getAttachmentServiceStatus } from './shared-attachments.js';
import { getSharedServiceQueueHealth, getSharedServiceWorkerStatus } from './shared-service-worker.js';
import { sanitizeSharedMetadata } from './shared-service-safety.js';

type Executor = Pick<typeof db, 'execute'>;
export const SHARED_API_TOKEN_SCOPES = Object.freeze([
  'directory:read', 'attachments:read', 'attachments:write', 'notifications:write',
  'jobs:write', 'exports:read', 'exports:write', 'usage:read', 'search:read', 'webhooks:write',
  'techdeck:read', 'techdeck:write',
]);

function scopeKey(moduleId?: string | null): string {
  return moduleId ? `module:${moduleId}` : 'tenant';
}

function providerHealth(input: {
  kind: string;
  mode: 'disabled' | 'test' | 'live';
  hasSecret: boolean;
  callbackReady: boolean;
}) {
  if (input.mode === 'disabled') return { state: 'blocked', reasonCode: 'PROVIDER_DISABLED', externalDelivery: false };
  if (input.mode === 'test') return { state: 'degraded', reasonCode: 'DETERMINISTIC_TEST_ADAPTER', externalDelivery: false };
  const callbackRequired = input.kind === 'oauth' || input.kind === 'webhook';
  if (!input.hasSecret) return { state: 'blocked', reasonCode: 'LIVE_CREDENTIAL_REFERENCE_MISSING', externalDelivery: false };
  if (callbackRequired && !input.callbackReady) return { state: 'blocked', reasonCode: 'LIVE_CALLBACK_NOT_READY', externalDelivery: false };
  return { state: 'ready', reasonCode: null, externalDelivery: true };
}

function providerJson(row: Record<string, unknown>) {
  const hasSecret = Boolean(row.secret_reference_id);
  const mode = String(row.mode) as 'disabled' | 'test' | 'live';
  const health = providerHealth({ kind: String(row.provider_kind), mode, hasSecret, callbackReady: Boolean(row.callback_ready) });
  return {
    id: String(row.id),
    moduleId: row.module_id ? String(row.module_id) : null,
    providerKey: String(row.provider_key),
    kind: String(row.provider_kind),
    mode,
    state: health.state,
    reasonCode: health.reasonCode,
    externalDelivery: health.externalDelivery,
    callbackReady: Boolean(row.callback_ready),
    hasSecretReference: hasSecret,
    secretFingerprint: row.fingerprint ? String(row.fingerprint) : null,
    publicConfig: row.public_config_json ?? {},
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function saveProviderConfiguration(input: {
  tenantId: string;
  moduleId?: string | null;
  actorUserId: string;
  providerKey: string;
  kind: 'email' | 'sms' | 'ai' | 'storage' | 'oauth' | 'webhook';
  mode: 'disabled' | 'test' | 'live';
  publicConfig?: Record<string, unknown>;
  secretReference?: string | null;
  callbackReady?: boolean;
  expectedVersion?: number | null;
}) {
  if (!/^[a-z0-9][a-z0-9._:-]{1,119}$/i.test(input.providerKey)) {
    throw Object.assign(new Error('Provider key is invalid'), { code: 'PROVIDER_KEY_INVALID' });
  }
  return db.transaction(async tx => {
    let secretId: string | null = null;
    if (input.secretReference?.trim()) {
      const secret = await storeEncryptedSecretReference({
        tenantId: input.tenantId,
        moduleId: input.moduleId,
        purpose: `provider:${input.kind}:${input.providerKey}`,
        reference: input.secretReference,
        actorUserId: input.actorUserId,
      }, tx);
      secretId = String(secret?.id);
    }
    const publicConfig = sanitizeSharedMetadata(input.publicConfig);
    const health = providerHealth({
      kind: input.kind,
      mode: input.mode,
      hasSecret: Boolean(secretId),
      callbackReady: input.callbackReady === true,
    });
    const result = await tx.execute(sql`
      INSERT INTO shared_provider_configs (
        tenant_id, module_id, scope_key, provider_key, provider_kind, mode,
        public_config_json, secret_reference_id, callback_ready, health_state,
        health_reason_code, last_health_at, created_by_user_id, updated_by_user_id
      ) VALUES (
        ${input.tenantId}, ${input.moduleId ?? null}, ${scopeKey(input.moduleId)}, ${input.providerKey},
        ${input.kind}, ${input.mode}, ${publicConfig}, ${secretId}, ${input.callbackReady === true},
        ${health.state}, ${health.reasonCode}, NOW(), ${input.actorUserId}, ${input.actorUserId}
      )
      ON CONFLICT (tenant_id, scope_key, provider_key) DO UPDATE SET
        provider_kind = EXCLUDED.provider_kind,
        mode = EXCLUDED.mode,
        public_config_json = EXCLUDED.public_config_json,
        secret_reference_id = COALESCE(EXCLUDED.secret_reference_id, shared_provider_configs.secret_reference_id),
        callback_ready = EXCLUDED.callback_ready,
        health_state = CASE
          WHEN EXCLUDED.mode = 'live' AND COALESCE(EXCLUDED.secret_reference_id, shared_provider_configs.secret_reference_id) IS NOT NULL
            AND (EXCLUDED.provider_kind NOT IN ('oauth','webhook') OR EXCLUDED.callback_ready) THEN 'ready'
          WHEN EXCLUDED.mode = 'test' THEN 'degraded'
          ELSE 'blocked'
        END,
        health_reason_code = CASE
          WHEN EXCLUDED.mode = 'live' AND COALESCE(EXCLUDED.secret_reference_id, shared_provider_configs.secret_reference_id) IS NOT NULL
            AND (EXCLUDED.provider_kind NOT IN ('oauth','webhook') OR EXCLUDED.callback_ready) THEN NULL
          WHEN EXCLUDED.mode = 'test' THEN 'DETERMINISTIC_TEST_ADAPTER'
          WHEN EXCLUDED.mode = 'disabled' THEN 'PROVIDER_DISABLED'
          WHEN COALESCE(EXCLUDED.secret_reference_id, shared_provider_configs.secret_reference_id) IS NULL THEN 'LIVE_CREDENTIAL_REFERENCE_MISSING'
          ELSE 'LIVE_CALLBACK_NOT_READY'
        END,
        last_health_at = NOW(), updated_by_user_id = EXCLUDED.updated_by_user_id,
        version = shared_provider_configs.version + 1, updated_at = NOW()
      WHERE (${input.expectedVersion ?? null}::int IS NULL OR shared_provider_configs.version = ${input.expectedVersion ?? null})
      RETURNING *
    `);
    if (!result.rows[0]) throw Object.assign(new Error('Provider configuration version conflict'), { code: 'PROVIDER_VERSION_CONFLICT' });
    const row = result.rows[0] as Record<string, unknown>;
    if (row.secret_reference_id) {
      const fingerprint = await tx.execute(sql`
        SELECT fingerprint FROM shared_secret_references
        WHERE tenant_id = ${input.tenantId} AND id = ${String(row.secret_reference_id)} LIMIT 1
      `);
      row.fingerprint = fingerprint.rows[0]?.fingerprint;
    }
    return providerJson(row);
  });
}

export async function listProviderConfigurations(tenantId: string, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT config.*, secret.fingerprint
    FROM shared_provider_configs config
    LEFT JOIN shared_secret_references secret
      ON secret.tenant_id = config.tenant_id AND secret.id = config.secret_reference_id
    WHERE config.tenant_id = ${tenantId}
    ORDER BY config.provider_kind, config.provider_key
  `);
  return result.rows.map(row => providerJson(row as Record<string, unknown>));
}

export async function getSharedPlatformOverview(tenantId: string) {
  const [providers, runtimeProviders, queueHealth, counts] = await Promise.all([
    listProviderConfigurations(tenantId),
    getSharedProviderStatuses(),
    getSharedServiceQueueHealth(),
    db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM shared_attachments WHERE tenant_id = ${tenantId} AND scan_status IN ('pending','unavailable','infected','error') AND deleted_at IS NULL) AS quarantined_attachments,
        (SELECT COUNT(*)::int FROM shared_service_identities WHERE tenant_id = ${tenantId} AND status = 'active') AS service_identities,
        (SELECT COUNT(*)::int FROM shared_api_tokens WHERE tenant_id = ${tenantId} AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())) AS active_api_tokens,
        (SELECT COUNT(*)::int FROM shared_webhook_endpoints WHERE tenant_id = ${tenantId} AND enabled = TRUE AND archived_at IS NULL) AS webhook_endpoints,
        (SELECT COUNT(*)::int FROM shared_exports WHERE tenant_id = ${tenantId} AND status IN ('pending','processing','retry')) AS open_exports,
        (SELECT COALESCE(SUM(units),0)::bigint FROM shared_usage_events WHERE tenant_id = ${tenantId} AND unit_kind = 'credits') AS credits_consumed
    `),
  ]);
  return {
    providers,
    runtimeProviders,
    secretVault: getSharedSecretVaultReadiness(),
    attachments: getAttachmentServiceStatus(),
    worker: getSharedServiceWorkerStatus(),
    queues: queueHealth,
    counts: counts.rows[0] ?? {},
  };
}

export async function listSharedPlatformOperations(input: { tenantId: string; limit?: number }, executor: Executor = db) {
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const [jobs, attachments, webhooks, exports, tokens, usage] = await Promise.all([
    executor.execute(sql`SELECT id, module_id, handler_key, status, attempt_count, max_attempts, last_error_code, run_at, created_at FROM shared_jobs WHERE tenant_id = ${input.tenantId} ORDER BY created_at DESC LIMIT ${limit}`),
    executor.execute(sql`SELECT id, module_id, original_name, detected_mime_type, size_bytes, scan_status, retention_until, created_at FROM shared_attachments WHERE tenant_id = ${input.tenantId} AND deleted_at IS NULL ORDER BY created_at DESC LIMIT ${limit}`),
    executor.execute(sql`SELECT delivery.id, delivery.module_id, endpoint.name AS endpoint_name, delivery.event_type, delivery.status, delivery.attempt_count, delivery.last_error_code, delivery.created_at FROM shared_webhook_deliveries delivery JOIN shared_webhook_endpoints endpoint ON endpoint.tenant_id = delivery.tenant_id AND endpoint.id = delivery.endpoint_id WHERE delivery.tenant_id = ${input.tenantId} ORDER BY delivery.created_at DESC LIMIT ${limit}`),
    executor.execute(sql`SELECT id, module_id, export_type, format, status, result_attachment_id, last_error_code, created_at, completed_at, expires_at FROM shared_exports WHERE tenant_id = ${input.tenantId} ORDER BY created_at DESC LIMIT ${limit}`),
    executor.execute(sql`SELECT token.id, token.service_identity_id, identity.name AS identity_name, token.name, token.token_prefix, token.scopes_json, token.expires_at, token.last_used_at, token.revoked_at, token.created_at FROM shared_api_tokens token JOIN shared_service_identities identity ON identity.tenant_id = token.tenant_id AND identity.id = token.service_identity_id WHERE token.tenant_id = ${input.tenantId} ORDER BY token.created_at DESC LIMIT ${limit}`),
    executor.execute(sql`SELECT module_id, operation, unit_kind, SUM(units)::bigint AS units, MAX(occurred_at) AS last_occurred_at FROM shared_usage_events WHERE tenant_id = ${input.tenantId} GROUP BY module_id, operation, unit_kind ORDER BY last_occurred_at DESC LIMIT ${limit}`),
  ]);
  return { jobs: jobs.rows, attachments: attachments.rows, webhooks: webhooks.rows, exports: exports.rows, tokens: tokens.rows, usage: usage.rows };
}

export async function retryDeadLetter(input: { tenantId: string; kind: 'job' | 'webhook' | 'outbox'; id: string }, executor: Executor = db) {
  const result = input.kind === 'job'
    ? await executor.execute(sql`
        UPDATE shared_jobs SET status = 'retry', run_at = NOW(), lease_owner = NULL,
          lease_expires_at = NULL, last_error_code = NULL, updated_at = NOW()
        WHERE tenant_id = ${input.tenantId} AND id = ${input.id} AND status IN ('dead_letter','disabled')
        RETURNING id, status
      `)
    : input.kind === 'webhook'
      ? await executor.execute(sql`
          UPDATE shared_webhook_deliveries SET status = 'retry', available_at = NOW(), lease_owner = NULL,
            lease_expires_at = NULL, last_error_code = NULL, updated_at = NOW()
          WHERE tenant_id = ${input.tenantId} AND id = ${input.id} AND status IN ('dead_letter','disabled')
          RETURNING id, status
        `)
      : await executor.execute(sql`
          UPDATE shared_outbox_messages SET status = 'retry', available_at = NOW(), lease_owner = NULL,
            lease_expires_at = NULL, last_error_code = NULL, updated_at = NOW()
          WHERE tenant_id = ${input.tenantId} AND id = ${input.id} AND status IN ('dead_letter','disabled')
          RETURNING id, status
        `);
  return result.rows[0] ?? null;
}

export async function createServiceIdentityAndToken(input: {
  tenantId: string;
  moduleId?: string | null;
  actorUserId: string;
  identityName: string;
  tokenName: string;
  description?: string | null;
  scopes: string[];
  expiresAt?: Date | null;
}) {
  const scopes = [...new Set(input.scopes)].filter(scope => SHARED_API_TOKEN_SCOPES.includes(scope as any));
  if (!input.identityName.trim() || !input.tokenName.trim() || scopes.length !== input.scopes.length || scopes.length === 0) {
    throw Object.assign(new Error('Identity name, token name, and recognized scopes are required'), { code: 'SERVICE_IDENTITY_INVALID' });
  }
  const rawToken = `oos_${randomBytes(32).toString('base64url')}`;
  const hash = createHash('sha256').update(rawToken).digest('hex');
  const prefix = rawToken.slice(0, 12);
  const result = await db.transaction(async tx => {
    const identity = await tx.execute(sql`
      INSERT INTO shared_service_identities (tenant_id, module_id, name, description, created_by_user_id)
      VALUES (${input.tenantId}, ${input.moduleId ?? null}, ${input.identityName.trim().slice(0, 120)},
        ${input.description?.trim().slice(0, 500) ?? null}, ${input.actorUserId})
      RETURNING id, tenant_id, module_id, name, description, status, created_at
    `);
    const identityId = String(identity.rows[0]!.id);
    const token = await tx.execute(sql`
      INSERT INTO shared_api_tokens (
        tenant_id, service_identity_id, name, token_prefix, token_hash,
        scopes_json, created_by_user_id, expires_at
      ) VALUES (
        ${input.tenantId}, ${identityId}, ${input.tokenName.trim().slice(0, 120)},
        ${prefix}, ${hash}, ${JSON.stringify(scopes)}::jsonb, ${input.actorUserId}, ${input.expiresAt ?? null}
      ) RETURNING id, service_identity_id, name, token_prefix, scopes_json, expires_at, created_at
    `);
    return { identity: identity.rows[0], token: token.rows[0] };
  });
  return { ...result, rawToken };
}

export async function revokeApiToken(input: { tenantId: string; tokenId: string }, executor: Executor = db) {
  const result = await executor.execute(sql`
    UPDATE shared_api_tokens SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE tenant_id = ${input.tenantId} AND id = ${input.tokenId} AND revoked_at IS NULL
    RETURNING id, revoked_at
  `);
  return result.rows[0] ?? null;
}

export async function authenticateSharedApiToken(input: {
  rawToken: string;
  requiredScope: string;
  tenantId?: string | null;
}, executor: Executor = db) {
  if (!input.rawToken.startsWith('oos_') || !SHARED_API_TOKEN_SCOPES.includes(input.requiredScope as any)) return null;
  const hash = createHash('sha256').update(input.rawToken).digest('hex');
  const result = await executor.execute(sql`
    SELECT token.id, token.tenant_id, identity.module_id, identity.name AS service_identity_name,
      token.scopes_json, token.expires_at
    FROM shared_api_tokens token
    JOIN shared_service_identities identity
      ON identity.tenant_id = token.tenant_id AND identity.id = token.service_identity_id
    WHERE token.token_hash = ${hash} AND token.revoked_at IS NULL
      AND identity.status = 'active' AND identity.revoked_at IS NULL
      AND (token.expires_at IS NULL OR token.expires_at > NOW())
      AND token.scopes_json ? ${input.requiredScope}
      AND (${input.tenantId ?? null}::text IS NULL OR token.tenant_id = ${input.tenantId ?? null})
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  await executor.execute(sql`UPDATE shared_api_tokens SET last_used_at = NOW() WHERE id = ${String(row.id)} AND tenant_id = ${String(row.tenant_id)}`);
  return {
    tokenId: String(row.id), tenantId: String(row.tenant_id),
    moduleId: row.module_id ? String(row.module_id) : null,
    serviceIdentityName: String(row.service_identity_name), scopes: row.scopes_json as string[],
  };
}

export async function setSharedFeatureFlag(input: {
  tenantId: string;
  moduleId?: string | null;
  flagKey: string;
  enabled: boolean;
  value?: Record<string, unknown>;
  actorUserId: string;
  expectedVersion?: number | null;
}, executor: Executor = db) {
  if (!/^[a-z0-9][a-z0-9._:-]{1,159}$/i.test(input.flagKey)) throw Object.assign(new Error('Feature flag key is invalid'), { code: 'FEATURE_FLAG_KEY_INVALID' });
  const value = sanitizeSharedMetadata(input.value);
  const result = await executor.execute(sql`
    INSERT INTO shared_feature_flags (
      tenant_id, module_id, scope_key, flag_key, enabled, value_json, updated_by_user_id
    ) VALUES (${input.tenantId}, ${input.moduleId ?? null}, ${scopeKey(input.moduleId)}, ${input.flagKey},
      ${input.enabled}, ${value}, ${input.actorUserId})
    ON CONFLICT (tenant_id, scope_key, flag_key) DO UPDATE SET
      enabled = EXCLUDED.enabled, value_json = EXCLUDED.value_json,
      updated_by_user_id = EXCLUDED.updated_by_user_id,
      version = shared_feature_flags.version + 1, updated_at = NOW()
    WHERE (${input.expectedVersion ?? null}::int IS NULL OR shared_feature_flags.version = ${input.expectedVersion ?? null})
    RETURNING id, module_id, flag_key, enabled, value_json, source, version, updated_at
  `);
  if (!result.rows[0]) throw Object.assign(new Error('Feature flag version conflict'), { code: 'FEATURE_FLAG_VERSION_CONFLICT' });
  return result.rows[0];
}

export async function listSharedFeatureFlags(input: { tenantId: string; moduleId?: string | null }, executor: Executor = db) {
  const result = await executor.execute(sql`
    SELECT id, module_id, flag_key, enabled, value_json, source, version, updated_at
    FROM shared_feature_flags WHERE tenant_id = ${input.tenantId}
      AND (${input.moduleId ?? null}::text IS NULL OR module_id = ${input.moduleId ?? null} OR module_id IS NULL)
    ORDER BY flag_key
  `);
  return result.rows;
}

export async function upsertSharedSearchDocument(input: {
  tenantId: string;
  moduleId: string;
  objectType: string;
  objectId: string;
  title: string;
  summary?: string | null;
  deepLink: string;
  provenance?: Record<string, unknown>;
}, executor: Executor = db) {
  if (!input.deepLink.startsWith('/') || input.deepLink.startsWith('//')) throw Object.assign(new Error('Deep link must be a relative platform path'), { code: 'SEARCH_DEEP_LINK_INVALID' });
  const provenance = sanitizeSharedMetadata(input.provenance);
  const searchText = `${input.title} ${input.summary ?? ''} ${input.objectType} ${input.objectId}`.trim();
  const result = await executor.execute(sql`
    INSERT INTO shared_search_documents (
      tenant_id, module_id, object_type, object_id, title, summary, deep_link, search_text, provenance_json
    ) VALUES (${input.tenantId}, ${input.moduleId}, ${input.objectType}, ${input.objectId}, ${input.title},
      ${input.summary ?? null}, ${input.deepLink}, ${searchText}, ${provenance})
    ON CONFLICT (tenant_id, module_id, object_type, object_id) DO UPDATE SET
      title = EXCLUDED.title, summary = EXCLUDED.summary, deep_link = EXCLUDED.deep_link,
      search_text = EXCLUDED.search_text, provenance_json = EXCLUDED.provenance_json,
      updated_at = NOW(), deleted_at = NULL
    RETURNING *
  `);
  return result.rows[0];
}

export async function searchSharedDocuments(input: { tenantId: string; query: string; limit?: number }, executor: Executor = db) {
  const query = input.query.trim().slice(0, 120);
  if (query.length < 2) return [];
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const result = await executor.execute(sql`
    SELECT document.id, document.module_id, module.slug AS module_slug, document.object_type,
      document.object_id, document.title, document.summary, document.deep_link, document.updated_at
    FROM shared_search_documents document
    JOIN modules module ON module.id = document.module_id
    WHERE document.tenant_id = ${input.tenantId} AND document.deleted_at IS NULL
      AND document.search_text ILIKE ${`%${query.replace(/[\\%_]/g, '\\$&')}%`} ESCAPE '\\'
    ORDER BY document.updated_at DESC LIMIT ${limit}
  `);
  return result.rows;
}

export async function createAttachmentDownloadGrant(input: {
  tenantId: string;
  moduleId: string;
  attachmentId: string;
  actorUserId: string;
  ttlSeconds?: number;
  maxUses?: number;
}, executor: Executor = db) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + Math.max(60, Math.min(3600, input.ttlSeconds ?? 300)) * 1000);
  const maxUses = Math.max(1, Math.min(20, input.maxUses ?? 1));
  const result = await executor.execute(sql`
    INSERT INTO shared_download_grants (
      tenant_id, module_id, attachment_id, token_hash, created_by_user_id, expires_at, max_uses
    ) SELECT ${input.tenantId}, ${input.moduleId}, attachment.id, ${tokenHash}, ${input.actorUserId}, ${expiresAt}, ${maxUses}
    FROM shared_attachments attachment
    WHERE attachment.tenant_id = ${input.tenantId} AND attachment.module_id = ${input.moduleId}
      AND attachment.id = ${input.attachmentId} AND attachment.deleted_at IS NULL
      AND attachment.scan_status IN ('clean','unavailable')
    RETURNING id, expires_at, max_uses
  `);
  if (!result.rows[0]) throw Object.assign(new Error('Attachment is unavailable or quarantined'), { code: 'ATTACHMENT_DOWNLOAD_UNAVAILABLE' });
  return { token, ...result.rows[0] };
}

export async function consumeAttachmentDownloadGrant(token: string) {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const grant = await db.transaction(async tx => {
    const result = await tx.execute(sql`
      UPDATE shared_download_grants SET use_count = use_count + 1
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > NOW() AND use_count < max_uses
      RETURNING tenant_id, module_id, attachment_id
    `);
    return result.rows[0] as any;
  });
  if (!grant) return null;
  return getAttachmentContent({
    tenantId: String(grant.tenant_id), moduleId: String(grant.module_id), attachmentId: String(grant.attachment_id),
  });
}
