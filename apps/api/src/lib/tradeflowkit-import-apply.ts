import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  adminAuditLogs,
  directoryOrganizations,
  modules,
  tenantModules,
  tenants,
  tenantUsers,
  tradeflowkitCustomers,
  tradeflowkitInvoiceItems,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitLeads,
  tradeflowkitMigrationRefs,
  tradeflowkitPayments,
  tradeflowkitQuoteItems,
  tradeflowkitQuotes,
  tradeflowkitSequences,
  tradeflowkitTasks,
  users,
} from '../schema.js';
import {
  planTradeFlowKitImport,
  type TradeFlowKitImportPlan,
  type TradeFlowKitStandaloneExport,
} from './tradeflowkit-import.js';

type JsonRecord = Record<string, unknown>;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const JOB_STATUSES = new Set(['lead', 'quoted', 'scheduled', 'in_progress', 'done', 'invoiced', 'paid', 'canceled']);
const QUOTE_STATUSES = new Set(['draft', 'sent', 'accepted', 'declined', 'expired', 'void']);
const INVOICE_STATUSES = new Set(['draft', 'sent', 'processing', 'paid', 'void']);
const LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'follow_up', 'converted', 'lost']);
const MAX_IMPORT_RECORDS = 25_000;
const TRADEFLOWKIT_V1_SOURCE_COMMIT = '37aa67f1da804fc3ac56f36e50e01362077d7a26';

export interface TradeFlowKitImportApplyOptions {
  tenantId: string;
  actorUserId: string;
  sourceOrgId: string;
  expectedSourceFingerprint: string;
  backupReference: string;
  userMap?: Record<string, string>;
}

export interface TradeFlowKitImportApplyResult {
  applyVersion: 1;
  mode: 'apply';
  tenantId: string;
  sourceOrgId: string;
  sourceFingerprint: string;
  backupReference: string;
  inserted: Record<string, number>;
  reused: Record<string, number>;
  reconciliation: TradeFlowKitImportPlan['reconciliation'] & {
    targetQuoteSubtotalCents: number;
    targetInvoiceSubtotalCents: number;
    targetPaidInvoiceCents: number;
  };
}

function rows(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value as JsonRecord[] : [];
}

function requiredString(row: JsonRecord, field: string, max: number): string {
  const value = row[field];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} must be a non-empty string`);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return normalized;
}

function optionalString(row: JsonRecord, field: string, max: number): string | null {
  const value = row[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return normalized || null;
}

function enumValue(row: JsonRecord, field: string, allowed: Set<string>, fallback: string): string {
  const value = optionalString(row, field, 40) ?? fallback;
  if (!allowed.has(value)) throw new Error(`${field} contains unsupported value ${value}`);
  return value;
}

function dateValue(row: JsonRecord, field: string): Date | null {
  const value = row[field];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && !(value instanceof Date)) throw new Error(`${field} must be an ISO date`);
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be an ISO date`);
  return parsed;
}

function decimalToCents(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') return 0;
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${field} must be a non-negative decimal with at most two fraction digits`);
  const [whole, fraction = ''] = normalized.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 1_000_000_000) throw new Error(`${field} is outside the supported money range`);
  return cents;
}

function decimalToBasisPoints(value: unknown, field: string): number {
  if (value === undefined || value === null || value === '') return 0;
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error(`${field} must be a percentage with at most two fraction digits`);
  const [whole, fraction = ''] = normalized.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(bps) || bps > 10_000) throw new Error(`${field} must be between 0 and 100`);
  return bps;
}

function quantityMilli(value: unknown, field: string): number {
  const normalized = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,3})?$/.test(normalized)) throw new Error(`${field} must be a positive quantity with at most three fraction digits`);
  const [whole, fraction = ''] = normalized.split('.');
  const amount = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 10_000_000) throw new Error(`${field} is outside the supported quantity range`);
  return amount;
}

function boundedInteger(value: unknown, field: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return Number(value);
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function sourceId(row: JsonRecord, table: string): string {
  const value = row.id;
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 160) {
    throw new Error(`${table}.id must be a non-empty string no longer than 160 characters`);
  }
  return value.trim();
}

function assertSourceScope(table: string, tableRows: JsonRecord[], sourceOrgId: string): void {
  tableRows.forEach((row, index) => {
    if (row.orgId !== sourceOrgId) {
      throw new Error(`${table}[${index}] is outside the approved source organization`);
    }
  });
}

function indexById(table: string, tableRows: JsonRecord[]): Map<string, JsonRecord> {
  return new Map(tableRows.map(row => [sourceId(row, table), row]));
}

function fingerprintFor(plan: TradeFlowKitImportPlan, table: string, id: string): string {
  const mapping = plan.mappings.find(item => item.sourceTable === table && item.sourceId === id);
  if (!mapping) throw new Error(`Missing deterministic mapping for ${table}:${id}`);
  return mapping.sourceFingerprint;
}

function count(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

async function assertAuthority(tx: Transaction, options: TradeFlowKitImportApplyOptions): Promise<string> {
  const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
    .where(and(eq(tenants.id, options.tenantId), isNull(tenants.archivedAt))).limit(1);
  if (!tenant) throw new Error('Target tenant is missing or archived');

  const [actor] = await tx.select({ id: users.id, status: users.status }).from(users)
    .where(eq(users.id, options.actorUserId)).limit(1);
  if (!actor || actor.status !== 'active') throw new Error('Import actor is missing or inactive');

  const [membership] = await tx.select({ role: tenantUsers.role }).from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, options.tenantId),
    eq(tenantUsers.userId, options.actorUserId),
  )).limit(1);
  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    throw new Error('Import actor must be an owner or admin of the target tenant');
  }

  const [module] = await tx.select({ id: modules.id }).from(modules)
    .where(and(eq(modules.slug, 'tradeflowkit'), eq(modules.status, 'live'), isNull(modules.archivedAt))).limit(1);
  if (!module) throw new Error('TradeFlowKit is not registered as a live module');
  const [enabled] = await tx.select({ status: tenantModules.status }).from(tenantModules).where(and(
    eq(tenantModules.tenantId, options.tenantId),
    eq(tenantModules.moduleId, module.id),
    eq(tenantModules.status, 'enabled'),
  )).limit(1);
  if (!enabled) throw new Error('Target tenant is not entitled to TradeFlowKit');
  return module.id;
}

async function mappedUserId(
  tx: Transaction,
  sourceUserId: unknown,
  options: TradeFlowKitImportApplyOptions,
): Promise<string | null> {
  if (sourceUserId === undefined || sourceUserId === null || sourceUserId === '') return null;
  if (typeof sourceUserId !== 'string') throw new Error('Source user identifier must be a string');
  const targetUserId = options.userMap?.[sourceUserId];
  if (!targetUserId) throw new Error(`Source user ${sourceUserId} requires an explicit target user mapping`);
  const [membership] = await tx.select({ userId: tenantUsers.userId }).from(tenantUsers).where(and(
    eq(tenantUsers.tenantId, options.tenantId),
    eq(tenantUsers.userId, targetUserId),
  )).limit(1);
  if (!membership) throw new Error(`Mapped user ${sourceUserId} is not a member of the target tenant`);
  return targetUserId;
}

async function nextNumber(tx: Transaction, tenantId: string, kind: 'job' | 'quote' | 'invoice'): Promise<number> {
  const result = await tx.execute(sql`
    INSERT INTO tradeflowkit_sequences (tenant_id, kind, last_number)
    VALUES (${tenantId}, ${kind}, 1)
    ON CONFLICT (tenant_id, kind) DO UPDATE SET
      last_number = tradeflowkit_sequences.last_number + 1,
      updated_at = NOW()
    RETURNING last_number
  `);
  return Number(result.rows[0].last_number);
}

async function existingTarget(
  tx: Transaction,
  targetTable: string,
  tenantId: string,
  targetId: string,
): Promise<boolean> {
  const tableByName = {
    directory_organizations: directoryOrganizations,
    tradeflowkit_customers: tradeflowkitCustomers,
    tradeflowkit_jobs: tradeflowkitJobs,
    tradeflowkit_quotes: tradeflowkitQuotes,
    tradeflowkit_quote_items: tradeflowkitQuoteItems,
    tradeflowkit_invoices: tradeflowkitInvoices,
    tradeflowkit_invoice_items: tradeflowkitInvoiceItems,
    tradeflowkit_payments: tradeflowkitPayments,
    tradeflowkit_leads: tradeflowkitLeads,
    tradeflowkit_tasks: tradeflowkitTasks,
    activity_feed: activityFeed,
  } as const;
  const table = tableByName[targetTable as keyof typeof tableByName];
  if (!table) throw new Error(`Unsupported target table ${targetTable}`);
  const [row] = await tx.select({ id: table.id }).from(table as any).where(and(
    eq((table as any).tenantId, tenantId),
    eq(table.id, targetId),
  )).limit(1);
  return Boolean(row);
}

async function resolveOrCreate(
  tx: Transaction,
  options: TradeFlowKitImportApplyOptions,
  sourceTable: string,
  sourceRecordId: string,
  targetTable: string,
  sourceFingerprint: string,
  create: () => Promise<string>,
  inserted: Record<string, number>,
  reused: Record<string, number>,
): Promise<string> {
  const [existing] = await tx.select().from(tradeflowkitMigrationRefs).where(and(
    eq(tradeflowkitMigrationRefs.tenantId, options.tenantId),
    eq(tradeflowkitMigrationRefs.sourceTable, sourceTable),
    eq(tradeflowkitMigrationRefs.sourceId, sourceRecordId),
  )).limit(1);
  if (existing) {
    if (existing.sourceFingerprint !== sourceFingerprint || existing.targetTable !== targetTable) {
      throw new Error(`Source drift detected for ${sourceTable}:${sourceRecordId}`);
    }
    if (!await existingTarget(tx, targetTable, options.tenantId, existing.targetId)) {
      throw new Error(`Mapped target is missing for ${sourceTable}:${sourceRecordId}`);
    }
    count(reused, targetTable);
    return existing.targetId;
  }

  const targetId = await create();
  await tx.insert(tradeflowkitMigrationRefs).values({
    tenantId: options.tenantId,
    sourceTable,
    sourceId: sourceRecordId,
    targetTable,
    targetId,
    sourceFingerprint,
  });
  count(inserted, targetTable);
  return targetId;
}

function lineItemsFor(
  table: 'quoteItems' | 'invoiceItems',
  foreignKey: 'quoteId' | 'invoiceId',
  parentId: string,
  input: TradeFlowKitStandaloneExport,
): Array<{ row: JsonRecord; sourceId: string; quantityMilli: number; unitPriceCents: number; lineTotalCents: number }> {
  return rows(input[table]).filter(row => row[foreignKey] === parentId).map((row, index) => {
    const quantity = quantityMilli(row.qty ?? row.quantity, `${table}[${index}].qty`);
    const unitPrice = decimalToCents(row.unitPrice ?? row.unitPriceCents, `${table}[${index}].unitPrice`);
    return {
      row,
      sourceId: sourceId(row, table),
      quantityMilli: quantity,
      unitPriceCents: unitPrice,
      lineTotalCents: Math.round(quantity * unitPrice / 1000),
    };
  });
}

function assertImportInput(input: TradeFlowKitStandaloneExport, sourceOrgId: string): void {
  const scoped = [
    'customers', 'jobs', 'jobEvents', 'quotes', 'quoteItems', 'invoices',
    'invoiceItems', 'leads', 'leadActivities', 'leadFollowupTasks',
    'orgAutomations', 'reminderLog',
  ] as const;
  const totalRecords = scoped.reduce((total, table) => total + rows(input[table]).length, 0);
  if (totalRecords > MAX_IMPORT_RECORDS) {
    throw new Error(`Export contains ${totalRecords} business records; the version 1 atomic apply limit is ${MAX_IMPORT_RECORDS}`);
  }
  for (const table of scoped) assertSourceScope(table, rows(input[table]), sourceOrgId);
  const sourceOrgs = rows(input.orgs);
  if (sourceOrgs.length > 0 && !sourceOrgs.some(row => row.id === sourceOrgId)) {
    throw new Error('Approved source organization is not present in the export');
  }
  if (rows(input.orgAutomations).length > 0) {
    throw new Error('Standalone automation configuration is excluded from apply; configure reviewed shared jobs after cutover');
  }
}

export async function applyTradeFlowKitImport(
  raw: unknown,
  options: TradeFlowKitImportApplyOptions,
): Promise<TradeFlowKitImportApplyResult> {
  if (!/^[0-9a-f]{64}$/.test(options.expectedSourceFingerprint)) {
    throw new Error('Expected source fingerprint must be a lowercase SHA-256 value');
  }
  if (!options.backupReference.trim() || options.backupReference.length > 200) {
    throw new Error('A backup reference of at most 200 characters is required');
  }
  const plan = planTradeFlowKitImport(raw);
  if (!plan.readyToApply) throw new Error(`Import plan is not applyable: ${plan.errors.join('; ')}`);
  if (plan.sourceFingerprint !== options.expectedSourceFingerprint) {
    throw new Error('Source fingerprint does not match the reviewed dry-run');
  }

  const input = raw as TradeFlowKitStandaloneExport;
  if (input.sourceCommit !== TRADEFLOWKIT_V1_SOURCE_COMMIT) {
    throw new Error(`Apply requires source commit ${TRADEFLOWKIT_V1_SOURCE_COMMIT}`);
  }
  assertImportInput(input, options.sourceOrgId);
  const inserted: Record<string, number> = {};
  const reused: Record<string, number> = {};

  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'tradeflowkit-import:' + options.tenantId}))`);
    await assertAuthority(tx, options);
    const previousApply = await tx.execute(sql`
      SELECT details->>'sourceFingerprint' AS source_fingerprint
      FROM admin_audit_logs
      WHERE tenant_id = ${options.tenantId}
        AND action = 'tradeflowkit_import_applied'
        AND details->>'sourceOrgId' = ${options.sourceOrgId}
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const previousFingerprint = previousApply.rows[0]?.source_fingerprint;
    if (typeof previousFingerprint === 'string' && previousFingerprint !== plan.sourceFingerprint) {
      throw new Error('Source snapshot drift detected after an earlier apply');
    }

    const customerTargets = new Map<string, string>();
    const jobTargets = new Map<string, string>();
    const quoteTargets = new Map<string, string>();
    const invoiceTargets = new Map<string, string>();
    const leadTargets = new Map<string, string>();

    for (const row of rows(input.customers)) {
      const id = sourceId(row, 'customers');
      const sourceFingerprint = fingerprintFor(plan, 'customers', id);
      const name = requiredString(row, 'name', 200);
      const organizationId = await resolveOrCreate(
        tx, options, 'customers:directory', id, 'directory_organizations', sourceFingerprint,
        async () => {
          const [collision] = await tx.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(
            eq(directoryOrganizations.tenantId, options.tenantId),
            eq(directoryOrganizations.normalizedName, normalizeName(name)),
            isNull(directoryOrganizations.archivedAt),
          )).limit(1);
          if (collision) throw new Error(`Directory organization collision for customers:${id}; explicit merge policy is required`);
          const [created] = await tx.insert(directoryOrganizations).values({
            tenantId: options.tenantId,
            name,
            normalizedName: normalizeName(name),
            type: 'customer',
            status: 'active',
            notes: optionalString(row, 'notes', 10_000),
            createdByUserId: options.actorUserId,
            updatedByUserId: options.actorUserId,
            createdAt: dateValue(row, 'createdAt') ?? new Date(),
            updatedAt: dateValue(row, 'createdAt') ?? new Date(),
            archivedAt: dateValue(row, 'deletedAt'),
          }).returning({ id: directoryOrganizations.id });
          return created.id;
        },
        inserted, reused,
      );
      const customerId = await resolveOrCreate(
        tx, options, 'customers', id, 'tradeflowkit_customers', sourceFingerprint,
        async () => {
          const [created] = await tx.insert(tradeflowkitCustomers).values({
            tenantId: options.tenantId,
            organizationId,
            createdByUserId: await mappedUserId(tx, row.createdBy, options) ?? options.actorUserId,
            name,
            phone: optionalString(row, 'phone', 80),
            email: optionalString(row, 'email', 320),
            address: optionalString(row, 'address', 1_000),
            notes: optionalString(row, 'notes', 10_000),
            sourceId: id,
            createdAt: dateValue(row, 'createdAt') ?? new Date(),
            updatedAt: dateValue(row, 'createdAt') ?? new Date(),
            deletedAt: dateValue(row, 'deletedAt'),
          }).returning({ id: tradeflowkitCustomers.id });
          return created.id;
        },
        inserted, reused,
      );
      customerTargets.set(id, customerId);
    }

    for (const row of rows(input.jobs)) {
      const id = sourceId(row, 'jobs');
      const sourceFingerprint = fingerprintFor(plan, 'jobs', id);
      const sourceCustomerId = requiredString(row, 'customerId', 160);
      const customerId = customerTargets.get(sourceCustomerId);
      if (!customerId) throw new Error(`jobs:${id} has no imported customer mapping`);
      const jobId = await resolveOrCreate(
        tx, options, 'jobs', id, 'tradeflowkit_jobs', sourceFingerprint,
        async () => {
          if (row.isRecurring === true || row.recurringFrequency || row.recurringSeriesId || row.parentJobId) {
            throw new Error(`jobs:${id} uses unsupported standalone recurrence`);
          }
          const [created] = await tx.insert(tradeflowkitJobs).values({
            tenantId: options.tenantId,
            customerId,
            createdByUserId: await mappedUserId(tx, row.createdBy, options) ?? options.actorUserId,
            assignedToUserId: await mappedUserId(tx, Array.isArray(row.assignedUserIds) ? row.assignedUserIds[0] : null, options),
            number: await nextNumber(tx, options.tenantId, 'job'),
            title: requiredString(row, 'title', 300),
            description: optionalString(row, 'description', 20_000),
            internalNotes: optionalString(row, 'internalNotes', 20_000),
            status: enumValue(row, 'status', JOB_STATUSES, 'lead'),
            priority: enumValue(row, 'priority', new Set(['low', 'normal', 'high', 'urgent']), 'normal'),
            scheduledStart: dateValue(row, 'scheduledStart'),
            scheduledEnd: dateValue(row, 'scheduledEnd'),
            completedAt: ['done', 'invoiced', 'paid'].includes(String(row.status)) ? (dateValue(row, 'updatedAt') ?? dateValue(row, 'createdAt')) : null,
            sourceId: id,
            createdAt: dateValue(row, 'createdAt') ?? new Date(),
            updatedAt: dateValue(row, 'updatedAt') ?? dateValue(row, 'createdAt') ?? new Date(),
            deletedAt: dateValue(row, 'deletedAt'),
          }).returning({ id: tradeflowkitJobs.id });
          return created.id;
        },
        inserted, reused,
      );
      jobTargets.set(id, jobId);
    }

    for (const row of rows(input.quotes)) {
      const id = sourceId(row, 'quotes');
      const sourceFingerprint = fingerprintFor(plan, 'quotes', id);
      const sourceCustomerId = requiredString(row, 'customerId', 160);
      const customerId = customerTargets.get(sourceCustomerId);
      if (!customerId) throw new Error(`quotes:${id} has no imported customer mapping`);
      const sourceJobId = optionalString(row, 'jobId', 160);
      const jobId = sourceJobId ? jobTargets.get(sourceJobId) : undefined;
      if (sourceJobId && !jobId) throw new Error(`quotes:${id} has no imported job mapping`);
      const items = lineItemsFor('quoteItems', 'quoteId', id, input);
      const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
      const taxRateBps = decimalToBasisPoints(row.taxRate, `quotes:${id}.taxRate`);
      const discountCents = decimalToCents(row.discount, `quotes:${id}.discount`);
      const taxCents = Math.round(subtotalCents * taxRateBps / 10_000);
      const totalCents = Math.max(0, subtotalCents + taxCents - discountCents);
      const quoteId = await resolveOrCreate(
        tx, options, 'quotes', id, 'tradeflowkit_quotes', sourceFingerprint,
        async () => {
          const status = enumValue(row, 'status', QUOTE_STATUSES, 'draft');
          const [created] = await tx.insert(tradeflowkitQuotes).values({
            tenantId: options.tenantId,
            customerId,
            jobId: jobId ?? null,
            createdByUserId: await mappedUserId(tx, row.createdBy, options) ?? options.actorUserId,
            number: await nextNumber(tx, options.tenantId, 'quote'),
            status,
            lineItems: items.map(item => ({
              description: requiredString(item.row, 'description', 500),
              quantity: item.quantityMilli / 1000,
              unitPriceCents: item.unitPriceCents,
            })),
            subtotalCents,
            taxRateBps,
            taxCents,
            discountCents,
            totalCents,
            notes: optionalString(row, 'notes', 20_000),
            expiresAt: dateValue(row, 'expiresAt'),
            sentAt: dateValue(row, 'sentAt'),
            acceptedAt: status === 'accepted' ? (dateValue(row, 'updatedAt') ?? dateValue(row, 'createdAt')) : null,
            declinedAt: status === 'declined' ? (dateValue(row, 'updatedAt') ?? dateValue(row, 'createdAt')) : null,
            sourceId: id,
            createdAt: dateValue(row, 'createdAt') ?? new Date(),
            updatedAt: dateValue(row, 'updatedAt') ?? dateValue(row, 'createdAt') ?? new Date(),
          }).returning({ id: tradeflowkitQuotes.id });
          return created.id;
        },
        inserted, reused,
      );
      quoteTargets.set(id, quoteId);
      for (const [index, item] of items.entries()) {
        await resolveOrCreate(
          tx, options, 'quoteItems', item.sourceId, 'tradeflowkit_quote_items',
          fingerprintFor(plan, 'quoteItems', item.sourceId),
          async () => {
            const [created] = await tx.insert(tradeflowkitQuoteItems).values({
              tenantId: options.tenantId,
              quoteId,
              lineNumber: index + 1,
              description: requiredString(item.row, 'description', 500),
              quantityMilli: item.quantityMilli,
              unitPriceCents: item.unitPriceCents,
              lineTotalCents: item.lineTotalCents,
              sourceId: item.sourceId,
            }).returning({ id: tradeflowkitQuoteItems.id });
            return created.id;
          },
          inserted, reused,
        );
      }
    }

    for (const row of rows(input.invoices)) {
      const id = sourceId(row, 'invoices');
      const sourceFingerprint = fingerprintFor(plan, 'invoices', id);
      const sourceCustomerId = requiredString(row, 'customerId', 160);
      const customerId = customerTargets.get(sourceCustomerId);
      if (!customerId) throw new Error(`invoices:${id} has no imported customer mapping`);
      const sourceJobId = optionalString(row, 'jobId', 160);
      const jobId = sourceJobId ? jobTargets.get(sourceJobId) : undefined;
      if (sourceJobId && !jobId) throw new Error(`invoices:${id} has no imported job mapping`);
      if (row.recurringInterval || row.nextRunAt || row.parentInvoiceId) {
        throw new Error(`invoices:${id} uses unsupported standalone recurrence`);
      }
      const items = lineItemsFor('invoiceItems', 'invoiceId', id, input);
      const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
      const taxRateBps = decimalToBasisPoints(row.taxRate, `invoices:${id}.taxRate`);
      const discountCents = decimalToCents(row.discount, `invoices:${id}.discount`);
      const taxCents = Math.round(subtotalCents * taxRateBps / 10_000);
      const totalCents = Math.max(0, subtotalCents + taxCents - discountCents);
      const status = enumValue(row, 'status', INVOICE_STATUSES, 'draft');
      const paidCents = status === 'paid' ? totalCents : 0;
      const invoiceId = await resolveOrCreate(
        tx, options, 'invoices', id, 'tradeflowkit_invoices', sourceFingerprint,
        async () => {
          const [created] = await tx.insert(tradeflowkitInvoices).values({
            tenantId: options.tenantId,
            customerId,
            jobId: jobId ?? null,
            createdByUserId: await mappedUserId(tx, row.createdBy, options) ?? options.actorUserId,
            number: await nextNumber(tx, options.tenantId, 'invoice'),
            status,
            lineItems: items.map(item => ({
              description: requiredString(item.row, 'description', 500),
              quantity: item.quantityMilli / 1000,
              unitPriceCents: item.unitPriceCents,
            })),
            subtotalCents,
            taxRateBps,
            taxCents,
            discountCents,
            totalCents,
            paidCents,
            balanceCents: totalCents - paidCents,
            notes: optionalString(row, 'notes', 20_000),
            dueDate: dateValue(row, 'dueDate'),
            sentAt: dateValue(row, 'sentAt'),
            paidAt: dateValue(row, 'paidAt'),
            paymentMethod: status === 'paid' ? 'legacy_import' : null,
            paymentNotes: optionalString(row, 'paymentNotes', 10_000),
            sourceId: id,
            createdAt: dateValue(row, 'createdAt') ?? new Date(),
            updatedAt: dateValue(row, 'createdAt') ?? new Date(),
            deletedAt: dateValue(row, 'deletedAt'),
          }).returning({ id: tradeflowkitInvoices.id });
          return created.id;
        },
        inserted, reused,
      );
      invoiceTargets.set(id, invoiceId);
      for (const [index, item] of items.entries()) {
        await resolveOrCreate(
          tx, options, 'invoiceItems', item.sourceId, 'tradeflowkit_invoice_items',
          fingerprintFor(plan, 'invoiceItems', item.sourceId),
          async () => {
            const [created] = await tx.insert(tradeflowkitInvoiceItems).values({
              tenantId: options.tenantId,
              invoiceId,
              lineNumber: index + 1,
              description: requiredString(item.row, 'description', 500),
              quantityMilli: item.quantityMilli,
              unitPriceCents: item.unitPriceCents,
              lineTotalCents: item.lineTotalCents,
              sourceId: item.sourceId,
            }).returning({ id: tradeflowkitInvoiceItems.id });
            return created.id;
          },
          inserted, reused,
        );
      }
      if (status === 'paid' && totalCents > 0) {
        await resolveOrCreate(
          tx, options, 'invoices:payment', id, 'tradeflowkit_payments', sourceFingerprint,
          async () => {
            const [created] = await tx.insert(tradeflowkitPayments).values({
              tenantId: options.tenantId,
              invoiceId,
              createdByUserId: options.actorUserId,
              amountCents: totalCents,
              method: 'other',
              status: 'succeeded',
              reference: `source-invoice:${id}`,
              notes: 'Historical paid state imported; legacy provider credentials and transaction identifiers were intentionally excluded.',
              idempotencyKey: `migration:${plan.sourceFingerprint}:${id}`.slice(0, 200),
              paidAt: dateValue(row, 'paidAt') ?? dateValue(row, 'createdAt') ?? new Date(),
            }).returning({ id: tradeflowkitPayments.id });
            return created.id;
          },
          inserted, reused,
        );
      }
    }

    for (const row of rows(input.leads)) {
      const id = sourceId(row, 'leads');
      const sourceFingerprint = fingerprintFor(plan, 'leads', id);
      const sourceCustomerId = optionalString(row, 'customerId', 160);
      const sourceJobId = optionalString(row, 'jobId', 160);
      const customerId = sourceCustomerId ? customerTargets.get(sourceCustomerId) : undefined;
      const jobId = sourceJobId ? jobTargets.get(sourceJobId) : undefined;
      if (sourceCustomerId && !customerId) throw new Error(`leads:${id} has no imported customer mapping`);
      if (sourceJobId && !jobId) throw new Error(`leads:${id} has no imported job mapping`);
      const leadId = await resolveOrCreate(
        tx, options, 'leads', id, 'tradeflowkit_leads', sourceFingerprint,
        async () => {
          const [created] = await tx.insert(tradeflowkitLeads).values({
            tenantId: options.tenantId,
            createdByUserId: await mappedUserId(tx, row.createdBy, options) ?? options.actorUserId,
            source: optionalString(row, 'source', 100) ?? 'manual',
            status: enumValue(row, 'status', LEAD_STATUSES, 'new') as 'new' | 'contacted' | 'qualified' | 'follow_up' | 'converted' | 'lost',
            name: requiredString(row, 'name', 200),
            phone: optionalString(row, 'phone', 80),
            email: optionalString(row, 'email', 320),
            serviceType: optionalString(row, 'serviceType', 200),
            description: optionalString(row, 'description', 20_000),
            address: optionalString(row, 'address', 1_000),
            urgency: enumValue(row, 'urgency', new Set(['normal', 'urgent', 'emergency']), 'normal') as 'normal' | 'urgent' | 'emergency',
            estimatedValueCents: row.estimatedValue === undefined ? null : decimalToCents(row.estimatedValue, `leads:${id}.estimatedValue`),
            preferredContact: optionalString(row, 'preferredContact', 100),
            consentToSms: row.consentToSms === true,
            assignedToUserId: await mappedUserId(tx, row.assignedUserId, options),
            customerId: customerId ?? null,
            jobId: jobId ?? null,
            convertedAt: dateValue(row, 'convertedAt'),
            lostReason: optionalString(row, 'lostReason', 2_000),
            nextFollowUpAt: dateValue(row, 'nextFollowUpAt'),
            lastContactedAt: dateValue(row, 'lastContactedAt'),
            sourceId: id,
            createdAt: dateValue(row, 'createdAt') ?? new Date(),
            updatedAt: dateValue(row, 'updatedAt') ?? dateValue(row, 'createdAt') ?? new Date(),
            deletedAt: dateValue(row, 'deletedAt'),
          }).returning({ id: tradeflowkitLeads.id });
          return created.id;
        },
        inserted, reused,
      );
      leadTargets.set(id, leadId);
    }

    const sourceLeads = indexById('leads', rows(input.leads));
    for (const row of rows(input.leadFollowupTasks)) {
      const id = sourceId(row, 'leadFollowupTasks');
      const sourceFingerprint = fingerprintFor(plan, 'leadFollowupTasks', id);
      const sourceLeadId = requiredString(row, 'leadId', 160);
      const sourceLead = sourceLeads.get(sourceLeadId);
      const sourceJobId = sourceLead ? optionalString(sourceLead, 'jobId', 160) : null;
      const jobId = sourceJobId ? jobTargets.get(sourceJobId) : undefined;
      if (!jobId) throw new Error(`leadFollowupTasks:${id} requires an imported lead with an imported job`);
      await resolveOrCreate(
        tx, options, 'leadFollowupTasks', id, 'tradeflowkit_tasks', sourceFingerprint,
        async () => {
          const sourceStatus = optionalString(row, 'status', 40) ?? 'pending';
          const status = sourceStatus === 'completed' ? 'completed' : sourceStatus === 'failed' ? 'blocked' : 'todo';
          const channel = requiredString(row, 'channel', 40);
          const [created] = await tx.insert(tradeflowkitTasks).values({
            tenantId: options.tenantId,
            jobId,
            createdByUserId: options.actorUserId,
            title: `Lead follow-up: ${channel}`,
            description: optionalString(row, 'messageTemplate', 20_000),
            status,
            priority: 'normal',
            dueAt: dateValue(row, 'dueAt'),
            sortOrder: boundedInteger(row.stepNumber, 'stepNumber', 0, 0, 10_000),
            completedAt: dateValue(row, 'completedAt'),
            sourceId: id,
            createdAt: dateValue(row, 'createdAt') ?? new Date(),
            updatedAt: dateValue(row, 'updatedAt') ?? dateValue(row, 'createdAt') ?? new Date(),
          }).returning({ id: tradeflowkitTasks.id });
          return created.id;
        },
        inserted, reused,
      );
    }

    const activityInputs = [
      ...rows(input.jobEvents).map(row => ({ table: 'jobEvents', row, targetType: 'job', sourceTargetId: row.jobId, action: row.type })),
      ...rows(input.leadActivities).map(row => ({ table: 'leadActivities', row, targetType: 'lead', sourceTargetId: row.leadId, action: row.type })),
      ...rows(input.reminderLog).map(row => ({
        table: 'reminderLog',
        row,
        targetType: typeof row.targetType === 'string' ? row.targetType : 'unknown',
        sourceTargetId: row.targetId,
        action: 'reminder_history_imported',
      })),
    ];
    for (const item of activityInputs) {
      const id = sourceId(item.row, item.table);
      const sourceFingerprint = fingerprintFor(plan, item.table, id);
      const sourceTargetId = typeof item.sourceTargetId === 'string' ? item.sourceTargetId : '';
      const targetId = item.targetType === 'job'
        ? jobTargets.get(sourceTargetId)
        : item.targetType === 'lead'
          ? leadTargets.get(sourceTargetId)
          : item.targetType === 'quote'
            ? quoteTargets.get(sourceTargetId)
            : item.targetType === 'invoice'
              ? invoiceTargets.get(sourceTargetId)
              : undefined;
      if (!targetId) throw new Error(`${item.table}:${id} has no supported imported target mapping`);
      await resolveOrCreate(
        tx, options, item.table, id, 'activity_feed', sourceFingerprint,
        async () => {
          const [created] = await tx.insert(activityFeed).values({
            userId: await mappedUserId(tx, item.row.createdBy, options) ?? options.actorUserId,
            tenantId: options.tenantId,
            action: typeof item.action === 'string' && item.action.trim() ? item.action.slice(0, 200) : 'history_imported',
            entityType: item.targetType,
            entityId: targetId,
            metadata: {
              moduleId: 'tradeflowkit',
              importVersion: 1,
              sourceTable: item.table,
              sourceId: id,
            },
            createdAt: dateValue(item.row, 'createdAt') ?? dateValue(item.row, 'sentAt') ?? new Date(),
          }).returning({ id: activityFeed.id });
          return created.id;
        },
        inserted, reused,
      );
    }

    const quoteRows = await tx.select({
      subtotalCents: tradeflowkitQuotes.subtotalCents,
      sourceId: tradeflowkitQuotes.sourceId,
    }).from(tradeflowkitQuotes).where(and(
      eq(tradeflowkitQuotes.tenantId, options.tenantId),
      isNull(tradeflowkitQuotes.deletedAt),
    ));
    const invoiceRows = await tx.select({
      subtotalCents: tradeflowkitInvoices.subtotalCents,
      totalCents: tradeflowkitInvoices.totalCents,
      status: tradeflowkitInvoices.status,
      sourceId: tradeflowkitInvoices.sourceId,
    }).from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.tenantId, options.tenantId),
      isNull(tradeflowkitInvoices.deletedAt),
    ));
    const importedQuoteIds = new Set(rows(input.quotes).map(row => sourceId(row, 'quotes')));
    const importedInvoiceIds = new Set(rows(input.invoices).map(row => sourceId(row, 'invoices')));
    const targetQuoteSubtotalCents = quoteRows
      .filter(row => row.sourceId && importedQuoteIds.has(row.sourceId))
      .reduce((sum, row) => sum + row.subtotalCents, 0);
    const importedInvoices = invoiceRows.filter(row => row.sourceId && importedInvoiceIds.has(row.sourceId));
    const targetInvoiceSubtotalCents = importedInvoices.reduce((sum, row) => sum + row.subtotalCents, 0);
    const targetPaidInvoiceCents = importedInvoices
      .filter(row => row.status === 'paid')
      .reduce((sum, row) => sum + row.totalCents, 0);
    if (
      targetQuoteSubtotalCents !== plan.reconciliation.quoteSubtotalCents
      || targetInvoiceSubtotalCents !== plan.reconciliation.invoiceSubtotalCents
      || targetPaidInvoiceCents !== plan.reconciliation.paidInvoiceCents
    ) {
      throw new Error('Post-apply financial reconciliation failed');
    }

    await tx.insert(adminAuditLogs).values({
      adminId: options.actorUserId,
      tenantId: options.tenantId,
      action: 'tradeflowkit_import_applied',
      details: {
        targetType: 'tradeflowkit_import',
        targetId: plan.sourceFingerprint,
        sourceOrgId: options.sourceOrgId,
        sourceFingerprint: plan.sourceFingerprint,
        backupReference: options.backupReference,
        applyVersion: 1,
        inserted,
        reused,
        reconciliation: {
          targetQuoteSubtotalCents,
          targetInvoiceSubtotalCents,
          targetPaidInvoiceCents,
        },
      },
    });

    return {
      applyVersion: 1,
      mode: 'apply',
      tenantId: options.tenantId,
      sourceOrgId: options.sourceOrgId,
      sourceFingerprint: plan.sourceFingerprint,
      backupReference: options.backupReference,
      inserted,
      reused,
      reconciliation: {
        ...plan.reconciliation,
        targetQuoteSubtotalCents,
        targetInvoiceSubtotalCents,
        targetPaidInvoiceCents,
      },
    };
  });
}
