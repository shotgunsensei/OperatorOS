import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  directorySites,
  tradeflowkitCustomers,
  tradeflowkitInvoices,
  tradeflowkitJobs,
  tradeflowkitPayments,
  tradeflowkitWorkflowStages,
} from '../schema.js';
import { beginIdempotentOperation, completeIdempotentOperation } from './shared-usage-activity.js';

export const TRADEFLOWKIT_BULK_LIMIT = 25;

export interface TradeFlowKitBulkRecord {
  id: string;
  expectedVersion: number;
}

export interface TradeFlowKitBulkContext {
  tenantId: string;
  userId: string;
  moduleId: string;
  idempotencyKey: string;
}

export interface TradeFlowKitBulkResult {
  status: number;
  body: Record<string, unknown>;
}

type Executor = Pick<typeof db, 'execute' | 'select' | 'insert' | 'update'>;
type OperationResult = { status: number; body: Record<string, unknown> };

function withReplay(body: unknown): Record<string, unknown> {
  return body && typeof body === 'object' && !Array.isArray(body)
    ? { ...(body as Record<string, unknown>), replay: true }
    : { result: body, replay: true };
}

async function activity(executor: Executor, input: {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await executor.insert(activityFeed).values({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    entityType: `tradeflowkit_${input.entityType}`,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}

async function runIdempotentBatch(
  context: TradeFlowKitBulkContext,
  scope: string,
  request: unknown,
  operation: (executor: Executor, batchId: string) => Promise<OperationResult>,
): Promise<TradeFlowKitBulkResult> {
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`tradeflowkit:${scope}:${context.tenantId}`}))`);
    const idempotency = await beginIdempotentOperation({
      tenantId: context.tenantId,
      moduleId: context.moduleId,
      scope,
      idempotencyKey: context.idempotencyKey,
      request,
      leaseMs: 60_000,
    }, tx);
    if (idempotency.state === 'replay') {
      return { status: idempotency.responseStatus, body: withReplay(idempotency.responseJson) };
    }
    if (idempotency.state === 'conflict') {
      return {
        status: 409,
        body: {
          error: 'Idempotency-Key was already used with a different bulk request',
          code: 'IDEMPOTENCY_KEY_REUSE',
        },
      };
    }
    if (idempotency.state === 'in_progress') {
      return {
        status: 409,
        body: { error: 'Bulk operation is already in progress', code: 'IDEMPOTENCY_IN_PROGRESS' },
      };
    }

    const result = await operation(tx, idempotency.id);
    const body = { ...result.body, replay: false };
    await completeIdempotentOperation({
      tenantId: context.tenantId,
      id: idempotency.id,
      leaseExpiresAt: idempotency.leaseExpiresAt,
      responseStatus: result.status,
      responseJson: body,
    }, tx);
    return { status: result.status, body };
  });
}

function requestedVersions(records: TradeFlowKitBulkRecord[]): Map<string, number> {
  return new Map(records.map(record => [record.id, record.expectedVersion]));
}

function rowsMatchRequest(
  rows: Array<{ id: string; version: number }>,
  records: TradeFlowKitBulkRecord[],
): boolean {
  if (rows.length !== records.length) return false;
  const versions = requestedVersions(records);
  return rows.every(row => versions.get(row.id) === row.version);
}

const recordConflict = (): OperationResult => ({
  status: 409,
  body: {
    error: 'One or more records are unavailable or changed; reload and retry the whole batch',
    code: 'BULK_RECORD_CONFLICT',
  },
});

const dependencyConflict = (): OperationResult => ({
  status: 409,
  body: {
    error: 'One or more archived records have an unavailable dependency; restore dependencies first',
    code: 'BULK_DEPENDENCY_CONFLICT',
  },
});

export async function bulkUpdateTradeFlowKitJobStatus(
  context: TradeFlowKitBulkContext,
  input: { records: TradeFlowKitBulkRecord[]; status: string },
): Promise<TradeFlowKitBulkResult> {
  return runIdempotentBatch(context, 'tradeflowkit-job-bulk-status', input, async (tx, batchId) => {
    const ids = input.records.map(record => record.id);
    const jobs = await tx.select().from(tradeflowkitJobs).where(and(
      eq(tradeflowkitJobs.tenantId, context.tenantId),
      inArray(tradeflowkitJobs.id, ids),
      isNull(tradeflowkitJobs.deletedAt),
    )).orderBy(asc(tradeflowkitJobs.id)).for('update');
    if (!rowsMatchRequest(jobs, input.records)) return recordConflict();

    const now = new Date();
    const updated: Array<{ id: string; version: number }> = [];
    for (const job of jobs) {
      const [next] = await tx.update(tradeflowkitJobs).set({
        status: input.status,
        completedAt: input.status === 'done' ? now : null,
        version: sql`${tradeflowkitJobs.version} + 1`,
        updatedAt: now,
      }).where(and(
        eq(tradeflowkitJobs.tenantId, context.tenantId),
        eq(tradeflowkitJobs.id, job.id),
        eq(tradeflowkitJobs.version, job.version),
        isNull(tradeflowkitJobs.deletedAt),
      )).returning({ id: tradeflowkitJobs.id, version: tradeflowkitJobs.version });
      if (!next) throw Object.assign(new Error('Locked job changed during bulk status update'), { code: 'BULK_WRITE_CONFLICT' });
      updated.push(next);
      await activity(tx, {
        tenantId: context.tenantId,
        userId: context.userId,
        action: 'bulk_status_updated',
        entityType: 'job',
        entityId: job.id,
        metadata: { batchId, previousStatus: job.status, status: input.status },
      });
    }
    await activity(tx, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'completed',
      entityType: 'job_bulk_status',
      entityId: batchId,
      metadata: { count: updated.length, status: input.status, jobIds: updated.map(row => row.id) },
    });
    return { status: 200, body: { ok: true, operation: 'job_status', status: input.status, count: updated.length, records: updated } };
  });
}

export async function bulkRestoreTradeFlowKitJobs(
  context: TradeFlowKitBulkContext,
  input: { records: TradeFlowKitBulkRecord[] },
): Promise<TradeFlowKitBulkResult> {
  return runIdempotentBatch(context, 'tradeflowkit-job-bulk-restore', input, async (tx, batchId) => {
    const ids = input.records.map(record => record.id);
    const jobs = await tx.select().from(tradeflowkitJobs).where(and(
      eq(tradeflowkitJobs.tenantId, context.tenantId),
      inArray(tradeflowkitJobs.id, ids),
      isNotNull(tradeflowkitJobs.deletedAt),
    )).orderBy(asc(tradeflowkitJobs.id)).for('update');
    if (!rowsMatchRequest(jobs, input.records)) return recordConflict();

    const customerIds = [...new Set(jobs.map(job => job.customerId))];
    const siteIds = [...new Set(jobs.map(job => job.siteId).filter((id): id is string => !!id))];
    const stageIds = [...new Set(jobs.map(job => job.workflowStageId).filter((id): id is string => !!id))];
    const [customers, sites, stages] = await Promise.all([
      tx.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
        eq(tradeflowkitCustomers.tenantId, context.tenantId),
        inArray(tradeflowkitCustomers.id, customerIds),
        isNull(tradeflowkitCustomers.deletedAt),
      )),
      siteIds.length === 0 ? Promise.resolve([]) : tx.select({ id: directorySites.id }).from(directorySites).where(and(
        eq(directorySites.tenantId, context.tenantId),
        inArray(directorySites.id, siteIds),
        isNull(directorySites.archivedAt),
      )),
      stageIds.length === 0 ? Promise.resolve([]) : tx.select({ id: tradeflowkitWorkflowStages.id }).from(tradeflowkitWorkflowStages).where(and(
        eq(tradeflowkitWorkflowStages.tenantId, context.tenantId),
        inArray(tradeflowkitWorkflowStages.id, stageIds),
        isNull(tradeflowkitWorkflowStages.archivedAt),
      )),
    ]);
    if (customers.length !== customerIds.length || sites.length !== siteIds.length || stages.length !== stageIds.length) {
      return dependencyConflict();
    }

    const now = new Date();
    const restored: Array<{ id: string; version: number }> = [];
    for (const job of jobs) {
      const [next] = await tx.update(tradeflowkitJobs).set({
        deletedAt: null,
        updatedAt: now,
        version: sql`${tradeflowkitJobs.version} + 1`,
      }).where(and(
        eq(tradeflowkitJobs.tenantId, context.tenantId),
        eq(tradeflowkitJobs.id, job.id),
        eq(tradeflowkitJobs.version, job.version),
        isNotNull(tradeflowkitJobs.deletedAt),
      )).returning({ id: tradeflowkitJobs.id, version: tradeflowkitJobs.version });
      if (!next) throw Object.assign(new Error('Locked job changed during bulk restore'), { code: 'BULK_WRITE_CONFLICT' });
      restored.push(next);
      await activity(tx, {
        tenantId: context.tenantId,
        userId: context.userId,
        action: 'bulk_restored',
        entityType: 'job',
        entityId: job.id,
        metadata: { batchId, customerId: job.customerId },
      });
    }
    await activity(tx, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'completed',
      entityType: 'job_bulk_restore',
      entityId: batchId,
      metadata: { count: restored.length, jobIds: restored.map(row => row.id) },
    });
    return { status: 200, body: { ok: true, operation: 'job_restore', count: restored.length, records: restored } };
  });
}

export async function bulkRestoreTradeFlowKitInvoices(
  context: TradeFlowKitBulkContext,
  input: { records: TradeFlowKitBulkRecord[] },
): Promise<TradeFlowKitBulkResult> {
  return runIdempotentBatch(context, 'tradeflowkit-invoice-bulk-restore', input, async (tx, batchId) => {
    const ids = input.records.map(record => record.id);
    const invoices = await tx.select().from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.tenantId, context.tenantId),
      inArray(tradeflowkitInvoices.id, ids),
      isNotNull(tradeflowkitInvoices.deletedAt),
    )).orderBy(asc(tradeflowkitInvoices.id)).for('update');
    if (!rowsMatchRequest(invoices, input.records)) return recordConflict();

    const customerIds = [...new Set(invoices.map(invoice => invoice.customerId))];
    const jobIds = [...new Set(invoices.map(invoice => invoice.jobId).filter((id): id is string => !!id))];
    const sourceQuoteIds = invoices.map(invoice => invoice.sourceQuoteId).filter((id): id is string => !!id);
    if (new Set(sourceQuoteIds).size !== sourceQuoteIds.length) return recordConflict();
    const [customers, jobs, activeSources] = await Promise.all([
      tx.select({ id: tradeflowkitCustomers.id }).from(tradeflowkitCustomers).where(and(
        eq(tradeflowkitCustomers.tenantId, context.tenantId),
        inArray(tradeflowkitCustomers.id, customerIds),
        isNull(tradeflowkitCustomers.deletedAt),
      )),
      jobIds.length === 0 ? Promise.resolve([]) : tx.select({ id: tradeflowkitJobs.id }).from(tradeflowkitJobs).where(and(
        eq(tradeflowkitJobs.tenantId, context.tenantId),
        inArray(tradeflowkitJobs.id, jobIds),
        isNull(tradeflowkitJobs.deletedAt),
      )),
      sourceQuoteIds.length === 0 ? Promise.resolve([]) : tx.select({ id: tradeflowkitInvoices.id }).from(tradeflowkitInvoices).where(and(
        eq(tradeflowkitInvoices.tenantId, context.tenantId),
        inArray(tradeflowkitInvoices.sourceQuoteId, sourceQuoteIds),
        isNull(tradeflowkitInvoices.deletedAt),
      )),
    ]);
    if (customers.length !== customerIds.length || jobs.length !== jobIds.length || activeSources.length > 0) {
      return dependencyConflict();
    }

    const now = new Date();
    const restored: Array<{ id: string; version: number }> = [];
    for (const invoice of invoices) {
      const [next] = await tx.update(tradeflowkitInvoices).set({
        deletedAt: null,
        updatedAt: now,
        version: sql`${tradeflowkitInvoices.version} + 1`,
      }).where(and(
        eq(tradeflowkitInvoices.tenantId, context.tenantId),
        eq(tradeflowkitInvoices.id, invoice.id),
        eq(tradeflowkitInvoices.version, invoice.version),
        isNotNull(tradeflowkitInvoices.deletedAt),
      )).returning({ id: tradeflowkitInvoices.id, version: tradeflowkitInvoices.version });
      if (!next) throw Object.assign(new Error('Locked invoice changed during bulk restore'), { code: 'BULK_WRITE_CONFLICT' });
      restored.push(next);
      await activity(tx, {
        tenantId: context.tenantId,
        userId: context.userId,
        action: 'bulk_restored',
        entityType: 'invoice',
        entityId: invoice.id,
        metadata: { batchId, customerId: invoice.customerId, jobId: invoice.jobId },
      });
    }
    await activity(tx, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'completed',
      entityType: 'invoice_bulk_restore',
      entityId: batchId,
      metadata: { count: restored.length, invoiceIds: restored.map(row => row.id) },
    });
    return { status: 200, body: { ok: true, operation: 'invoice_restore', count: restored.length, records: restored } };
  });
}

function paymentIdempotencyKey(batchKey: string, invoiceId: string): string {
  return `bulk:${createHash('sha256').update(`${batchKey}:${invoiceId}`).digest('hex')}`;
}

export async function bulkMarkTradeFlowKitInvoicesPaid(
  context: TradeFlowKitBulkContext,
  input: {
    records: TradeFlowKitBulkRecord[];
    method: string;
    reference: string | null;
    notes: string | null;
  },
): Promise<TradeFlowKitBulkResult> {
  return runIdempotentBatch(context, 'tradeflowkit-invoice-bulk-mark-paid', input, async (tx, batchId) => {
    const ids = input.records.map(record => record.id);
    const invoices = await tx.select().from(tradeflowkitInvoices).where(and(
      eq(tradeflowkitInvoices.tenantId, context.tenantId),
      inArray(tradeflowkitInvoices.id, ids),
      isNull(tradeflowkitInvoices.deletedAt),
    )).orderBy(asc(tradeflowkitInvoices.id)).for('update');
    if (!rowsMatchRequest(invoices, input.records)) return recordConflict();
    if (invoices.some(invoice => !['sent', 'processing'].includes(invoice.status) || invoice.balanceCents <= 0)) {
      return {
        status: 409,
        body: {
          error: 'Every invoice must be sent or processing with a positive balance',
          code: 'BULK_INVOICE_NOT_PAYABLE',
        },
      };
    }

    const now = new Date();
    const paid: Array<{ id: string; version: number; paymentId: string; amountCents: number }> = [];
    for (const invoice of invoices) {
      const [payment] = await tx.insert(tradeflowkitPayments).values({
        tenantId: context.tenantId,
        invoiceId: invoice.id,
        createdByUserId: context.userId,
        amountCents: invoice.balanceCents,
        method: input.method,
        status: 'succeeded',
        reference: input.reference,
        notes: input.notes,
        idempotencyKey: paymentIdempotencyKey(context.idempotencyKey, invoice.id),
        paidAt: now,
      }).returning({ id: tradeflowkitPayments.id, amountCents: tradeflowkitPayments.amountCents });
      const [next] = await tx.update(tradeflowkitInvoices).set({
        paidCents: invoice.totalCents,
        balanceCents: 0,
        status: 'paid',
        paidAt: now,
        paymentMethod: input.method,
        paymentReference: input.reference,
        paymentNotes: input.notes,
        version: sql`${tradeflowkitInvoices.version} + 1`,
        updatedAt: now,
      }).where(and(
        eq(tradeflowkitInvoices.tenantId, context.tenantId),
        eq(tradeflowkitInvoices.id, invoice.id),
        eq(tradeflowkitInvoices.version, invoice.version),
        eq(tradeflowkitInvoices.balanceCents, invoice.balanceCents),
        isNull(tradeflowkitInvoices.deletedAt),
      )).returning({ id: tradeflowkitInvoices.id, version: tradeflowkitInvoices.version });
      if (!payment || !next) throw Object.assign(new Error('Locked invoice changed during bulk payment'), { code: 'BULK_WRITE_CONFLICT' });
      paid.push({ ...next, paymentId: payment.id, amountCents: payment.amountCents });
      await activity(tx, {
        tenantId: context.tenantId,
        userId: context.userId,
        action: 'bulk_payment_recorded',
        entityType: 'invoice',
        entityId: invoice.id,
        metadata: { batchId, paymentId: payment.id, amountCents: payment.amountCents, method: input.method },
      });
    }

    const jobIds = [...new Set(invoices.map(invoice => invoice.jobId).filter((id): id is string => !!id))];
    for (const jobId of jobIds) {
      const [outstanding] = await tx.select({ id: tradeflowkitInvoices.id }).from(tradeflowkitInvoices).where(and(
        eq(tradeflowkitInvoices.tenantId, context.tenantId),
        eq(tradeflowkitInvoices.jobId, jobId),
        isNull(tradeflowkitInvoices.deletedAt),
        sql`${tradeflowkitInvoices.balanceCents} > 0`,
      )).limit(1);
      if (!outstanding) {
        await tx.update(tradeflowkitJobs).set({
          status: 'paid',
          version: sql`${tradeflowkitJobs.version} + 1`,
          updatedAt: now,
        }).where(and(
          eq(tradeflowkitJobs.tenantId, context.tenantId),
          eq(tradeflowkitJobs.id, jobId),
          isNull(tradeflowkitJobs.deletedAt),
        ));
      }
    }
    await activity(tx, {
      tenantId: context.tenantId,
      userId: context.userId,
      action: 'completed',
      entityType: 'invoice_bulk_payment',
      entityId: batchId,
      metadata: {
        count: paid.length,
        totalCents: paid.reduce((sum, row) => sum + row.amountCents, 0),
        invoiceIds: paid.map(row => row.id),
        paymentIds: paid.map(row => row.paymentId),
        method: input.method,
      },
    });
    return {
      status: 200,
      body: {
        ok: true,
        operation: 'invoice_mark_paid',
        count: paid.length,
        totalCents: paid.reduce((sum, row) => sum + row.amountCents, 0),
        records: paid,
      },
    };
  });
}
