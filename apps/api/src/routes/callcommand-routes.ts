import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sql } from 'drizzle-orm';
import { db } from '../db.js';
import { requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { checkRateLimit } from '../lib/rate-limiter.js';
import {
  CallCommandValidationError,
  maskPhone,
  normalizeE164,
  parseCall,
  parseChannel,
  parseConsent,
  parseDisposition,
  parseProfile,
  parseSuppression,
  parseTransferTarget,
  parseTwilioCallSid,
  phoneFingerprint,
  safeProviderError,
} from '../lib/callcommand.js';
import {
  getTelephonyInfo,
  isTelephonyConfigured,
  mapTwilioStatus,
  placeTwilioCall,
  verifyTwilioSignature,
} from '../lib/telephony.js';
import {
  receiveVerifiedWebhook,
  registerSharedWebhookHandler,
} from '../lib/shared-webhooks.js';
import { appendActivityEvent } from '../lib/shared-usage-activity.js';

const reads = [requireTenantModuleAccess('callcommand-ai')];
const writes = [...reads, requireTenantModuleWriteAccess];
type Row = Record<string, any>;

function context(request: FastifyRequest) {
  return {
    tenantId: String((request as any).tenantContext.tenantId),
    userId: String((request as any).user.id),
  };
}

function validation(reply: FastifyReply, error: unknown) {
  if (!(error instanceof CallCommandValidationError)) return false;
  reply.code(error.statusCode).send({
    error: error.message,
    code: error.code,
    ...(error.field ? { field: error.field } : {}),
  });
  return true;
}

function camel(row: Row) {
  const output: Row = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())] = value;
  }
  delete output.tenantId;
  delete output.phoneE164;
  delete output.phoneFingerprint;
  return output;
}

async function moduleId() {
  const result = await db.execute(sql`SELECT id FROM modules WHERE slug='callcommand-ai' LIMIT 1`);
  return result.rows[0] ? String(result.rows[0].id) : null;
}

async function activity(request: FastifyRequest, eventType: string, objectType: string, objectId: string, summary: string) {
  const modId = await moduleId();
  if (!modId) return;
  const { tenantId, userId } = context(request);
  await appendActivityEvent({ tenantId, moduleId: modId, actorUserId: userId, objectType, objectId, eventType, summary });
}

function testAdapterEnabled() {
  return process.env.APP_ENV === 'test' && process.env.CALLCOMMAND_TEST_ADAPTER === 'enabled';
}

function canonicalWebhookUrl(request: FastifyRequest) {
  const base = process.env.TWILIO_PUBLIC_BASE_URL || process.env.APP_URL;
  if (base) return new URL(request.url, base).toString();
  return `${request.protocol}://${request.headers.host}${request.url}`;
}

function twiml(body: string) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

function xml(value: string) {
  return value.replace(/[<>&'"]/g, character => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] as string);
}

function sendTwiml(reply: FastifyReply, body: string) {
  return reply.header('content-type', 'text/xml; charset=utf-8').send(twiml(body));
}

function webhookBody(request: FastifyRequest) {
  return ((request.body as Record<string, string>) ?? {});
}

function webhookBytes(request: FastifyRequest, body: Record<string, string>) {
  return (request as any).rawBody as Buffer | undefined ?? Buffer.from(JSON.stringify(body));
}

async function callByProvider(sid: string | undefined, callId: string | undefined): Promise<Row | null> {
  const result = sid
    ? await db.execute(sql`SELECT * FROM callcommand_calls WHERE provider='twilio' AND provider_call_sid=${sid} LIMIT 1`)
    : callId
      ? await db.execute(sql`SELECT * FROM callcommand_calls WHERE provider='twilio' AND id=${callId} LIMIT 1`)
      : { rows: [] };
  return (result.rows[0] as Row | undefined) ?? null;
}

async function workspace(tenantId: string) {
  const [channels, profiles, targets, consents, suppressions, calls, followups, summary] = await Promise.all([
    db.execute(sql`SELECT * FROM callcommand_channels WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT * FROM callcommand_profiles WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT * FROM callcommand_transfer_targets WHERE tenant_id=${tenantId} AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT id,phone_masked,subject_name,purpose,source,granted_at,expires_at,revoked_at FROM callcommand_consents WHERE tenant_id=${tenantId} ORDER BY granted_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT id,phone_masked,reason,active,created_at,released_at FROM callcommand_suppressions WHERE tenant_id=${tenantId} ORDER BY created_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT id,channel_id,profile_id,consent_id,phone_masked,subject_name,direction,purpose,provider,status,summary,disposition,disposition_note,recording_status,error_code,created_at,updated_at,completed_at FROM callcommand_calls WHERE tenant_id=${tenantId} ORDER BY created_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT id,call_id,channel,body,status,created_at,sent_at FROM callcommand_followups WHERE tenant_id=${tenantId} ORDER BY created_at DESC,id DESC LIMIT 100`),
    db.execute(sql`SELECT
      COUNT(*)::int AS calls,
      COUNT(*) FILTER (WHERE status='completed')::int AS completed,
      COUNT(*) FILTER (WHERE status='failed')::int AS failed,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::int AS last_24_hours
      FROM callcommand_calls WHERE tenant_id=${tenantId}`),
  ]);
  return {
    summary: summary.rows[0],
    channels: channels.rows.map(camel),
    profiles: profiles.rows.map(camel),
    transferTargets: targets.rows.map(camel),
    consents: consents.rows.map(camel),
    suppressions: suppressions.rows.map(camel),
    calls: calls.rows.map(camel),
    followups: followups.rows.map(camel),
    provider: { ...(await getTelephonyInfo()), testAdapter: testAdapterEnabled() },
  };
}

export async function registerCallCommandRoutes(app: FastifyInstance) {
  registerSharedWebhookHandler('callcommand.twilio.status.v2', async context => {
    const callId = String(context.payload.callId || '');
    const status = mapTwilioStatus(String(context.payload.status || ''));
    await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE callcommand_calls SET
          status=${status},
          provider_call_sid=COALESCE(provider_call_sid,${String(context.payload.sid || '')}),
          error_code=${context.payload.errorCode ? String(context.payload.errorCode).slice(0, 80) : null},
          completed_at=CASE WHEN ${status} IN ('completed','failed') THEN COALESCE(completed_at,NOW()) ELSE completed_at END,
          updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${callId} RETURNING id
      `);
      if (!updated.rows[0]) throw Object.assign(new Error('Call row is unavailable'), { code: 'CALLCOMMAND_CALL_NOT_FOUND' });
      await tx.execute(sql`INSERT INTO callcommand_events (tenant_id,call_id,event_type,safe_payload)
        VALUES (${context.tenantId},${callId},${`provider.status.${status}`},${JSON.stringify({
          provider: 'twilio',
          status,
          errorCode: context.payload.errorCode || null,
        })}::jsonb)`);
    });
  });

  registerSharedWebhookHandler('callcommand.twilio.recording.v1', async context => {
    const callId = String(context.payload.callId || '');
    await db.transaction(async tx => {
      const updated = await tx.execute(sql`
        UPDATE callcommand_calls SET
          recording_sid=NULL,
          recording_status='disabled',
          updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${callId}
        RETURNING id
      `);
      if (!updated.rows[0]) {
        throw Object.assign(new Error('Call row is unavailable'), {
          code: 'CALLCOMMAND_CALL_NOT_FOUND',
        });
      }
      await tx.execute(sql`INSERT INTO callcommand_events (tenant_id,call_id,event_type,safe_payload)
        VALUES (${context.tenantId},${callId},'provider.recording.rejected',
          '{"provider":"twilio","accepted":false,"reason":"recording_disabled"}'::jsonb)`);
    });
  });

  registerSharedWebhookHandler('callcommand.twilio.incoming.v1', async context => {
    const callId = String(context.payload.callId || '');
    await db.transaction(async tx => {
      const updated = await tx.execute(sql`UPDATE callcommand_calls
        SET status='in_progress',updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${callId} AND direction='inbound'
        RETURNING id`);
      if (!updated.rows[0]) {
        throw Object.assign(new Error('Inbound call row is unavailable'), {
          code: 'CALLCOMMAND_CALL_NOT_FOUND',
        });
      }
      await tx.execute(sql`INSERT INTO callcommand_events (tenant_id,call_id,event_type,safe_payload)
        VALUES (${context.tenantId},${callId},'provider.inbound.received',
          '{"provider":"twilio","recording":false,"input":"dtmf"}'::jsonb)`);
    });
  });

  registerSharedWebhookHandler('callcommand.twilio.intake.v1', async context => {
    const callId = String(context.payload.callId || '');
    const purpose = String(context.payload.purpose || 'support');
    const summary = `Inbound caller selected ${purpose.replaceAll('_', ' ')} intake. A reviewed follow-up is required.`;
    await db.transaction(async tx => {
      const updated = await tx.execute(sql`UPDATE callcommand_calls SET
        purpose=${purpose},status='completed',summary=${summary},
        disposition='follow_up_required',recording_status='disabled',
        completed_at=COALESCE(completed_at,NOW()),updated_at=NOW()
        WHERE tenant_id=${context.tenantId} AND id=${callId} AND direction='inbound'
        RETURNING id`);
      if (!updated.rows[0]) {
        throw Object.assign(new Error('Inbound call row is unavailable'), {
          code: 'CALLCOMMAND_CALL_NOT_FOUND',
        });
      }
      await tx.execute(sql`INSERT INTO callcommand_events (tenant_id,call_id,event_type,safe_payload)
        VALUES (${context.tenantId},${callId},'provider.inbound.intake_completed',
          ${JSON.stringify({ provider: 'twilio', purpose, disposition: 'follow_up_required' })}::jsonb)`);
    });
  });

  app.get('/v1/modules/callcommand-ai/workspace', { preHandler: reads }, async request => {
    return workspace(context(request).tenantId);
  });

  app.get('/v1/modules/callcommand-ai/telephony/status', { preHandler: reads }, async () => ({
    ...(await getTelephonyInfo()),
    testAdapter: testAdapterEnabled(),
  }));

  app.post('/v1/modules/callcommand-ai/channels', { preHandler: writes }, async (request, reply) => {
    try {
      const input = parseChannel(request.body);
      const { tenantId, userId } = context(request);
      const result = await db.execute(sql`INSERT INTO callcommand_channels
        (tenant_id,created_by_user_id,name,phone_e164,timezone,consent_script,recording_enabled)
        VALUES (${tenantId},${userId},${input.name},${input.phone},${input.timezone},${input.consentScript},${input.recordingEnabled})
        RETURNING *`);
      const row = camel(result.rows[0] as Row);
      await activity(request, 'channel.created', 'callcommand_channel', String(row.id), 'Call channel created.');
      return reply.code(201).send(row);
    } catch (error) {
      if (validation(reply, error)) return reply;
      if ((error as any)?.code === '23505') return reply.code(409).send({ error: 'Channel phone already exists', code: 'CALLCOMMAND_CHANNEL_PHONE_EXISTS' });
      throw error;
    }
  });

  app.post('/v1/modules/callcommand-ai/profiles', { preHandler: writes }, async (request, reply) => {
    try {
      const input = parseProfile(request.body);
      const { tenantId, userId } = context(request);
      const result = await db.execute(sql`INSERT INTO callcommand_profiles
        (tenant_id,created_by_user_id,name,mode,greeting,intake_fields)
        VALUES (${tenantId},${userId},${input.name},${input.mode},${input.greeting},${JSON.stringify(input.intakeFields)}::jsonb)
        RETURNING *`);
      const row = camel(result.rows[0] as Row);
      await activity(request, 'profile.created', 'callcommand_profile', String(row.id), 'Reception profile created.');
      return reply.code(201).send(row);
    } catch (error) {
      if (validation(reply, error)) return reply;
      throw error;
    }
  });

  app.post('/v1/modules/callcommand-ai/transfer-targets', { preHandler: writes }, async (request, reply) => {
    try {
      const input = parseTransferTarget(request.body);
      const { tenantId, userId } = context(request);
      const result = await db.execute(sql`INSERT INTO callcommand_transfer_targets
        (tenant_id,created_by_user_id,label,kind,phone_e164,verified_at)
        VALUES (${tenantId},${userId},${input.label},${input.kind},${input.phone},NULL)
        RETURNING *`);
      const row = camel(result.rows[0] as Row);
      await activity(request, 'transfer_target.created', 'callcommand_transfer_target', String(row.id), 'Transfer target created.');
      return reply.code(201).send(row);
    } catch (error) {
      if (validation(reply, error)) return reply;
      throw error;
    }
  });

  app.post('/v1/modules/callcommand-ai/consents', { preHandler: writes }, async (request, reply) => {
    try {
      const input = parseConsent(request.body);
      if (input.expiresAt && (!Number.isFinite(input.expiresAt.getTime()) || input.expiresAt <= new Date())) {
        throw new CallCommandValidationError('expiresAt must be a future timestamp', 'CALLCOMMAND_CONSENT_EXPIRY_INVALID', 'expiresAt');
      }
      const { tenantId, userId } = context(request);
      const fingerprint = phoneFingerprint(input.phone);
      const result = await db.execute(sql`INSERT INTO callcommand_consents
        (tenant_id,recorded_by_user_id,phone_fingerprint,phone_masked,phone_e164,subject_name,purpose,source,evidence,expires_at)
        VALUES (${tenantId},${userId},${fingerprint},${maskPhone(input.phone)},${input.phone},${input.subjectName},${input.purpose},${input.source},${input.evidence},${input.expiresAt})
        RETURNING id,phone_masked,subject_name,purpose,source,granted_at,expires_at,revoked_at`);
      const row = camel(result.rows[0] as Row);
      await activity(request, 'consent.granted', 'callcommand_consent', String(row.id), 'Call consent recorded.');
      return reply.code(201).send(row);
    } catch (error) {
      if (validation(reply, error)) return reply;
      throw error;
    }
  });

  app.post('/v1/modules/callcommand-ai/consents/:id/revoke', { preHandler: writes }, async (request, reply) => {
    const { tenantId } = context(request);
    const id = String((request.params as any).id);
    const reason = typeof (request.body as any)?.reason === 'string' ? (request.body as any).reason.trim().slice(0, 500) : 'Revoked by tenant operator';
    const result = await db.execute(sql`UPDATE callcommand_consents SET revoked_at=COALESCE(revoked_at,NOW()),revoke_reason=${reason}
      WHERE tenant_id=${tenantId} AND id=${id} RETURNING id`);
    if (!result.rows[0]) return reply.code(404).send({ error: 'Consent not found', code: 'CALLCOMMAND_CONSENT_NOT_FOUND' });
    await activity(request, 'consent.revoked', 'callcommand_consent', id, 'Call consent revoked.');
    return { ok: true };
  });

  app.post('/v1/modules/callcommand-ai/suppressions', { preHandler: writes }, async (request, reply) => {
    try {
      const input = parseSuppression(request.body);
      const { tenantId, userId } = context(request);
      const fingerprint = phoneFingerprint(input.phone);
      const result = await db.execute(sql`INSERT INTO callcommand_suppressions
        (tenant_id,recorded_by_user_id,phone_fingerprint,phone_masked,phone_e164,reason)
        VALUES (${tenantId},${userId},${fingerprint},${maskPhone(input.phone)},${input.phone},${input.reason})
        ON CONFLICT (tenant_id,phone_fingerprint) WHERE active=TRUE
        DO UPDATE SET reason=EXCLUDED.reason,recorded_by_user_id=EXCLUDED.recorded_by_user_id
        RETURNING id,phone_masked,reason,active,created_at,released_at`);
      const row = camel(result.rows[0] as Row);
      await activity(request, 'suppression.activated', 'callcommand_suppression', String(row.id), 'Do-not-call suppression activated.');
      return reply.code(201).send(row);
    } catch (error) {
      if (validation(reply, error)) return reply;
      throw error;
    }
  });

  app.get('/v1/modules/callcommand-ai/calls/:id', { preHandler: reads }, async (request, reply) => {
    const { tenantId } = context(request);
    const id = String((request.params as any).id);
    const [call, events, followups] = await Promise.all([
      db.execute(sql`SELECT id,channel_id,profile_id,consent_id,phone_masked,subject_name,direction,purpose,provider,status,summary,disposition,disposition_note,recording_status,error_code,created_at,updated_at,completed_at
        FROM callcommand_calls WHERE tenant_id=${tenantId} AND id=${id} LIMIT 1`),
      db.execute(sql`SELECT id,event_type,safe_payload,created_at FROM callcommand_events WHERE tenant_id=${tenantId} AND call_id=${id} ORDER BY created_at,id`),
      db.execute(sql`SELECT id,channel,body,status,created_at,sent_at FROM callcommand_followups WHERE tenant_id=${tenantId} AND call_id=${id} ORDER BY created_at DESC,id DESC`),
    ]);
    if (!call.rows[0]) return reply.code(404).send({ error: 'Call not found', code: 'CALLCOMMAND_CALL_NOT_FOUND' });
    return { ...camel(call.rows[0] as Row), events: events.rows.map(camel), followups: followups.rows.map(camel) };
  });

  app.post('/v1/modules/callcommand-ai/calls', { preHandler: writes }, async (request, reply) => {
    try {
      const input = parseCall(request.body);
      const { tenantId, userId } = context(request);
      if (!checkRateLimit(`callcommand:${tenantId}:${userId}`, 5, 5 * 60_000)) {
        return reply.code(429).send({ error: 'Call limit reached; retry later', code: 'CALLCOMMAND_RATE_LIMITED' });
      }
      const fingerprint = phoneFingerprint(input.phone);
      const prepared = await db.transaction(async tx => {
        const existing = await tx.execute(sql`SELECT * FROM callcommand_calls WHERE tenant_id=${tenantId} AND idempotency_key=${input.idempotencyKey} LIMIT 1`);
        if (existing.rows[0]) return { existing: true, row: existing.rows[0] as Row, recording: false, mode: '' };
        const suppressed = await tx.execute(sql`SELECT 1 FROM callcommand_suppressions WHERE tenant_id=${tenantId} AND phone_fingerprint=${fingerprint} AND active=TRUE LIMIT 1`);
        if (suppressed.rows[0]) throw new CallCommandValidationError('Number is on the tenant do-not-call list', 'CALLCOMMAND_SUPPRESSED', 'phone', 409);
        const consent = await tx.execute(sql`SELECT id FROM callcommand_consents
          WHERE tenant_id=${tenantId} AND phone_fingerprint=${fingerprint} AND purpose=${input.purpose}
            AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())
          ORDER BY granted_at DESC LIMIT 1`);
        if (!consent.rows[0]) throw new CallCommandValidationError('Active consent is required for this number and purpose', 'CALLCOMMAND_CONSENT_REQUIRED', 'phone', 409);
        const config = await tx.execute(sql`SELECT c.recording_enabled,p.mode
          FROM callcommand_channels c JOIN callcommand_profiles p ON p.tenant_id=c.tenant_id
          WHERE c.tenant_id=${tenantId} AND c.id=${input.channelId} AND p.id=${input.profileId}
            AND c.deleted_at IS NULL AND p.deleted_at IS NULL AND c.status='active' AND p.status='active' LIMIT 1`);
        if (!config.rows[0]) throw new CallCommandValidationError('Active channel and profile are required', 'CALLCOMMAND_CONFIGURATION_INVALID', undefined, 409);
        const provider = testAdapterEnabled() ? 'test' : 'twilio';
        if (provider === 'twilio' && !(await isTelephonyConfigured())) {
          throw new CallCommandValidationError('Telephony provider is disabled', 'CALLCOMMAND_PROVIDER_DISABLED', undefined, 503);
        }
        const inserted = await tx.execute(sql`INSERT INTO callcommand_calls
          (tenant_id,created_by_user_id,channel_id,profile_id,consent_id,phone_fingerprint,phone_masked,phone_e164,subject_name,purpose,provider,status,idempotency_key,recording_status)
          VALUES (${tenantId},${userId},${input.channelId},${input.profileId},${String(consent.rows[0].id)},${fingerprint},${maskPhone(input.phone)},${input.phone},${input.subjectName},${input.purpose},${provider},'queued',${input.idempotencyKey},'disabled')
          RETURNING *`);
        await tx.execute(sql`INSERT INTO callcommand_events (tenant_id,call_id,event_type,safe_payload)
          VALUES (${tenantId},${String(inserted.rows[0].id)},'call.queued',${JSON.stringify({ provider, purpose: input.purpose })}::jsonb)`);
        return { existing: false, row: inserted.rows[0] as Row, recording: false, mode: String(config.rows[0].mode) };
      });
      if (prepared.existing) return reply.code(200).send(camel(prepared.row));
      if (prepared.row.provider === 'test') {
        const summary = 'Test adapter completed the consent-gated call workflow without contacting an external number.';
        const completed = await db.transaction(async tx => {
          const updated = await tx.execute(sql`UPDATE callcommand_calls SET status='completed',summary=${summary},recording_status='disabled',completed_at=NOW(),updated_at=NOW()
            WHERE tenant_id=${tenantId} AND id=${String(prepared.row.id)} RETURNING *`);
          await tx.execute(sql`INSERT INTO callcommand_events (tenant_id,call_id,event_type,safe_payload)
            VALUES (${tenantId},${String(prepared.row.id)},'test.completed','{"externalContact":false}'::jsonb)`);
          return updated.rows[0] as Row;
        });
        await activity(request, 'call.test_completed', 'callcommand_call', String(completed.id), 'Consent-gated provider test completed.');
        return reply.code(201).send(camel(completed));
      }
      try {
        const placed = await placeTwilioCall({
          to: input.phone,
          persona: prepared.mode,
          callerName: input.subjectName || 'customer',
          callRowId: String(prepared.row.id),
          recordingEnabled: prepared.recording,
        });
        const updated = await db.execute(sql`UPDATE callcommand_calls SET provider_call_sid=${placed.sid},status=${placed.status},updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${String(prepared.row.id)} RETURNING *`);
        await activity(request, 'call.placed', 'callcommand_call', String(prepared.row.id), 'Consent-gated provider call placed.');
        return reply.code(201).send(camel(updated.rows[0] as Row));
      } catch (error) {
        const code = safeProviderError(error);
        await db.execute(sql`UPDATE callcommand_calls SET status='failed',error_code=${code},completed_at=NOW(),updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${String(prepared.row.id)}`);
        request.log.error({ callId: prepared.row.id }, 'CallCommand provider request failed');
        return reply.code(502).send({ error: 'Telephony provider failed', code: 'CALLCOMMAND_PROVIDER_FAILED' });
      }
    } catch (error) {
      if (validation(reply, error)) return reply;
      throw error;
    }
  });

  app.post('/v1/modules/callcommand-ai/calls/:id/followups', { preHandler: writes }, async (request, reply) => {
    const { tenantId, userId } = context(request);
    const id = String((request.params as any).id);
    const body = request.body as any;
    const channel = typeof body?.channel === 'string' ? body.channel : '';
    const content = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!['sms', 'email', 'task'].includes(channel) || !content || content.length > 2000) {
      return reply.code(400).send({ error: 'Valid channel and 1-2000 character body are required', code: 'CALLCOMMAND_FOLLOWUP_INVALID' });
    }
    const call = await db.execute(sql`SELECT 1 FROM callcommand_calls WHERE tenant_id=${tenantId} AND id=${id} LIMIT 1`);
    if (!call.rows[0]) return reply.code(404).send({ error: 'Call not found', code: 'CALLCOMMAND_CALL_NOT_FOUND' });
    const created = await db.execute(sql`INSERT INTO callcommand_followups (tenant_id,call_id,created_by_user_id,channel,body,status)
      VALUES (${tenantId},${id},${userId},${channel},${content},'draft') RETURNING id,channel,body,status,created_at,sent_at`);
    await activity(request, 'followup.drafted', 'callcommand_call', id, 'Follow-up draft created for review.');
    return reply.code(201).send(camel(created.rows[0] as Row));
  });

  app.post('/v1/modules/callcommand-ai/calls/:id/disposition', { preHandler: writes }, async (request, reply) => {
    try {
      const { tenantId } = context(request);
      const id = String((request.params as any).id);
      const input = parseDisposition(request.body);
      const updated = await db.transaction(async tx => {
        const result = await tx.execute(sql`UPDATE callcommand_calls SET
          disposition=${input.disposition},disposition_note=${input.note},updated_at=NOW()
          WHERE tenant_id=${tenantId} AND id=${id}
          RETURNING id,disposition,disposition_note,updated_at`);
        if (!result.rows[0]) return null;
        await tx.execute(sql`INSERT INTO callcommand_events (tenant_id,call_id,event_type,safe_payload)
          VALUES (${tenantId},${id},'call.disposition.updated',
            ${JSON.stringify({ disposition: input.disposition })}::jsonb)`);
        return result.rows[0] as Row;
      });
      if (!updated) {
        return reply.code(404).send({
          error: 'Call not found',
          code: 'CALLCOMMAND_CALL_NOT_FOUND',
        });
      }
      await activity(request, 'call.disposition_updated', 'callcommand_call', id, 'Call disposition updated.');
      return camel(updated);
    } catch (error) {
      if (validation(reply, error)) return reply;
      throw error;
    }
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/incoming', async (request, reply) => {
    const body = webhookBody(request);
    const signature = request.headers['x-twilio-signature'] as string | undefined;
    if (!(await verifyTwilioSignature(canonicalWebhookUrl(request), body, signature))) {
      return reply.code(403).send({ error: 'Invalid signature', code: 'CALLCOMMAND_SIGNATURE_INVALID' });
    }
    let sid: string;
    let from: string;
    let to: string;
    try {
      sid = parseTwilioCallSid(body.CallSid);
      from = normalizeE164(body.From, 'From');
      to = normalizeE164(body.To, 'To');
    } catch {
      return sendTwiml(reply, '<Say>This line is unavailable.</Say><Hangup/>');
    }
    const config = await db.execute(sql`
      SELECT c.tenant_id,c.id AS channel_id,p.id AS profile_id,p.greeting
      FROM callcommand_channels c
      JOIN LATERAL (
        SELECT id,greeting FROM callcommand_profiles
        WHERE tenant_id=c.tenant_id AND status='active' AND deleted_at IS NULL
        ORDER BY updated_at DESC,id DESC LIMIT 1
      ) p ON TRUE
      WHERE c.phone_e164=${to} AND c.status='active' AND c.deleted_at IS NULL
      LIMIT 1
    `);
    if (!config.rows[0]) {
      return sendTwiml(reply, '<Say>This line is unavailable.</Say><Hangup/>');
    }
    const row = config.rows[0] as Row;
    const fingerprint = phoneFingerprint(from);
    const idempotencyKey = `twilio:inbound:${sid}`;
    const created = await db.execute(sql`INSERT INTO callcommand_calls
      (tenant_id,channel_id,profile_id,consent_id,phone_fingerprint,phone_masked,phone_e164,
       direction,purpose,provider,provider_call_sid,status,idempotency_key,recording_status)
      VALUES (${String(row.tenant_id)},${String(row.channel_id)},${String(row.profile_id)},NULL,
        ${fingerprint},${maskPhone(from)},${from},'inbound','support','twilio',${sid},
        'in_progress',${idempotencyKey},'disabled')
      ON CONFLICT DO NOTHING
      RETURNING id`);
    const inbound = created.rows[0] ?? (await db.execute(sql`SELECT id FROM callcommand_calls
      WHERE tenant_id=${String(row.tenant_id)} AND idempotency_key=${idempotencyKey}
        AND provider='twilio' AND direction='inbound' LIMIT 1`)).rows[0];
    if (!inbound) {
      return sendTwiml(reply, '<Say>This line is unavailable.</Say><Hangup/>');
    }
    const modId = await moduleId();
    if (!modId) return sendTwiml(reply, '<Say>This line is unavailable.</Say><Hangup/>');
    const rawBody = webhookBytes(request, body);
    const receipt = await receiveVerifiedWebhook({
      tenantId: String(row.tenant_id),
      moduleId: modId,
      provider: 'twilio',
      providerEventId: `${sid}:incoming:v1`,
      eventType: 'call.incoming',
      handlerKey: 'callcommand.twilio.incoming.v1',
      rawBody,
      safePayload: { callId: String(inbound.id) },
      correlationId: request.id,
    });
    if (receipt.status !== 'processed') {
      return sendTwiml(reply, '<Say>This line is temporarily unavailable.</Say><Hangup/>');
    }
    const action = xml(`/v1/modules/callcommand-ai/webhooks/twilio/intake?call_id=${encodeURIComponent(String(inbound.id))}`);
    const greeting = xml(String(row.greeting).slice(0, 1000));
    return sendTwiml(
      reply,
      `<Gather input="dtmf" numDigits="1" timeout="8" method="POST" action="${action}">`
        + `<Say>${greeting} Press 1 for support, 2 for an appointment, or 3 for a service callback.</Say>`
        + '</Gather><Say>No selection was received. Goodbye.</Say><Hangup/>',
    );
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/intake', async (request, reply) => {
    const body = webhookBody(request);
    const signature = request.headers['x-twilio-signature'] as string | undefined;
    if (!(await verifyTwilioSignature(canonicalWebhookUrl(request), body, signature))) {
      return reply.code(403).send({ error: 'Invalid signature', code: 'CALLCOMMAND_SIGNATURE_INVALID' });
    }
    let sid: string;
    try {
      sid = parseTwilioCallSid(body.CallSid);
    } catch {
      return sendTwiml(reply, '<Say>This request is unavailable.</Say><Hangup/>');
    }
    const call = await callByProvider(sid, String((request.query as any)?.call_id || ''));
    if (!call || call.direction !== 'inbound') {
      return sendTwiml(reply, '<Say>This request is unavailable.</Say><Hangup/>');
    }
    const purpose = ({ '1': 'support', '2': 'appointment', '3': 'service_callback' } as Record<string, string>)[body.Digits];
    if (!purpose) {
      return sendTwiml(reply, '<Say>That selection is unavailable. Goodbye.</Say><Hangup/>');
    }
    const modId = await moduleId();
    if (!modId) return sendTwiml(reply, '<Say>This request is unavailable.</Say><Hangup/>');
    const receipt = await receiveVerifiedWebhook({
      tenantId: String(call.tenant_id),
      moduleId: modId,
      provider: 'twilio',
      providerEventId: `${sid}:intake:v1`,
      eventType: 'call.inbound.intake',
      handlerKey: 'callcommand.twilio.intake.v1',
      rawBody: webhookBytes(request, body),
      safePayload: { callId: call.id, purpose },
      correlationId: request.id,
    });
    if (receipt.status !== 'processed') {
      return sendTwiml(reply, '<Say>This request is temporarily unavailable.</Say><Hangup/>');
    }
    return sendTwiml(reply, '<Say>Your request was recorded for operator review. Goodbye.</Say><Hangup/>');
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/status', async (request, reply) => {
    const body = webhookBody(request);
    const signature = request.headers['x-twilio-signature'] as string | undefined;
    if (!(await verifyTwilioSignature(canonicalWebhookUrl(request), body, signature))) {
      return reply.code(403).send({ error: 'Invalid signature', code: 'CALLCOMMAND_SIGNATURE_INVALID' });
    }
    let sid: string;
    try {
      sid = parseTwilioCallSid(body.CallSid);
    } catch {
      return reply.code(400).send({
        error: 'Provider identifier is invalid',
        code: 'CALLCOMMAND_PROVIDER_IDENTIFIER_INVALID',
      });
    }
    const call = await callByProvider(sid, String((request.query as any)?.call_id || ''));
    if (!call) return reply.code(404).send({ error: 'Call not found', code: 'CALLCOMMAND_CALL_NOT_FOUND' });
    const modId = await moduleId();
    if (!modId) return reply.code(503).send({ error: 'Module registry unavailable' });
    const rawBody = webhookBytes(request, body);
    const hash = createHash('sha256').update(rawBody).digest('hex');
    const status = mapTwilioStatus(body.CallStatus);
    const sequence = /^\d{1,10}$/.test(body.SequenceNumber || '')
      ? body.SequenceNumber
      : hash.slice(0, 24);
    const receipt = await receiveVerifiedWebhook({
      tenantId: String(call.tenant_id),
      moduleId: modId,
      provider: 'twilio',
      providerEventId: `${sid}:status:${sequence}`,
      eventType: `call.status.${status}`,
      handlerKey: 'callcommand.twilio.status.v2',
      rawBody,
      safePayload: {
        callId: call.id,
        sid,
        status,
        errorCode: body.ErrorCode ? safeProviderError({ code: body.ErrorCode }) : null,
      },
      correlationId: request.id,
    });
    if (receipt.status !== 'processed') return reply.code(503).send({ error: 'Webhook queued for retry', code: 'CALLCOMMAND_WEBHOOK_RETRY' });
    return { ok: true, duplicate: receipt.duplicate };
  });

  app.post('/v1/modules/callcommand-ai/webhooks/twilio/recording', async (request, reply) => {
    const body = webhookBody(request);
    const signature = request.headers['x-twilio-signature'] as string | undefined;
    if (!(await verifyTwilioSignature(canonicalWebhookUrl(request), body, signature))) {
      return reply.code(403).send({ error: 'Invalid signature', code: 'CALLCOMMAND_SIGNATURE_INVALID' });
    }
    let sid: string;
    try {
      sid = parseTwilioCallSid(body.CallSid);
    } catch {
      return reply.code(400).send({
        error: 'Provider identifier is invalid',
        code: 'CALLCOMMAND_PROVIDER_IDENTIFIER_INVALID',
      });
    }
    const call = await callByProvider(sid, String((request.query as any)?.call_id || ''));
    if (!call) return reply.code(404).send({ error: 'Call not found', code: 'CALLCOMMAND_CALL_NOT_FOUND' });
    const modId = await moduleId();
    if (!modId) return reply.code(503).send({ error: 'Module registry unavailable' });
    const rawBody = webhookBytes(request, body);
    const hash = createHash('sha256').update(rawBody).digest('hex');
    const receipt = await receiveVerifiedWebhook({
      tenantId: String(call.tenant_id),
      moduleId: modId,
      provider: 'twilio',
      providerEventId: `${sid}:recording:${hash.slice(0, 24)}`,
      eventType: 'call.recording.completed',
      handlerKey: 'callcommand.twilio.recording.v1',
      rawBody,
      safePayload: {
        callId: call.id,
      },
      correlationId: request.id,
    });
    if (receipt.status !== 'processed') {
      return reply.code(503).send({ error: 'Webhook queued for retry', code: 'CALLCOMMAND_WEBHOOK_RETRY' });
    }
    return { ok: true, duplicate: receipt.duplicate };
  });
}
