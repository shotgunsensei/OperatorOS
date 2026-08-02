import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  OutCallValidationError,
  fingerprint,
  parseOutCallReauthentication,
  parsePhoneVerification,
  parsePhoneVerificationStart,
  parseProfile,
  parseSchedule,
  parseTrigger,
  protect,
  unprotect,
} from '../lib/outcall.js';
import {
  OutCallProviderError,
  confirmOutCallPhoneVerification,
  isOutCallInboundNumber,
  normalizeOutCallProviderPhone,
  outCallProviderState,
  placeOutCallVoice,
  startOutCallPhoneVerification,
  verifyOutCallTwilioSignature,
} from '../lib/outcall-provider.js';
import { enqueueSharedJob, registerSharedJobHandler } from '../lib/shared-background-jobs.js';
import { appendActivityEvent, recordUsageEvent, summarizeUsage } from '../lib/shared-usage-activity.js';
import { receiveVerifiedWebhook, registerSharedWebhookHandler } from '../lib/shared-webhooks.js';
import { verifyPassword } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';
import { resolveEntitlements } from '../lib/entitlement-resolver.js';

const readGuards = [requireTenantModuleAccess('outcall')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const OUTCALL_JOB = 'outcall.place_verified_call.v1';
const OUTCALL_STATUS_WEBHOOK = 'outcall.twilio.voice.status.v1';
const OUTCALL_GATHER_WEBHOOK = 'outcall.twilio.voice.gather.v1';
const OUTCALL_SMS_WEBHOOK = 'outcall.twilio.sms.v1';
type Row = Record<string, any>;

function context(request: FastifyRequest) {
  return {
    tenantId: String((request as any).tenantContext.tenantId),
    userId: String((request as any).user.id),
  };
}

function camel(row: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    result[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())] = value;
  }
  delete result.tenantId;
  delete result.userId;
  delete result.phoneCiphertext;
  delete result.phoneFingerprint;
  delete result.phraseCiphertext;
  delete result.phraseDigest;
  delete result.destinationFingerprint;
  return result;
}

function validation(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof OutCallValidationError)) return false;
  reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(error.field ? { field: error.field } : {}),
  });
  return true;
}

async function outcallModuleId(): Promise<string> {
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug='outcall' LIMIT 1`);
  if (!result.rows[0]) throw Object.assign(new Error('OutCall is not registered'), { code: 'OUTCALL_MODULE_NOT_REGISTERED' });
  return String(result.rows[0].id);
}

async function activity(request: FastifyRequest, objectType: string, objectId: string, eventType: string, summary: string) {
  const { tenantId, userId } = context(request);
  await appendActivityEvent({
    tenantId,
    moduleId: await outcallModuleId(),
    actorUserId: userId,
    objectType,
    objectId,
    eventType,
    summary,
    correlationId: request.id,
  });
}

function providerFailure(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof OutCallProviderError)) return false;
  reply.code(error.code === 'OUTCALL_COUNTRY_NOT_ALLOWED' ? 400 : 503).send({
    error: error.message,
    code: error.code,
  });
  return true;
}

function webhookBody(request: FastifyRequest): Record<string, string> {
  const value = request.body;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === 'string') result[key] = item;
  }
  return result;
}

function webhookBytes(request: FastifyRequest, body: Record<string, string>): Buffer {
  return (request as any).rawBody as Buffer | undefined ?? Buffer.from(JSON.stringify(body));
}

function twiml(reply: FastifyReply, body: string) {
  return reply
    .header('content-type', 'text/xml; charset=utf-8')
    .send(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`);
}

function mapProviderStatus(value: string): 'processing' | 'completed' | 'failed' {
  if (value === 'completed') return 'completed';
  if (['busy', 'no-answer', 'canceled', 'failed'].includes(value)) return 'failed';
  return 'processing';
}

async function consumeRateLimit(input: {
  tenantId: string;
  userId: string;
  scope: string;
  max: number;
  windowMs: number;
}): Promise<boolean> {
  const windowStartedAt = new Date(Math.floor(Date.now() / input.windowMs) * input.windowMs);
  const expiresAt = new Date(windowStartedAt.getTime() + input.windowMs * 2);
  const digest = fingerprint(`rate:${input.scope}`);
  const result = await db.execute(sql`
    INSERT INTO outcall_rate_limits (
      tenant_id,user_id,scope_digest,window_started_at,request_count,expires_at
    ) VALUES (${input.tenantId},${input.userId},${digest},${windowStartedAt},1,${expiresAt})
    ON CONFLICT (tenant_id,user_id,scope_digest,window_started_at) DO UPDATE SET
      request_count=outcall_rate_limits.request_count+1,updated_at=NOW()
    WHERE outcall_rate_limits.request_count < ${input.max}
    RETURNING request_count
  `);
  return Boolean(result.rows[0]);
}

async function persistVerifiedPhone(input: {
  tenantId: string;
  userId: string;
  phone: string;
  masked: string;
}): Promise<boolean> {
  const encrypted = protect(input.phone);
  const phoneFingerprint = fingerprint(`phone:${input.phone}`);
  return db.transaction(async (tx) => {
    // A settings row does not exist for a first verification, so lock the
    // central user row to serialize phone changes across all of the user's
    // tenants and avoid leaving a stale global ownership reservation.
    await tx.execute(sql`SELECT id FROM users WHERE id=${input.userId} FOR UPDATE`);
    const previous = await tx.execute(sql`
      SELECT phone_fingerprint FROM outcall_settings
      WHERE tenant_id=${input.tenantId} AND user_id=${input.userId}
      FOR UPDATE
    `);
    const previousFingerprint = previous.rows[0]?.phone_fingerprint
      ? String(previous.rows[0].phone_fingerprint)
      : null;
    const inserted = await tx.execute(sql`
      INSERT INTO outcall_phone_owners (
        phone_fingerprint,user_id,phone_ciphertext,phone_masked
      ) VALUES (${phoneFingerprint},${input.userId},${encrypted},${input.masked})
      ON CONFLICT (phone_fingerprint) DO NOTHING
      RETURNING user_id
    `);
    let ownerId = inserted.rows[0]?.user_id ? String(inserted.rows[0].user_id) : null;
    if (!ownerId) {
      const existing = await tx.execute(sql`
        SELECT user_id FROM outcall_phone_owners
        WHERE phone_fingerprint=${phoneFingerprint} LIMIT 1
      `);
      ownerId = existing.rows[0]?.user_id ? String(existing.rows[0].user_id) : null;
    }
    if (ownerId !== input.userId) return false;
    await tx.execute(sql`
      INSERT INTO outcall_settings (
        tenant_id,user_id,phone_ciphertext,phone_fingerprint,phone_masked,
        phone_verified_at,onboarding_step
      ) VALUES (
        ${input.tenantId},${input.userId},${encrypted},${phoneFingerprint},
        ${input.masked},NOW(),3
      )
      ON CONFLICT (tenant_id,user_id) DO UPDATE SET
        phone_ciphertext=EXCLUDED.phone_ciphertext,phone_fingerprint=EXCLUDED.phone_fingerprint,
        phone_masked=EXCLUDED.phone_masked,phone_verified_at=NOW(),
        onboarding_step=GREATEST(outcall_settings.onboarding_step,3),updated_at=NOW()
    `);
    if (previousFingerprint && previousFingerprint !== phoneFingerprint) {
      await tx.execute(sql`
        DELETE FROM outcall_phone_owners p
        WHERE p.phone_fingerprint=${previousFingerprint} AND p.user_id=${input.userId}
          AND NOT EXISTS (
            SELECT 1 FROM outcall_settings s
            WHERE s.phone_fingerprint=p.phone_fingerprint
          )
      `);
    }
    return true;
  });
}

async function requireRecentPassword(request: FastifyRequest, password: string): Promise<boolean> {
  const hash = String((request as any).user?.passwordHash ?? '');
  return Boolean(hash) && await verifyPassword(password, hash);
}

registerSharedJobHandler(OUTCALL_JOB, async (job) => {
  const requestId = String(job.payload.requestId ?? '');
  if (!requestId) throw Object.assign(new Error('OutCall job request is invalid'), { code: 'OUTCALL_JOB_INVALID' });

  const claimed = await db.execute(sql`
    UPDATE outcall_call_requests
    SET status='processing',started_at=NOW(),updated_at=NOW()
    WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='scheduled'
    RETURNING *
  `);
  const request = claimed.rows[0] as Row | undefined;
  if (!request) return;

  const provider = outCallProviderState();
  if (!provider.ready) {
    await db.execute(sql`
      UPDATE outcall_call_requests
      SET status='failed',failure_code='OUTCALL_PROVIDER_NOT_READY',completed_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='processing'
    `);
    throw Object.assign(new Error('OutCall provider is not ready'), { code: 'OUTCALL_PROVIDER_NOT_READY' });
  }

  if (provider.name === 'test') {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE outcall_call_requests
        SET status='completed',provider='test',completed_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='processing'
      `);
      await tx.execute(sql`
        INSERT INTO outcall_events (tenant_id,call_request_id,event_type,safe_payload)
        VALUES (${job.tenantId},${requestId},'test.completed',${JSON.stringify({ recording: false })}::jsonb)
      `);
      await recordUsageEvent({
        tenantId: job.tenantId,
        moduleId: job.moduleId,
        userId: String(request.user_id),
        operation: 'outcall.test_call',
        units: 1,
        unitKind: 'call',
        idempotencyKey: `call:${requestId}`,
        externalReference: requestId,
        metadata: { provider: 'test', recording: false },
      }, tx as any);
    });
    return;
  }

  const details = await db.execute(sql`
    SELECT s.phone_ciphertext,s.phone_fingerprint,p.message,p.voice,p.language
    FROM outcall_call_requests c
    JOIN outcall_settings s ON s.tenant_id=c.tenant_id AND s.user_id=c.user_id
    JOIN outcall_profiles p ON p.tenant_id=c.tenant_id AND p.id=c.profile_id
    WHERE c.tenant_id=${job.tenantId} AND c.id=${requestId}
      AND c.status='processing' AND p.active=TRUE AND p.deleted_at IS NULL
    LIMIT 1
  `);
  const detail = details.rows[0] as Row | undefined;
  if (!detail) {
    await db.execute(sql`
      UPDATE outcall_call_requests SET status='failed',failure_code='OUTCALL_CALL_CONFIGURATION_INVALID',
        completed_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='processing'
    `);
    throw Object.assign(new Error('OutCall request configuration is unavailable'), { code: 'OUTCALL_CALL_CONFIGURATION_INVALID' });
  }
  const destination = unprotect(String(detail.phone_ciphertext));
  if (fingerprint(`phone:${destination}`) !== String(detail.phone_fingerprint)
    || fingerprint(`phone:${destination}`) !== String(request.destination_fingerprint)) {
    await db.execute(sql`
      UPDATE outcall_call_requests SET status='failed',failure_code='OUTCALL_DESTINATION_INTEGRITY_FAILED',
        completed_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='processing'
    `);
    throw Object.assign(new Error('OutCall destination integrity check failed'), { code: 'OUTCALL_DESTINATION_INTEGRITY_FAILED' });
  }
  try {
    const placed = await placeOutCallVoice({
      requestId,
      destination,
      message: String(detail.message),
      voice: String(detail.voice),
      language: String(detail.language),
    });
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE outcall_call_requests
        SET provider='twilio',provider_call_sid=${placed.sid},updated_at=NOW()
        WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='processing'
      `);
      await tx.execute(sql`
        INSERT INTO outcall_events (tenant_id,call_request_id,event_type,safe_payload,provider_event_id)
        VALUES (${job.tenantId},${requestId},'provider.accepted',
          ${JSON.stringify({ provider: 'twilio', recording: false })}::jsonb,${`${placed.sid}:accepted`})
        ON CONFLICT DO NOTHING
      `);
      await recordUsageEvent({
        tenantId: job.tenantId,
        moduleId: job.moduleId,
        userId: String(request.user_id),
        operation: 'outcall.live_call',
        units: 1,
        unitKind: 'call',
        idempotencyKey: `call:${requestId}`,
        externalReference: requestId,
        metadata: { provider: 'twilio', recording: false },
      }, tx as any);
    });
  } catch (error) {
    const code = error instanceof OutCallProviderError ? error.code : 'OUTCALL_PROVIDER_FAILED';
    await db.execute(sql`
      UPDATE outcall_call_requests
      SET status='failed',failure_code=${code},completed_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='processing'
    `);
    throw error;
  }
});

registerSharedWebhookHandler(OUTCALL_STATUS_WEBHOOK, async (event) => {
  const callId = String(event.payload.callId ?? '');
  const status = String(event.payload.status ?? 'processing');
  const sid = String(event.payload.sid ?? '');
  if (!callId || !sid || !['processing', 'completed', 'failed'].includes(status)) {
    throw Object.assign(new Error('OutCall status event is invalid'), { code: 'OUTCALL_WEBHOOK_INVALID' });
  }
  await db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      UPDATE outcall_call_requests SET
        provider='twilio',provider_call_sid=COALESCE(provider_call_sid,${sid}),status=${status},
        completed_at=CASE WHEN ${status} IN ('completed','failed') THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
        failure_code=CASE WHEN ${status}='failed' THEN COALESCE(NULLIF(${String(event.payload.failureCode ?? '')},''),'OUTCALL_PROVIDER_FAILED') ELSE failure_code END,
        updated_at=NOW()
      WHERE tenant_id=${event.tenantId} AND id=${callId}
        AND status IN ('processing','completed','failed')
        AND (provider_call_sid IS NULL OR provider_call_sid=${sid})
      RETURNING id
    `);
    if (!result.rows[0]) throw Object.assign(new Error('OutCall call was not found'), { code: 'OUTCALL_CALL_NOT_FOUND' });
    await tx.execute(sql`
      INSERT INTO outcall_events (tenant_id,call_request_id,event_type,safe_payload,provider_event_id)
      VALUES (${event.tenantId},${callId},${`provider.status.${status}`},
        ${JSON.stringify({ provider: 'twilio', status })}::jsonb,${event.providerEventId})
      ON CONFLICT DO NOTHING
    `);
  });
});

registerSharedWebhookHandler(OUTCALL_GATHER_WEBHOOK, async (event) => {
  const callId = String(event.payload.callId ?? '');
  const confirmed = event.payload.confirmed === true;
  if (!callId) throw Object.assign(new Error('OutCall gather event is invalid'), { code: 'OUTCALL_WEBHOOK_INVALID' });
  await db.execute(sql`
    INSERT INTO outcall_events (tenant_id,call_request_id,event_type,safe_payload,provider_event_id)
    SELECT ${event.tenantId},id,'provider.dtmf',${JSON.stringify({ confirmed })}::jsonb,${event.providerEventId}
    FROM outcall_call_requests
    WHERE tenant_id=${event.tenantId} AND id=${callId} AND provider='twilio'
    ON CONFLICT DO NOTHING
  `);
});

registerSharedWebhookHandler(OUTCALL_SMS_WEBHOOK, async (event) => {
  const userId = String(event.payload.userId ?? '');
  const triggerId = String(event.payload.triggerId ?? '');
  const messageSid = String(event.payload.messageSid ?? '');
  if (!userId || !triggerId || !messageSid) {
    throw Object.assign(new Error('OutCall SMS event is invalid'), { code: 'OUTCALL_WEBHOOK_INVALID' });
  }
  const trigger = await db.execute(sql`
    SELECT t.profile_id,t.delay_seconds,s.phone_fingerprint,s.phone_masked
    FROM outcall_triggers t
    JOIN outcall_settings s ON s.tenant_id=t.tenant_id AND s.user_id=t.user_id
    JOIN outcall_profiles p ON p.tenant_id=t.tenant_id AND p.id=t.profile_id
    WHERE t.tenant_id=${event.tenantId} AND t.user_id=${userId} AND t.id=${triggerId}
      AND t.enabled=TRUE AND t.deleted_at IS NULL AND p.active=TRUE AND p.deleted_at IS NULL
      AND s.phone_verified_at IS NOT NULL AND s.disclaimer_accepted_at IS NOT NULL
    LIMIT 1
  `);
  const row = trigger.rows[0] as Row | undefined;
  if (!row) throw Object.assign(new Error('OutCall trigger is unavailable'), { code: 'OUTCALL_TRIGGER_NOT_FOUND' });
  const runAt = new Date(Date.now() + Number(row.delay_seconds) * 1000);
  await db.transaction(async (tx) => {
    const created = await tx.execute(sql`
      INSERT INTO outcall_call_requests (
        tenant_id,user_id,profile_id,destination_fingerprint,destination_masked,
        source,status,provider,idempotency_key,scheduled_at
      ) VALUES (${event.tenantId},${userId},${String(row.profile_id)},${String(row.phone_fingerprint)},
        ${String(row.phone_masked)},'sms','scheduled','twilio',${`twilio:sms:${messageSid}`},${runAt})
      ON CONFLICT (tenant_id,user_id,idempotency_key) DO NOTHING
      RETURNING id
    `);
    const requestId = created.rows[0]?.id ? String(created.rows[0].id) : null;
    if (requestId) {
      await enqueueSharedJob({
        tenantId: event.tenantId,
        moduleId: event.moduleId,
        requestedByUserId: userId,
        handlerKey: OUTCALL_JOB,
        payload: { requestId },
        idempotencyKey: `call:${requestId}`,
        correlationId: event.correlationId,
        runAt,
        maxAttempts: 1,
      }, tx as any);
      await tx.execute(sql`
        UPDATE outcall_triggers SET last_used_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${event.tenantId} AND user_id=${userId} AND id=${triggerId}
      `);
    }
  });
});

export async function registerOutCallRoutes(app: FastifyInstance) {
  app.get('/v1/modules/outcall/health', async () => ({
    status: 'ok',
    module: 'outcall',
    provider: outCallProviderState().ready ? 'configured' : 'disabled',
  }));

  app.get('/v1/modules/outcall/workspace', { preHandler: readGuards }, async (request) => {
    const { tenantId, userId } = context(request);
    const moduleId = await outcallModuleId();
    const [settings, profiles, triggers, calls, usage] = await Promise.all([
      db.execute(sql`
        SELECT tenant_id,user_id,phone_masked,phone_verified_at,timezone,privacy_mode,
          disclaimer_accepted_at,onboarding_step,created_at,updated_at
        FROM outcall_settings WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1
      `),
      db.execute(sql`
        SELECT * FROM outcall_profiles
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 100
      `),
      db.execute(sql`
        SELECT id,tenant_id,user_id,profile_id,neutral_reply,delay_seconds,enabled,last_used_at,created_at,updated_at
        FROM outcall_triggers
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 100
      `),
      db.execute(sql`
        SELECT id,tenant_id,user_id,profile_id,destination_masked,source,status,provider,
          scheduled_at,started_at,completed_at,canceled_at,failure_code,created_at,updated_at
        FROM outcall_call_requests
        WHERE tenant_id=${tenantId} AND user_id=${userId}
        ORDER BY created_at DESC LIMIT 100
      `),
      summarizeUsage({ tenantId, moduleId, userId }),
    ]);
    const provider = outCallProviderState();
    return {
      settings: settings.rows[0] ? camel(settings.rows[0] as Row) : null,
      profiles: profiles.rows.map(row => camel(row as Row)),
      triggers: triggers.rows.map(row => camel(row as Row)),
      calls: calls.rows.map(row => camel(row as Row)),
      usage: usage.map(row => camel(row as Row)),
      provider,
      safety: {
        emergencyReplacement: false,
        recording: false,
        arbitraryDestinations: false,
        trustedContactsEnabled: false,
        checkInsEnabled: false,
        duressEnabled: false,
        locationEnabled: false,
      },
    };
  });

  app.post('/v1/modules/outcall/onboarding/accept-safety', { preHandler: writeGuards }, async (request, reply) => {
    const value = request.body as Record<string, unknown> | null;
    if (!value || value.accepted !== true) {
      return reply.code(400).send({ error: 'The OutCall safety disclaimer must be accepted', code: 'OUTCALL_DISCLAIMER_REQUIRED' });
    }
    const { tenantId, userId } = context(request);
    await db.execute(sql`
      INSERT INTO outcall_settings (tenant_id,user_id,disclaimer_accepted_at,onboarding_step)
      VALUES (${tenantId},${userId},NOW(),1)
      ON CONFLICT (tenant_id,user_id) DO UPDATE SET
        disclaimer_accepted_at=NOW(),onboarding_step=GREATEST(outcall_settings.onboarding_step,1),updated_at=NOW()
    `);
    await activity(request, 'outcall_settings', userId, 'safety.accepted', 'OutCall safety disclaimer accepted.');
    return { accepted: true };
  });

  app.post('/v1/modules/outcall/phone-verification', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parsePhoneVerification(request.body);
      const provider = outCallProviderState();
      if (!provider.ready || provider.name !== 'test') {
        return reply.code(503).send({
          error: 'The compatibility verification route is available only to isolated tests',
          code: 'OUTCALL_VERIFY_NOT_READY',
        });
      }
      if (input.verificationCode !== '000000') {
        return reply.code(400).send({ error: 'Verification could not be completed', code: 'OUTCALL_VERIFY_FAILED' });
      }
      const { tenantId, userId } = context(request);
      const ownership = await persistVerifiedPhone({ tenantId, userId, ...input });
      if (!ownership) {
        return reply.code(409).send({ error: 'This number is already verified to another account', code: 'OUTCALL_PHONE_OWNERSHIP_CONFLICT' });
      }
      await activity(request, 'outcall_settings', userId, 'phone.verified', 'OutCall phone ownership verified.');
      return { verified: true, phoneMasked: input.masked };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/outcall/phone-verification/start', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parsePhoneVerificationStart(request.body);
      const provider = outCallProviderState();
      if (!provider.ready || provider.name !== 'twilio') {
        return reply.code(503).send({ error: provider.reason, code: 'OUTCALL_VERIFY_NOT_READY' });
      }
      const { tenantId, userId } = context(request);
      if (!await consumeRateLimit({ tenantId, userId, scope: 'verify-start', max: 3, windowMs: 15 * 60_000 })) {
        return reply.code(429).send({ error: 'Please wait before requesting another verification code', code: 'OUTCALL_RATE_LIMITED' });
      }
      await startOutCallPhoneVerification(input.phone);
      await activity(request, 'outcall_settings', userId, 'phone.verification_started', 'OutCall phone verification started.');
      return { started: true, phoneMasked: input.masked };
    } catch (error) {
      if (validation(reply, error) || providerFailure(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/outcall/phone-verification/confirm', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parsePhoneVerification(request.body);
      const provider = outCallProviderState();
      if (!provider.ready || provider.name !== 'twilio') {
        return reply.code(503).send({ error: provider.reason, code: 'OUTCALL_VERIFY_NOT_READY' });
      }
      const { tenantId, userId } = context(request);
      if (!await consumeRateLimit({ tenantId, userId, scope: 'verify-confirm', max: 8, windowMs: 15 * 60_000 })) {
        return reply.code(429).send({ error: 'Please wait before checking another verification code', code: 'OUTCALL_RATE_LIMITED' });
      }
      if (!await confirmOutCallPhoneVerification(input.phone, input.verificationCode)) {
        return reply.code(400).send({ error: 'Verification could not be completed', code: 'OUTCALL_VERIFY_FAILED' });
      }
      const ownership = await persistVerifiedPhone({ tenantId, userId, ...input });
      if (!ownership) {
        return reply.code(409).send({ error: 'This number is already verified to another account', code: 'OUTCALL_PHONE_OWNERSHIP_CONFLICT' });
      }
      await activity(request, 'outcall_settings', userId, 'phone.verified', 'OutCall phone ownership verified.');
      return { verified: true, phoneMasked: input.masked };
    } catch (error) {
      if (validation(reply, error) || providerFailure(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/outcall/profiles', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseProfile(request.body);
      const { tenantId, userId } = context(request);
      const result = await db.execute(sql`
        INSERT INTO outcall_profiles (tenant_id,user_id,name,message,voice,language)
        VALUES (${tenantId},${userId},${input.name},${input.message},${input.voice},${input.language})
        RETURNING *
      `);
      const created = result.rows[0] as Row;
      await activity(request, 'outcall_profile', String(created.id), 'profile.created', 'OutCall rescue profile created.');
      return reply.code(201).send({ profile: camel(created) });
    } catch (error) {
      if (validation(reply, error)) return;
      if (String((error as any)?.code) === '23505') {
        return reply.code(409).send({ error: 'A profile with this name already exists', code: 'OUTCALL_PROFILE_CONFLICT' });
      }
      throw error;
    }
  });

  app.post('/v1/modules/outcall/triggers', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseTrigger(request.body);
      const { tenantId, userId } = context(request);
      const result = await db.execute(sql`
        INSERT INTO outcall_triggers (
          tenant_id,user_id,profile_id,phrase_ciphertext,phrase_digest,neutral_reply,delay_seconds
        ) SELECT
          ${tenantId},${userId},p.id,${input.ciphertext},${input.digest},${input.neutralReply},${input.delaySeconds}
        FROM outcall_profiles p
        WHERE p.tenant_id=${tenantId} AND p.user_id=${userId} AND p.id=${input.profileId}
          AND p.active=TRUE AND p.deleted_at IS NULL
        RETURNING id,tenant_id,user_id,profile_id,neutral_reply,delay_seconds,enabled,created_at,updated_at
      `);
      if (!result.rows[0]) {
        return reply.code(404).send({ error: 'Rescue profile not found', code: 'OUTCALL_PROFILE_NOT_FOUND' });
      }
      const created = result.rows[0] as Row;
      await activity(request, 'outcall_trigger', String(created.id), 'trigger.created', 'Private OutCall trigger created.');
      return reply.code(201).send({ trigger: camel(created) });
    } catch (error) {
      if (validation(reply, error)) return;
      if (String((error as any)?.code) === '23505') {
        return reply.code(409).send({ error: 'This private trigger already exists', code: 'OUTCALL_TRIGGER_CONFLICT' });
      }
      throw error;
    }
  });

  app.post('/v1/modules/outcall/calls', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseSchedule(request.body);
      const provider = outCallProviderState();
      if (!provider.ready) {
        return reply.code(503).send({ error: provider.reason, code: 'OUTCALL_PROVIDER_NOT_READY' });
      }
      const { tenantId, userId } = context(request);
      if (!await consumeRateLimit({ tenantId, userId, scope: 'schedule', max: 5, windowMs: 5 * 60_000 })) {
        return reply.code(429).send({ error: 'Please wait before scheduling another call', code: 'OUTCALL_RATE_LIMITED' });
      }
      const moduleId = await outcallModuleId();
      const result = await db.transaction(async (tx) => {
        const settings = await tx.execute(sql`
          SELECT phone_fingerprint,phone_masked,phone_verified_at,disclaimer_accepted_at
          FROM outcall_settings WHERE tenant_id=${tenantId} AND user_id=${userId} FOR UPDATE
        `);
        const current = settings.rows[0] as Row | undefined;
        if (!current?.disclaimer_accepted_at) return { state: 'disclaimer' as const };
        if (!current?.phone_verified_at) return { state: 'phone' as const };
        const profile = await tx.execute(sql`
          SELECT id FROM outcall_profiles
          WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${input.profileId}
            AND active=TRUE AND deleted_at IS NULL LIMIT 1
        `);
        if (!profile.rows[0]) return { state: 'profile' as const };
        const inserted = await tx.execute(sql`
          INSERT INTO outcall_call_requests (
            tenant_id,user_id,profile_id,destination_fingerprint,destination_masked,
            source,status,provider,idempotency_key,scheduled_at
          ) VALUES (
            ${tenantId},${userId},${input.profileId},${String(current.phone_fingerprint)},
            ${String(current.phone_masked)},'web','scheduled',${provider.name},
            ${input.idempotencyKey},${input.runAt}
          )
          ON CONFLICT (tenant_id,user_id,idempotency_key) DO NOTHING
          RETURNING *
        `);
        let row = inserted.rows[0] as Row | undefined;
        const duplicate = !row;
        if (!row) {
          const existing = await tx.execute(sql`
            SELECT * FROM outcall_call_requests
            WHERE tenant_id=${tenantId} AND user_id=${userId} AND idempotency_key=${input.idempotencyKey}
          `);
          row = existing.rows[0] as Row;
        }
        await enqueueSharedJob({
          tenantId,
          moduleId,
          requestedByUserId: userId,
          handlerKey: OUTCALL_JOB,
          payload: { requestId: String(row.id) },
          idempotencyKey: `call:${String(row.id)}`,
          correlationId: request.id,
          runAt: input.runAt,
          maxAttempts: provider.name === 'test' ? 3 : 1,
        }, tx as any);
        return { state: 'ok' as const, row, duplicate };
      });
      if (result.state === 'disclaimer') return reply.code(409).send({ error: 'Accept the safety disclaimer first', code: 'OUTCALL_DISCLAIMER_REQUIRED' });
      if (result.state === 'phone') return reply.code(409).send({ error: 'Verify your own mobile number first', code: 'OUTCALL_PHONE_REQUIRED' });
      if (result.state === 'profile') return reply.code(404).send({ error: 'Rescue profile not found', code: 'OUTCALL_PROFILE_NOT_FOUND' });
      await activity(request, 'outcall_call', String(result.row.id), 'call.scheduled', 'Verified-self OutCall request scheduled.');
      return reply.code(result.duplicate ? 200 : 201).send({ call: camel(result.row), replayed: result.duplicate });
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.put('/v1/modules/outcall/profiles/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseProfile(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const result = await db.execute(sql`
        UPDATE outcall_profiles SET name=${input.name},message=${input.message},voice=${input.voice},
          language=${input.language},version=version+1,updated_at=NOW()
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND deleted_at IS NULL
        RETURNING *
      `);
      if (!result.rows[0]) return reply.code(404).send({ error: 'Rescue profile not found', code: 'OUTCALL_PROFILE_NOT_FOUND' });
      await activity(request, 'outcall_profile', id, 'profile.updated', 'OutCall rescue profile updated.');
      return { profile: camel(result.rows[0] as Row) };
    } catch (error) {
      if (validation(reply, error)) return;
      if (String((error as any)?.code) === '23505') {
        return reply.code(409).send({ error: 'A profile with this name already exists', code: 'OUTCALL_PROFILE_CONFLICT' });
      }
      throw error;
    }
  });

  app.delete('/v1/modules/outcall/profiles/:id', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const id = String((request.params as any).id);
    const result = await db.transaction(async (tx) => {
      const pending = await tx.execute(sql`
        SELECT id FROM outcall_call_requests
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND profile_id=${id}
          AND status IN ('scheduled','processing') LIMIT 1
      `);
      if (pending.rows[0]) return { state: 'pending' as const };
      const profile = await tx.execute(sql`
        UPDATE outcall_profiles SET active=FALSE,deleted_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND deleted_at IS NULL
        RETURNING id
      `);
      if (!profile.rows[0]) return { state: 'missing' as const };
      await tx.execute(sql`
        UPDATE outcall_triggers SET enabled=FALSE,deleted_at=COALESCE(deleted_at,NOW()),updated_at=NOW()
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND profile_id=${id}
      `);
      return { state: 'deleted' as const };
    });
    if (result.state === 'pending') return reply.code(409).send({ error: 'Cancel pending calls before removing this profile', code: 'OUTCALL_PROFILE_IN_USE' });
    if (result.state === 'missing') return reply.code(404).send({ error: 'Rescue profile not found', code: 'OUTCALL_PROFILE_NOT_FOUND' });
    await activity(request, 'outcall_profile', id, 'profile.deleted', 'OutCall rescue profile removed.');
    return reply.code(204).send();
  });

  app.put('/v1/modules/outcall/triggers/:id', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseTrigger(request.body);
      const { tenantId, userId } = context(request);
      const id = String((request.params as any).id);
      const result = await db.execute(sql`
        UPDATE outcall_triggers t SET profile_id=p.id,phrase_ciphertext=${input.ciphertext},
          phrase_digest=${input.digest},neutral_reply=${input.neutralReply},delay_seconds=${input.delaySeconds},
          enabled=TRUE,updated_at=NOW()
        FROM outcall_profiles p
        WHERE t.tenant_id=${tenantId} AND t.user_id=${userId} AND t.id=${id} AND t.deleted_at IS NULL
          AND p.tenant_id=t.tenant_id AND p.user_id=t.user_id AND p.id=${input.profileId}
          AND p.active=TRUE AND p.deleted_at IS NULL
        RETURNING t.id,t.profile_id,t.neutral_reply,t.delay_seconds,t.enabled,t.created_at,t.updated_at
      `);
      if (!result.rows[0]) return reply.code(404).send({ error: 'Private trigger or rescue profile not found', code: 'OUTCALL_TRIGGER_NOT_FOUND' });
      await activity(request, 'outcall_trigger', id, 'trigger.updated', 'Private OutCall trigger updated.');
      return { trigger: camel(result.rows[0] as Row) };
    } catch (error) {
      if (validation(reply, error)) return;
      if (String((error as any)?.code) === '23505') {
        return reply.code(409).send({ error: 'This private trigger already exists', code: 'OUTCALL_TRIGGER_CONFLICT' });
      }
      throw error;
    }
  });

  app.delete('/v1/modules/outcall/triggers/:id', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const id = String((request.params as any).id);
    const result = await db.execute(sql`
      UPDATE outcall_triggers SET enabled=FALSE,deleted_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND deleted_at IS NULL
      RETURNING id
    `);
    if (!result.rows[0]) return reply.code(404).send({ error: 'Private trigger not found', code: 'OUTCALL_TRIGGER_NOT_FOUND' });
    await activity(request, 'outcall_trigger', id, 'trigger.deleted', 'Private OutCall trigger removed.');
    return reply.code(204).send();
  });

  app.post('/v1/modules/outcall/data-export', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseOutCallReauthentication(request.body);
      if (!await requireRecentPassword(request, input.password)) {
        return reply.code(401).send({ error: 'Password is incorrect', code: 'INVALID_CREDENTIALS' });
      }
      const { tenantId, userId } = context(request);
      const moduleId = await outcallModuleId();
      const [settings, profiles, triggers, calls, events, usage] = await Promise.all([
        db.execute(sql`SELECT * FROM outcall_settings WHERE tenant_id=${tenantId} AND user_id=${userId} LIMIT 1`),
        db.execute(sql`SELECT * FROM outcall_profiles WHERE tenant_id=${tenantId} AND user_id=${userId} ORDER BY created_at`),
        db.execute(sql`SELECT * FROM outcall_triggers WHERE tenant_id=${tenantId} AND user_id=${userId} ORDER BY created_at`),
        db.execute(sql`SELECT * FROM outcall_call_requests WHERE tenant_id=${tenantId} AND user_id=${userId} ORDER BY created_at`),
        db.execute(sql`
          SELECT e.* FROM outcall_events e JOIN outcall_call_requests c
            ON c.tenant_id=e.tenant_id AND c.id=e.call_request_id
          WHERE c.tenant_id=${tenantId} AND c.user_id=${userId} ORDER BY e.created_at
        `),
        summarizeUsage({ tenantId, moduleId, userId }),
      ]);
      const setting = settings.rows[0] as Row | undefined;
      const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        module: 'outcall',
        tenantId,
        phone: setting?.phone_ciphertext ? unprotect(String(setting.phone_ciphertext)) : null,
        settings: setting ? camel(setting) : null,
        profiles: profiles.rows.map(row => camel(row as Row)),
        triggers: triggers.rows.map(row => ({
          ...camel(row as Row),
          phrase: (row as Row).phrase_ciphertext ? unprotect(String((row as Row).phrase_ciphertext)) : null,
        })),
        calls: calls.rows.map(row => camel(row as Row)),
        events: events.rows.map(row => camel(row as Row)),
        usage: usage.map(row => camel(row as Row)),
      };
      await writeAudit({
        actorUserId: userId,
        tenantId,
        targetType: 'outcall_data',
        targetId: userId,
        action: 'outcall_data_exported',
        after: { profileCount: profiles.rows.length, triggerCount: triggers.rows.length, callCount: calls.rows.length },
        ipAddress: request.ip,
      }, request);
      reply.header('content-disposition', `attachment; filename="outcall-export-${new Date().toISOString().slice(0, 10)}.json"`);
      return { export: payload };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/outcall/data-deletion', { preHandler: writeGuards }, async (request, reply) => {
    try {
      const input = parseOutCallReauthentication(request.body, true);
      if (!await requireRecentPassword(request, input.password)) {
        return reply.code(401).send({ error: 'Password is incorrect', code: 'INVALID_CREDENTIALS' });
      }
      const { tenantId, userId } = context(request);
      const moduleId = await outcallModuleId();
      const result = await db.transaction(async (tx) => {
        const current = await tx.execute(sql`
          SELECT phone_fingerprint FROM outcall_settings
          WHERE tenant_id=${tenantId} AND user_id=${userId} FOR UPDATE
        `);
        const inFlight = await tx.execute(sql`
          SELECT id FROM outcall_call_requests
          WHERE tenant_id=${tenantId} AND user_id=${userId} AND status='processing'
          LIMIT 1 FOR UPDATE
        `);
        if (inFlight.rows[0]) return { deleted: false, inFlight: true };
        const phoneFingerprint = current.rows[0]?.phone_fingerprint ? String(current.rows[0].phone_fingerprint) : null;
        await tx.execute(sql`
          UPDATE shared_jobs SET status='cancelled',completed_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenantId} AND module_id=${moduleId} AND requested_by_user_id=${userId}
            AND status IN ('pending','retry')
        `);
        await tx.execute(sql`
          DELETE FROM shared_webhook_receipts
          WHERE tenant_id=${tenantId} AND module_id=${moduleId}
            AND (
              safe_payload_json->>'userId'=${userId}
              OR safe_payload_json->>'callId' IN (
                SELECT id::text FROM outcall_call_requests
                WHERE tenant_id=${tenantId} AND user_id=${userId}
              )
            )
        `);
        await tx.execute(sql`DELETE FROM outcall_events WHERE call_request_id IN (
          SELECT id FROM outcall_call_requests WHERE tenant_id=${tenantId} AND user_id=${userId}
        )`);
        await tx.execute(sql`DELETE FROM outcall_call_requests WHERE tenant_id=${tenantId} AND user_id=${userId}`);
        await tx.execute(sql`DELETE FROM outcall_triggers WHERE tenant_id=${tenantId} AND user_id=${userId}`);
        await tx.execute(sql`DELETE FROM outcall_profiles WHERE tenant_id=${tenantId} AND user_id=${userId}`);
        await tx.execute(sql`DELETE FROM outcall_rate_limits WHERE tenant_id=${tenantId} AND user_id=${userId}`);
        await tx.execute(sql`DELETE FROM outcall_settings WHERE tenant_id=${tenantId} AND user_id=${userId}`);
        if (phoneFingerprint) {
          await tx.execute(sql`
            DELETE FROM outcall_phone_owners p
            WHERE p.phone_fingerprint=${phoneFingerprint} AND p.user_id=${userId}
              AND NOT EXISTS (
                SELECT 1 FROM outcall_settings s WHERE s.phone_fingerprint=p.phone_fingerprint
              )
          `);
        }
        return { deleted: Boolean(current.rows[0]), inFlight: false };
      });
      if (result.inFlight) {
        return reply.code(409).send({
          error: 'A call is currently in progress. Try again after it finishes.',
          code: 'OUTCALL_CALL_IN_PROGRESS',
        });
      }
      await writeAudit({
        actorUserId: userId,
        tenantId,
        targetType: 'outcall_data',
        targetId: userId,
        action: 'outcall_data_deleted',
        before: { existed: result.deleted },
        after: { deleted: true, retained: ['platform audit', 'billing usage'] },
        ipAddress: request.ip,
      }, request);
      return { deleted: true, retained: ['Platform audit and billing usage records required by OperatorOS'] };
    } catch (error) {
      if (validation(reply, error)) return;
      throw error;
    }
  });

  app.post('/v1/modules/outcall/calls/:id/cancel', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const id = String((request.params as any).id);
    const result = await db.transaction(async (tx) => {
      const call = await tx.execute(sql`
        UPDATE outcall_call_requests
        SET status='canceled',canceled_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND status='scheduled'
        RETURNING *
      `);
      if (!call.rows[0]) return null;
      await tx.execute(sql`
        UPDATE shared_jobs SET status='cancelled',completed_at=NOW(),updated_at=NOW()
        WHERE tenant_id=${tenantId} AND requested_by_user_id=${userId}
          AND handler_key=${OUTCALL_JOB} AND payload_json->>'requestId'=${id}
          AND status IN ('pending','retry')
      `);
      return call.rows[0] as Row;
    });
    if (!result) {
      return reply.code(409).send({ error: 'Only a pending call can be canceled', code: 'OUTCALL_CANCEL_CONFLICT' });
    }
    await activity(request, 'outcall_call', id, 'call.canceled', 'Pending OutCall request canceled.');
    return { call: camel(result) };
  });

  app.post('/v1/modules/outcall/webhooks/twilio/voice/status', async (request, reply) => {
    const body = webhookBody(request);
    const signature = request.headers['x-twilio-signature'] as string | undefined;
    if (!verifyOutCallTwilioSignature(request.url, body, signature)) {
      return reply.code(403).send({ error: 'Invalid signature', code: 'OUTCALL_SIGNATURE_INVALID' });
    }
    const sid = String(body.CallSid ?? '');
    const requestId = String((request.query as any)?.request_id ?? '');
    if (!/^CA[a-zA-Z0-9]{8,}$/.test(sid) || !/^[a-zA-Z0-9-]{1,36}$/.test(requestId)) {
      return reply.code(400).send({ error: 'Provider identifiers are invalid', code: 'OUTCALL_PROVIDER_IDENTIFIER_INVALID' });
    }
    const call = await db.execute(sql`
      SELECT tenant_id,id FROM outcall_call_requests
      WHERE id=${requestId} AND provider='twilio'
        AND (provider_call_sid IS NULL OR provider_call_sid=${sid}) LIMIT 1
    `);
    if (!call.rows[0]) return reply.code(404).send({ error: 'Call not found', code: 'OUTCALL_CALL_NOT_FOUND' });
    const status = mapProviderStatus(String(body.CallStatus ?? ''));
    const raw = webhookBytes(request, body);
    const sequence = /^\d{1,10}$/.test(String(body.SequenceNumber ?? ''))
      ? String(body.SequenceNumber)
      : createHash('sha256').update(raw).digest('hex').slice(0, 24);
    const failureCode = status === 'failed' && /^\d{3,8}$/.test(String(body.ErrorCode ?? ''))
      ? `TWILIO_${body.ErrorCode}`
      : null;
    const receipt = await receiveVerifiedWebhook({
      tenantId: String(call.rows[0].tenant_id),
      moduleId: await outcallModuleId(),
      provider: 'twilio-outcall',
      providerEventId: `${sid}:status:${sequence}`,
      eventType: `call.status.${status}`,
      handlerKey: OUTCALL_STATUS_WEBHOOK,
      rawBody: raw,
      safePayload: { callId: requestId, sid, status, failureCode },
      correlationId: request.id,
    });
    if (receipt.status !== 'processed') return reply.code(503).send({ error: 'Webhook queued for retry', code: 'OUTCALL_WEBHOOK_RETRY' });
    return { ok: true, duplicate: receipt.duplicate };
  });

  app.post('/v1/modules/outcall/webhooks/twilio/voice/gather', async (request, reply) => {
    const body = webhookBody(request);
    const signature = request.headers['x-twilio-signature'] as string | undefined;
    if (!verifyOutCallTwilioSignature(request.url, body, signature)) {
      return reply.code(403).send({ error: 'Invalid signature', code: 'OUTCALL_SIGNATURE_INVALID' });
    }
    const sid = String(body.CallSid ?? '');
    const requestId = String((request.query as any)?.request_id ?? '');
    if (!/^CA[a-zA-Z0-9]{8,}$/.test(sid) || !/^[a-zA-Z0-9-]{1,36}$/.test(requestId)) {
      return twiml(reply, '<Say>This request is unavailable.</Say><Hangup/>');
    }
    const call = await db.execute(sql`
      SELECT tenant_id,id FROM outcall_call_requests
      WHERE id=${requestId} AND provider='twilio'
        AND (provider_call_sid IS NULL OR provider_call_sid=${sid}) LIMIT 1
    `);
    if (!call.rows[0]) return twiml(reply, '<Say>This request is unavailable.</Say><Hangup/>');
    const raw = webhookBytes(request, body);
    const digest = createHash('sha256').update(raw).digest('hex').slice(0, 24);
    const receipt = await receiveVerifiedWebhook({
      tenantId: String(call.rows[0].tenant_id),
      moduleId: await outcallModuleId(),
      provider: 'twilio-outcall',
      providerEventId: `${sid}:gather:${digest}`,
      eventType: 'call.dtmf',
      handlerKey: OUTCALL_GATHER_WEBHOOK,
      rawBody: raw,
      safePayload: { callId: requestId, confirmed: body.Digits === '1' },
      correlationId: request.id,
    });
    if (receipt.status !== 'processed') return twiml(reply, '<Say>Confirmation could not be saved.</Say><Hangup/>');
    return twiml(reply, body.Digits === '1'
      ? '<Say>Confirmation received. Goodbye.</Say><Hangup/>'
      : '<Say>No confirmation was recorded. Goodbye.</Say><Hangup/>');
  });

  app.post('/v1/modules/outcall/webhooks/twilio/sms', async (request, reply) => {
    const body = webhookBody(request);
    const signature = request.headers['x-twilio-signature'] as string | undefined;
    if (!verifyOutCallTwilioSignature(request.url, body, signature)) {
      return reply.code(403).send({ error: 'Invalid signature', code: 'OUTCALL_SIGNATURE_INVALID' });
    }
    if (!outCallProviderState().ready) {
      return reply.code(503).send({ error: 'OutCall inbound triggers are not active', code: 'OUTCALL_PROVIDER_NOT_READY' });
    }
    const messageSid = String(body.MessageSid ?? '');
    let from: string;
    let to: string;
    let normalized: string;
    try {
      if (!/^SM[a-zA-Z0-9]{8,}$/.test(messageSid)) throw new Error('invalid sid');
      from = normalizeOutCallProviderPhone(body.From);
      to = normalizeOutCallProviderPhone(body.To);
      normalized = String(body.Body ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');
      if (!normalized || normalized.length > 120 || !isOutCallInboundNumber(to)) throw new Error('invalid sms');
    } catch {
      return twiml(reply, '<Message>Request received.</Message>');
    }
    const phoneDigest = fingerprint(`phone:${from}`);
    const triggerDigest = fingerprint(`trigger:${normalized}`);
    const candidate = await db.execute(sql`
      SELECT s.tenant_id,s.user_id,t.id AS trigger_id
      FROM outcall_phone_owners o
      JOIN users u ON u.id=o.user_id AND u.status='active'
      JOIN outcall_settings s ON s.user_id=o.user_id AND s.tenant_id=u.current_tenant_id
      JOIN outcall_triggers t ON t.tenant_id=s.tenant_id AND t.user_id=s.user_id
      JOIN outcall_profiles p ON p.tenant_id=t.tenant_id AND p.id=t.profile_id
      WHERE o.phone_fingerprint=${phoneDigest} AND s.phone_fingerprint=o.phone_fingerprint
        AND s.phone_verified_at IS NOT NULL AND s.disclaimer_accepted_at IS NOT NULL
        AND t.phrase_digest=${triggerDigest} AND t.enabled=TRUE AND t.deleted_at IS NULL
        AND p.active=TRUE AND p.deleted_at IS NULL
      LIMIT 1
    `);
    const match = candidate.rows[0] as Row | undefined;
    if (!match) return twiml(reply, '<Message>Request received.</Message>');
    const tenantId = String(match.tenant_id);
    const userId = String(match.user_id);
    const entitlements = await resolveEntitlements(userId, tenantId);
    const entitlement = entitlements?.modules.find(entry => entry.slug === 'outcall');
    if (!entitlement?.enabled || !await consumeRateLimit({ tenantId, userId, scope: 'sms-trigger', max: 5, windowMs: 15 * 60_000 })) {
      return twiml(reply, '<Message>Request received.</Message>');
    }
    const raw = webhookBytes(request, body);
    const receipt = await receiveVerifiedWebhook({
      tenantId,
      moduleId: await outcallModuleId(),
      provider: 'twilio-outcall',
      providerEventId: messageSid,
      eventType: 'sms.trigger',
      handlerKey: OUTCALL_SMS_WEBHOOK,
      rawBody: raw,
      safePayload: { userId, triggerId: String(match.trigger_id), messageSid },
      correlationId: request.id,
      maxAttempts: 1,
    });
    if (receipt.status !== 'processed') return reply.code(503).send({ error: 'Trigger could not be queued', code: 'OUTCALL_WEBHOOK_RETRY' });
    return twiml(reply, '<Message>Request received.</Message>');
  });
}
