import type { FastifyInstance } from 'fastify';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import { activityFeed, directorySites, modules, tenantUsers, tradeflowkitCustomers, tradeflowkitJobs } from '../schema.js';
import { requireTenantMember, requireTenantModuleAccess, requireTenantModuleWriteAccess } from '../lib/tenant-auth.js';
import { registerSharedJobHandler, type SharedJobContext } from '../lib/shared-background-jobs.js';
import { createSharedSchedule } from '../lib/shared-schedules-exports.js';
import { appendActivityEvent } from '../lib/shared-usage-activity.js';
import { allocateTradeFlowKitNumber } from './tradeflowkit-routes.js';

export const TRADEFLOWKIT_RECURRING_JOB_HANDLER = 'tradeflowkit.recurring-job.create.v1';
const readGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];

class RecurringInputError extends Error {
  constructor(public code: string, public field?: string) { super(code); }
}

function object(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RecurringInputError('BODY_INVALID');
  return raw as Record<string, unknown>;
}

function textValue(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new RecurringInputError('FIELD_REQUIRED', field);
    return null;
  }
  if (typeof value !== 'string') throw new RecurringInputError('FIELD_INVALID', field);
  const result = value.trim();
  if (required && !result) throw new RecurringInputError('FIELD_REQUIRED', field);
  if (result.length > max) throw new RecurringInputError('FIELD_TOO_LONG', field);
  return result || null;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new RecurringInputError('FIELD_INVALID', field);
  return Number(value);
}

function dateValue(value: unknown, field: string): Date {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new RecurringInputError('FIELD_INVALID', field);
  return new Date(value);
}

function sendInputError(reply: any, error: unknown): boolean {
  if (!(error instanceof RecurringInputError)) return false;
  reply.code(400).send({ error: 'Invalid recurring job schedule', code: error.code, field: error.field });
  return true;
}

function publicSchedule(raw: unknown) {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    payload: (row.payloadJson ?? row.payload_json ?? {}) as Record<string, unknown>,
    intervalSeconds: Number(row.intervalSeconds ?? row.interval_seconds ?? 0),
    nextRunAt: row.nextRunAt ?? row.next_run_at ?? null,
    enabled: Boolean(row.enabled),
    lastEnqueuedAt: row.lastEnqueuedAt ?? row.last_enqueued_at ?? null,
    lastErrorCode: row.lastErrorCode ?? row.last_error_code ?? null,
    version: Number(row.version ?? 0),
    createdAt: row.createdAt ?? row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? null,
  };
}

async function tradeFlowKitModuleId(): Promise<string> {
  const [module] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!module) throw Object.assign(new Error('TradeFlowKit module registry is unavailable'), { code: 'TRADEFLOWKIT_MODULE_UNAVAILABLE' });
  return module.id;
}

function recurringPayload(raw: unknown) {
  const body = object(raw);
  const priority = textValue(body.priority, 'priority', 20) ?? 'normal';
  if (!['low', 'normal', 'high', 'urgent'].includes(priority)) throw new RecurringInputError('PRIORITY_INVALID', 'priority');
  const intervalDays = integer(body.intervalDays, 'intervalDays', 1, 30);
  return {
    name: textValue(body.name, 'name', 120, true)!,
    customerId: textValue(body.customerId, 'customerId', 36, true)!,
    siteId: textValue(body.siteId, 'siteId', 36),
    assignedToUserId: textValue(body.assignedToUserId, 'assignedToUserId', 36),
    title: textValue(body.title, 'title', 200, true)!,
    description: textValue(body.description, 'description', 4_000),
    priority,
    intervalDays,
    intervalSeconds: intervalDays * 86_400,
    durationMinutes: body.durationMinutes === undefined ? 60 : integer(body.durationMinutes, 'durationMinutes', 15, 1_440),
    nextRunAt: dateValue(body.nextRunAt, 'nextRunAt'),
  };
}

async function validateReferences(tenantId: string, input: { customerId: string; siteId: string | null; assignedToUserId: string | null }) {
  const [customer] = await db.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
    eq(tradeflowkitCustomers.tenantId, tenantId), eq(tradeflowkitCustomers.id, input.customerId), isNull(tradeflowkitCustomers.deletedAt),
  )).limit(1);
  if (!customer) return 'CUSTOMER_NOT_FOUND';
  if (input.siteId) {
    const [site] = await db.select({ id: directorySites.id }).from(directorySites).where(and(
      eq(directorySites.tenantId, tenantId), eq(directorySites.id, input.siteId), isNull(directorySites.archivedAt),
    )).limit(1);
    if (!site) return 'SITE_NOT_FOUND';
  }
  if (input.assignedToUserId) {
    const [member] = await db.select({ id: tenantUsers.userId }).from(tenantUsers).where(and(
      eq(tenantUsers.tenantId, tenantId), eq(tenantUsers.userId, input.assignedToUserId),
    )).limit(1);
    if (!member) return 'ASSIGNEE_NOT_FOUND';
  }
  return null;
}

async function createRecurringJob(context: SharedJobContext): Promise<void> {
  const scheduleId = textValue(context.payload.sharedScheduleId, 'sharedScheduleId', 36, true)!;
  const customerId = textValue(context.payload.customerId, 'customerId', 36, true)!;
  const title = textValue(context.payload.title, 'title', 200, true)!;
  const scheduledFor = dateValue(context.payload.scheduledFor, 'scheduledFor');
  const durationMinutes = integer(context.payload.durationMinutes ?? 60, 'durationMinutes', 15, 1_440);
  const siteId = textValue(context.payload.siteId, 'siteId', 36);
  const assignedToUserId = textValue(context.payload.assignedToUserId, 'assignedToUserId', 36);
  const description = textValue(context.payload.description, 'description', 4_000);
  const priority = textValue(context.payload.priority, 'priority', 20) ?? 'normal';
  const referenceFailure = await validateReferences(context.tenantId, { customerId, siteId, assignedToUserId });
  if (referenceFailure) throw Object.assign(new Error('Recurring job reference is unavailable'), { code: `RECURRING_${referenceFailure}` });
  const sourceId = `shared-schedule:${scheduleId}:${scheduledFor.toISOString()}`;

  await db.transaction(async tx => {
    const [existing] = await tx.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
      eq(tradeflowkitJobs.tenantId, context.tenantId), eq(tradeflowkitJobs.sourceId, sourceId),
    )).limit(1);
    if (existing) return;
    const number = await allocateTradeFlowKitNumber(tx, context.tenantId, 'job');
    const [job] = await tx.insert(tradeflowkitJobs).values({
      tenantId: context.tenantId, customerId, createdByUserId: context.requestedByUserId,
      number, siteId, assignedToUserId, title, description, priority, status: 'scheduled',
      scheduledStart: scheduledFor,
      scheduledEnd: new Date(scheduledFor.getTime() + durationMinutes * 60_000),
      sourceId,
    }).returning();
    if (context.requestedByUserId) await tx.insert(activityFeed).values({
      tenantId: context.tenantId, userId: context.requestedByUserId,
      action: 'created_from_recurring_schedule', entityType: 'tradeflowkit_job', entityId: job.id,
      metadata: { scheduleId, scheduledFor: scheduledFor.toISOString(), sourceId, number },
    });
    await appendActivityEvent({
      tenantId: context.tenantId, moduleId: context.moduleId, actorUserId: context.requestedByUserId,
      objectType: 'tradeflowkit_job', objectId: job.id, eventType: 'recurring_job_created',
      summary: `Created scheduled job ${number} from recurring schedule`,
      metadata: { scheduleId, scheduledFor: scheduledFor.toISOString(), sourceId }, correlationId: context.correlationId,
    }, tx);
  });
}

registerSharedJobHandler(TRADEFLOWKIT_RECURRING_JOB_HANDLER, createRecurringJob);

export async function registerTradeFlowKitRecurringRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/tradeflowkit/recurring-jobs', { preHandler: [...readGuards] }, async request => {
    const tenantId = String((request as any).tenantContext.tenantId);
    const moduleId = await tradeFlowKitModuleId();
    const result = await db.execute(sql`
      SELECT id, name, payload_json, interval_seconds, next_run_at, enabled,
        last_enqueued_at, last_error_code, version, created_at, updated_at
      FROM shared_schedules
      WHERE tenant_id = ${tenantId} AND module_id = ${moduleId} AND handler_key = ${TRADEFLOWKIT_RECURRING_JOB_HANDLER}
      ORDER BY created_at DESC LIMIT 200
    `);
    return { schedules: result.rows.map(publicSchedule) };
  });

  app.post('/v1/modules/tradeflowkit/recurring-jobs', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input;
    try { input = recurringPayload(request.body); } catch (error) { if (sendInputError(reply, error)) return; throw error; }
    const tenantId = String((request as any).tenantContext.tenantId);
    const actorUserId = String((request as any).user.id);
    const moduleId = await tradeFlowKitModuleId();
    const referenceFailure = await validateReferences(tenantId, input);
    if (referenceFailure) return reply.code(404).send({ error: referenceFailure.replaceAll('_', ' ').toLowerCase(), code: referenceFailure });
    const schedule = await createSharedSchedule({
      tenantId, moduleId, actorUserId, name: input.name, handlerKey: TRADEFLOWKIT_RECURRING_JOB_HANDLER,
      payload: {
        customerId: input.customerId, siteId: input.siteId, assignedToUserId: input.assignedToUserId,
        title: input.title, description: input.description, priority: input.priority, durationMinutes: input.durationMinutes,
      },
      intervalSeconds: input.intervalSeconds, nextRunAt: input.nextRunAt,
    });
    await appendActivityEvent({
      tenantId, moduleId, actorUserId, objectType: 'tradeflowkit_recurring_schedule', objectId: String((schedule as any).id),
      eventType: 'recurring_schedule_saved', summary: `Saved recurring job schedule ${input.name}`,
      metadata: { intervalDays: input.intervalDays, nextRunAt: input.nextRunAt.toISOString() }, correlationId: request.id,
    });
    return reply.code(201).send({ schedule: publicSchedule(schedule) });
  });

  app.patch('/v1/modules/tradeflowkit/recurring-jobs/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = String((request as any).tenantContext.tenantId);
    const actorUserId = String((request as any).user.id);
    const moduleId = await tradeFlowKitModuleId();
    let expectedVersion: number;
    let enabled: boolean;
    let nextRunAt: Date | null = null;
    try {
      const body = object(request.body);
      expectedVersion = integer(body.expectedVersion, 'expectedVersion', 1, 1_000_000);
      if (typeof body.enabled !== 'boolean') throw new RecurringInputError('FIELD_INVALID', 'enabled');
      enabled = body.enabled;
      if (body.nextRunAt !== undefined) nextRunAt = dateValue(body.nextRunAt, 'nextRunAt');
    } catch (error) { if (sendInputError(reply, error)) return; throw error; }
    const result = await db.execute(sql`
      UPDATE shared_schedules SET enabled = ${enabled}, next_run_at = COALESCE(${nextRunAt}, next_run_at),
        version = version + 1, updated_at = NOW()
      WHERE tenant_id = ${tenantId} AND module_id = ${moduleId} AND id = ${id}
        AND handler_key = ${TRADEFLOWKIT_RECURRING_JOB_HANDLER} AND version = ${expectedVersion}
      RETURNING *
    `);
    if (!result.rows[0]) return reply.code(409).send({ error: 'Recurring schedule changed or was not found', code: 'RECURRING_SCHEDULE_VERSION_CONFLICT' });
    await appendActivityEvent({
      tenantId, moduleId, actorUserId, objectType: 'tradeflowkit_recurring_schedule', objectId: id,
      eventType: enabled ? 'recurring_schedule_enabled' : 'recurring_schedule_disabled',
      summary: `${enabled ? 'Enabled' : 'Disabled'} recurring job schedule`, correlationId: request.id,
    });
    return { schedule: publicSchedule(result.rows[0]) };
  });
}
