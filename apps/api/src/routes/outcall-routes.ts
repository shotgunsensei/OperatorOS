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
  outCallProviderState,
  parsePhoneVerification,
  parseProfile,
  parseSchedule,
  parseTrigger,
  protect,
} from '../lib/outcall.js';
import { enqueueSharedJob, registerSharedJobHandler } from '../lib/shared-background-jobs.js';
import { appendActivityEvent, recordUsageEvent, summarizeUsage } from '../lib/shared-usage-activity.js';

const readGuards = [requireTenantModuleAccess('outcall')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const OUTCALL_JOB = 'outcall.place_verified_call.v1';
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
  if (!provider.ready || provider.name !== 'test') {
    await db.execute(sql`
      UPDATE outcall_call_requests
      SET status='failed',failure_code='OUTCALL_PROVIDER_NOT_READY',completed_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${job.tenantId} AND id=${requestId} AND status='processing'
    `);
    throw Object.assign(new Error('OutCall provider is not ready'), { code: 'OUTCALL_PROVIDER_NOT_READY' });
  }

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
        SELECT id,tenant_id,user_id,neutral_reply,delay_seconds,enabled,last_used_at,created_at,updated_at
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
          error: 'Phone verification is unavailable until Twilio Verify is configured and validated',
          code: 'OUTCALL_VERIFY_NOT_READY',
        });
      }
      if (input.verificationCode !== '000000') {
        return reply.code(400).send({ error: 'Verification could not be completed', code: 'OUTCALL_VERIFY_FAILED' });
      }
      const { tenantId, userId } = context(request);
      const encrypted = protect(input.phone);
      const phoneFingerprint = fingerprint(`phone:${input.phone}`);
      const ownership = await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`
          INSERT INTO outcall_phone_owners (
            phone_fingerprint,user_id,phone_ciphertext,phone_masked
          ) VALUES (${phoneFingerprint},${userId},${encrypted},${input.masked})
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
        if (ownerId !== userId) return false;
        await tx.execute(sql`
          INSERT INTO outcall_settings (
            tenant_id,user_id,phone_ciphertext,phone_fingerprint,phone_masked,
            phone_verified_at,onboarding_step
          ) VALUES (
            ${tenantId},${userId},${encrypted},${phoneFingerprint},
            ${input.masked},NOW(),3
          )
          ON CONFLICT (tenant_id,user_id) DO UPDATE SET
            phone_ciphertext=EXCLUDED.phone_ciphertext,phone_fingerprint=EXCLUDED.phone_fingerprint,
            phone_masked=EXCLUDED.phone_masked,phone_verified_at=NOW(),
            onboarding_step=GREATEST(outcall_settings.onboarding_step,3),updated_at=NOW()
        `);
        return true;
      });
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
          tenant_id,user_id,phrase_ciphertext,phrase_digest,neutral_reply,delay_seconds
        ) VALUES (
          ${tenantId},${userId},${input.ciphertext},${input.digest},${input.neutralReply},${input.delaySeconds}
        ) RETURNING id,tenant_id,user_id,neutral_reply,delay_seconds,enabled,created_at,updated_at
      `);
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
            ${String(current.phone_masked)},'test','scheduled',${provider.name},
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
          maxAttempts: 3,
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

  app.post('/v1/modules/outcall/calls/:id/cancel', { preHandler: writeGuards }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const id = String((request.params as any).id);
    const result = await db.execute(sql`
      UPDATE outcall_call_requests
      SET status='canceled',canceled_at=NOW(),updated_at=NOW()
      WHERE tenant_id=${tenantId} AND user_id=${userId} AND id=${id} AND status='scheduled'
      RETURNING *
    `);
    if (!result.rows[0]) {
      return reply.code(409).send({ error: 'Only a pending call can be canceled', code: 'OUTCALL_CANCEL_CONFLICT' });
    }
    await activity(request, 'outcall_call', id, 'call.canceled', 'Pending OutCall request canceled.');
    return { call: camel(result.rows[0] as Row) };
  });
}
