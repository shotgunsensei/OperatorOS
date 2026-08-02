import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  modules,
  tradeflowkitLeadCaptureForms,
  tradeflowkitLeads,
  tradeflowkitLeadSourceEvents,
} from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
  failIdempotentOperation,
  appendActivityEvent,
} from '../lib/shared-usage-activity.js';
import { scheduleTradeFlowKitLeadFollowups } from '../lib/tradeflowkit-lead-operations.js';
import {
  deriveTradeFlowKitAdapterSecret,
  hashTradeFlowKitPublicToken,
  parseTradeFlowKitPublicLeadPayload,
  publicIntakeMasterSecret,
  TRADEFLOWKIT_PUBLIC_ADAPTER_KEYS,
  type TradeFlowKitPublicAdapterKey,
  TradeFlowKitPublicIntakeError,
  validateTradeFlowKitPrivacyUrl,
  verifyTradeFlowKitAdapterSignature,
} from '../lib/tradeflowkit-public-intake.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const adminGuards = [...readGuards, requireTenantModuleWriteAccess, requireTenantAdmin];
const ADAPTER_SET = new Set<string>(TRADEFLOWKIT_PUBLIC_ADAPTER_KEYS);

type TenantRequest = FastifyRequest & {
  tenantContext: { tenantId: string };
  user: { id: string };
};

function securePublicReply(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function idempotencyKey(request: FastifyRequest): string | null {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : null;
}

function bodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TradeFlowKitPublicIntakeError('BODY_INVALID');
  }
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, field: string, max: number, nullable = false): string | null {
  if (value === undefined || value === null) {
    if (nullable) return null;
    throw new TradeFlowKitPublicIntakeError('FIELD_REQUIRED', field);
  }
  if (typeof value !== 'string') throw new TradeFlowKitPublicIntakeError('FIELD_INVALID', field);
  const normalized = value.trim();
  if (!normalized && !nullable) throw new TradeFlowKitPublicIntakeError('FIELD_REQUIRED', field);
  if (normalized.length > max) throw new TradeFlowKitPublicIntakeError('FIELD_TOO_LONG', field);
  return normalized || null;
}

function boolValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new TradeFlowKitPublicIntakeError('FIELD_INVALID', field);
  return value;
}

function versionValue(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1_000_000) {
    throw new TradeFlowKitPublicIntakeError('EXPECTED_VERSION_REQUIRED', 'expectedVersion');
  }
  return Number(value);
}

async function tradeFlowKitModuleId(): Promise<string> {
  const [module] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!module) throw new Error('TradeFlowKit module registry row is missing');
  return module.id;
}

function safeCaptureForm(form: typeof tradeflowkitLeadCaptureForms.$inferSelect) {
  const { publicTokenHash: _publicTokenHash, ...safe } = form;
  return {
    ...safe,
    hasPublicToken: Boolean(form.publicTokenHash),
    publicPath: form.publicTokenHash ? '/public/tradeflowkit/leads/{token}' : null,
  };
}

async function activeCaptureForm(publicToken: string) {
  if (!/^[A-Za-z0-9_-]{32,200}$/.test(publicToken)) return null;
  const [form] = await db.select().from(tradeflowkitLeadCaptureForms).where(and(
    eq(tradeflowkitLeadCaptureForms.publicTokenHash, hashTradeFlowKitPublicToken(publicToken)),
    eq(tradeflowkitLeadCaptureForms.publicIntakeEnabled, true),
  )).limit(1);
  return form ?? null;
}

async function consumeRateLimit(input: {
  tenantId: string;
  captureFormId: string;
  scope: string;
  subject: string;
  windowMs: number;
  limit: number;
  secret: string;
}): Promise<boolean> {
  const windowSeconds = Math.max(1, Math.floor(input.windowMs / 1000));
  const bucketHash = createHmac('sha256', input.secret)
    .update(`${input.scope}:${input.subject}`, 'utf8')
    .digest('hex');
  await db.execute(sql`
    DELETE FROM tradeflowkit_public_intake_rate_limits
    WHERE tenant_id = ${input.tenantId}
      AND capture_form_id = ${input.captureFormId}
      AND expires_at < NOW()
  `);
  const result = await db.execute(sql`
    INSERT INTO tradeflowkit_public_intake_rate_limits (
      tenant_id, capture_form_id, bucket_hash, window_start, request_count, expires_at
    ) VALUES (
      ${input.tenantId}, ${input.captureFormId}, ${bucketHash},
      to_timestamp(floor(extract(epoch FROM NOW()) / ${windowSeconds}) * ${windowSeconds})::timestamp,
      1, NOW() + (${input.windowMs * 2} * interval '1 millisecond')
    )
    ON CONFLICT (tenant_id, capture_form_id, bucket_hash, window_start)
    DO UPDATE SET request_count = tradeflowkit_public_intake_rate_limits.request_count + 1
    RETURNING request_count
  `);
  return Number(result.rows[0]?.request_count ?? input.limit + 1) <= input.limit;
}

function publicFailure(reply: FastifyReply, error: unknown) {
  if (error instanceof TradeFlowKitPublicIntakeError) {
    return reply.code(400).send({ error: 'Lead submission was not accepted', code: error.code, field: error.field });
  }
  throw error;
}

export async function registerTradeFlowKitPublicIntakeRoutes(app: FastifyInstance): Promise<void> {
  app.patch('/v1/modules/tradeflowkit/leads/capture-form/:id', { preHandler: [...adminGuards] }, async (request, reply) => {
    const tenantId = (request as TenantRequest).tenantContext.tenantId;
    const actorUserId = (request as TenantRequest).user.id;
    const { id } = request.params as { id: string };
    let expectedVersion: number;
    let rotateToken = false;
    let revealAdapterSecrets = false;
    let update: Partial<typeof tradeflowkitLeadCaptureForms.$inferInsert> = {};
    try {
      const body = bodyObject(request.body);
      const allowed = [
        'expectedVersion', 'name', 'sourceLabel', 'defaultService', 'successMessage',
        'publicIntakeEnabled', 'privacyNoticeUrl', 'consentText', 'consentVersion',
        'allowedAdapterKeys', 'rotateToken', 'revealAdapterSecrets',
      ];
      const unexpected = Object.keys(body).find(field => !allowed.includes(field));
      if (unexpected) throw new TradeFlowKitPublicIntakeError('FIELD_NOT_ALLOWED', unexpected);
      expectedVersion = versionValue(body.expectedVersion);
      if ('name' in body) update.name = boundedText(body.name, 'name', 120)!;
      if ('sourceLabel' in body) update.sourceLabel = boundedText(body.sourceLabel, 'sourceLabel', 80)!;
      if ('defaultService' in body) update.defaultService = boundedText(body.defaultService, 'defaultService', 160, true);
      if ('successMessage' in body) update.successMessage = boundedText(body.successMessage, 'successMessage', 500)!;
      if ('publicIntakeEnabled' in body) update.publicIntakeEnabled = boolValue(body.publicIntakeEnabled, 'publicIntakeEnabled');
      if ('privacyNoticeUrl' in body) update.privacyNoticeUrl = validateTradeFlowKitPrivacyUrl(boundedText(body.privacyNoticeUrl, 'privacyNoticeUrl', 500)!);
      if ('consentText' in body) update.consentText = boundedText(body.consentText, 'consentText', 1000)!;
      if ('consentVersion' in body) {
        const value = boundedText(body.consentVersion, 'consentVersion', 40)!;
        if (!/^[A-Za-z0-9._:-]+$/.test(value)) throw new TradeFlowKitPublicIntakeError('FIELD_INVALID', 'consentVersion');
        update.consentVersion = value;
      }
      if ('allowedAdapterKeys' in body) {
        if (!Array.isArray(body.allowedAdapterKeys) || body.allowedAdapterKeys.length > TRADEFLOWKIT_PUBLIC_ADAPTER_KEYS.length) {
          throw new TradeFlowKitPublicIntakeError('FIELD_INVALID', 'allowedAdapterKeys');
        }
        const adapters = [...new Set(body.allowedAdapterKeys.map(value => boundedText(value, 'allowedAdapterKeys', 40)!))];
        if (adapters.some(key => !ADAPTER_SET.has(key))) throw new TradeFlowKitPublicIntakeError('FIELD_INVALID', 'allowedAdapterKeys');
        update.allowedAdapterKeys = adapters;
      }
      if ('rotateToken' in body) rotateToken = boolValue(body.rotateToken, 'rotateToken');
      if ('revealAdapterSecrets' in body) revealAdapterSecrets = boolValue(body.revealAdapterSecrets, 'revealAdapterSecrets');
    } catch (error) {
      if (error instanceof TradeFlowKitPublicIntakeError) {
        return reply.code(400).send({ error: 'Invalid capture form configuration', code: error.code, field: error.field });
      }
      throw error;
    }

    const [current] = await db.select().from(tradeflowkitLeadCaptureForms).where(and(
      eq(tradeflowkitLeadCaptureForms.id, id),
      eq(tradeflowkitLeadCaptureForms.tenantId, tenantId),
    )).limit(1);
    if (!current) return reply.code(404).send({ error: 'Capture form not found', code: 'LEAD_CAPTURE_NOT_FOUND' });
    if (current.version !== expectedVersion) return reply.code(409).send({ error: 'Capture form changed; reload and retry', code: 'LEAD_CAPTURE_VERSION_CONFLICT' });

    const masterSecret = publicIntakeMasterSecret();
    const enabling = update.publicIntakeEnabled ?? current.publicIntakeEnabled;
    let publicToken: string | null = null;
    if (rotateToken || (enabling && !current.publicTokenHash)) {
      publicToken = randomBytes(32).toString('base64url');
      update.publicTokenHash = hashTradeFlowKitPublicToken(publicToken);
      update.tokenRotatedAt = new Date();
    }
    const privacyNoticeUrl = update.privacyNoticeUrl ?? current.privacyNoticeUrl;
    const consentText = update.consentText ?? current.consentText;
    const consentVersion = update.consentVersion ?? current.consentVersion;
    if (enabling && (!masterSecret || !privacyNoticeUrl || !consentText || !consentVersion || !(update.publicTokenHash ?? current.publicTokenHash))) {
      return reply.code(503).send({
        error: 'Public intake requires the HMAC secret, HTTPS privacy notice, consent text/version, and a rotated token',
        code: 'PUBLIC_INTAKE_NOT_CONFIGURED',
      });
    }
    if (revealAdapterSecrets && !masterSecret) {
      return reply.code(503).send({ error: 'Public intake HMAC secret is not configured', code: 'PUBLIC_INTAKE_NOT_CONFIGURED' });
    }

    const [updated] = await db.update(tradeflowkitLeadCaptureForms).set({
      ...update,
      updatedByUserId: actorUserId,
      updatedAt: new Date(),
      version: sql`${tradeflowkitLeadCaptureForms.version} + 1`,
    }).where(and(
      eq(tradeflowkitLeadCaptureForms.id, id),
      eq(tradeflowkitLeadCaptureForms.tenantId, tenantId),
      eq(tradeflowkitLeadCaptureForms.version, expectedVersion),
    )).returning();
    if (!updated) return reply.code(409).send({ error: 'Capture form changed; reload and retry', code: 'LEAD_CAPTURE_VERSION_CONFLICT' });

    const moduleId = await tradeFlowKitModuleId();
    await appendActivityEvent({
      tenantId,
      moduleId,
      actorUserId,
      objectType: 'tradeflowkit_lead_capture_form',
      objectId: updated.id,
      eventType: rotateToken ? 'public_token_rotated' : 'configuration_updated',
      summary: rotateToken ? 'Lead capture public token rotated' : 'Lead capture configuration updated',
      metadata: {
        publicIntakeEnabled: updated.publicIntakeEnabled,
        allowedAdapterKeys: updated.allowedAdapterKeys,
      },
    });
    const adapterSecrets = revealAdapterSecrets && masterSecret
      ? Object.fromEntries(updated.allowedAdapterKeys.map(adapterKey => [
          adapterKey,
          deriveTradeFlowKitAdapterSecret({
            masterSecret,
            tenantId,
            captureFormId: updated.id,
            adapterKey: adapterKey as TradeFlowKitPublicAdapterKey,
          }),
        ]))
      : undefined;
    return {
      captureForm: safeCaptureForm(updated),
      ...(publicToken ? { publicToken } : {}),
      ...(adapterSecrets ? { adapterSecrets } : {}),
      secretDisclosure: publicToken || adapterSecrets ? 'Copy these values now; the public token cannot be retrieved later.' : undefined,
    };
  });

  app.get('/v1/public/tradeflowkit/leads/capture/:publicToken', async (request, reply) => {
    securePublicReply(reply);
    const { publicToken } = request.params as { publicToken: string };
    const form = await activeCaptureForm(publicToken);
    if (!form) return reply.code(404).send({ error: 'Lead form not found', code: 'LEAD_FORM_NOT_FOUND' });
    return {
      name: form.name,
      defaultService: form.defaultService,
      successMessage: form.successMessage,
      privacyNoticeUrl: form.privacyNoticeUrl,
      consentText: form.consentText,
      consentVersion: form.consentVersion,
      acceptedFields: ['name', 'phone', 'email', 'serviceType', 'description', 'urgency', 'estimatedValueCents', 'consentToSms'],
    };
  });

  const acceptLead = (adapterKey: 'website-form' | TradeFlowKitPublicAdapterKey) => async (request: FastifyRequest, reply: FastifyReply) => {
    securePublicReply(reply);
    const { publicToken } = request.params as { publicToken: string };
    const form = await activeCaptureForm(publicToken);
    if (!form) return reply.code(404).send({ error: 'Lead form not found', code: 'LEAD_FORM_NOT_FOUND' });
    if (adapterKey !== 'website-form' && !form.allowedAdapterKeys.includes(adapterKey)) {
      return reply.code(404).send({ error: 'Lead source not found', code: 'LEAD_SOURCE_NOT_FOUND' });
    }
    const masterSecret = publicIntakeMasterSecret();
    if (!masterSecret) return reply.code(503).send({ error: 'Lead intake is temporarily unavailable', code: 'PUBLIC_INTAKE_UNAVAILABLE' });
    const rawBody = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!rawBody || rawBody.length === 0 || rawBody.length > 8_192) {
      return reply.code(400).send({ error: 'Lead submission was not accepted', code: rawBody && rawBody.length > 8_192 ? 'PAYLOAD_TOO_LARGE' : 'BODY_INVALID' });
    }
    if (adapterKey !== 'website-form') {
      const signatureRaw = request.headers['x-tradeflowkit-signature'];
      const signature = Array.isArray(signatureRaw) ? signatureRaw[0] : signatureRaw;
      const secret = deriveTradeFlowKitAdapterSecret({
        masterSecret,
        tenantId: form.tenantId,
        captureFormId: form.id,
        adapterKey,
      });
      if (!verifyTradeFlowKitAdapterSignature({ rawBody, signature, secret })) {
        return reply.code(401).send({ error: 'Lead source signature was not accepted', code: 'SIGNATURE_INVALID' });
      }
    }
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    let parsed;
    try {
      parsed = parseTradeFlowKitPublicLeadPayload(request.body);
    } catch (error) {
      return publicFailure(reply, error);
    }
    if (parsed.consentVersion !== form.consentVersion) {
      return reply.code(409).send({ error: 'Privacy consent changed; reload the form and retry', code: 'CONSENT_VERSION_CONFLICT' });
    }
    if (parsed.honeypotTriggered) {
      return reply.code(202).send({ status: 'accepted', message: form.successMessage });
    }
    const [subjectAllowed, formAllowed] = await Promise.all([
      consumeRateLimit({ tenantId: form.tenantId, captureFormId: form.id, scope: 'client', subject: request.ip, windowMs: 15 * 60_000, limit: 5, secret: masterSecret }),
      consumeRateLimit({ tenantId: form.tenantId, captureFormId: form.id, scope: 'form', subject: form.id, windowMs: 60 * 60_000, limit: 100, secret: masterSecret }),
    ]);
    if (!subjectAllowed || !formAllowed) {
      return reply.code(429).send({ error: 'Too many lead submissions; try again later', code: 'RATE_LIMITED' });
    }
    const moduleId = await tradeFlowKitModuleId();
    const idempotency = await beginIdempotentOperation({
      tenantId: form.tenantId,
      moduleId,
      scope: `tradeflowkit.public-lead-intake.${adapterKey}.v1`,
      idempotencyKey: key,
      request: request.body,
    });
    if (idempotency.state === 'replay') return reply.code(idempotency.responseStatus).send(idempotency.responseJson);
    if (idempotency.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was reused with a different submission', code: 'IDEMPOTENCY_KEY_REUSE' });
    if (idempotency.state === 'in_progress') return reply.code(409).send({ error: 'Lead submission is already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' });

    try {
      const createdAt = new Date();
      const lead = await db.transaction(async tx => {
        const [created] = await tx.insert(tradeflowkitLeads).values({
          ...parsed.lead,
          tenantId: form.tenantId,
          createdByUserId: null,
          source: 'public_form',
          status: 'new',
          sourceId: `public:${form.id}:${hashTradeFlowKitPublicToken(key)}`,
          captureFormId: form.id,
          intakeConsentVersion: parsed.consentVersion,
          intakeConsentAt: createdAt,
          createdAt,
          updatedAt: createdAt,
        }).returning();
        await tx.insert(tradeflowkitLeadSourceEvents).values({
          tenantId: form.tenantId,
          leadId: created.id,
          createdByUserId: null,
          adapterKey,
          eventType: 'intake',
          status: 'accepted',
          metadata: { consentVersion: parsed.consentVersion, captureFormId: form.id },
        });
        await scheduleTradeFlowKitLeadFollowups({ tenantId: form.tenantId, leadId: created.id, createdAt }, tx);
        await appendActivityEvent({
          tenantId: form.tenantId,
          moduleId,
          actorUserId: null,
          objectType: 'tradeflowkit_lead',
          objectId: created.id,
          eventType: 'public_intake_received',
          summary: 'Public lead intake received',
          metadata: { adapterKey, captureFormId: form.id, consentVersion: parsed.consentVersion },
        }, tx);
        return created;
      });
      const response = { status: 'accepted', message: form.successMessage, submissionId: lead.id };
      await completeIdempotentOperation({ tenantId: form.tenantId, id: idempotency.id, leaseExpiresAt: idempotency.leaseExpiresAt, responseStatus: 201, responseJson: response });
      return reply.code(201).send(response);
    } catch (error) {
      await failIdempotentOperation({ tenantId: form.tenantId, id: idempotency.id, leaseExpiresAt: idempotency.leaseExpiresAt });
      throw error;
    }
  };

  app.post('/v1/public/tradeflowkit/leads/capture/:publicToken', acceptLead('website-form'));
  app.post('/v1/public/tradeflowkit/leads/source/:publicToken/:adapterKey', async (request, reply) => {
    const { adapterKey } = request.params as { adapterKey: string };
    if (!ADAPTER_SET.has(adapterKey)) {
      securePublicReply(reply);
      return reply.code(404).send({ error: 'Lead source not found', code: 'LEAD_SOURCE_NOT_FOUND' });
    }
    return acceptLead(adapterKey as TradeFlowKitPublicAdapterKey)(request, reply);
  });
}
