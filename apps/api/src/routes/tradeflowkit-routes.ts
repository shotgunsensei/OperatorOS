import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  directoryContacts,
  directoryOrganizationContacts,
  directoryOrganizations,
  directorySites,
  modules,
  tradeflowkitComments,
  tradeflowkitCustomers,
  tradeflowkitInvoiceItems,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitLeads,
  tradeflowkitPayments,
  tradeflowkitQuoteItems,
  tradeflowkitQuotes,
  tradeflowkitSettings,
  tradeflowkitTagAssignments,
  tradeflowkitTags,
  tradeflowkitTaskDependencies,
  tradeflowkitTasks,
  tenantUsers,
} from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import { enqueueOutboxMessage } from '../lib/shared-notification-outbox.js';
import { getTradeFlowKitPaymentProvider } from '../lib/tradeflowkit-payment-provider.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const ENTITY_TYPES = new Set(['lead', 'customer', 'job', 'task', 'quote', 'invoice', 'payment']);
const TAG_ENTITY_TYPES = new Set(['lead', 'customer', 'job', 'task', 'quote', 'invoice']);
const TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'completed', 'canceled']);
const TASK_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

type RequestContext = { tenantId: string };
type RequestUser = { id: string };
type Executor = Pick<typeof db, 'execute' | 'select' | 'insert' | 'update'>;

class InputError extends Error {
  constructor(public code: string, public field?: string) { super(code); }
}

function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('BODY_INVALID');
  return raw as Record<string, unknown>;
}

function stringValue(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new InputError('FIELD_REQUIRED', field);
    return null;
  }
  if (typeof value !== 'string') throw new InputError('FIELD_INVALID', field);
  const normalized = value.trim();
  if (required && !normalized) throw new InputError('FIELD_REQUIRED', field);
  if (normalized.length > max) throw new InputError('FIELD_TOO_LONG', field);
  return normalized || null;
}

function integer(value: unknown, field: string, min: number, max: number, required = false): number | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new InputError('FIELD_REQUIRED', field);
    return null;
  }
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new InputError('FIELD_INVALID', field);
  }
  return value as number;
}

function dateValue(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new InputError('FIELD_INVALID', field);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InputError('FIELD_INVALID', field);
  return date;
}

function inputFailure(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof InputError)) return false;
  reply.code(400).send({ error: 'Invalid TradeFlowKit input', code: error.code, field: error.field });
  return true;
}

function tenantId(request: FastifyRequest): string {
  return (request as FastifyRequest & { tenantContext: RequestContext }).tenantContext.tenantId;
}

function userId(request: FastifyRequest): string {
  return (request as FastifyRequest & { user: RequestUser }).user.id;
}

function idempotencyKey(request: FastifyRequest): string | null {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^[A-Za-z0-9._:-]{8,200}$/.test(value)) return null;
  return value;
}

function pageQuery(raw: unknown) {
  const query = record(raw ?? {});
  const limitRaw = query.limit === undefined ? 50 : Number(query.limit);
  const offsetRaw = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100) throw new InputError('LIMIT_INVALID', 'limit');
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0 || offsetRaw > 100_000) throw new InputError('OFFSET_INVALID', 'offset');
  return {
    limit: limitRaw,
    offset: offsetRaw,
    search: stringValue(query.search, 'search', 100),
    status: stringValue(query.status, 'status', 40),
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function issueToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

function securePublicReply(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('X-Content-Type-Options', 'nosniff');
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(headers: string[], rows: unknown[][]): string {
  return `${headers.map(csvCell).join(',')}\r\n${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export async function allocateTradeFlowKitNumber(executor: Executor, tenant: string, kind: 'job' | 'quote' | 'invoice'): Promise<number> {
  const result = await executor.execute(sql`
    INSERT INTO tradeflowkit_sequences (tenant_id, kind, last_number)
    VALUES (${tenant}, ${kind}, 1)
    ON CONFLICT (tenant_id, kind) DO UPDATE SET
      last_number = tradeflowkit_sequences.last_number + 1,
      updated_at = NOW()
    RETURNING last_number
  `);
  return Number(result.rows[0].last_number);
}

async function moduleId(): Promise<string> {
  const [row] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'tradeflowkit')).limit(1);
  if (!row) throw new Error('TradeFlowKit module registry row is missing');
  return row.id;
}

async function entityExists(tenant: string, type: string, id: string): Promise<boolean> {
  const tableByType = {
    lead: tradeflowkitLeads,
    customer: tradeflowkitCustomers,
    job: tradeflowkitJobs,
    task: tradeflowkitTasks,
    quote: tradeflowkitQuotes,
    invoice: tradeflowkitInvoices,
    payment: tradeflowkitPayments,
  } as const;
  const table = tableByType[type as keyof typeof tableByType];
  if (!table) return false;
  const deletedColumn = 'deletedAt' in table ? (table as any).deletedAt : null;
  const [row] = await db.select({ id: (table as any).id }).from(table as any).where(and(
    eq((table as any).id, id), eq((table as any).tenantId, tenant),
    ...(deletedColumn ? [isNull(deletedColumn)] : []),
  )).limit(1);
  return !!row;
}

async function audit(executor: Executor, input: {
  tenantId: string; userId: string; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown>;
}) {
  await executor.insert(activityFeed).values({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    entityType: `tradeflowkit_${input.entityType}`,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}

export async function registerTradeFlowKitRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/tradeflowkit/operations', { preHandler: [...readGuards] }, async (request, reply) => {
    let query;
    try { query = pageQuery(request.query); } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const jobWhere = and(
      eq(tradeflowkitJobs.tenantId, tenant), isNull(tradeflowkitJobs.deletedAt),
      ...(query.status ? [eq(tradeflowkitJobs.status, query.status)] : []),
      ...(query.search ? [or(ilike(tradeflowkitJobs.title, `%${query.search}%`), ilike(tradeflowkitJobs.description, `%${query.search}%`))!] : []),
    );
    const [jobs, tasks, payments, settings, counts] = await Promise.all([
      db.select().from(tradeflowkitJobs).where(jobWhere).orderBy(desc(tradeflowkitJobs.updatedAt)).limit(query.limit).offset(query.offset),
      db.select().from(tradeflowkitTasks).where(and(eq(tradeflowkitTasks.tenantId, tenant), isNull(tradeflowkitTasks.deletedAt))).orderBy(asc(tradeflowkitTasks.sortOrder), desc(tradeflowkitTasks.updatedAt)).limit(250),
      db.select().from(tradeflowkitPayments).where(eq(tradeflowkitPayments.tenantId, tenant)).orderBy(desc(tradeflowkitPayments.paidAt)).limit(100),
      db.select().from(tradeflowkitSettings).where(eq(tradeflowkitSettings.tenantId, tenant)).limit(1),
      db.execute(sql`
        SELECT
          (SELECT COUNT(*)::int FROM tradeflowkit_leads WHERE tenant_id = ${tenant} AND deleted_at IS NULL) AS leads,
          (SELECT COUNT(*)::int FROM tradeflowkit_jobs WHERE tenant_id = ${tenant} AND deleted_at IS NULL) AS jobs,
          (SELECT COUNT(*)::int FROM tradeflowkit_tasks WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status <> 'canceled') AS tasks,
          (SELECT COUNT(*)::int FROM tradeflowkit_tasks WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status = 'completed') AS completed_tasks,
          (SELECT COALESCE(SUM(total_cents),0)::bigint FROM tradeflowkit_invoices WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status <> 'void') AS invoiced_cents,
          (SELECT COALESCE(SUM(amount_cents),0)::bigint FROM tradeflowkit_payments WHERE tenant_id = ${tenant} AND status = 'succeeded') AS collected_cents,
          (SELECT COALESCE(SUM(balance_cents),0)::bigint FROM tradeflowkit_invoices WHERE tenant_id = ${tenant} AND deleted_at IS NULL AND status NOT IN ('void','paid')) AS outstanding_cents
      `),
    ]);
    return {
      jobs, tasks, payments, settings: settings[0] ?? null,
      metrics: counts.rows[0], pagination: { limit: query.limit, offset: query.offset, returned: jobs.length },
    };
  });

  app.get('/v1/modules/tradeflowkit/exports/:kind.csv', { preHandler: [...readGuards] }, async (request, reply) => {
    const { kind } = request.params as { kind: string };
    const tenant = tenantId(request);
    let output: string;
    if (kind === 'customers') {
      const rows = await db.select().from(tradeflowkitCustomers).where(and(eq(tradeflowkitCustomers.tenantId, tenant), isNull(tradeflowkitCustomers.deletedAt))).orderBy(asc(tradeflowkitCustomers.name));
      output = csv(['id','organization_id','name','email','phone','address','created_at'], rows.map(row => [row.id,row.organizationId,row.name,row.email,row.phone,row.address,row.createdAt]));
    } else if (kind === 'invoices') {
      const rows = await db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.tenantId, tenant), isNull(tradeflowkitInvoices.deletedAt))).orderBy(asc(tradeflowkitInvoices.number));
      output = csv(['id','number','customer_id','job_id','source_quote_id','status','subtotal_cents','tax_cents','discount_cents','total_cents','paid_cents','balance_cents','due_date','paid_at'], rows.map(row => [row.id,row.number,row.customerId,row.jobId,row.sourceQuoteId,row.status,row.subtotalCents,row.taxCents,row.discountCents,row.totalCents,row.paidCents,row.balanceCents,row.dueDate,row.paidAt]));
    } else if (kind === 'payments') {
      const rows = await db.select().from(tradeflowkitPayments).where(eq(tradeflowkitPayments.tenantId, tenant)).orderBy(asc(tradeflowkitPayments.paidAt));
      output = csv(['id','invoice_id','amount_cents','method','status','provider','provider_reference','reference','paid_at'], rows.map(row => [row.id,row.invoiceId,row.amountCents,row.method,row.status,row.provider,row.providerReference,row.reference,row.paidAt]));
    } else {
      return reply.code(404).send({ error: 'Export not found', code: 'EXPORT_NOT_FOUND' });
    }
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="tradeflowkit-${kind}.csv"`)
      .header('Cache-Control', 'private, no-store').send(output);
  });

  app.get('/v1/modules/tradeflowkit/jobs/:id', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const [job] = await db.select().from(tradeflowkitJobs).where(and(
      eq(tradeflowkitJobs.id, id), eq(tradeflowkitJobs.tenantId, tenant), isNull(tradeflowkitJobs.deletedAt),
    )).limit(1);
    if (!job) return reply.code(404).send({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
    const [tasks, comments, dependencies] = await Promise.all([
      db.select().from(tradeflowkitTasks).where(and(eq(tradeflowkitTasks.tenantId, tenant), eq(tradeflowkitTasks.jobId, id), isNull(tradeflowkitTasks.deletedAt))).orderBy(asc(tradeflowkitTasks.sortOrder), asc(tradeflowkitTasks.createdAt)),
      db.select().from(tradeflowkitComments).where(and(eq(tradeflowkitComments.tenantId, tenant), eq(tradeflowkitComments.entityType, 'job'), eq(tradeflowkitComments.entityId, id), isNull(tradeflowkitComments.deletedAt))).orderBy(desc(tradeflowkitComments.createdAt)),
      db.execute(sql`
        SELECT d.* FROM tradeflowkit_task_dependencies d
        JOIN tradeflowkit_tasks t ON t.tenant_id = d.tenant_id AND t.id = d.task_id
        WHERE d.tenant_id = ${tenant} AND t.job_id = ${id}
      `),
    ]);
    return { job, tasks, comments, dependencies: dependencies.rows };
  });

  app.patch('/v1/modules/tradeflowkit/jobs/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    let body;
    try {
      const raw = record(request.body);
      const expectedVersion = integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)!;
      const status = stringValue(raw.status, 'status', 30);
      const priority = stringValue(raw.priority, 'priority', 20);
      if (status && !['lead','quoted','scheduled','in_progress','done','invoiced','paid','canceled'].includes(status)) throw new InputError('STATUS_INVALID', 'status');
      if (priority && !['low','normal','urgent'].includes(priority)) throw new InputError('PRIORITY_INVALID', 'priority');
      body = {
        expectedVersion,
        title: stringValue(raw.title, 'title', 200),
        description: stringValue(raw.description, 'description', 4_000),
        internalNotes: stringValue(raw.internalNotes, 'internalNotes', 10_000),
        status, priority,
        assignedToUserId: stringValue(raw.assignedToUserId, 'assignedToUserId', 36),
        siteId: stringValue(raw.siteId, 'siteId', 36),
        scheduledStart: dateValue(raw.scheduledStart, 'scheduledStart'),
        scheduledEnd: dateValue(raw.scheduledEnd, 'scheduledEnd'),
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    if (body.scheduledStart && body.scheduledEnd && body.scheduledEnd <= body.scheduledStart) {
      return reply.code(400).send({ error: 'Scheduled end must follow start', code: 'SCHEDULE_INVALID' });
    }
    if (body.assignedToUserId) {
      const [member] = await db.select({ id: tenantUsers.userId }).from(tenantUsers).where(and(eq(tenantUsers.tenantId, tenant), eq(tenantUsers.userId, body.assignedToUserId))).limit(1);
      if (!member) return reply.code(404).send({ error: 'Assignee not found', code: 'ASSIGNEE_NOT_FOUND' });
    }
    if (body.siteId) {
      const [site] = await db.select({ id: directorySites.id }).from(directorySites).where(and(eq(directorySites.tenantId, tenant), eq(directorySites.id, body.siteId), isNull(directorySites.archivedAt))).limit(1);
      if (!site) return reply.code(404).send({ error: 'Site not found', code: 'SITE_NOT_FOUND' });
    }
    const patch = Object.fromEntries(Object.entries(body).filter(([key, value]) => key !== 'expectedVersion' && value !== null));
    const [updated] = await db.transaction(async tx => {
      const rows = await tx.update(tradeflowkitJobs).set({
        ...patch,
        ...(body.status === 'done' ? { completedAt: new Date() } : {}),
        version: sql`${tradeflowkitJobs.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(tradeflowkitJobs.id, id), eq(tradeflowkitJobs.tenantId, tenant), eq(tradeflowkitJobs.version, body.expectedVersion), isNull(tradeflowkitJobs.deletedAt))).returning();
      if (!rows[0]) return [];
      await audit(tx, { tenantId: tenant, userId: userId(request), action: 'updated', entityType: 'job', entityId: id, metadata: { changedFields: Object.keys(patch) } });
      return rows;
    });
    if (!updated) return reply.code(409).send({ error: 'Job changed; reload and retry', code: 'JOB_VERSION_CONFLICT' });
    return updated;
  });

  app.post('/v1/modules/tradeflowkit/jobs/:id/tasks', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id: jobId } = request.params as { id: string };
    const tenant = tenantId(request);
    let body;
    try {
      const raw = record(request.body);
      const priority = stringValue(raw.priority, 'priority', 20) ?? 'normal';
      if (!TASK_PRIORITIES.has(priority)) throw new InputError('PRIORITY_INVALID', 'priority');
      body = {
        title: stringValue(raw.title, 'title', 200, true)!,
        description: stringValue(raw.description, 'description', 4_000), priority,
        assignedToUserId: stringValue(raw.assignedToUserId, 'assignedToUserId', 36),
        dueAt: dateValue(raw.dueAt, 'dueAt'),
        sortOrder: integer(raw.sortOrder, 'sortOrder', 0, 1_000_000) ?? 0,
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const [job] = await db.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(eq(tradeflowkitJobs.id, jobId), eq(tradeflowkitJobs.tenantId, tenant), isNull(tradeflowkitJobs.deletedAt))).limit(1);
    if (!job) return reply.code(404).send({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
    if (body.assignedToUserId) {
      const [member] = await db.select({ id: tenantUsers.userId }).from(tenantUsers).where(and(eq(tenantUsers.tenantId, tenant), eq(tenantUsers.userId, body.assignedToUserId))).limit(1);
      if (!member) return reply.code(404).send({ error: 'Assignee not found', code: 'ASSIGNEE_NOT_FOUND' });
    }
    const task = await db.transaction(async tx => {
      const [created] = await tx.insert(tradeflowkitTasks).values({ ...body, tenantId: tenant, jobId, createdByUserId: userId(request) }).returning();
      await audit(tx, { tenantId: tenant, userId: userId(request), action: 'created', entityType: 'task', entityId: created.id, metadata: { jobId } });
      return created;
    });
    return reply.code(201).send(task);
  });

  app.patch('/v1/modules/tradeflowkit/tasks/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    let body;
    try {
      const raw = record(request.body);
      const expectedVersion = integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)!;
      const status = stringValue(raw.status, 'status', 30);
      const priority = stringValue(raw.priority, 'priority', 20);
      if (status && !TASK_STATUSES.has(status)) throw new InputError('STATUS_INVALID', 'status');
      if (priority && !TASK_PRIORITIES.has(priority)) throw new InputError('PRIORITY_INVALID', 'priority');
      body = {
        expectedVersion, status, priority,
        title: stringValue(raw.title, 'title', 200),
        description: stringValue(raw.description, 'description', 4_000),
        assignedToUserId: stringValue(raw.assignedToUserId, 'assignedToUserId', 36),
        dueAt: dateValue(raw.dueAt, 'dueAt'),
        sortOrder: integer(raw.sortOrder, 'sortOrder', 0, 1_000_000),
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const [current] = await db.select().from(tradeflowkitTasks).where(and(eq(tradeflowkitTasks.id, id), eq(tradeflowkitTasks.tenantId, tenant), isNull(tradeflowkitTasks.deletedAt))).limit(1);
    if (!current) return reply.code(404).send({ error: 'Task not found', code: 'TASK_NOT_FOUND' });
    if (body.status === 'completed') {
      const unmet = await db.execute(sql`
        SELECT 1 FROM tradeflowkit_task_dependencies d
        JOIN tradeflowkit_tasks prerequisite
          ON prerequisite.tenant_id = d.tenant_id AND prerequisite.id = d.depends_on_task_id
        WHERE d.tenant_id = ${tenant} AND d.task_id = ${id}
          AND prerequisite.deleted_at IS NULL AND prerequisite.status <> 'completed'
        LIMIT 1
      `);
      if (unmet.rows[0]) return reply.code(409).send({ error: 'Task dependencies must be completed first', code: 'TASK_DEPENDENCY_INCOMPLETE' });
    }
    const patch = Object.fromEntries(Object.entries(body).filter(([key, value]) => key !== 'expectedVersion' && value !== null));
    const [updated] = await db.transaction(async tx => {
      const rows = await tx.update(tradeflowkitTasks).set({
        ...patch,
        ...(body.status === 'completed' ? { completedAt: new Date() } : body.status ? { completedAt: null } : {}),
        version: sql`${tradeflowkitTasks.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(tradeflowkitTasks.id, id), eq(tradeflowkitTasks.tenantId, tenant), eq(tradeflowkitTasks.version, body.expectedVersion), isNull(tradeflowkitTasks.deletedAt))).returning();
      if (!rows[0]) return [];
      await audit(tx, { tenantId: tenant, userId: userId(request), action: body.status === 'completed' ? 'completed' : 'updated', entityType: 'task', entityId: id, metadata: { jobId: current.jobId } });
      return rows;
    });
    if (!updated) return reply.code(409).send({ error: 'Task changed; reload and retry', code: 'TASK_VERSION_CONFLICT' });
    return updated;
  });

  app.post('/v1/modules/tradeflowkit/tasks/:id/dependencies', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    let dependsOnTaskId;
    try { dependsOnTaskId = stringValue(record(request.body).dependsOnTaskId, 'dependsOnTaskId', 36, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    if (dependsOnTaskId === id) return reply.code(400).send({ error: 'Task cannot depend on itself', code: 'TASK_DEPENDENCY_SELF' });
    const rows = await db.select({ id: tradeflowkitTasks.id, jobId: tradeflowkitTasks.jobId }).from(tradeflowkitTasks).where(and(
      eq(tradeflowkitTasks.tenantId, tenant), or(eq(tradeflowkitTasks.id, id), eq(tradeflowkitTasks.id, dependsOnTaskId)), isNull(tradeflowkitTasks.deletedAt),
    ));
    if (rows.length !== 2 || rows[0].jobId !== rows[1].jobId) return reply.code(404).send({ error: 'Tasks not found in the same job', code: 'TASK_DEPENDENCY_NOT_FOUND' });
    const cycle = await db.execute(sql`
      WITH RECURSIVE descendants(task_id) AS (
        SELECT task_id FROM tradeflowkit_task_dependencies WHERE tenant_id = ${tenant} AND depends_on_task_id = ${id}
        UNION
        SELECT d.task_id FROM tradeflowkit_task_dependencies d JOIN descendants x ON d.depends_on_task_id = x.task_id WHERE d.tenant_id = ${tenant}
      ) SELECT 1 FROM descendants WHERE task_id = ${dependsOnTaskId} LIMIT 1
    `);
    if (cycle.rows[0]) return reply.code(409).send({ error: 'Dependency would create a cycle', code: 'TASK_DEPENDENCY_CYCLE' });
    const [dependency] = await db.insert(tradeflowkitTaskDependencies).values({ tenantId: tenant, taskId: id, dependsOnTaskId, createdByUserId: userId(request) }).onConflictDoNothing().returning();
    if (!dependency) return reply.code(200).send({ duplicate: true });
    await audit(db, { tenantId: tenant, userId: userId(request), action: 'dependency_added', entityType: 'task', entityId: id, metadata: { dependsOnTaskId } });
    return reply.code(201).send(dependency);
  });

  app.post('/v1/modules/tradeflowkit/leads/:id/convert', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const converted = await db.transaction(async tx => {
      const [lead] = await tx.select().from(tradeflowkitLeads).where(and(
        eq(tradeflowkitLeads.id, id), eq(tradeflowkitLeads.tenantId, tenant), isNull(tradeflowkitLeads.deletedAt),
      )).for('update').limit(1);
      if (!lead) return { outcome: 'not_found' as const };
      if (lead.convertedAt && lead.customerId && lead.jobId) {
        return { outcome: 'replay' as const, body: { lead, customerId: lead.customerId, jobId: lead.jobId, replay: true } };
      }
      if (lead.status === 'lost') return { outcome: 'not_convertible' as const };
      const normalized = normalizeName(lead.name);
      let [organization] = await tx.select().from(directoryOrganizations).where(and(eq(directoryOrganizations.tenantId, tenant), eq(directoryOrganizations.normalizedName, normalized), isNull(directoryOrganizations.archivedAt))).limit(1);
      if (!organization) {
        [organization] = await tx.insert(directoryOrganizations).values({
          tenantId: tenant, name: lead.name, normalizedName: normalized, type: 'customer', status: 'active', notes: lead.description,
          createdByUserId: userId(request), updatedByUserId: userId(request),
        }).onConflictDoNothing().returning();
        if (!organization) {
          [organization] = await tx.select().from(directoryOrganizations).where(and(
            eq(directoryOrganizations.tenantId, tenant), eq(directoryOrganizations.normalizedName, normalized), isNull(directoryOrganizations.archivedAt),
          )).limit(1);
        }
      }
      if (!organization) throw new Error('Directory organization could not be resolved');
      let contactId: string | null = null;
      if (lead.email || lead.phone) {
        const normalizedEmail = lead.email?.trim().toLowerCase() ?? null;
        let [contact] = normalizedEmail
          ? await tx.select().from(directoryContacts).where(and(
              eq(directoryContacts.tenantId, tenant), eq(directoryContacts.normalizedEmail, normalizedEmail), isNull(directoryContacts.archivedAt),
            )).limit(1)
          : await tx.select().from(directoryContacts).where(and(
              eq(directoryContacts.tenantId, tenant), eq(directoryContacts.normalizedName, normalized), eq(directoryContacts.phone, lead.phone!), isNull(directoryContacts.archivedAt),
            )).limit(1);
        const parts = lead.name.trim().split(/\s+/);
        if (!contact) {
          [contact] = await tx.insert(directoryContacts).values({
            tenantId: tenant, firstName: parts.shift() || lead.name, lastName: parts.join(' '), normalizedName: normalized,
            email: lead.email, normalizedEmail, phone: lead.phone,
            createdByUserId: userId(request), updatedByUserId: userId(request),
          }).onConflictDoNothing().returning();
          if (!contact && normalizedEmail) {
            [contact] = await tx.select().from(directoryContacts).where(and(
              eq(directoryContacts.tenantId, tenant), eq(directoryContacts.normalizedEmail, normalizedEmail), isNull(directoryContacts.archivedAt),
            )).limit(1);
          }
        }
        contactId = contact?.id ?? null;
        if (contactId) {
          await tx.insert(directoryOrganizationContacts).values({
            tenantId: tenant, organizationId: organization.id, contactId,
            role: 'primary', isPrimary: true, createdByUserId: userId(request),
          }).onConflictDoNothing();
        }
      }
      const portal = issueToken();
      const [customer] = await tx.insert(tradeflowkitCustomers).values({
        tenantId: tenant, createdByUserId: userId(request), organizationId: organization.id, primaryContactId: contactId,
        name: lead.name, phone: lead.phone, email: lead.email, address: lead.address, notes: lead.description,
        portalTokenHash: portal.hash, sourceId: `lead:${lead.id}`,
      }).returning();
      const number = await allocateTradeFlowKitNumber(tx, tenant, 'job');
      const [job] = await tx.insert(tradeflowkitJobs).values({
        tenantId: tenant, customerId: customer.id, createdByUserId: userId(request), number,
        title: lead.serviceType || `Service for ${lead.name}`, description: lead.description,
        priority: lead.urgency === 'emergency' ? 'urgent' : lead.urgency === 'urgent' ? 'urgent' : 'normal', sourceId: `lead:${lead.id}`,
      }).returning();
      const rows = await tx.update(tradeflowkitLeads).set({
        status: 'converted', directoryOrganizationId: organization.id, customerId: customer.id, jobId: job.id,
        convertedAt: new Date(), version: sql`${tradeflowkitLeads.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(tradeflowkitLeads.id, lead.id), eq(tradeflowkitLeads.tenantId, tenant), isNull(tradeflowkitLeads.convertedAt))).returning();
      if (!rows[0]) throw new Error('Locked lead conversion update did not persist');
      await audit(tx, { tenantId: tenant, userId: userId(request), action: 'converted', entityType: 'lead', entityId: lead.id, metadata: { customerId: customer.id, jobId: job.id, idempotencyKey: key } });
      return { outcome: 'created' as const, body: { lead: rows[0], customer, job, portalToken: portal.token, replay: false } };
    });
    if (converted.outcome === 'not_found') return reply.code(404).send({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });
    if (converted.outcome === 'not_convertible') return reply.code(409).send({ error: 'Lost lead must be reopened before conversion', code: 'LEAD_NOT_CONVERTIBLE' });
    if (converted.outcome === 'replay') return reply.code(200).send(converted.body);
    return reply.code(201).send(converted.body);
  });

  app.get('/v1/modules/tradeflowkit/comments/:entityType/:entityId', { preHandler: [...readGuards] }, async (request, reply) => {
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const tenant = tenantId(request);
    if (!ENTITY_TYPES.has(entityType) || !(await entityExists(tenant, entityType, entityId))) return reply.code(404).send({ error: 'Record not found', code: 'ENTITY_NOT_FOUND' });
    return db.select().from(tradeflowkitComments).where(and(eq(tradeflowkitComments.tenantId, tenant), eq(tradeflowkitComments.entityType, entityType), eq(tradeflowkitComments.entityId, entityId), isNull(tradeflowkitComments.deletedAt))).orderBy(desc(tradeflowkitComments.createdAt)).limit(200);
  });

  app.post('/v1/modules/tradeflowkit/comments/:entityType/:entityId', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const tenant = tenantId(request);
    let body;
    try { body = stringValue(record(request.body).body, 'body', 10_000, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    if (!ENTITY_TYPES.has(entityType) || !(await entityExists(tenant, entityType, entityId))) return reply.code(404).send({ error: 'Record not found', code: 'ENTITY_NOT_FOUND' });
    const [comment] = await db.insert(tradeflowkitComments).values({ tenantId: tenant, entityType, entityId, body, createdByUserId: userId(request) }).returning();
    await audit(db, { tenantId: tenant, userId: userId(request), action: 'commented', entityType, entityId, metadata: { commentId: comment.id } });
    return reply.code(201).send(comment);
  });

  app.get('/v1/modules/tradeflowkit/tags', { preHandler: [...readGuards] }, async request => db.select().from(tradeflowkitTags).where(and(eq(tradeflowkitTags.tenantId, tenantId(request)), isNull(tradeflowkitTags.archivedAt))).orderBy(asc(tradeflowkitTags.name)));

  app.post('/v1/modules/tradeflowkit/tags', { preHandler: [...writeGuards] }, async (request, reply) => {
    let name: string; let color: string | null;
    try { const raw = record(request.body); name = stringValue(raw.name, 'name', 60, true)!; color = stringValue(raw.color, 'color', 30); }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const [tag] = await db.insert(tradeflowkitTags).values({ tenantId: tenantId(request), name, normalizedName: normalizeName(name), color, createdByUserId: userId(request) }).onConflictDoNothing().returning();
    if (!tag) return reply.code(409).send({ error: 'Tag already exists', code: 'TAG_DUPLICATE' });
    return reply.code(201).send(tag);
  });

  app.post('/v1/modules/tradeflowkit/tags/:id/assign', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    let entityType: string; let entityId: string;
    try { const raw = record(request.body); entityType = stringValue(raw.entityType, 'entityType', 30, true)!; entityId = stringValue(raw.entityId, 'entityId', 36, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const [tag] = await db.select({ id: tradeflowkitTags.id }).from(tradeflowkitTags).where(and(eq(tradeflowkitTags.id, id), eq(tradeflowkitTags.tenantId, tenant), isNull(tradeflowkitTags.archivedAt))).limit(1);
    if (!tag || !TAG_ENTITY_TYPES.has(entityType) || !(await entityExists(tenant, entityType, entityId))) return reply.code(404).send({ error: 'Tag or record not found', code: 'TAG_ASSIGNMENT_NOT_FOUND' });
    const [assignment] = await db.insert(tradeflowkitTagAssignments).values({ tenantId: tenant, tagId: id, entityType, entityId, createdByUserId: userId(request) }).onConflictDoNothing().returning();
    return reply.code(assignment ? 201 : 200).send(assignment ?? { duplicate: true });
  });

  app.get('/v1/modules/tradeflowkit/settings', { preHandler: [...readGuards] }, async request => {
    const tenant = tenantId(request);
    await db.insert(tradeflowkitSettings).values({ tenantId: tenant }).onConflictDoNothing();
    const [settings] = await db.select().from(tradeflowkitSettings).where(eq(tradeflowkitSettings.tenantId, tenant)).limit(1);
    return settings;
  });

  app.patch('/v1/modules/tradeflowkit/settings', { preHandler: [...adminGuards] }, async (request, reply) => {
    const tenant = tenantId(request);
    let body;
    try {
      const raw = record(request.body);
      const prefix = (field: string) => {
        const value = stringValue(raw[field], field, 12);
        if (value && !/^[A-Z0-9-]{1,12}$/.test(value)) throw new InputError('PREFIX_INVALID', field);
        return value;
      };
      const currency = stringValue(raw.currency, 'currency', 3);
      if (currency && !/^[A-Z]{3}$/.test(currency)) throw new InputError('CURRENCY_INVALID', 'currency');
      body = {
        expectedVersion: integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)!,
        jobPrefix: prefix('jobPrefix'), quotePrefix: prefix('quotePrefix'), invoicePrefix: prefix('invoicePrefix'),
        defaultTaxRateBps: integer(raw.defaultTaxRateBps, 'defaultTaxRateBps', 0, 10_000),
        defaultHourlyRateCents: integer(raw.defaultHourlyRateCents, 'defaultHourlyRateCents', 0, 100_000_000),
        paymentTermsDays: integer(raw.paymentTermsDays, 'paymentTermsDays', 0, 365), currency,
        timezone: stringValue(raw.timezone, 'timezone', 80),
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    await db.insert(tradeflowkitSettings).values({ tenantId: tenant }).onConflictDoNothing();
    const patch = Object.fromEntries(Object.entries(body).filter(([key, value]) => key !== 'expectedVersion' && value !== null));
    const [settings] = await db.update(tradeflowkitSettings).set({ ...patch, updatedByUserId: userId(request), version: sql`${tradeflowkitSettings.version} + 1`, updatedAt: new Date() }).where(and(eq(tradeflowkitSettings.tenantId, tenant), eq(tradeflowkitSettings.version, body.expectedVersion))).returning();
    if (!settings) return reply.code(409).send({ error: 'Settings changed; reload and retry', code: 'SETTINGS_VERSION_CONFLICT' });
    await audit(db, { tenantId: tenant, userId: userId(request), action: 'settings_updated', entityType: 'settings', entityId: tenant, metadata: { changedFields: Object.keys(patch) } });
    return settings;
  });

  app.post('/v1/modules/tradeflowkit/:documentType/:id/public-link', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { documentType, id } = request.params as { documentType: string; id: string };
    const tenant = tenantId(request);
    if (!['quotes', 'invoices', 'customers'].includes(documentType)) return reply.code(404).send({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' });
    const issued = issueToken();
    let found = false;
    if (documentType === 'quotes') found = !!(await db.update(tradeflowkitQuotes).set({ publicTokenHash: issued.hash, updatedAt: new Date() }).where(and(eq(tradeflowkitQuotes.id, id), eq(tradeflowkitQuotes.tenantId, tenant), isNull(tradeflowkitQuotes.deletedAt))).returning())[0];
    if (documentType === 'invoices') found = !!(await db.update(tradeflowkitInvoices).set({ publicTokenHash: issued.hash, updatedAt: new Date() }).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, tenant), isNull(tradeflowkitInvoices.deletedAt))).returning())[0];
    if (documentType === 'customers') found = !!(await db.update(tradeflowkitCustomers).set({ portalTokenHash: issued.hash, updatedAt: new Date() }).where(and(eq(tradeflowkitCustomers.id, id), eq(tradeflowkitCustomers.tenantId, tenant), isNull(tradeflowkitCustomers.deletedAt))).returning())[0];
    if (!found) return reply.code(404).send({ error: 'Document not found', code: 'DOCUMENT_NOT_FOUND' });
    return { token: issued.token, path: `/public/tradeflowkit/${documentType}/${issued.token}` };
  });

  app.get('/v1/public/tradeflowkit/quotes/:token', async (request, reply) => {
    securePublicReply(reply);
    const { token } = request.params as { token: string };
    const hash = hashToken(token);
    const [quote] = await db.select({
      id: tradeflowkitQuotes.id, number: tradeflowkitQuotes.number, status: tradeflowkitQuotes.status,
      lineItems: tradeflowkitQuotes.lineItems, subtotalCents: tradeflowkitQuotes.subtotalCents,
      taxCents: tradeflowkitQuotes.taxCents, discountCents: tradeflowkitQuotes.discountCents,
      totalCents: tradeflowkitQuotes.totalCents, notes: tradeflowkitQuotes.notes,
      expiresAt: tradeflowkitQuotes.expiresAt, version: tradeflowkitQuotes.version,
    }).from(tradeflowkitQuotes).where(and(eq(tradeflowkitQuotes.publicTokenHash, hash), isNull(tradeflowkitQuotes.deletedAt))).limit(1);
    if (!quote) return reply.code(404).send({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
    return quote;
  });

  app.post('/v1/public/tradeflowkit/quotes/:token/respond', async (request, reply) => {
    securePublicReply(reply);
    const { token } = request.params as { token: string };
    let response: string; let expectedVersion: number;
    try { const raw = record(request.body); response = stringValue(raw.response, 'response', 20, true)!; expectedVersion = integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)!; if (!['accepted','declined'].includes(response)) throw new InputError('RESPONSE_INVALID', 'response'); }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const now = new Date();
    const [current] = await db.select().from(tradeflowkitQuotes).where(and(eq(tradeflowkitQuotes.publicTokenHash, hashToken(token)), isNull(tradeflowkitQuotes.deletedAt))).limit(1);
    if (!current) return reply.code(404).send({ error: 'Quote not found', code: 'QUOTE_NOT_FOUND' });
    if (current.expiresAt && current.expiresAt <= now) {
      await db.update(tradeflowkitQuotes).set({ status: 'expired', expiredAt: now, version: sql`${tradeflowkitQuotes.version} + 1`, updatedAt: now }).where(and(eq(tradeflowkitQuotes.id, current.id), eq(tradeflowkitQuotes.tenantId, current.tenantId), eq(tradeflowkitQuotes.status, 'sent')));
      return reply.code(409).send({ error: 'Quote has expired', code: 'QUOTE_EXPIRED' });
    }
    if (current.status !== 'sent') return reply.code(409).send({ error: 'Quote is not awaiting response', code: 'QUOTE_NOT_RESPONDABLE' });
    const [updated] = await db.update(tradeflowkitQuotes).set({
      status: response,
      ...(response === 'accepted' ? { acceptedAt: now } : { declinedAt: now }),
      version: sql`${tradeflowkitQuotes.version} + 1`, updatedAt: now,
    }).where(and(eq(tradeflowkitQuotes.id, current.id), eq(tradeflowkitQuotes.tenantId, current.tenantId), eq(tradeflowkitQuotes.version, expectedVersion), eq(tradeflowkitQuotes.status, 'sent'))).returning();
    if (!updated) return reply.code(409).send({ error: 'Quote changed; reload and retry', code: 'QUOTE_VERSION_CONFLICT' });
    return { id: updated.id, status: updated.status, version: updated.version };
  });

  app.get('/v1/public/tradeflowkit/invoices/:token', async (request, reply) => {
    securePublicReply(reply);
    const { token } = request.params as { token: string };
    const [invoice] = await db.select({
      id: tradeflowkitInvoices.id, number: tradeflowkitInvoices.number, status: tradeflowkitInvoices.status,
      lineItems: tradeflowkitInvoices.lineItems, subtotalCents: tradeflowkitInvoices.subtotalCents,
      taxCents: tradeflowkitInvoices.taxCents, discountCents: tradeflowkitInvoices.discountCents,
      totalCents: tradeflowkitInvoices.totalCents, paidCents: tradeflowkitInvoices.paidCents,
      balanceCents: tradeflowkitInvoices.balanceCents, notes: tradeflowkitInvoices.notes,
      dueDate: tradeflowkitInvoices.dueDate,
    }).from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.publicTokenHash, hashToken(token)), isNull(tradeflowkitInvoices.deletedAt))).limit(1);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    return invoice;
  });

  app.get('/v1/public/tradeflowkit/customers/:token', async (request, reply) => {
    securePublicReply(reply);
    const { token } = request.params as { token: string };
    const [customer] = await db.select({ id: tradeflowkitCustomers.id, tenantId: tradeflowkitCustomers.tenantId, name: tradeflowkitCustomers.name }).from(tradeflowkitCustomers).where(and(eq(tradeflowkitCustomers.portalTokenHash, hashToken(token)), isNull(tradeflowkitCustomers.deletedAt))).limit(1);
    if (!customer) return reply.code(404).send({ error: 'Portal not found', code: 'PORTAL_NOT_FOUND' });
    const [jobs, quotes, invoices] = await Promise.all([
      db.select({ id: tradeflowkitJobs.id, number: tradeflowkitJobs.number, title: tradeflowkitJobs.title, status: tradeflowkitJobs.status, scheduledStart: tradeflowkitJobs.scheduledStart }).from(tradeflowkitJobs).where(and(eq(tradeflowkitJobs.tenantId, customer.tenantId), eq(tradeflowkitJobs.customerId, customer.id), isNull(tradeflowkitJobs.deletedAt))).orderBy(desc(tradeflowkitJobs.updatedAt)),
      db.select({ id: tradeflowkitQuotes.id, number: tradeflowkitQuotes.number, status: tradeflowkitQuotes.status, totalCents: tradeflowkitQuotes.totalCents, expiresAt: tradeflowkitQuotes.expiresAt }).from(tradeflowkitQuotes).where(and(eq(tradeflowkitQuotes.tenantId, customer.tenantId), eq(tradeflowkitQuotes.customerId, customer.id), isNull(tradeflowkitQuotes.deletedAt))).orderBy(desc(tradeflowkitQuotes.updatedAt)),
      db.select({ id: tradeflowkitInvoices.id, number: tradeflowkitInvoices.number, status: tradeflowkitInvoices.status, totalCents: tradeflowkitInvoices.totalCents, balanceCents: tradeflowkitInvoices.balanceCents, dueDate: tradeflowkitInvoices.dueDate }).from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.tenantId, customer.tenantId), eq(tradeflowkitInvoices.customerId, customer.id), isNull(tradeflowkitInvoices.deletedAt))).orderBy(desc(tradeflowkitInvoices.updatedAt)),
    ]);
    return { customer: { id: customer.id, name: customer.name }, jobs, quotes, invoices };
  });

  app.post('/v1/modules/tradeflowkit/invoices/:id/payments', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    let body;
    try {
      const raw = record(request.body);
      const method = stringValue(raw.method, 'method', 40, true)!;
      if (!['cash','check','card_external','bank_transfer','other'].includes(method)) throw new InputError('PAYMENT_METHOD_INVALID', 'method');
      body = { amountCents: integer(raw.amountCents, 'amountCents', 1, 1_000_000_000, true)!, method, reference: stringValue(raw.reference, 'reference', 200), notes: stringValue(raw.notes, 'notes', 2_000), expectedVersion: integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)! };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const [duplicate] = await db.select().from(tradeflowkitPayments).where(and(eq(tradeflowkitPayments.tenantId, tenant), eq(tradeflowkitPayments.idempotencyKey, key))).limit(1);
    if (duplicate) return reply.code(200).send({ payment: duplicate, replay: true });
    const [invoice] = await db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, tenant), isNull(tradeflowkitInvoices.deletedAt))).limit(1);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    if (!['sent','processing'].includes(invoice.status) || body.amountCents > invoice.balanceCents) return reply.code(409).send({ error: 'Payment exceeds payable invoice balance', code: 'INVOICE_NOT_PAYABLE' });
    const result = await db.transaction(async tx => {
      const [payment] = await tx.insert(tradeflowkitPayments).values({ tenantId: tenant, invoiceId: id, createdByUserId: userId(request), amountCents: body.amountCents, method: body.method, reference: body.reference, notes: body.notes, idempotencyKey: key }).returning();
      const newPaid = invoice.paidCents + body.amountCents;
      const newBalance = invoice.totalCents - newPaid;
      const [updated] = await tx.update(tradeflowkitInvoices).set({
        paidCents: newPaid, balanceCents: newBalance, status: newBalance === 0 ? 'paid' : 'processing',
        ...(newBalance === 0 ? { paidAt: new Date() } : {}), paymentMethod: body.method,
        paymentReference: body.reference, paymentNotes: body.notes,
        version: sql`${tradeflowkitInvoices.version} + 1`, updatedAt: new Date(),
      }).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, tenant), eq(tradeflowkitInvoices.version, body.expectedVersion), eq(tradeflowkitInvoices.balanceCents, invoice.balanceCents))).returning();
      if (!updated) throw Object.assign(new Error('Invoice version conflict'), { code: 'INVOICE_VERSION_CONFLICT' });
      if (newBalance === 0 && invoice.jobId) await tx.update(tradeflowkitJobs).set({ status: 'paid', version: sql`${tradeflowkitJobs.version} + 1`, updatedAt: new Date() }).where(and(eq(tradeflowkitJobs.id, invoice.jobId), eq(tradeflowkitJobs.tenantId, tenant)));
      await audit(tx, { tenantId: tenant, userId: userId(request), action: 'payment_recorded', entityType: 'invoice', entityId: id, metadata: { paymentId: payment.id, amountCents: payment.amountCents, method: payment.method } });
      return { payment, invoice: updated };
    }).catch(error => {
      if ((error as any)?.code === 'INVOICE_VERSION_CONFLICT') return null;
      throw error;
    });
    if (!result) return reply.code(409).send({ error: 'Invoice changed; reload and retry', code: 'INVOICE_VERSION_CONFLICT' });
    return reply.code(201).send({ ...result, replay: false });
  });

  app.post('/v1/modules/tradeflowkit/invoices/:id/payment-session', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    const [invoice] = await db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.id, id), eq(tradeflowkitInvoices.tenantId, tenant), isNull(tradeflowkitInvoices.deletedAt))).limit(1);
    if (!invoice) return reply.code(404).send({ error: 'Invoice not found', code: 'INVOICE_NOT_FOUND' });
    if (!['sent','processing'].includes(invoice.status) || invoice.balanceCents <= 0) return reply.code(409).send({ error: 'Invoice is not payable', code: 'INVOICE_NOT_PAYABLE' });
    const provider = getTradeFlowKitPaymentProvider();
    if (!provider.status.configured) return reply.code(503).send({ error: provider.status.reason, code: 'TRADEFLOWKIT_PAYMENT_PROVIDER_DISABLED' });
    const [existing] = await db.select().from(tradeflowkitPayments).where(and(eq(tradeflowkitPayments.tenantId, tenant), eq(tradeflowkitPayments.idempotencyKey, key))).limit(1);
    if (existing) return reply.code(200).send({ payment: existing, checkoutUrl: null, replay: true });
    const session = await provider.createSession({ tenantId: tenant, invoiceId: id, amountCents: invoice.balanceCents, idempotencyKey: key });
    const [payment] = await db.insert(tradeflowkitPayments).values({ tenantId: tenant, invoiceId: id, createdByUserId: userId(request), amountCents: invoice.balanceCents, method: 'provider', status: 'pending', provider: session.provider, providerReference: session.providerReference, idempotencyKey: key }).returning();
    return reply.code(201).send({ payment, checkoutUrl: session.checkoutUrl, replay: false });
  });

  app.post('/v1/modules/tradeflowkit/payments/:id/test-complete', { preHandler: [...writeGuards] }, async (request, reply) => {
    const provider = getTradeFlowKitPaymentProvider();
    if (provider.status.kind !== 'test') return reply.code(404).send({ error: 'Test payment route is unavailable', code: 'NOT_FOUND' });
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const [current] = await db.select().from(tradeflowkitPayments).where(and(eq(tradeflowkitPayments.id, id), eq(tradeflowkitPayments.tenantId, tenant))).limit(1);
    if (!current) return reply.code(404).send({ error: 'Payment not found', code: 'PAYMENT_NOT_FOUND' });
    if (current.status === 'succeeded') return reply.code(200).send({ payment: current, replay: true });
    if (current.status !== 'pending') return reply.code(409).send({ error: 'Payment is not pending', code: 'PAYMENT_NOT_PENDING' });
    const [invoice] = await db.select().from(tradeflowkitInvoices).where(and(eq(tradeflowkitInvoices.id, current.invoiceId), eq(tradeflowkitInvoices.tenantId, tenant))).limit(1);
    if (!invoice || current.amountCents > invoice.balanceCents) return reply.code(409).send({ error: 'Invoice balance changed', code: 'INVOICE_BALANCE_CONFLICT' });
    const result = await db.transaction(async tx => {
      const [payment] = await tx.update(tradeflowkitPayments).set({ status: 'succeeded', paidAt: new Date(), version: sql`${tradeflowkitPayments.version} + 1`, updatedAt: new Date() }).where(and(eq(tradeflowkitPayments.id, id), eq(tradeflowkitPayments.tenantId, tenant), eq(tradeflowkitPayments.status, 'pending'))).returning();
      if (!payment) return null;
      const paidCents = invoice.paidCents + payment.amountCents;
      const balanceCents = invoice.totalCents - paidCents;
      const [updatedInvoice] = await tx.update(tradeflowkitInvoices).set({ paidCents, balanceCents, status: balanceCents === 0 ? 'paid' : 'processing', ...(balanceCents === 0 ? { paidAt: new Date() } : {}), version: sql`${tradeflowkitInvoices.version} + 1`, updatedAt: new Date() }).where(and(eq(tradeflowkitInvoices.id, invoice.id), eq(tradeflowkitInvoices.tenantId, tenant), eq(tradeflowkitInvoices.version, invoice.version))).returning();
      if (!updatedInvoice) throw Object.assign(new Error('Invoice version conflict'), { code: 'INVOICE_VERSION_CONFLICT' });
      if (balanceCents === 0 && invoice.jobId) await tx.update(tradeflowkitJobs).set({ status: 'paid', version: sql`${tradeflowkitJobs.version} + 1`, updatedAt: new Date() }).where(and(eq(tradeflowkitJobs.id, invoice.jobId), eq(tradeflowkitJobs.tenantId, tenant)));
      await audit(tx, { tenantId: tenant, userId: userId(request), action: 'provider_payment_completed', entityType: 'invoice', entityId: invoice.id, metadata: { paymentId: payment.id, provider: payment.provider } });
      return { payment, invoice: updatedInvoice };
    });
    if (!result) return reply.code(409).send({ error: 'Payment changed; reload and retry', code: 'PAYMENT_VERSION_CONFLICT' });
    return result;
  });

  app.post('/v1/modules/tradeflowkit/:entityType/:entityId/message', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const tenant = tenantId(request);
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    let channel: 'email' | 'sms' | 'in_app'; let destination: string | null; let recipientUserId: string | null; let subject: string | null; let body: string;
    try {
      const raw = record(request.body);
      channel = stringValue(raw.channel, 'channel', 20, true)! as typeof channel;
      if (!['email','sms','in_app'].includes(channel)) throw new InputError('CHANNEL_INVALID', 'channel');
      destination = stringValue(raw.destination, 'destination', 320);
      recipientUserId = stringValue(raw.recipientUserId, 'recipientUserId', 36);
      subject = stringValue(raw.subject, 'subject', 500);
      body = stringValue(raw.body, 'body', 20_000, true)!;
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    if (!ENTITY_TYPES.has(entityType) || !(await entityExists(tenant, entityType, entityId))) return reply.code(404).send({ error: 'Record not found', code: 'ENTITY_NOT_FOUND' });
    try {
      const queued = await enqueueOutboxMessage({ tenantId: tenant, moduleId: await moduleId(), requestedByUserId: userId(request), recipientUserId, channel, destination, subject, body, idempotencyKey: key, context: { entityType, entityId } });
      await audit(db, { tenantId: tenant, userId: userId(request), action: 'message_queued', entityType, entityId, metadata: { channel, duplicate: queued.duplicate } });
      return reply.code(queued.duplicate ? 200 : 202).send(queued);
    } catch (error) {
      const code = String((error as any)?.code || 'MESSAGE_INVALID');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Message could not be queued', code });
    }
  });
}
