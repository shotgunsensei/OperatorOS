import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  modules,
  tradeflowkitLeadCaptureForms,
  tradeflowkitLeadFollowups,
  tradeflowkitLeadSettings,
  tradeflowkitLeadSourceEvents,
  tradeflowkitLeads,
  users,
} from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { enqueueOutboxMessage } from '../lib/shared-notification-outbox.js';
import {
  beginIdempotentOperation,
  completeIdempotentOperation,
} from '../lib/shared-usage-activity.js';
import {
  ensureTradeFlowKitLeadOperationDefaults,
  getTradeFlowKitLeadTemplate,
  TRADEFLOWKIT_LEAD_TEMPLATES,
} from '../lib/tradeflowkit-lead-operations.js';
import {
  parseTradeFlowKitLeadCreate,
  TradeFlowKitLeadValidationError,
} from '../lib/tradeflowkit-leads.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];

const SOURCE_ADAPTERS = Object.freeze([
  {
    key: 'website-form',
    name: 'Website form',
    description: 'Validates a website form payload against the canonical lead contract before deployment.',
    acceptedFields: ['name', 'phone', 'email', 'serviceType', 'description', 'urgency', 'estimatedValueCents', 'consentToSms'],
  },
  {
    key: 'generic-json',
    name: 'Generic JSON',
    description: 'Validates a bounded JSON payload for a future authenticated integration.',
    acceptedFields: ['name', 'phone', 'email', 'serviceType', 'description', 'urgency', 'estimatedValueCents', 'consentToSms'],
  },
  {
    key: 'n8n',
    name: 'n8n workflow',
    description: 'Validates the canonical lead fields an n8n workflow would submit after a signed ingress contract is approved.',
    acceptedFields: ['name', 'phone', 'email', 'serviceType', 'description', 'urgency', 'estimatedValueCents', 'consentToSms'],
  },
]);

type TenantRequest = FastifyRequest & {
  tenantContext: { tenantId: string };
  user: { id: string };
};

class LeadOperationsInputError extends Error {
  constructor(readonly code: string, readonly field?: string) {
    super(code);
  }
}

function tenantId(request: FastifyRequest): string {
  return (request as TenantRequest).tenantContext.tenantId;
}

function userId(request: FastifyRequest): string {
  return (request as TenantRequest).user.id;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LeadOperationsInputError('BODY_INVALID');
  return value as Record<string, unknown>;
}

function onlyFields(value: Record<string, unknown>, allowed: readonly string[]): void {
  const unexpected = Object.keys(value).find(key => !allowed.includes(key));
  if (unexpected) throw new LeadOperationsInputError('FIELD_NOT_ALLOWED', unexpected);
}

function textValue(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new LeadOperationsInputError('FIELD_REQUIRED', field);
    return null;
  }
  if (typeof value !== 'string') throw new LeadOperationsInputError('FIELD_INVALID', field);
  const normalized = value.trim();
  if (required && !normalized) throw new LeadOperationsInputError('FIELD_REQUIRED', field);
  if (normalized.length > max) throw new LeadOperationsInputError('FIELD_TOO_LONG', field);
  return normalized || null;
}

function boolValue(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new LeadOperationsInputError('FIELD_INVALID', field);
  return value;
}

function versionValue(value: unknown, field = 'expectedVersion'): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 1_000_000) {
    throw new LeadOperationsInputError('EXPECTED_VERSION_REQUIRED', field);
  }
  return value as number;
}

function idempotencyKey(request: FastifyRequest): string | null {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && /^[A-Za-z0-9._:-]{8,160}$/.test(value) ? value : null;
}

function inputFailure(reply: FastifyReply, error: unknown): boolean {
  if (error instanceof LeadOperationsInputError) {
    reply.code(400).send({ error: 'Invalid TradeFlowKit lead-operations input', code: error.code, field: error.field });
    return true;
  }
  if (error instanceof TradeFlowKitLeadValidationError) {
    reply.code(400).send({ error: error.message, code: error.code, field: error.field });
    return true;
  }
  return false;
}

type LeadOperationsExecutor = Pick<typeof db, 'execute' | 'select'>;

async function tradeFlowKitModuleId(executor: LeadOperationsExecutor = db): Promise<string> {
  const [module] = await executor.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!module) throw new Error('TradeFlowKit module registry row is missing');
  return module.id;
}

async function lockLeadOperationsConfiguration(executor: LeadOperationsExecutor, tenant: string) {
  const result = await executor.execute(sql`
    SELECT settings.version AS settings_version, capture.version AS capture_version
    FROM tradeflowkit_lead_settings settings
    JOIN tradeflowkit_lead_capture_forms capture ON capture.tenant_id=settings.tenant_id
    WHERE settings.tenant_id=${tenant}
    FOR UPDATE OF settings, capture
  `);
  const row = result.rows[0] as { settings_version: number | string; capture_version: number | string } | undefined;
  if (!row) throw new Error('TradeFlowKit lead operations configuration is missing');
  return {
    settingsVersion: Number(row.settings_version),
    captureVersion: Number(row.capture_version),
  };
}

function settingsResponse(state: Awaited<ReturnType<typeof ensureTradeFlowKitLeadOperationDefaults>>) {
  return {
    settings: state.settings,
    captureForm: state.captureForm,
    templates: TRADEFLOWKIT_LEAD_TEMPLATES.map(({ key, label, description, serviceCategories }) => ({
      key, label, description, serviceCategories,
    })),
    delivery: {
      mode: 'manual_shared_outbox',
      autoRespond: false,
      note: 'Follow-ups are queued deliberately through the shared OperatorOS outbox; deployment connectors control final delivery.',
    },
    publicIntake: {
      enabled: false,
      reason: 'Anonymous intake is disabled pending consent, privacy, retention, rate-limit, abuse, and deployed-host acceptance.',
    },
  };
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) throw new LeadOperationsInputError('FIELD_INVALID', field);
  const items = value.map((item, index) => textValue(item, `${field}.${index}`, 80, true)!);
  return [...new Set(items)];
}

function renderLeadTemplate(template: string, lead: { name: string; serviceType: string | null }): string {
  return template
    .replaceAll('{name}', lead.name)
    .replaceAll('{service}', lead.serviceType || 'your service request');
}

export async function registerTradeFlowKitLeadOperationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/tradeflowkit/leads/settings', { preHandler: [...readGuards] }, async request => {
    const state = await ensureTradeFlowKitLeadOperationDefaults(tenantId(request), null);
    return settingsResponse(state);
  });

  app.patch('/v1/modules/tradeflowkit/leads/settings', { preHandler: [...adminGuards] }, async (request, reply) => {
    let expectedVersion: number;
    let expectedCaptureFormVersion: number | null = null;
    let settingsPatch: Record<string, unknown>;
    let capturePatch: Record<string, unknown> | null = null;
    try {
      const body = record(request.body);
      onlyFields(body, [
        'expectedVersion', 'expectedCaptureFormVersion', 'followUpEnabled', 'emailEnabled', 'smsEnabled',
        'serviceArea', 'emailTemplate', 'smsTemplate', 'leadSources', 'captureForm',
      ]);
      expectedVersion = versionValue(body.expectedVersion);
      settingsPatch = {};
      if ('followUpEnabled' in body) settingsPatch.followUpEnabled = boolValue(body.followUpEnabled, 'followUpEnabled');
      if ('emailEnabled' in body) settingsPatch.emailEnabled = boolValue(body.emailEnabled, 'emailEnabled');
      if ('smsEnabled' in body) settingsPatch.smsEnabled = boolValue(body.smsEnabled, 'smsEnabled');
      if ('serviceArea' in body) settingsPatch.serviceArea = textValue(body.serviceArea, 'serviceArea', 500);
      if ('emailTemplate' in body) settingsPatch.emailTemplate = textValue(body.emailTemplate, 'emailTemplate', 4_000, true)!;
      if ('smsTemplate' in body) settingsPatch.smsTemplate = textValue(body.smsTemplate, 'smsTemplate', 1_000, true)!;
      if ('leadSources' in body) settingsPatch.leadSources = stringList(body.leadSources, 'leadSources');
      if ('captureForm' in body) {
        expectedCaptureFormVersion = versionValue(body.expectedCaptureFormVersion, 'expectedCaptureFormVersion');
        const capture = record(body.captureForm);
        onlyFields(capture, ['name', 'sourceLabel', 'defaultService', 'successMessage']);
        capturePatch = {};
        if ('name' in capture) capturePatch.name = textValue(capture.name, 'captureForm.name', 120, true)!;
        if ('sourceLabel' in capture) capturePatch.sourceLabel = textValue(capture.sourceLabel, 'captureForm.sourceLabel', 80, true)!;
        if ('defaultService' in capture) capturePatch.defaultService = textValue(capture.defaultService, 'captureForm.defaultService', 160);
        if ('successMessage' in capture) capturePatch.successMessage = textValue(capture.successMessage, 'captureForm.successMessage', 500, true)!;
        if (Object.keys(capturePatch).length === 0) throw new LeadOperationsInputError('FIELD_REQUIRED', 'captureForm');
      }
      if (Object.keys(settingsPatch).length === 0 && !capturePatch) throw new LeadOperationsInputError('FIELD_REQUIRED');
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }

    const tenant = tenantId(request);
    const actor = userId(request);
    const outcome = await db.transaction(async tx => {
      await ensureTradeFlowKitLeadOperationDefaults(tenant, actor, tx);
      const locked = await lockLeadOperationsConfiguration(tx, tenant);
      if (locked.settingsVersion !== expectedVersion) return { kind: 'settings_conflict' as const };
      if (capturePatch && locked.captureVersion !== expectedCaptureFormVersion) return { kind: 'capture_conflict' as const };
      const [settings] = await tx.update(tradeflowkitLeadSettings).set({
        ...settingsPatch,
        autoRespond: false,
        dryRun: true,
        updatedByUserId: actor,
        updatedAt: new Date(),
        version: sql`${tradeflowkitLeadSettings.version} + 1`,
      }).where(and(
        eq(tradeflowkitLeadSettings.tenantId, tenant),
        eq(tradeflowkitLeadSettings.version, expectedVersion),
      )).returning();
      if (!settings) throw new Error('Locked TradeFlowKit lead settings update returned no row');
      let captureForm = (await tx.select().from(tradeflowkitLeadCaptureForms)
        .where(eq(tradeflowkitLeadCaptureForms.tenantId, tenant)).limit(1))[0];
      if (capturePatch) {
        [captureForm] = await tx.update(tradeflowkitLeadCaptureForms).set({
          ...capturePatch,
          publicIntakeEnabled: false,
          updatedByUserId: actor,
          updatedAt: new Date(),
          version: sql`${tradeflowkitLeadCaptureForms.version} + 1`,
        }).where(and(
          eq(tradeflowkitLeadCaptureForms.tenantId, tenant),
          eq(tradeflowkitLeadCaptureForms.version, expectedCaptureFormVersion!),
        )).returning();
        if (!captureForm) throw new Error('Locked TradeFlowKit lead capture update returned no row');
      }
      const changedFields = [...Object.keys(settingsPatch), ...(capturePatch ? Object.keys(capturePatch).map(key => `captureForm.${key}`) : [])];
      await tx.insert(tradeflowkitLeadSourceEvents).values({
        tenantId: tenant,
        createdByUserId: actor,
        adapterKey: 'operator-settings',
        eventType: 'configuration',
        status: 'configured',
        metadata: { changedFields },
      });
      await tx.insert(activityFeed).values({
        tenantId: tenant,
        userId: actor,
        action: 'updated',
        entityType: 'tradeflowkit_lead_settings',
        entityId: settings.id,
        metadata: { changedFields },
      });
      return { kind: 'updated' as const, settings, captureForm };
    });
    if (outcome.kind === 'settings_conflict') return reply.code(409).send({ error: 'Lead settings changed; reload and retry', code: 'LEAD_SETTINGS_VERSION_CONFLICT' });
    if (outcome.kind === 'capture_conflict') return reply.code(409).send({ error: 'Capture profile changed; reload and retry', code: 'LEAD_CAPTURE_VERSION_CONFLICT' });
    return settingsResponse({ settings: outcome.settings, captureForm: outcome.captureForm });
  });

  app.post('/v1/modules/tradeflowkit/leads/settings/apply-template', { preHandler: [...adminGuards] }, async (request, reply) => {
    let templateKey: string;
    let expectedVersion: number;
    let expectedCaptureFormVersion: number;
    try {
      const body = record(request.body);
      onlyFields(body, ['templateKey', 'expectedVersion', 'expectedCaptureFormVersion']);
      templateKey = textValue(body.templateKey, 'templateKey', 60, true)!;
      expectedVersion = versionValue(body.expectedVersion);
      expectedCaptureFormVersion = versionValue(body.expectedCaptureFormVersion, 'expectedCaptureFormVersion');
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const template = getTradeFlowKitLeadTemplate(templateKey);
    if (!template) return reply.code(400).send({ error: 'Unknown lead template', code: 'LEAD_TEMPLATE_INVALID', field: 'templateKey' });
    const tenant = tenantId(request);
    const actor = userId(request);
    const outcome = await db.transaction(async tx => {
      await ensureTradeFlowKitLeadOperationDefaults(tenant, actor, tx);
      const locked = await lockLeadOperationsConfiguration(tx, tenant);
      if (locked.settingsVersion !== expectedVersion) return { kind: 'settings_conflict' as const };
      if (locked.captureVersion !== expectedCaptureFormVersion) return { kind: 'capture_conflict' as const };
      const [settings] = await tx.update(tradeflowkitLeadSettings).set({
        tradeTemplate: template.key,
        followUpEnabled: true,
        autoRespond: false,
        dryRun: true,
        emailEnabled: true,
        emailTemplate: template.emailTemplate,
        smsTemplate: template.smsTemplate,
        followupSequence: template.followupSequence,
        leadSources: template.leadSources,
        updatedByUserId: actor,
        updatedAt: new Date(),
        version: sql`${tradeflowkitLeadSettings.version} + 1`,
      }).where(and(
        eq(tradeflowkitLeadSettings.tenantId, tenant),
        eq(tradeflowkitLeadSettings.version, expectedVersion),
      )).returning();
      if (!settings) throw new Error('Locked TradeFlowKit lead template settings update returned no row');
      const [captureForm] = await tx.update(tradeflowkitLeadCaptureForms).set({
        name: `${template.label} lead profile`,
        sourceLabel: template.leadSources.find(source => source !== 'manual') ?? 'website',
        defaultService: template.serviceCategories[0] ?? null,
        publicIntakeEnabled: false,
        updatedByUserId: actor,
        updatedAt: new Date(),
        version: sql`${tradeflowkitLeadCaptureForms.version} + 1`,
      }).where(and(
        eq(tradeflowkitLeadCaptureForms.tenantId, tenant),
        eq(tradeflowkitLeadCaptureForms.version, expectedCaptureFormVersion),
      )).returning();
      if (!captureForm) throw new Error('Locked TradeFlowKit lead template capture update returned no row');
      await tx.insert(tradeflowkitLeadSourceEvents).values({
        tenantId: tenant,
        createdByUserId: actor,
        adapterKey: 'operator-template',
        eventType: 'configuration',
        status: 'configured',
        metadata: { templateKey: template.key, followupSteps: template.followupSequence.length },
      });
      await tx.insert(activityFeed).values({
        tenantId: tenant,
        userId: actor,
        action: 'template_applied',
        entityType: 'tradeflowkit_lead_settings',
        entityId: settings.id,
        metadata: { templateKey: template.key, followupSteps: template.followupSequence.length },
      });
      return { kind: 'applied' as const, settings, captureForm };
    });
    if (outcome.kind === 'settings_conflict') return reply.code(409).send({ error: 'Lead settings changed; reload and retry', code: 'LEAD_SETTINGS_VERSION_CONFLICT' });
    if (outcome.kind === 'capture_conflict') return reply.code(409).send({ error: 'Capture profile changed; reload and retry', code: 'LEAD_CAPTURE_VERSION_CONFLICT' });
    return settingsResponse({ settings: outcome.settings, captureForm: outcome.captureForm });
  });

  app.get('/v1/modules/tradeflowkit/leads/source-adapters', { preHandler: [...readGuards] }, async () => ({
    adapters: SOURCE_ADAPTERS.map(adapter => ({
      ...adapter,
      publicIngress: false,
      validationMode: 'authenticated_sample_only',
    })),
  }));

  app.post('/v1/modules/tradeflowkit/leads/source-adapters/:adapterKey/validate', { preHandler: [...adminGuards] }, async (request, reply) => {
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const { adapterKey } = request.params as { adapterKey: string };
    const adapter = SOURCE_ADAPTERS.find(item => item.key === adapterKey);
    if (!adapter) return reply.code(404).send({ error: 'Source adapter not found', code: 'LEAD_SOURCE_ADAPTER_NOT_FOUND' });
    let sample: Record<string, unknown>;
    try {
      const body = record(request.body);
      onlyFields(body, ['sample']);
      sample = record(body.sample);
      if (Buffer.byteLength(JSON.stringify(sample), 'utf8') > 8_192) throw new LeadOperationsInputError('PAYLOAD_TOO_LARGE', 'sample');
      parseTradeFlowKitLeadCreate(sample);
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const moduleId = await tradeFlowKitModuleId();
    const idempotency = await beginIdempotentOperation({
      tenantId: tenant,
      moduleId,
      scope: 'tradeflowkit.lead-source.validate.v1',
      idempotencyKey: key,
      request: { adapterKey, sample },
    });
    if (idempotency.state === 'replay') return reply.code(idempotency.responseStatus).send(idempotency.responseJson);
    if (idempotency.state === 'conflict') return reply.code(409).send({ error: 'Idempotency key was used with a different adapter sample', code: 'IDEMPOTENCY_KEY_REUSE' });
    if (idempotency.state === 'in_progress') return reply.code(409).send({ error: 'Adapter validation is already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' });
    const response = await db.transaction(async tx => {
      const [event] = await tx.insert(tradeflowkitLeadSourceEvents).values({
        tenantId: tenant,
        createdByUserId: actor,
        adapterKey,
        eventType: 'validation',
        status: 'validated',
        metadata: {
          acceptedFields: Object.keys(sample).sort(),
          payloadBytes: Buffer.byteLength(JSON.stringify(sample), 'utf8'),
          consentFieldPresent: Object.hasOwn(sample, 'consentToSms'),
          publicIngress: false,
        },
      }).returning({ id: tradeflowkitLeadSourceEvents.id, createdAt: tradeflowkitLeadSourceEvents.createdAt });
      const result = {
        valid: true,
        adapterKey,
        acceptedFields: Object.keys(sample).sort(),
        publicIngress: false,
        event,
      };
      await completeIdempotentOperation({
        tenantId: tenant,
        id: idempotency.id,
        leaseExpiresAt: idempotency.leaseExpiresAt,
        responseStatus: 200,
        responseJson: result,
      }, tx);
      return result;
    });
    return response;
  });

  app.get('/v1/modules/tradeflowkit/leads/source-events', { preHandler: [...readGuards] }, async (request, reply) => {
    const query = request.query as { limit?: string; adapterKey?: string };
    const limit = query.limit === undefined ? 25 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) return reply.code(400).send({ error: 'limit must be from 1 to 100', code: 'LIMIT_INVALID' });
    const adapterKey = query.adapterKey?.trim() || null;
    if (adapterKey && adapterKey.length > 40) return reply.code(400).send({ error: 'adapterKey is too long', code: 'FIELD_TOO_LONG', field: 'adapterKey' });
    const conditions = [eq(tradeflowkitLeadSourceEvents.tenantId, tenantId(request))];
    if (adapterKey) conditions.push(eq(tradeflowkitLeadSourceEvents.adapterKey, adapterKey));
    const events = await db.select({
      id: tradeflowkitLeadSourceEvents.id,
      adapterKey: tradeflowkitLeadSourceEvents.adapterKey,
      eventType: tradeflowkitLeadSourceEvents.eventType,
      status: tradeflowkitLeadSourceEvents.status,
      metadata: tradeflowkitLeadSourceEvents.metadata,
      createdAt: tradeflowkitLeadSourceEvents.createdAt,
    }).from(tradeflowkitLeadSourceEvents).where(and(...conditions))
      .orderBy(desc(tradeflowkitLeadSourceEvents.createdAt), desc(tradeflowkitLeadSourceEvents.id)).limit(limit);
    return { events };
  });

  app.get('/v1/modules/tradeflowkit/leads/:id/followups', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const [lead] = await db.select({ id: tradeflowkitLeads.id }).from(tradeflowkitLeads).where(and(
      eq(tradeflowkitLeads.tenantId, tenant),
      eq(tradeflowkitLeads.id, id),
      isNull(tradeflowkitLeads.deletedAt),
    )).limit(1);
    if (!lead) return reply.code(404).send({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });
    const followups = await db.select({
      id: tradeflowkitLeadFollowups.id,
      stepNumber: tradeflowkitLeadFollowups.stepNumber,
      channel: tradeflowkitLeadFollowups.channel,
      dueAt: tradeflowkitLeadFollowups.dueAt,
      status: tradeflowkitLeadFollowups.status,
      lastAttemptAt: tradeflowkitLeadFollowups.lastAttemptAt,
      completedAt: tradeflowkitLeadFollowups.completedAt,
      errorCode: tradeflowkitLeadFollowups.errorCode,
      version: tradeflowkitLeadFollowups.version,
      createdAt: tradeflowkitLeadFollowups.createdAt,
      updatedAt: tradeflowkitLeadFollowups.updatedAt,
    }).from(tradeflowkitLeadFollowups).where(and(
      eq(tradeflowkitLeadFollowups.tenantId, tenant),
      eq(tradeflowkitLeadFollowups.leadId, id),
    )).orderBy(tradeflowkitLeadFollowups.stepNumber);
    return { followups };
  });

  app.post('/v1/modules/tradeflowkit/leads/:id/followups/:followupId/queue', { preHandler: [...writeGuards] }, async (request, reply) => {
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    let expectedVersion: number;
    try {
      const body = record(request.body);
      onlyFields(body, ['expectedVersion']);
      expectedVersion = versionValue(body.expectedVersion);
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const { id, followupId } = request.params as { id: string; followupId: string };
    const tenant = tenantId(request);
    const actor = userId(request);
    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:lead-followup:${tenant}:${followupId}`}))`);
      const [followup] = await tx.select().from(tradeflowkitLeadFollowups).where(and(
        eq(tradeflowkitLeadFollowups.tenantId, tenant),
        eq(tradeflowkitLeadFollowups.leadId, id),
        eq(tradeflowkitLeadFollowups.id, followupId),
      )).limit(1);
      if (!followup) return { kind: 'not_found' as const };
      if (followup.status === 'queued' && followup.outboxIdempotencyKey === key) return { kind: 'replay' as const, followup };
      if (followup.version !== expectedVersion) return { kind: 'version_conflict' as const };
      if (!['pending', 'failed'].includes(followup.status)) return { kind: 'status_conflict' as const };
      const [[lead], [settings]] = await Promise.all([
        tx.select({
          id: tradeflowkitLeads.id,
          name: tradeflowkitLeads.name,
          serviceType: tradeflowkitLeads.serviceType,
          email: tradeflowkitLeads.email,
          phone: tradeflowkitLeads.phone,
          consentToSms: tradeflowkitLeads.consentToSms,
        }).from(tradeflowkitLeads).where(and(
          eq(tradeflowkitLeads.tenantId, tenant),
          eq(tradeflowkitLeads.id, id),
          isNull(tradeflowkitLeads.deletedAt),
        )).limit(1),
        tx.select({
          emailEnabled: tradeflowkitLeadSettings.emailEnabled,
          smsEnabled: tradeflowkitLeadSettings.smsEnabled,
        }).from(tradeflowkitLeadSettings).where(eq(tradeflowkitLeadSettings.tenantId, tenant)).limit(1),
      ]);
      if (!lead) return { kind: 'not_found' as const };
      if (!settings || (followup.channel === 'email' ? !settings.emailEnabled : !settings.smsEnabled)) return { kind: 'channel_disabled' as const, channel: followup.channel };
      if (followup.channel === 'sms' && !lead.consentToSms) return { kind: 'consent_required' as const };
      const destination = followup.channel === 'email' ? lead.email : lead.phone;
      if (!destination) return { kind: 'destination_missing' as const, channel: followup.channel };
      let body = renderLeadTemplate(followup.messageTemplate, lead);
      if (followup.channel === 'sms' && !/\b(?:stop|unsubscribe)\b/i.test(body)) body += ' Reply STOP to opt out.';
      const subject = followup.channel === 'email' ? 'Following up on your request' : null;
      const queued = await enqueueOutboxMessage({
        tenantId: tenant,
        moduleId: await tradeFlowKitModuleId(tx),
        requestedByUserId: actor,
        channel: followup.channel,
        destination,
        subject,
        body,
        idempotencyKey: key,
        context: { entityType: 'lead_followup', entityId: followup.id, leadId: id, stepNumber: followup.stepNumber },
      }, tx);
      if (queued.duplicate) {
        const existing = queued.message as Record<string, unknown>;
        const existingSubject = existing.subject === undefined || existing.subject === null ? null : String(existing.subject);
        if (String(existing.channel) !== followup.channel || String(existing.destination) !== destination || existingSubject !== subject || String(existing.body) !== body) {
          return { kind: 'idempotency_conflict' as const };
        }
      }
      const [updated] = await tx.update(tradeflowkitLeadFollowups).set({
        status: 'queued',
        outboxIdempotencyKey: key,
        lastAttemptAt: new Date(),
        errorCode: null,
        updatedAt: new Date(),
        version: sql`${tradeflowkitLeadFollowups.version} + 1`,
      }).where(and(
        eq(tradeflowkitLeadFollowups.tenantId, tenant),
        eq(tradeflowkitLeadFollowups.id, followupId),
        eq(tradeflowkitLeadFollowups.version, expectedVersion),
        inArray(tradeflowkitLeadFollowups.status, ['pending', 'failed']),
      )).returning();
      if (!updated) return { kind: 'version_conflict' as const };
      await tx.insert(activityFeed).values({
        tenantId: tenant,
        userId: actor,
        action: 'followup_queued',
        entityType: 'tradeflowkit_lead',
        entityId: id,
        metadata: { followupId, stepNumber: followup.stepNumber, channel: followup.channel, duplicate: queued.duplicate },
      });
      return { kind: 'queued' as const, followup: updated, duplicate: queued.duplicate };
    });
    if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Lead follow-up not found', code: 'LEAD_FOLLOWUP_NOT_FOUND' });
    if (outcome.kind === 'replay') return { followup: outcome.followup, status: 'queued', duplicate: true };
    if (outcome.kind === 'version_conflict') return reply.code(409).send({ error: 'Lead follow-up changed; reload and retry', code: 'LEAD_FOLLOWUP_VERSION_CONFLICT' });
    if (outcome.kind === 'status_conflict') return reply.code(409).send({ error: 'Lead follow-up cannot be queued from its current status', code: 'LEAD_FOLLOWUP_STATUS_CONFLICT' });
    if (outcome.kind === 'channel_disabled') return reply.code(409).send({ error: `${outcome.channel.toUpperCase()} follow-ups are disabled in lead settings`, code: 'LEAD_FOLLOWUP_CHANNEL_DISABLED' });
    if (outcome.kind === 'consent_required') return reply.code(409).send({ error: 'SMS consent is required before queuing this follow-up', code: 'LEAD_SMS_CONSENT_REQUIRED' });
    if (outcome.kind === 'destination_missing') return reply.code(409).send({ error: `Lead has no ${outcome.channel} destination`, code: 'LEAD_FOLLOWUP_DESTINATION_UNAVAILABLE' });
    if (outcome.kind === 'idempotency_conflict') return reply.code(409).send({ error: 'Idempotency key was already used for a different message', code: 'IDEMPOTENCY_KEY_REUSE' });
    return reply.code(outcome.duplicate ? 200 : 202).send({ followup: outcome.followup, status: 'queued', duplicate: outcome.duplicate });
  });

  app.post('/v1/modules/tradeflowkit/leads/:id/followups/:followupId/complete', { preHandler: [...writeGuards] }, async (request, reply) => {
    let expectedVersion: number;
    try {
      const body = record(request.body);
      onlyFields(body, ['expectedVersion']);
      expectedVersion = versionValue(body.expectedVersion);
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const { id, followupId } = request.params as { id: string; followupId: string };
    const tenant = tenantId(request);
    const actor = userId(request);
    const [updated] = await db.transaction(async tx => {
      const rows = await tx.update(tradeflowkitLeadFollowups).set({
        status: 'completed',
        completedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${tradeflowkitLeadFollowups.version} + 1`,
      }).where(and(
        eq(tradeflowkitLeadFollowups.tenantId, tenant),
        eq(tradeflowkitLeadFollowups.leadId, id),
        eq(tradeflowkitLeadFollowups.id, followupId),
        eq(tradeflowkitLeadFollowups.version, expectedVersion),
        inArray(tradeflowkitLeadFollowups.status, ['pending', 'queued', 'failed']),
      )).returning();
      if (!rows[0]) return [];
      await tx.insert(activityFeed).values({
        tenantId: tenant,
        userId: actor,
        action: 'followup_completed',
        entityType: 'tradeflowkit_lead',
        entityId: id,
        metadata: { followupId },
      });
      return rows;
    });
    if (!updated) return reply.code(404).send({ error: 'Lead follow-up not found or changed', code: 'LEAD_FOLLOWUP_NOT_FOUND_OR_CHANGED' });
    return updated;
  });

  app.post('/v1/modules/tradeflowkit/leads/test-message', { preHandler: [...adminGuards] }, async (request, reply) => {
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    let expectedVersion: number;
    try {
      const body = record(request.body);
      onlyFields(body, ['channel', 'confirmDelivery', 'expectedVersion']);
      const channel = textValue(body.channel, 'channel', 20, true);
      if (channel !== 'email') throw new LeadOperationsInputError('TEST_MESSAGE_EMAIL_ONLY', 'channel');
      if (boolValue(body.confirmDelivery, 'confirmDelivery') !== true) throw new LeadOperationsInputError('DELIVERY_CONFIRMATION_REQUIRED', 'confirmDelivery');
      expectedVersion = versionValue(body.expectedVersion);
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const state = await ensureTradeFlowKitLeadOperationDefaults(tenant, actor);
    if (state.settings.version !== expectedVersion) return reply.code(409).send({ error: 'Lead settings changed; reload and retry', code: 'LEAD_SETTINGS_VERSION_CONFLICT' });
    if (!state.settings.emailEnabled) return reply.code(409).send({ error: 'Email is disabled in lead settings', code: 'LEAD_EMAIL_DISABLED' });
    const [actorUser] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(and(
      eq(users.id, actor),
      eq(users.status, 'active'),
      isNull(users.deletedAt),
    )).limit(1);
    if (!actorUser) return reply.code(404).send({ error: 'Authenticated user not found', code: 'USER_NOT_FOUND' });
    const subject = 'TradeFlowKit delivery check';
    const body = renderLeadTemplate(state.settings.emailTemplate, {
      name: actorUser.name,
      serviceType: 'notification delivery test',
    });
    const queued = await enqueueOutboxMessage({
      tenantId: tenant,
      moduleId: await tradeFlowKitModuleId(),
      requestedByUserId: actor,
      channel: 'email',
      destination: actorUser.email,
      subject,
      body,
      idempotencyKey: key,
      context: { entityType: 'lead_settings', entityId: state.settings.id, sourceRoute: 'test-message' },
    });
    if (queued.duplicate) {
      const existing = queued.message as Record<string, unknown>;
      if (String(existing.channel) !== 'email' || String(existing.destination) !== actorUser.email || String(existing.subject) !== subject || String(existing.body) !== body) {
        return reply.code(409).send({ error: 'Idempotency key was already used for a different message', code: 'IDEMPOTENCY_KEY_REUSE' });
      }
    }
    await db.insert(activityFeed).values({
      tenantId: tenant,
      userId: actor,
      action: 'test_message_queued',
      entityType: 'tradeflowkit_lead_settings',
      entityId: state.settings.id,
      metadata: { channel: 'email', duplicate: queued.duplicate, destinationOwner: 'authenticated_user' },
    });
    return reply.code(queued.duplicate ? 200 : 202).send({ status: 'queued', channel: 'email', duplicate: queued.duplicate });
  });
}
