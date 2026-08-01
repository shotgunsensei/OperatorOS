import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
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
  tradeflowkitSavedViews,
  tradeflowkitSettings,
  tradeflowkitTagAssignments,
  tradeflowkitTags,
  tradeflowkitTaskDependencies,
  tradeflowkitTasks,
  tradeflowkitWorkflows,
  tradeflowkitWorkflowStages,
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
import {
  TRADEFLOWKIT_ACCOUNTING_EXPORT_VERSION,
  buildQuickBooksIif,
  buildQuickBooksInvoiceCsv,
  buildXeroCustomersCsv,
  buildXeroInvoicesCsv,
  buildXeroPaymentsCsv,
  type AccountingExportData,
} from '../lib/tradeflowkit-accounting-exports.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('tradeflowkit')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const ENTITY_TYPES = new Set(['lead', 'customer', 'job', 'task', 'quote', 'invoice', 'payment']);
const TAG_ENTITY_TYPES = new Set(['lead', 'customer', 'job', 'task', 'quote', 'invoice']);
const TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'completed', 'canceled']);
const TASK_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const WORKFLOW_ENTITY_TYPES = new Set(['job', 'task']);
const JOB_STATUSES = new Set(['lead', 'quoted', 'scheduled', 'in_progress', 'done', 'invoiced', 'paid', 'canceled']);
const WORKFLOW_MAPPED_STATUSES = new Set([...JOB_STATUSES, ...TASK_STATUSES]);
const ACCOUNTING_EXPORT_LIMITS = { customers: 10_000, invoices: 10_000, items: 50_000, payments: 20_000 } as const;
const SAVED_VIEW_FILTERS = {
  jobs: new Set(['search', 'status', 'priority', 'assignedToUserId', 'customerId']),
  tasks: new Set(['search', 'status', 'priority', 'assignedToUserId', 'jobId', 'scope']),
  leads: new Set(['search', 'status', 'urgency', 'assignedToUserId']),
  customers: new Set(['search']),
  quotes: new Set(['search', 'status', 'customerId']),
  invoices: new Set(['search', 'status', 'customerId']),
} as const;
const SAVED_VIEW_SORTS = {
  jobs: new Set(['updatedAt', 'createdAt', 'title', 'status', 'priority']),
  tasks: new Set(['updatedAt', 'title', 'status', 'priority', 'dueAt']),
  leads: new Set(['updatedAt', 'name', 'status', 'nextFollowUpAt']),
  customers: new Set(['updatedAt', 'name']),
  quotes: new Set(['updatedAt', 'number', 'status', 'totalCents']),
  invoices: new Set(['updatedAt', 'number', 'status', 'totalCents']),
} as const;
type SavedViewResource = keyof typeof SAVED_VIEW_FILTERS;

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

function booleanValue(value: unknown, field: string, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new InputError('FIELD_INVALID', field);
  return value;
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

function workflowColor(value: unknown, field = 'color'): string {
  const color = stringValue(value, field, 7) ?? '#2563eb';
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new InputError('FIELD_INVALID', field);
  return color.toLowerCase();
}

function workflowStatus(value: unknown, field = 'mappedStatus'): string | null {
  const status = stringValue(value, field, 30);
  if (status && !WORKFLOW_MAPPED_STATUSES.has(status)) throw new InputError('FIELD_INVALID', field);
  return status;
}

function workflowStageInput(raw: unknown, position: number) {
  const value = record(raw);
  return {
    name: stringValue(value.name, 'stages.name', 80, true)!,
    normalizedName: normalizeName(stringValue(value.name, 'stages.name', 80, true)!),
    color: workflowColor(value.color, 'stages.color'),
    position: integer(value.position, 'stages.position', 0, 1000) ?? position,
    mappedStatus: workflowStatus(value.mappedStatus, 'stages.mappedStatus'),
  };
}

function mappedStatusAllowed(entityType: 'job' | 'task', status: string | null): boolean {
  return !status || (entityType === 'job' ? JOB_STATUSES : TASK_STATUSES).has(status);
}

function databaseErrorCode(error: unknown): string | null {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function savedViewResource(value: unknown, required = true): SavedViewResource | null {
  const resource = stringValue(value, 'resource', 80, required);
  if (!resource) return null;
  if (!Object.hasOwn(SAVED_VIEW_FILTERS, resource)) throw new InputError('SAVED_VIEW_RESOURCE_INVALID', 'resource');
  return resource as SavedViewResource;
}

function savedViewInput(raw: unknown) {
  const body = record(raw);
  if (Object.keys(body).some(key => !['resource', 'name', 'filters', 'sort', 'isShared'].includes(key))) {
    throw new InputError('FIELD_NOT_ALLOWED');
  }
  const resource = savedViewResource(body.resource)!;
  const name = stringValue(body.name, 'name', 120, true)!;
  const filters = body.filters === undefined ? {} : record(body.filters);
  if (Buffer.byteLength(JSON.stringify(filters), 'utf8') > 2048) throw new InputError('SAVED_VIEW_FILTERS_TOO_LARGE', 'filters');
  const normalizedFilters: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(filters)) {
    if (!SAVED_VIEW_FILTERS[resource].has(key as never)) throw new InputError('SAVED_VIEW_FILTER_INVALID', `filters.${key}`);
    const value = stringValue(rawValue, `filters.${key}`, 100, true)!;
    normalizedFilters[key] = value;
  }
  const sort = body.sort === undefined ? { field: 'updatedAt', direction: 'desc' } : record(body.sort);
  if (Object.keys(sort).some(key => !['field', 'direction'].includes(key))) throw new InputError('SAVED_VIEW_SORT_INVALID', 'sort');
  const field = stringValue(sort.field, 'sort.field', 40, true)!;
  const direction = stringValue(sort.direction, 'sort.direction', 4, true)!;
  if (!SAVED_VIEW_SORTS[resource].has(field as never) || !['asc', 'desc'].includes(direction)) {
    throw new InputError('SAVED_VIEW_SORT_INVALID', 'sort');
  }
  return {
    resource,
    name,
    normalizedName: normalizeName(name),
    filters: normalizedFilters,
    sort: { field, direction: direction as 'asc' | 'desc' },
    isShared: booleanValue(body.isShared, 'isShared'),
  };
}

function canShareSavedViews(request: FastifyRequest): boolean {
  const role = (request as FastifyRequest & { tenantContext: RequestContext & { role?: string } }).tenantContext.role;
  return role === 'owner' || role === 'admin';
}

function savedViewResponse(row: typeof tradeflowkitSavedViews.$inferSelect, actorUserId: string) {
  return {
    id: row.id,
    resource: row.resource,
    name: row.name,
    filters: row.filters,
    sort: row.sort,
    isShared: row.isShared,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owned: row.userId === actorUserId,
  };
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function csv(headers: string[], rows: unknown[][]): string {
  return `${headers.map(csvCell).join(',')}\r\n${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

class AccountingExportLimitError extends Error {
  constructor(public resource: keyof typeof ACCOUNTING_EXPORT_LIMITS) {
    super(`Accounting export exceeds the ${ACCOUNTING_EXPORT_LIMITS[resource]} ${resource} limit`);
  }
}

function assertAccountingExportLimit<T>(rows: T[], resource: keyof typeof ACCOUNTING_EXPORT_LIMITS): T[] {
  if (rows.length > ACCOUNTING_EXPORT_LIMITS[resource]) throw new AccountingExportLimitError(resource);
  return rows;
}

async function loadAccountingExportData(tenant: string): Promise<AccountingExportData> {
  const [settingsRows, customerRows, invoiceRows] = await Promise.all([
    db.select({ invoicePrefix: tradeflowkitSettings.invoicePrefix, currency: tradeflowkitSettings.currency })
      .from(tradeflowkitSettings).where(eq(tradeflowkitSettings.tenantId, tenant)).limit(1),
    db.select({
      id: tradeflowkitCustomers.id,
      name: tradeflowkitCustomers.name,
      email: tradeflowkitCustomers.email,
      phone: tradeflowkitCustomers.phone,
      address: tradeflowkitCustomers.address,
    }).from(tradeflowkitCustomers).where(and(
      eq(tradeflowkitCustomers.tenantId, tenant),
      isNull(tradeflowkitCustomers.deletedAt),
    )).orderBy(asc(tradeflowkitCustomers.name), asc(tradeflowkitCustomers.id))
      .limit(ACCOUNTING_EXPORT_LIMITS.customers + 1),
    db.select({
      id: tradeflowkitInvoices.id,
      number: tradeflowkitInvoices.number,
      status: tradeflowkitInvoices.status,
      customerName: tradeflowkitCustomers.name,
      customerEmail: tradeflowkitCustomers.email,
      subtotalCents: tradeflowkitInvoices.subtotalCents,
      taxCents: tradeflowkitInvoices.taxCents,
      discountCents: tradeflowkitInvoices.discountCents,
      totalCents: tradeflowkitInvoices.totalCents,
      notes: tradeflowkitInvoices.notes,
      createdAt: tradeflowkitInvoices.createdAt,
      dueDate: tradeflowkitInvoices.dueDate,
    }).from(tradeflowkitInvoices).innerJoin(tradeflowkitCustomers, and(
      eq(tradeflowkitCustomers.id, tradeflowkitInvoices.customerId),
      eq(tradeflowkitCustomers.tenantId, tenant),
    )).where(and(
      eq(tradeflowkitInvoices.tenantId, tenant),
      isNull(tradeflowkitInvoices.deletedAt),
    )).orderBy(asc(tradeflowkitInvoices.number), asc(tradeflowkitInvoices.id))
      .limit(ACCOUNTING_EXPORT_LIMITS.invoices + 1),
  ]);
  const customers = assertAccountingExportLimit(customerRows, 'customers');
  const invoices = assertAccountingExportLimit(invoiceRows, 'invoices');
  const invoiceIds = invoices.map(invoice => invoice.id);
  const [itemRows, paymentRows] = invoiceIds.length === 0 ? [[], []] : await Promise.all([
    db.select({
      invoiceId: tradeflowkitInvoiceItems.invoiceId,
      lineNumber: tradeflowkitInvoiceItems.lineNumber,
      description: tradeflowkitInvoiceItems.description,
      quantityMilli: tradeflowkitInvoiceItems.quantityMilli,
      unitPriceCents: tradeflowkitInvoiceItems.unitPriceCents,
      lineTotalCents: tradeflowkitInvoiceItems.lineTotalCents,
    }).from(tradeflowkitInvoiceItems).where(and(
      eq(tradeflowkitInvoiceItems.tenantId, tenant),
      inArray(tradeflowkitInvoiceItems.invoiceId, invoiceIds),
    )).orderBy(asc(tradeflowkitInvoiceItems.invoiceId), asc(tradeflowkitInvoiceItems.lineNumber))
      .limit(ACCOUNTING_EXPORT_LIMITS.items + 1),
    db.select({
      id: tradeflowkitPayments.id,
      invoiceId: tradeflowkitPayments.invoiceId,
      amountCents: tradeflowkitPayments.amountCents,
      method: tradeflowkitPayments.method,
      reference: tradeflowkitPayments.reference,
      paidAt: tradeflowkitPayments.paidAt,
    }).from(tradeflowkitPayments).where(and(
      eq(tradeflowkitPayments.tenantId, tenant),
      inArray(tradeflowkitPayments.invoiceId, invoiceIds),
      eq(tradeflowkitPayments.status, 'succeeded'),
      isNull(tradeflowkitPayments.voidedAt),
    )).orderBy(asc(tradeflowkitPayments.paidAt), asc(tradeflowkitPayments.id))
      .limit(ACCOUNTING_EXPORT_LIMITS.payments + 1),
  ]);
  assertAccountingExportLimit(itemRows, 'items');
  const payments = assertAccountingExportLimit(paymentRows, 'payments');
  const itemsByInvoice = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const items = itemsByInvoice.get(item.invoiceId) ?? [];
    items.push(item);
    itemsByInvoice.set(item.invoiceId, items);
  }
  return {
    invoicePrefix: settingsRows[0]?.invoicePrefix || 'INV',
    currency: settingsRows[0]?.currency || 'USD',
    customers,
    invoices: invoices.map(invoice => ({ ...invoice, items: itemsByInvoice.get(invoice.id) ?? [] })),
    payments,
  };
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

  app.get('/v1/modules/tradeflowkit/saved-views', { preHandler: [...readGuards] }, async (request, reply) => {
    let resource: SavedViewResource | null;
    try {
      const query = record(request.query ?? {});
      if (Object.keys(query).some(key => key !== 'resource')) throw new InputError('FIELD_NOT_ALLOWED');
      resource = savedViewResource(query.resource, false);
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const rows = await db.select().from(tradeflowkitSavedViews).where(and(
      eq(tradeflowkitSavedViews.tenantId, tenant),
      isNull(tradeflowkitSavedViews.archivedAt),
      or(eq(tradeflowkitSavedViews.userId, actor), eq(tradeflowkitSavedViews.isShared, true)),
      ...(resource ? [eq(tradeflowkitSavedViews.resource, resource)] : []),
    )).orderBy(asc(tradeflowkitSavedViews.resource), asc(tradeflowkitSavedViews.name)).limit(200);
    return { savedViews: rows.map(row => savedViewResponse(row, actor)) };
  });

  app.post('/v1/modules/tradeflowkit/saved-views', { preHandler: [...readGuards] }, async (request, reply) => {
    let input: ReturnType<typeof savedViewInput>;
    try { input = savedViewInput(request.body); } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    if (input.isShared && !canShareSavedViews(request)) {
      return reply.code(403).send({ error: 'Only tenant administrators can share saved views', code: 'SAVED_VIEW_ADMIN_REQUIRED' });
    }
    const tenant = tenantId(request);
    const actor = userId(request);
    try {
      const outcome = await db.transaction(async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:saved-view:${tenant}:${actor}:${input.resource}`}))`);
        const usage = await tx.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM tradeflowkit_saved_views
          WHERE tenant_id = ${tenant} AND user_id = ${actor} AND resource = ${input.resource} AND archived_at IS NULL
        `);
        if (Number(usage.rows[0]?.count ?? 0) >= 50) return { kind: 'limit' as const };
        const [row] = await tx.insert(tradeflowkitSavedViews).values({ tenantId: tenant, userId: actor, ...input }).returning();
        await audit(tx, { tenantId: tenant, userId: actor, action: 'created', entityType: 'saved_view', entityId: row.id, metadata: { resource: input.resource, isShared: input.isShared } });
        return { kind: 'created' as const, row };
      });
      if (outcome.kind === 'limit') {
        return reply.code(409).send({ error: 'Saved view limit reached for this resource', code: 'SAVED_VIEW_LIMIT_REACHED' });
      }
      return reply.code(201).send(savedViewResponse(outcome.row, actor));
    } catch (error) {
      if (databaseErrorCode(error) === '23505') {
        return reply.code(409).send({ error: 'A saved view with that name already exists', code: 'SAVED_VIEW_NAME_CONFLICT' });
      }
      throw error;
    }
  });

  app.delete('/v1/modules/tradeflowkit/saved-views/:id', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const actor = userId(request);
    const now = new Date();
    const row = await db.transaction(async tx => {
      const [archived] = await tx.update(tradeflowkitSavedViews).set({
        archivedAt: now,
        updatedAt: now,
        version: sql`${tradeflowkitSavedViews.version} + 1`,
      }).where(and(
        eq(tradeflowkitSavedViews.id, id),
        eq(tradeflowkitSavedViews.tenantId, tenant),
        eq(tradeflowkitSavedViews.userId, actor),
        isNull(tradeflowkitSavedViews.archivedAt),
      )).returning();
      if (archived) await audit(tx, { tenantId: tenant, userId: actor, action: 'archived', entityType: 'saved_view', entityId: id, metadata: { resource: archived.resource, isShared: archived.isShared } });
      return archived;
    });
    if (!row) return reply.code(404).send({ error: 'Saved view not found', code: 'SAVED_VIEW_NOT_FOUND' });
    return { ok: true, savedView: savedViewResponse(row, actor) };
  });

  app.get('/v1/modules/tradeflowkit/search', { preHandler: [...readGuards] }, async (request, reply) => {
    let query: string;
    try {
      const raw = record(request.query ?? {});
      query = stringValue(raw.q, 'q', 100)?.trim() ?? '';
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }

    const empty = {
      query,
      leads: [], customers: [], jobs: [], tasks: [], organizations: [], contacts: [], quotes: [], invoices: [],
      total: 0,
    };
    if (!query) return empty;

    const tenant = tenantId(request);
    const escaped = query.replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escaped}%`;
    const prefix = `${escaped}%`;
    const limit = 5;
    const [leads, customers, jobs, tasks, organizations, contacts, quotes, invoices] = await Promise.all([
      db.select({
        id: tradeflowkitLeads.id,
        name: tradeflowkitLeads.name,
        status: tradeflowkitLeads.status,
        serviceType: tradeflowkitLeads.serviceType,
      }).from(tradeflowkitLeads).where(and(
        eq(tradeflowkitLeads.tenantId, tenant),
        isNull(tradeflowkitLeads.deletedAt),
        or(
          ilike(tradeflowkitLeads.name, pattern),
          ilike(tradeflowkitLeads.phone, pattern),
          ilike(tradeflowkitLeads.email, pattern),
          ilike(tradeflowkitLeads.serviceType, pattern),
        ),
      )).orderBy(desc(tradeflowkitLeads.updatedAt)).limit(limit),
      db.select({
        id: tradeflowkitCustomers.id,
        name: tradeflowkitCustomers.name,
        email: tradeflowkitCustomers.email,
        phone: tradeflowkitCustomers.phone,
      }).from(tradeflowkitCustomers).where(and(
        eq(tradeflowkitCustomers.tenantId, tenant),
        isNull(tradeflowkitCustomers.deletedAt),
        or(
          ilike(tradeflowkitCustomers.name, pattern),
          ilike(tradeflowkitCustomers.email, pattern),
          ilike(tradeflowkitCustomers.phone, pattern),
        ),
      )).orderBy(desc(tradeflowkitCustomers.updatedAt)).limit(limit),
      db.select({
        id: tradeflowkitJobs.id,
        title: tradeflowkitJobs.title,
        status: tradeflowkitJobs.status,
        number: tradeflowkitJobs.number,
        customerName: tradeflowkitCustomers.name,
      }).from(tradeflowkitJobs).innerJoin(tradeflowkitCustomers, and(
        eq(tradeflowkitCustomers.tenantId, tradeflowkitJobs.tenantId),
        eq(tradeflowkitCustomers.id, tradeflowkitJobs.customerId),
        isNull(tradeflowkitCustomers.deletedAt),
      )).where(and(
        eq(tradeflowkitJobs.tenantId, tenant),
        isNull(tradeflowkitJobs.deletedAt),
        or(
          ilike(tradeflowkitJobs.title, pattern),
          ilike(tradeflowkitJobs.description, pattern),
          ilike(tradeflowkitCustomers.name, pattern),
          sql`CAST(${tradeflowkitJobs.number} AS TEXT) ILIKE ${prefix}`,
        ),
      )).orderBy(desc(tradeflowkitJobs.updatedAt)).limit(limit),
      db.select({
        id: tradeflowkitTasks.id,
        title: tradeflowkitTasks.title,
        status: tradeflowkitTasks.status,
        priority: tradeflowkitTasks.priority,
        jobId: tradeflowkitTasks.jobId,
        jobTitle: tradeflowkitJobs.title,
      }).from(tradeflowkitTasks).innerJoin(tradeflowkitJobs, and(
        eq(tradeflowkitJobs.tenantId, tradeflowkitTasks.tenantId),
        eq(tradeflowkitJobs.id, tradeflowkitTasks.jobId),
        isNull(tradeflowkitJobs.deletedAt),
      )).where(and(
        eq(tradeflowkitTasks.tenantId, tenant),
        isNull(tradeflowkitTasks.deletedAt),
        or(
          ilike(tradeflowkitTasks.title, pattern),
          ilike(tradeflowkitTasks.description, pattern),
          ilike(tradeflowkitJobs.title, pattern),
        ),
      )).orderBy(desc(tradeflowkitTasks.updatedAt)).limit(limit),
      db.select({
        id: directoryOrganizations.id,
        name: directoryOrganizations.name,
        type: directoryOrganizations.type,
        status: directoryOrganizations.status,
      }).from(directoryOrganizations).where(and(
        eq(directoryOrganizations.tenantId, tenant),
        isNull(directoryOrganizations.archivedAt),
        or(
          ilike(directoryOrganizations.name, pattern),
          ilike(directoryOrganizations.website, pattern),
        ),
      )).orderBy(desc(directoryOrganizations.updatedAt)).limit(limit),
      db.select({
        id: directoryContacts.id,
        firstName: directoryContacts.firstName,
        lastName: directoryContacts.lastName,
        email: directoryContacts.email,
        phone: directoryContacts.phone,
      }).from(directoryContacts).where(and(
        eq(directoryContacts.tenantId, tenant),
        isNull(directoryContacts.archivedAt),
        or(
          ilike(directoryContacts.firstName, pattern),
          ilike(directoryContacts.lastName, pattern),
          ilike(directoryContacts.normalizedName, pattern),
          ilike(directoryContacts.email, pattern),
          ilike(directoryContacts.phone, pattern),
        ),
      )).orderBy(desc(directoryContacts.updatedAt)).limit(limit),
      db.select({
        id: tradeflowkitQuotes.id,
        number: tradeflowkitQuotes.number,
        status: tradeflowkitQuotes.status,
        totalCents: tradeflowkitQuotes.totalCents,
        customerName: tradeflowkitCustomers.name,
      }).from(tradeflowkitQuotes).innerJoin(tradeflowkitCustomers, and(
        eq(tradeflowkitCustomers.tenantId, tradeflowkitQuotes.tenantId),
        eq(tradeflowkitCustomers.id, tradeflowkitQuotes.customerId),
        isNull(tradeflowkitCustomers.deletedAt),
      )).where(and(
        eq(tradeflowkitQuotes.tenantId, tenant),
        isNull(tradeflowkitQuotes.deletedAt),
        or(
          ilike(tradeflowkitQuotes.id, prefix),
          ilike(tradeflowkitCustomers.name, pattern),
          sql`CAST(${tradeflowkitQuotes.number} AS TEXT) ILIKE ${prefix}`,
        ),
      )).orderBy(desc(tradeflowkitQuotes.updatedAt)).limit(limit),
      db.select({
        id: tradeflowkitInvoices.id,
        number: tradeflowkitInvoices.number,
        status: tradeflowkitInvoices.status,
        totalCents: tradeflowkitInvoices.totalCents,
        balanceCents: tradeflowkitInvoices.balanceCents,
        customerName: tradeflowkitCustomers.name,
      }).from(tradeflowkitInvoices).innerJoin(tradeflowkitCustomers, and(
        eq(tradeflowkitCustomers.tenantId, tradeflowkitInvoices.tenantId),
        eq(tradeflowkitCustomers.id, tradeflowkitInvoices.customerId),
        isNull(tradeflowkitCustomers.deletedAt),
      )).where(and(
        eq(tradeflowkitInvoices.tenantId, tenant),
        isNull(tradeflowkitInvoices.deletedAt),
        or(
          ilike(tradeflowkitInvoices.id, prefix),
          ilike(tradeflowkitCustomers.name, pattern),
          sql`CAST(${tradeflowkitInvoices.number} AS TEXT) ILIKE ${prefix}`,
        ),
      )).orderBy(desc(tradeflowkitInvoices.updatedAt)).limit(limit),
    ]);

    return {
      query,
      leads, customers, jobs, tasks, organizations, contacts, quotes, invoices,
      total: leads.length + customers.length + jobs.length + tasks.length
        + organizations.length + contacts.length + quotes.length + invoices.length,
    };
  });

  app.get('/v1/modules/tradeflowkit/trash', { preHandler: [...readGuards] }, async (request, reply) => {
    let limit: number;
    try {
      const raw = record(request.query ?? {});
      limit = integer(raw.limit === undefined ? 50 : Number(raw.limit), 'limit', 1, 100, true)!;
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const [customers, jobs, invoices] = await Promise.all([
      db.select({
        id: tradeflowkitCustomers.id,
        name: tradeflowkitCustomers.name,
        email: tradeflowkitCustomers.email,
        phone: tradeflowkitCustomers.phone,
        version: tradeflowkitCustomers.version,
        deletedAt: tradeflowkitCustomers.deletedAt,
      }).from(tradeflowkitCustomers).where(and(
        eq(tradeflowkitCustomers.tenantId, tenant),
        isNotNull(tradeflowkitCustomers.deletedAt),
      )).orderBy(desc(tradeflowkitCustomers.deletedAt)).limit(limit + 1),
      db.select({
        id: tradeflowkitJobs.id,
        customerId: tradeflowkitJobs.customerId,
        number: tradeflowkitJobs.number,
        title: tradeflowkitJobs.title,
        status: tradeflowkitJobs.status,
        version: tradeflowkitJobs.version,
        deletedAt: tradeflowkitJobs.deletedAt,
      }).from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.tenantId, tenant),
        isNotNull(tradeflowkitJobs.deletedAt),
      )).orderBy(desc(tradeflowkitJobs.deletedAt)).limit(limit + 1),
      db.select({
        id: tradeflowkitInvoices.id,
        customerId: tradeflowkitInvoices.customerId,
        jobId: tradeflowkitInvoices.jobId,
        number: tradeflowkitInvoices.number,
        status: tradeflowkitInvoices.status,
        totalCents: tradeflowkitInvoices.totalCents,
        balanceCents: tradeflowkitInvoices.balanceCents,
        version: tradeflowkitInvoices.version,
        deletedAt: tradeflowkitInvoices.deletedAt,
      }).from(tradeflowkitInvoices).where(and(
        eq(tradeflowkitInvoices.tenantId, tenant),
        isNotNull(tradeflowkitInvoices.deletedAt),
      )).orderBy(desc(tradeflowkitInvoices.deletedAt)).limit(limit + 1),
    ]);
    return {
      customers: customers.slice(0, limit),
      jobs: jobs.slice(0, limit),
      invoices: invoices.slice(0, limit),
      hasMore: {
        customers: customers.length > limit,
        jobs: jobs.length > limit,
        invoices: invoices.length > limit,
      },
    };
  });

  app.post('/v1/modules/tradeflowkit/trash/customers/:id/restore', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let expectedVersion: number;
    try { expectedVersion = integer(record(request.body).expectedVersion, 'expectedVersion', 1, 1_000_000, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:customer:${tenant}:${id}`}))`);
      const [current] = await tx.select().from(tradeflowkitCustomers).where(and(
        eq(tradeflowkitCustomers.id, id),
        eq(tradeflowkitCustomers.tenantId, tenant),
        isNotNull(tradeflowkitCustomers.deletedAt),
      )).limit(1);
      if (!current) return { kind: 'not_found' as const };
      if (current.version !== expectedVersion) return { kind: 'version_conflict' as const, currentVersion: current.version };
      if (current.organizationId) {
        const [organization] = await tx.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(
          eq(directoryOrganizations.id, current.organizationId),
          eq(directoryOrganizations.tenantId, tenant),
          isNull(directoryOrganizations.archivedAt),
        )).limit(1);
        if (!organization) return { kind: 'parent_unavailable' as const };
      }
      const [restored] = await tx.update(tradeflowkitCustomers).set({
        deletedAt: null,
        updatedAt: new Date(),
        version: sql`${tradeflowkitCustomers.version} + 1`,
      }).where(and(
        eq(tradeflowkitCustomers.id, id),
        eq(tradeflowkitCustomers.tenantId, tenant),
        eq(tradeflowkitCustomers.version, expectedVersion),
        isNotNull(tradeflowkitCustomers.deletedAt),
      )).returning({ id: tradeflowkitCustomers.id, version: tradeflowkitCustomers.version });
      if (!restored) return { kind: 'version_conflict' as const, currentVersion: current.version };
      await audit(tx, { tenantId: tenant, userId: actor, action: 'restored', entityType: 'customer', entityId: id });
      return { kind: 'restored' as const, record: restored };
    });
    if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Archived customer not found', code: 'CUSTOMER_NOT_FOUND' });
    if (outcome.kind === 'parent_unavailable') return reply.code(409).send({ error: 'Restore the linked Directory organization first', code: 'CUSTOMER_DIRECTORY_ARCHIVED' });
    if (outcome.kind === 'version_conflict') return reply.code(409).send({ error: 'Customer changed; reload and retry', code: 'CUSTOMER_VERSION_CONFLICT', currentVersion: outcome.currentVersion });
    return { ok: true, customer: outcome.record };
  });

  app.post('/v1/modules/tradeflowkit/trash/jobs/:id/restore', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let expectedVersion: number;
    try { expectedVersion = integer(record(request.body).expectedVersion, 'expectedVersion', 1, 1_000_000, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const outcome = await db.transaction(async tx => {
      const [current] = await tx.select().from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.id, id),
        eq(tradeflowkitJobs.tenantId, tenant),
        isNotNull(tradeflowkitJobs.deletedAt),
      )).limit(1);
      if (!current) return { kind: 'not_found' as const };
      if (current.version !== expectedVersion) return { kind: 'version_conflict' as const, currentVersion: current.version };
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:customer:${tenant}:${current.customerId}`}))`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:job:${tenant}:${id}`}))`);
      const [customer] = await tx.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
        eq(tradeflowkitCustomers.id, current.customerId),
        eq(tradeflowkitCustomers.tenantId, tenant),
        isNull(tradeflowkitCustomers.deletedAt),
      )).limit(1);
      if (!customer) return { kind: 'customer_archived' as const };
      if (current.siteId) {
        const [site] = await tx.select({ id: directorySites.id }).from(directorySites).where(and(
          eq(directorySites.id, current.siteId),
          eq(directorySites.tenantId, tenant),
          isNull(directorySites.archivedAt),
        )).limit(1);
        if (!site) return { kind: 'site_archived' as const };
      }
      if (current.workflowStageId) {
        const [stage] = await tx.select({ id: tradeflowkitWorkflowStages.id }).from(tradeflowkitWorkflowStages).where(and(
          eq(tradeflowkitWorkflowStages.id, current.workflowStageId),
          eq(tradeflowkitWorkflowStages.tenantId, tenant),
          isNull(tradeflowkitWorkflowStages.archivedAt),
        )).limit(1);
        if (!stage) return { kind: 'stage_archived' as const };
      }
      const [restored] = await tx.update(tradeflowkitJobs).set({
        deletedAt: null,
        updatedAt: new Date(),
        version: sql`${tradeflowkitJobs.version} + 1`,
      }).where(and(
        eq(tradeflowkitJobs.id, id),
        eq(tradeflowkitJobs.tenantId, tenant),
        eq(tradeflowkitJobs.version, expectedVersion),
        isNotNull(tradeflowkitJobs.deletedAt),
      )).returning({ id: tradeflowkitJobs.id, version: tradeflowkitJobs.version });
      if (!restored) return { kind: 'version_conflict' as const, currentVersion: current.version };
      await audit(tx, { tenantId: tenant, userId: actor, action: 'restored', entityType: 'job', entityId: id, metadata: { customerId: current.customerId } });
      return { kind: 'restored' as const, record: restored };
    });
    if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Archived job not found', code: 'JOB_NOT_FOUND' });
    if (outcome.kind === 'customer_archived') return reply.code(409).send({ error: 'Restore the customer before restoring this job', code: 'JOB_CUSTOMER_ARCHIVED' });
    if (outcome.kind === 'site_archived') return reply.code(409).send({ error: 'Restore the linked site before restoring this job', code: 'JOB_SITE_ARCHIVED' });
    if (outcome.kind === 'stage_archived') return reply.code(409).send({ error: 'Restore or replace the workflow stage before restoring this job', code: 'JOB_STAGE_ARCHIVED' });
    if (outcome.kind === 'version_conflict') return reply.code(409).send({ error: 'Job changed; reload and retry', code: 'JOB_VERSION_CONFLICT', currentVersion: outcome.currentVersion });
    return { ok: true, job: outcome.record };
  });

  app.post('/v1/modules/tradeflowkit/trash/invoices/:id/restore', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let expectedVersion: number;
    try { expectedVersion = integer(record(request.body).expectedVersion, 'expectedVersion', 1, 1_000_000, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    try {
      const outcome = await db.transaction(async tx => {
        const [current] = await tx.select().from(tradeflowkitInvoices).where(and(
          eq(tradeflowkitInvoices.id, id),
          eq(tradeflowkitInvoices.tenantId, tenant),
          isNotNull(tradeflowkitInvoices.deletedAt),
        )).limit(1);
        if (!current) return { kind: 'not_found' as const };
        if (current.version !== expectedVersion) return { kind: 'version_conflict' as const, currentVersion: current.version };
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:customer:${tenant}:${current.customerId}`}))`);
        if (current.jobId) await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:job:${tenant}:${current.jobId}`}))`);
        const [customer] = await tx.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
          eq(tradeflowkitCustomers.id, current.customerId),
          eq(tradeflowkitCustomers.tenantId, tenant),
          isNull(tradeflowkitCustomers.deletedAt),
        )).limit(1);
        if (!customer) return { kind: 'customer_archived' as const };
        if (current.jobId) {
          const [job] = await tx.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
            eq(tradeflowkitJobs.id, current.jobId),
            eq(tradeflowkitJobs.tenantId, tenant),
            isNull(tradeflowkitJobs.deletedAt),
          )).limit(1);
          if (!job) return { kind: 'job_archived' as const };
        }
        const [restored] = await tx.update(tradeflowkitInvoices).set({
          deletedAt: null,
          updatedAt: new Date(),
          version: sql`${tradeflowkitInvoices.version} + 1`,
        }).where(and(
          eq(tradeflowkitInvoices.id, id),
          eq(tradeflowkitInvoices.tenantId, tenant),
          eq(tradeflowkitInvoices.version, expectedVersion),
          isNotNull(tradeflowkitInvoices.deletedAt),
        )).returning({ id: tradeflowkitInvoices.id, version: tradeflowkitInvoices.version });
        if (!restored) return { kind: 'version_conflict' as const, currentVersion: current.version };
        await audit(tx, { tenantId: tenant, userId: actor, action: 'restored', entityType: 'invoice', entityId: id, metadata: { customerId: current.customerId, jobId: current.jobId } });
        return { kind: 'restored' as const, record: restored };
      });
      if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Archived invoice not found', code: 'INVOICE_NOT_FOUND' });
      if (outcome.kind === 'customer_archived') return reply.code(409).send({ error: 'Restore the customer before restoring this invoice', code: 'INVOICE_CUSTOMER_ARCHIVED' });
      if (outcome.kind === 'job_archived') return reply.code(409).send({ error: 'Restore the job before restoring this invoice', code: 'INVOICE_JOB_ARCHIVED' });
      if (outcome.kind === 'version_conflict') return reply.code(409).send({ error: 'Invoice changed; reload and retry', code: 'INVOICE_VERSION_CONFLICT', currentVersion: outcome.currentVersion });
      return { ok: true, invoice: outcome.record };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Another active invoice already uses this source quote or number', code: 'INVOICE_RESTORE_CONFLICT' });
      }
      throw error;
    }
  });

  app.get('/v1/modules/tradeflowkit/workflows', { preHandler: [...readGuards] }, async (request, reply) => {
    let entityType: 'job' | 'task' | null;
    try {
      const raw = record(request.query ?? {});
      const value = stringValue(raw.entityType, 'entityType', 20);
      if (value && !WORKFLOW_ENTITY_TYPES.has(value)) throw new InputError('FIELD_INVALID', 'entityType');
      entityType = value as 'job' | 'task' | null;
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const workflows = await db.select().from(tradeflowkitWorkflows).where(and(
      eq(tradeflowkitWorkflows.tenantId, tenant),
      isNull(tradeflowkitWorkflows.archivedAt),
      ...(entityType ? [eq(tradeflowkitWorkflows.entityType, entityType)] : []),
    )).orderBy(desc(tradeflowkitWorkflows.isDefault), asc(tradeflowkitWorkflows.name));
    const stages = workflows.length > 0
      ? await db.select().from(tradeflowkitWorkflowStages).where(and(
        eq(tradeflowkitWorkflowStages.tenantId, tenant),
        inArray(tradeflowkitWorkflowStages.workflowId, workflows.map(workflow => workflow.id)),
        isNull(tradeflowkitWorkflowStages.archivedAt),
      )).orderBy(asc(tradeflowkitWorkflowStages.position))
      : [];
    return workflows.map(workflow => ({
      ...workflow,
      stages: stages.filter(stage => stage.workflowId === workflow.id),
    }));
  });

  app.post('/v1/modules/tradeflowkit/workflows', { preHandler: [...adminGuards] }, async (request, reply) => {
    let body: {
      name: string;
      normalizedName: string;
      description: string;
      entityType: 'job' | 'task';
      isDefault: boolean;
      stages: ReturnType<typeof workflowStageInput>[];
    };
    try {
      const raw = record(request.body);
      const name = stringValue(raw.name, 'name', 120, true)!;
      const entityType = (stringValue(raw.entityType, 'entityType', 20) ?? 'job') as 'job' | 'task';
      if (!WORKFLOW_ENTITY_TYPES.has(entityType)) throw new InputError('FIELD_INVALID', 'entityType');
      if (!Array.isArray(raw.stages) || raw.stages.length < 1 || raw.stages.length > 30) {
        throw new InputError('FIELD_INVALID', 'stages');
      }
      const stages = raw.stages.map((stage, index) => workflowStageInput(stage, index));
      if (new Set(stages.map(stage => stage.normalizedName)).size !== stages.length) {
        throw new InputError('FIELD_DUPLICATE', 'stages.name');
      }
      if (new Set(stages.map(stage => stage.position)).size !== stages.length) {
        throw new InputError('FIELD_DUPLICATE', 'stages.position');
      }
      if (stages.some(stage => !mappedStatusAllowed(entityType, stage.mappedStatus))) {
        throw new InputError('FIELD_INVALID', 'stages.mappedStatus');
      }
      body = {
        name,
        normalizedName: normalizeName(name),
        description: stringValue(raw.description, 'description', 2_000) ?? '',
        entityType,
        isDefault: booleanValue(raw.isDefault, 'isDefault'),
        stages,
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }

    const tenant = tenantId(request);
    const actor = userId(request);
    try {
      const result = await db.transaction(async tx => {
        if (body.isDefault) {
          await tx.update(tradeflowkitWorkflows).set({
            isDefault: false,
            version: sql`${tradeflowkitWorkflows.version} + 1`,
            updatedAt: new Date(),
            updatedByUserId: actor,
          }).where(and(
            eq(tradeflowkitWorkflows.tenantId, tenant),
            eq(tradeflowkitWorkflows.entityType, body.entityType),
            eq(tradeflowkitWorkflows.isDefault, true),
            isNull(tradeflowkitWorkflows.archivedAt),
          ));
        }
        const [workflow] = await tx.insert(tradeflowkitWorkflows).values({
          tenantId: tenant,
          name: body.name,
          normalizedName: body.normalizedName,
          description: body.description,
          entityType: body.entityType,
          isDefault: body.isDefault,
          createdByUserId: actor,
          updatedByUserId: actor,
        }).returning();
        const stages = await tx.insert(tradeflowkitWorkflowStages).values(body.stages.map(stage => ({
          ...stage,
          tenantId: tenant,
          workflowId: workflow.id,
          createdByUserId: actor,
          updatedByUserId: actor,
        }))).returning();
        await audit(tx, {
          tenantId: tenant,
          userId: actor,
          action: 'created',
          entityType: 'workflow',
          entityId: workflow.id,
          metadata: { entityType: body.entityType, stageCount: stages.length },
        });
        return { ...workflow, stages };
      });
      return reply.code(201).send(result);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Workflow name, default, or stage order already exists', code: 'WORKFLOW_CONFLICT' });
      }
      throw error;
    }
  });

  app.patch('/v1/modules/tradeflowkit/workflows/:id', { preHandler: [...adminGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: { expectedVersion: number; name: string | null; description: string | null; isDefault: boolean | null };
    try {
      const raw = record(request.body);
      body = {
        expectedVersion: integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)!,
        name: stringValue(raw.name, 'name', 120),
        description: stringValue(raw.description, 'description', 2_000),
        isDefault: raw.isDefault === undefined ? null : booleanValue(raw.isDefault, 'isDefault'),
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    try {
      const updated = await db.transaction(async tx => {
        const [current] = await tx.select().from(tradeflowkitWorkflows).where(and(
          eq(tradeflowkitWorkflows.tenantId, tenant),
          eq(tradeflowkitWorkflows.id, id),
          isNull(tradeflowkitWorkflows.archivedAt),
        )).limit(1);
        if (!current) return { kind: 'missing' as const };
        if (current.version !== body.expectedVersion) return { kind: 'conflict' as const };
        if (body.isDefault === true) {
          await tx.update(tradeflowkitWorkflows).set({
            isDefault: false,
            version: sql`${tradeflowkitWorkflows.version} + 1`,
            updatedAt: new Date(),
            updatedByUserId: actor,
          }).where(and(
            eq(tradeflowkitWorkflows.tenantId, tenant),
            eq(tradeflowkitWorkflows.entityType, current.entityType),
            eq(tradeflowkitWorkflows.isDefault, true),
            ne(tradeflowkitWorkflows.id, id),
            isNull(tradeflowkitWorkflows.archivedAt),
          ));
        }
        const patch = {
          ...(body.name ? { name: body.name, normalizedName: normalizeName(body.name) } : {}),
          ...(body.description !== null ? { description: body.description } : {}),
          ...(body.isDefault !== null ? { isDefault: body.isDefault } : {}),
          version: sql`${tradeflowkitWorkflows.version} + 1`,
          updatedAt: new Date(),
          updatedByUserId: actor,
        };
        const [workflow] = await tx.update(tradeflowkitWorkflows).set(patch).where(and(
          eq(tradeflowkitWorkflows.tenantId, tenant),
          eq(tradeflowkitWorkflows.id, id),
          eq(tradeflowkitWorkflows.version, body.expectedVersion),
          isNull(tradeflowkitWorkflows.archivedAt),
        )).returning();
        if (!workflow) return { kind: 'conflict' as const };
        await audit(tx, {
          tenantId: tenant,
          userId: actor,
          action: 'updated',
          entityType: 'workflow',
          entityId: id,
          metadata: { changedFields: Object.keys(patch).filter(key => !['version', 'updatedAt', 'updatedByUserId'].includes(key)) },
        });
        return { kind: 'updated' as const, workflow };
      });
      if (updated.kind === 'missing') return reply.code(404).send({ error: 'Workflow not found', code: 'WORKFLOW_NOT_FOUND' });
      if (updated.kind === 'conflict') return reply.code(409).send({ error: 'Workflow changed; reload and retry', code: 'WORKFLOW_VERSION_CONFLICT' });
      return updated.workflow;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Workflow name or default already exists', code: 'WORKFLOW_CONFLICT' });
      }
      throw error;
    }
  });

  app.post('/v1/modules/tradeflowkit/workflows/:id/stages', { preHandler: [...adminGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: ReturnType<typeof workflowStageInput> & { expectedWorkflowVersion: number };
    try {
      const raw = record(request.body);
      body = {
        ...workflowStageInput(raw, 0),
        expectedWorkflowVersion: integer(raw.expectedWorkflowVersion, 'expectedWorkflowVersion', 1, 1_000_000, true)!,
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    try {
      const result = await db.transaction(async tx => {
        const [workflow] = await tx.select().from(tradeflowkitWorkflows).where(and(
          eq(tradeflowkitWorkflows.tenantId, tenant),
          eq(tradeflowkitWorkflows.id, id),
          isNull(tradeflowkitWorkflows.archivedAt),
        )).limit(1);
        if (!workflow) return { kind: 'missing' as const };
        if (workflow.version !== body.expectedWorkflowVersion) return { kind: 'conflict' as const };
        if (!mappedStatusAllowed(workflow.entityType, body.mappedStatus)) return { kind: 'invalid_status' as const };
        const [claimed] = await tx.update(tradeflowkitWorkflows).set({
          version: sql`${tradeflowkitWorkflows.version} + 1`,
          updatedAt: new Date(),
          updatedByUserId: actor,
        }).where(and(
          eq(tradeflowkitWorkflows.tenantId, tenant),
          eq(tradeflowkitWorkflows.id, id),
          eq(tradeflowkitWorkflows.version, body.expectedWorkflowVersion),
        )).returning();
        if (!claimed) return { kind: 'conflict' as const };
        const [stage] = await tx.insert(tradeflowkitWorkflowStages).values({
          tenantId: tenant,
          workflowId: id,
          name: body.name,
          normalizedName: body.normalizedName,
          color: body.color,
          position: body.position,
          mappedStatus: body.mappedStatus,
          createdByUserId: actor,
          updatedByUserId: actor,
        }).returning();
        await audit(tx, { tenantId: tenant, userId: actor, action: 'stage_created', entityType: 'workflow', entityId: id, metadata: { stageId: stage.id } });
        return { kind: 'created' as const, stage, workflowVersion: claimed.version };
      });
      if (result.kind === 'missing') return reply.code(404).send({ error: 'Workflow not found', code: 'WORKFLOW_NOT_FOUND' });
      if (result.kind === 'conflict') return reply.code(409).send({ error: 'Workflow changed; reload and retry', code: 'WORKFLOW_VERSION_CONFLICT' });
      if (result.kind === 'invalid_status') return reply.code(400).send({ error: 'Mapped status is invalid for this workflow', code: 'WORKFLOW_STATUS_INVALID' });
      return reply.code(201).send({ ...result.stage, workflowVersion: result.workflowVersion });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Stage name or position already exists', code: 'WORKFLOW_STAGE_CONFLICT' });
      }
      throw error;
    }
  });

  app.patch('/v1/modules/tradeflowkit/workflow-stages/:id', { preHandler: [...adminGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: {
      expectedVersion: number;
      name: string | null;
      color: string | null;
      position: number | null;
      mappedStatus: string | null;
      mappedStatusProvided: boolean;
    };
    try {
      const raw = record(request.body);
      body = {
        expectedVersion: integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)!,
        name: stringValue(raw.name, 'name', 80),
        color: raw.color === undefined ? null : workflowColor(raw.color),
        position: integer(raw.position, 'position', 0, 1000),
        mappedStatus: workflowStatus(raw.mappedStatus),
        mappedStatusProvided: raw.mappedStatus !== undefined,
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const [current] = await db.select({
      stage: tradeflowkitWorkflowStages,
      entityType: tradeflowkitWorkflows.entityType,
    }).from(tradeflowkitWorkflowStages).innerJoin(
      tradeflowkitWorkflows,
      and(
        eq(tradeflowkitWorkflows.tenantId, tradeflowkitWorkflowStages.tenantId),
        eq(tradeflowkitWorkflows.id, tradeflowkitWorkflowStages.workflowId),
      ),
    ).where(and(
      eq(tradeflowkitWorkflowStages.tenantId, tenant),
      eq(tradeflowkitWorkflowStages.id, id),
      isNull(tradeflowkitWorkflowStages.archivedAt),
      isNull(tradeflowkitWorkflows.archivedAt),
    )).limit(1);
    if (!current) return reply.code(404).send({ error: 'Workflow stage not found', code: 'WORKFLOW_STAGE_NOT_FOUND' });
    if (!mappedStatusAllowed(current.entityType, body.mappedStatus)) {
      return reply.code(400).send({ error: 'Mapped status is invalid for this workflow', code: 'WORKFLOW_STATUS_INVALID' });
    }
    try {
      const [stage] = await db.transaction(async tx => {
        const rows = await tx.update(tradeflowkitWorkflowStages).set({
          ...(body.name ? { name: body.name, normalizedName: normalizeName(body.name) } : {}),
          ...(body.color ? { color: body.color } : {}),
          ...(body.position !== null ? { position: body.position } : {}),
          ...(body.mappedStatusProvided ? { mappedStatus: body.mappedStatus } : {}),
          version: sql`${tradeflowkitWorkflowStages.version} + 1`,
          updatedAt: new Date(),
          updatedByUserId: actor,
        }).where(and(
          eq(tradeflowkitWorkflowStages.tenantId, tenant),
          eq(tradeflowkitWorkflowStages.id, id),
          eq(tradeflowkitWorkflowStages.version, body.expectedVersion),
          isNull(tradeflowkitWorkflowStages.archivedAt),
        )).returning();
        if (!rows[0]) return [];
        await audit(tx, { tenantId: tenant, userId: actor, action: 'stage_updated', entityType: 'workflow', entityId: current.stage.workflowId, metadata: { stageId: id } });
        return rows;
      });
      if (!stage) return reply.code(409).send({ error: 'Workflow stage changed; reload and retry', code: 'WORKFLOW_STAGE_VERSION_CONFLICT' });
      return stage;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return reply.code(409).send({ error: 'Stage name or position already exists', code: 'WORKFLOW_STAGE_CONFLICT' });
      }
      throw error;
    }
  });

  app.delete('/v1/modules/tradeflowkit/workflows/:id', { preHandler: [...adminGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let expectedVersion;
    try { expectedVersion = integer(record(request.body).expectedVersion, 'expectedVersion', 1, 1_000_000, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const archived = await db.transaction(async tx => {
      const [workflow] = await tx.update(tradeflowkitWorkflows).set({
        archivedAt: new Date(),
        isDefault: false,
        version: sql`${tradeflowkitWorkflows.version} + 1`,
        updatedAt: new Date(),
        updatedByUserId: actor,
      }).where(and(
        eq(tradeflowkitWorkflows.tenantId, tenant),
        eq(tradeflowkitWorkflows.id, id),
        eq(tradeflowkitWorkflows.version, expectedVersion),
        isNull(tradeflowkitWorkflows.archivedAt),
      )).returning();
      if (!workflow) return null;
      await tx.update(tradeflowkitWorkflowStages).set({
        archivedAt: new Date(),
        version: sql`${tradeflowkitWorkflowStages.version} + 1`,
        updatedAt: new Date(),
        updatedByUserId: actor,
      }).where(and(
        eq(tradeflowkitWorkflowStages.tenantId, tenant),
        eq(tradeflowkitWorkflowStages.workflowId, id),
        isNull(tradeflowkitWorkflowStages.archivedAt),
      ));
      await audit(tx, { tenantId: tenant, userId: actor, action: 'archived', entityType: 'workflow', entityId: id });
      return workflow;
    });
    if (!archived) return reply.code(409).send({ error: 'Workflow not found or changed; reload and retry', code: 'WORKFLOW_VERSION_CONFLICT' });
    return { ok: true };
  });

  async function sendAccountingExport(
    request: FastifyRequest,
    reply: FastifyReply,
    definition: { filename: string; contentType: string; build: (data: AccountingExportData) => string },
  ) {
    try {
      const output = definition.build(await loadAccountingExportData(tenantId(request)));
      return reply
        .header('Content-Type', definition.contentType)
        .header('Content-Disposition', `attachment; filename="${definition.filename}"`)
        .header('Cache-Control', 'private, no-store')
        .header('X-Content-Type-Options', 'nosniff')
        .header('X-TradeFlowKit-Accounting-Export-Version', TRADEFLOWKIT_ACCOUNTING_EXPORT_VERSION)
        .send(output);
    } catch (error) {
      if (error instanceof AccountingExportLimitError) {
        return reply.code(409).send({
          error: error.message,
          code: 'ACCOUNTING_EXPORT_LIMIT_EXCEEDED',
          resource: error.resource,
          limit: ACCOUNTING_EXPORT_LIMITS[error.resource],
        });
      }
      request.log.error({ err: error }, 'TradeFlowKit accounting export failed');
      return reply.code(500).send({ error: 'Accounting export failed', code: 'ACCOUNTING_EXPORT_FAILED' });
    }
  }

  app.get('/v1/modules/tradeflowkit/exports/quickbooks.iif', { preHandler: [...readGuards] }, (request, reply) =>
    sendAccountingExport(request, reply, {
      filename: 'tradeflowkit-quickbooks-v1.iif',
      contentType: 'text/plain; charset=utf-8',
      build: buildQuickBooksIif,
    }));
  app.get('/v1/modules/tradeflowkit/exports/quickbooks/invoices.csv', { preHandler: [...readGuards] }, (request, reply) =>
    sendAccountingExport(request, reply, {
      filename: 'tradeflowkit-quickbooks-invoices-v1.csv',
      contentType: 'text/csv; charset=utf-8',
      build: buildQuickBooksInvoiceCsv,
    }));
  app.get('/v1/modules/tradeflowkit/exports/xero/customers.csv', { preHandler: [...readGuards] }, (request, reply) =>
    sendAccountingExport(request, reply, {
      filename: 'tradeflowkit-xero-customers-v1.csv',
      contentType: 'text/csv; charset=utf-8',
      build: buildXeroCustomersCsv,
    }));
  app.get('/v1/modules/tradeflowkit/exports/xero/invoices.csv', { preHandler: [...readGuards] }, (request, reply) =>
    sendAccountingExport(request, reply, {
      filename: 'tradeflowkit-xero-invoices-v1.csv',
      contentType: 'text/csv; charset=utf-8',
      build: buildXeroInvoicesCsv,
    }));
  app.get('/v1/modules/tradeflowkit/exports/xero/payments.csv', { preHandler: [...readGuards] }, (request, reply) =>
    sendAccountingExport(request, reply, {
      filename: 'tradeflowkit-xero-payments-v1.csv',
      contentType: 'text/csv; charset=utf-8',
      build: buildXeroPaymentsCsv,
    }));

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

  app.get('/v1/modules/tradeflowkit/tasks', { preHandler: [...readGuards] }, async (request, reply) => {
    let query: ReturnType<typeof pageQuery> & { scope: string | null; jobId: string | null };
    try {
      const page = pageQuery(request.query);
      const raw = record(request.query ?? {});
      query = {
        ...page,
        scope: stringValue(raw.scope, 'scope', 20),
        jobId: stringValue(raw.jobId, 'jobId', 36),
      };
      if (query.scope && !['mine', 'team'].includes(query.scope)) throw new InputError('FIELD_INVALID', 'scope');
      if (query.status && !TASK_STATUSES.has(query.status)) throw new InputError('FIELD_INVALID', 'status');
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const where = and(
      eq(tradeflowkitTasks.tenantId, tenant),
      isNull(tradeflowkitTasks.deletedAt),
      ...(query.scope === 'mine' ? [eq(tradeflowkitTasks.assignedToUserId, userId(request))] : []),
      ...(query.status ? [eq(tradeflowkitTasks.status, query.status)] : []),
      ...(query.jobId ? [eq(tradeflowkitTasks.jobId, query.jobId)] : []),
      ...(query.search ? [or(
        ilike(tradeflowkitTasks.title, `%${query.search}%`),
        ilike(tradeflowkitTasks.description, `%${query.search}%`),
      )!] : []),
    );
    const [items, total] = await Promise.all([
      db.select({
        id: tradeflowkitTasks.id,
        tenantId: tradeflowkitTasks.tenantId,
        jobId: tradeflowkitTasks.jobId,
        title: tradeflowkitTasks.title,
        description: tradeflowkitTasks.description,
        status: tradeflowkitTasks.status,
        priority: tradeflowkitTasks.priority,
        assignedToUserId: tradeflowkitTasks.assignedToUserId,
        dueAt: tradeflowkitTasks.dueAt,
        sortOrder: tradeflowkitTasks.sortOrder,
        workflowStageId: tradeflowkitTasks.workflowStageId,
        completedAt: tradeflowkitTasks.completedAt,
        version: tradeflowkitTasks.version,
        createdAt: tradeflowkitTasks.createdAt,
        updatedAt: tradeflowkitTasks.updatedAt,
        jobTitle: tradeflowkitJobs.title,
        customerId: tradeflowkitJobs.customerId,
        customerName: tradeflowkitCustomers.name,
        stageName: tradeflowkitWorkflowStages.name,
        stageColor: tradeflowkitWorkflowStages.color,
      }).from(tradeflowkitTasks)
        .innerJoin(tradeflowkitJobs, and(
          eq(tradeflowkitJobs.tenantId, tradeflowkitTasks.tenantId),
          eq(tradeflowkitJobs.id, tradeflowkitTasks.jobId),
          isNull(tradeflowkitJobs.deletedAt),
        ))
        .innerJoin(tradeflowkitCustomers, and(
          eq(tradeflowkitCustomers.tenantId, tradeflowkitJobs.tenantId),
          eq(tradeflowkitCustomers.id, tradeflowkitJobs.customerId),
          isNull(tradeflowkitCustomers.deletedAt),
        ))
        .leftJoin(tradeflowkitWorkflowStages, and(
          eq(tradeflowkitWorkflowStages.tenantId, tradeflowkitTasks.tenantId),
          eq(tradeflowkitWorkflowStages.id, tradeflowkitTasks.workflowStageId),
          isNull(tradeflowkitWorkflowStages.archivedAt),
        ))
        .where(where)
        .orderBy(sql`${tradeflowkitTasks.dueAt} ASC NULLS LAST`, desc(tradeflowkitTasks.updatedAt))
        .limit(query.limit)
        .offset(query.offset),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM tradeflowkit_tasks WHERE tenant_id = ${tenant} AND deleted_at IS NULL
        ${query.scope === 'mine' ? sql`AND assigned_to_user_id = ${userId(request)}` : sql``}
        ${query.status ? sql`AND status = ${query.status}` : sql``}
        ${query.jobId ? sql`AND job_id = ${query.jobId}` : sql``}
        ${query.search ? sql`AND (title ILIKE ${`%${query.search}%`} OR description ILIKE ${`%${query.search}%`})` : sql``}`),
    ]);
    return {
      items,
      pagination: {
        total: Number(total.rows[0]?.count ?? 0),
        limit: query.limit,
        offset: query.offset,
        returned: items.length,
      },
    };
  });

  app.get('/v1/modules/tradeflowkit/tasks/:id', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const [task] = await db.select().from(tradeflowkitTasks).where(and(
      eq(tradeflowkitTasks.tenantId, tenant),
      eq(tradeflowkitTasks.id, id),
      isNull(tradeflowkitTasks.deletedAt),
    )).limit(1);
    if (!task) return reply.code(404).send({ error: 'Task not found', code: 'TASK_NOT_FOUND' });
    const [dependencies, comments, activity] = await Promise.all([
      db.select().from(tradeflowkitTaskDependencies).where(and(
        eq(tradeflowkitTaskDependencies.tenantId, tenant),
        eq(tradeflowkitTaskDependencies.taskId, id),
      )).orderBy(asc(tradeflowkitTaskDependencies.createdAt)),
      db.select().from(tradeflowkitComments).where(and(
        eq(tradeflowkitComments.tenantId, tenant),
        eq(tradeflowkitComments.entityType, 'task'),
        eq(tradeflowkitComments.entityId, id),
        isNull(tradeflowkitComments.deletedAt),
      )).orderBy(desc(tradeflowkitComments.createdAt)),
      db.select().from(activityFeed).where(and(
        eq(activityFeed.tenantId, tenant),
        eq(activityFeed.entityType, 'tradeflowkit_task'),
        eq(activityFeed.entityId, id),
      )).orderBy(desc(activityFeed.createdAt)).limit(100),
    ]);
    return { ...task, dependencies, comments, activity };
  });

  app.delete('/v1/modules/tradeflowkit/tasks/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let expectedVersion;
    try { expectedVersion = integer(record(request.body).expectedVersion, 'expectedVersion', 1, 1_000_000, true)!; }
    catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const actor = userId(request);
    const [archived] = await db.transaction(async tx => {
      const rows = await tx.update(tradeflowkitTasks).set({
        deletedAt: new Date(),
        version: sql`${tradeflowkitTasks.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitTasks.tenantId, tenant),
        eq(tradeflowkitTasks.id, id),
        eq(tradeflowkitTasks.version, expectedVersion),
        isNull(tradeflowkitTasks.deletedAt),
      )).returning();
      if (!rows[0]) return [];
      await audit(tx, { tenantId: tenant, userId: actor, action: 'archived', entityType: 'task', entityId: id, metadata: { jobId: rows[0].jobId } });
      return rows;
    });
    if (!archived) return reply.code(409).send({ error: 'Task not found or changed; reload and retry', code: 'TASK_VERSION_CONFLICT' });
    return { ok: true };
  });

  app.get('/v1/modules/tradeflowkit/activity', { preHandler: [...readGuards] }, async (request, reply) => {
    let query: ReturnType<typeof pageQuery> & { entityType: string | null; entityId: string | null };
    try {
      const page = pageQuery(request.query);
      const raw = record(request.query ?? {});
      query = {
        ...page,
        entityType: stringValue(raw.entityType, 'entityType', 40),
        entityId: stringValue(raw.entityId, 'entityId', 36),
      };
      if (query.entityType && !ENTITY_TYPES.has(query.entityType) && query.entityType !== 'workflow') {
        throw new InputError('FIELD_INVALID', 'entityType');
      }
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const items = await db.select().from(activityFeed).where(and(
      eq(activityFeed.tenantId, tenant),
      ilike(activityFeed.entityType, 'tradeflowkit_%'),
      ...(query.entityType ? [eq(activityFeed.entityType, `tradeflowkit_${query.entityType}`)] : []),
      ...(query.entityId ? [eq(activityFeed.entityId, query.entityId)] : []),
    )).orderBy(desc(activityFeed.createdAt)).limit(query.limit).offset(query.offset);
    return { items, pagination: { limit: query.limit, offset: query.offset, returned: items.length } };
  });

  app.post('/v1/modules/tradeflowkit/jobs/:id/workflow-transition', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    let body: { workflowStageId: string; expectedVersion: number };
    try {
      const raw = record(request.body);
      body = {
        workflowStageId: stringValue(raw.workflowStageId, 'workflowStageId', 36, true)!,
        expectedVersion: integer(raw.expectedVersion, 'expectedVersion', 1, 1_000_000, true)!,
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const tenant = tenantId(request);
    const [stage] = await db.select({
      id: tradeflowkitWorkflowStages.id,
      name: tradeflowkitWorkflowStages.name,
      mappedStatus: tradeflowkitWorkflowStages.mappedStatus,
    }).from(tradeflowkitWorkflowStages).innerJoin(
      tradeflowkitWorkflows,
      and(
        eq(tradeflowkitWorkflows.tenantId, tradeflowkitWorkflowStages.tenantId),
        eq(tradeflowkitWorkflows.id, tradeflowkitWorkflowStages.workflowId),
      ),
    ).where(and(
      eq(tradeflowkitWorkflowStages.tenantId, tenant),
      eq(tradeflowkitWorkflowStages.id, body.workflowStageId),
      isNull(tradeflowkitWorkflowStages.archivedAt),
      eq(tradeflowkitWorkflows.entityType, 'job'),
      isNull(tradeflowkitWorkflows.archivedAt),
    )).limit(1);
    if (!stage) return reply.code(404).send({ error: 'Workflow stage not found', code: 'WORKFLOW_STAGE_NOT_FOUND' });
    const actor = userId(request);
    const [updated] = await db.transaction(async tx => {
      const rows = await tx.update(tradeflowkitJobs).set({
        workflowStageId: stage.id,
        ...(stage.mappedStatus ? { status: stage.mappedStatus } : {}),
        ...(stage.mappedStatus === 'done' ? { completedAt: new Date() } : {}),
        version: sql`${tradeflowkitJobs.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(tradeflowkitJobs.tenantId, tenant),
        eq(tradeflowkitJobs.id, id),
        eq(tradeflowkitJobs.version, body.expectedVersion),
        isNull(tradeflowkitJobs.deletedAt),
      )).returning();
      if (!rows[0]) return [];
      await audit(tx, {
        tenantId: tenant,
        userId: actor,
        action: 'workflow_transition',
        entityType: 'job',
        entityId: id,
        metadata: { workflowStageId: stage.id, stageName: stage.name, mappedStatus: stage.mappedStatus },
      });
      return rows;
    });
    if (!updated) return reply.code(409).send({ error: 'Job not found or changed; reload and retry', code: 'JOB_VERSION_CONFLICT' });
    return updated;
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
      if (priority && !['low','normal','high','urgent'].includes(priority)) throw new InputError('PRIORITY_INVALID', 'priority');
      body = {
        expectedVersion,
        providedFields: new Set(Object.keys(raw)),
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
    const patch = Object.fromEntries(Object.entries(body).filter(([key, value]) => !['expectedVersion', 'providedFields'].includes(key) && value !== null));
    for (const field of ['description', 'internalNotes', 'assignedToUserId', 'siteId', 'scheduledStart', 'scheduledEnd'] as const) {
      if (body.providedFields.has(field)) patch[field] = body[field];
    }
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

  app.delete('/v1/modules/tradeflowkit/jobs/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    let expectedVersion;
    try {
      expectedVersion = integer(record(request.body).expectedVersion, 'expectedVersion', 1, 1_000_000, true)!;
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }

    const outcome = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:job:${tenant}:${id}`}))`);
      const [current] = await tx.select().from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.id, id),
        eq(tradeflowkitJobs.tenantId, tenant),
        isNull(tradeflowkitJobs.deletedAt),
      )).limit(1);
      if (!current) return { kind: 'not_found' as const };
      if (current.version !== expectedVersion) return { kind: 'version_conflict' as const, currentVersion: current.version };
      const [activeTasks, activeQuotes, activeInvoices] = await Promise.all([
        tx.select({ id: tradeflowkitTasks.id }).from(tradeflowkitTasks).where(and(
          eq(tradeflowkitTasks.tenantId, tenant),
          eq(tradeflowkitTasks.jobId, id),
          isNull(tradeflowkitTasks.deletedAt),
        )).limit(1),
        tx.select({ id: tradeflowkitQuotes.id }).from(tradeflowkitQuotes).where(and(
          eq(tradeflowkitQuotes.tenantId, tenant),
          eq(tradeflowkitQuotes.jobId, id),
          isNull(tradeflowkitQuotes.deletedAt),
        )).limit(1),
        tx.select({ id: tradeflowkitInvoices.id }).from(tradeflowkitInvoices).where(and(
          eq(tradeflowkitInvoices.tenantId, tenant),
          eq(tradeflowkitInvoices.jobId, id),
          isNull(tradeflowkitInvoices.deletedAt),
        )).limit(1),
      ]);
      if (activeTasks.length || activeQuotes.length || activeInvoices.length) return { kind: 'active_history' as const };
      const [archived] = await tx.update(tradeflowkitJobs).set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${tradeflowkitJobs.version} + 1`,
      }).where(and(
        eq(tradeflowkitJobs.id, id),
        eq(tradeflowkitJobs.tenantId, tenant),
        eq(tradeflowkitJobs.version, expectedVersion),
        isNull(tradeflowkitJobs.deletedAt),
      )).returning();
      if (!archived) return { kind: 'version_conflict' as const, currentVersion: current.version };
      await audit(tx, {
        tenantId: tenant,
        userId: userId(request),
        action: 'archived',
        entityType: 'job',
        entityId: id,
        metadata: { customerId: current.customerId },
      });
      return { kind: 'archived' as const, job: archived };
    });

    if (outcome.kind === 'not_found') return reply.code(404).send({ error: 'Job not found', code: 'JOB_NOT_FOUND' });
    if (outcome.kind === 'version_conflict') {
      return reply.code(409).send({
        error: 'Job changed; reload and retry',
        code: 'JOB_VERSION_CONFLICT',
        currentVersion: outcome.currentVersion,
      });
    }
    if (outcome.kind === 'active_history') {
      return reply.code(409).send({
        error: 'Archive active tasks, quotes, and invoices before archiving this job',
        code: 'JOB_HAS_ACTIVE_HISTORY',
      });
    }
    return { ok: true, job: outcome.job };
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
        workflowStageId: stringValue(raw.workflowStageId, 'workflowStageId', 36),
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
    if (body.workflowStageId) {
      const [stage] = await db.select({ id: tradeflowkitWorkflowStages.id }).from(tradeflowkitWorkflowStages).innerJoin(
        tradeflowkitWorkflows,
        and(
          eq(tradeflowkitWorkflows.tenantId, tradeflowkitWorkflowStages.tenantId),
          eq(tradeflowkitWorkflows.id, tradeflowkitWorkflowStages.workflowId),
        ),
      ).where(and(
        eq(tradeflowkitWorkflowStages.tenantId, tenant),
        eq(tradeflowkitWorkflowStages.id, body.workflowStageId),
        isNull(tradeflowkitWorkflowStages.archivedAt),
        eq(tradeflowkitWorkflows.entityType, 'task'),
        isNull(tradeflowkitWorkflows.archivedAt),
      )).limit(1);
      if (!stage) return reply.code(404).send({ error: 'Task workflow stage not found', code: 'WORKFLOW_STAGE_NOT_FOUND' });
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
        expectedVersion, status, priority, providedFields: new Set(Object.keys(raw)),
        title: stringValue(raw.title, 'title', 200),
        description: stringValue(raw.description, 'description', 4_000),
        assignedToUserId: stringValue(raw.assignedToUserId, 'assignedToUserId', 36),
        workflowStageId: stringValue(raw.workflowStageId, 'workflowStageId', 36),
        dueAt: dateValue(raw.dueAt, 'dueAt'),
        sortOrder: integer(raw.sortOrder, 'sortOrder', 0, 1_000_000),
      };
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const [current] = await db.select().from(tradeflowkitTasks).where(and(eq(tradeflowkitTasks.id, id), eq(tradeflowkitTasks.tenantId, tenant), isNull(tradeflowkitTasks.deletedAt))).limit(1);
    if (!current) return reply.code(404).send({ error: 'Task not found', code: 'TASK_NOT_FOUND' });
    if (body.workflowStageId) {
      const [stage] = await db.select({ id: tradeflowkitWorkflowStages.id }).from(tradeflowkitWorkflowStages).innerJoin(
        tradeflowkitWorkflows,
        and(
          eq(tradeflowkitWorkflows.tenantId, tradeflowkitWorkflowStages.tenantId),
          eq(tradeflowkitWorkflows.id, tradeflowkitWorkflowStages.workflowId),
        ),
      ).where(and(
        eq(tradeflowkitWorkflowStages.tenantId, tenant),
        eq(tradeflowkitWorkflowStages.id, body.workflowStageId),
        isNull(tradeflowkitWorkflowStages.archivedAt),
        eq(tradeflowkitWorkflows.entityType, 'task'),
        isNull(tradeflowkitWorkflows.archivedAt),
      )).limit(1);
      if (!stage) return reply.code(404).send({ error: 'Task workflow stage not found', code: 'WORKFLOW_STAGE_NOT_FOUND' });
    }
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
    const patch = Object.fromEntries(Object.entries(body).filter(([key, value]) => !['expectedVersion', 'providedFields'].includes(key) && value !== null));
    for (const field of ['description', 'assignedToUserId', 'workflowStageId', 'dueAt'] as const) {
      if (body.providedFields.has(field)) patch[field] = body[field];
    }
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

  const queueLeadMessage = (channel: 'email' | 'sms') => async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const tenant = tenantId(request);
    const key = idempotencyKey(request);
    if (!key) return reply.code(400).send({ error: 'A valid Idempotency-Key header is required', code: 'IDEMPOTENCY_KEY_REQUIRED' });
    let template: string | null;
    let subject: string | null;
    try {
      const raw = record(request.body ?? {});
      if (Object.keys(raw).some(field => !['template', 'body', 'subject'].includes(field))) {
        throw new InputError('FIELD_NOT_ALLOWED');
      }
      template = stringValue(raw.template ?? raw.body, 'template', 18_000);
      subject = stringValue(raw.subject, 'subject', 500);
    } catch (error) { if (inputFailure(reply, error)) return; throw error; }
    const [lead] = await db.select({
      id: tradeflowkitLeads.id,
      name: tradeflowkitLeads.name,
      phone: tradeflowkitLeads.phone,
      email: tradeflowkitLeads.email,
      serviceType: tradeflowkitLeads.serviceType,
      consentToSms: tradeflowkitLeads.consentToSms,
    }).from(tradeflowkitLeads).where(and(
      eq(tradeflowkitLeads.id, id),
      eq(tradeflowkitLeads.tenantId, tenant),
      isNull(tradeflowkitLeads.deletedAt),
    )).limit(1);
    if (!lead) return reply.code(404).send({ error: 'Lead not found', code: 'LEAD_NOT_FOUND' });
    if (channel === 'sms' && !lead.consentToSms) {
      return reply.code(409).send({ error: 'SMS consent is required before messaging this lead', code: 'LEAD_SMS_CONSENT_REQUIRED' });
    }
    const destination = channel === 'email' ? lead.email : lead.phone;
    if (!destination) {
      return reply.code(409).send({ error: `Lead has no ${channel === 'email' ? 'email address' : 'phone number'}`, code: channel === 'email' ? 'LEAD_EMAIL_UNAVAILABLE' : 'LEAD_SMS_UNAVAILABLE' });
    }
    const defaultBody = channel === 'email'
      ? 'Hi {name}, thanks for reaching out about {service}. We received your request and will follow up shortly.'
      : 'Hi {name}, we received your request about {service}. Reply STOP to opt out.';
    let body = (template ?? defaultBody)
      .replaceAll('{name}', lead.name)
      .replaceAll('{service}', lead.serviceType || 'your service request');
    if (channel === 'sms' && !/\b(?:stop|unsubscribe)\b/i.test(body)) body += ' Reply STOP to opt out.';
    try {
      const queued = await enqueueOutboxMessage({
        tenantId: tenant,
        moduleId: await moduleId(),
        requestedByUserId: userId(request),
        channel,
        destination,
        subject: channel === 'email' ? (subject ?? 'Following up on your request') : null,
        body,
        idempotencyKey: key,
        context: { entityType: 'lead', entityId: id, sourceRoute: `send-${channel}` },
      });
      if (queued.duplicate) {
        const existing = queued.message as Record<string, unknown>;
        const existingSubject = existing.subject === undefined || existing.subject === null ? null : String(existing.subject);
        if (
          String(existing.channel) !== channel ||
          String(existing.destination) !== destination ||
          existingSubject !== (channel === 'email' ? (subject ?? 'Following up on your request') : null) ||
          String(existing.body) !== body
        ) {
          return reply.code(409).send({ error: 'Idempotency key was already used for a different lead message', code: 'IDEMPOTENCY_KEY_REUSE' });
        }
      }
      await audit(db, {
        tenantId: tenant,
        userId: userId(request),
        action: 'message_queued',
        entityType: 'lead',
        entityId: id,
        metadata: { channel, duplicate: queued.duplicate },
      });
      return reply.code(queued.duplicate ? 200 : 202).send({ ...queued, status: 'queued' });
    } catch (error) {
      const code = String((error as { code?: string })?.code || 'MESSAGE_INVALID');
      return reply.code(400).send({ error: error instanceof Error ? error.message : 'Message could not be queued', code });
    }
  };

  app.post('/v1/modules/tradeflowkit/leads/:id/send-email', { preHandler: [...writeGuards] }, queueLeadMessage('email'));
  app.post('/v1/modules/tradeflowkit/leads/:id/send-sms', { preHandler: [...writeGuards] }, queueLeadMessage('sms'));

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
