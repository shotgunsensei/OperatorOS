import { and, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { tenantApplicationSubscriptions } from '../schema.js';

export type StackTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type StackRow = typeof tenantApplicationSubscriptions.$inferSelect;

export class StackMutationConflictError extends Error {
  constructor() {
    super('The Application Stack changed while its provider state was being checked. Retry to reconcile the current checkout.');
    this.name = 'StackMutationConflictError';
  }
}

export interface StackMutationSnapshot {
  readonly id: string;
  readonly tenantId: string;
  readonly fingerprint: string;
}

// Copy primitive values before awaiting the provider. Never retain a mutable
// selected row as the expected authority. Object key order is not JSONB order.
function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function captureStackMutationSnapshot(row: StackRow): StackMutationSnapshot {
  return Object.freeze({ id: row.id, tenantId: row.tenantId, fingerprint: JSON.stringify(stableValue(row)) });
}

/** All Stack writers acquire this lock before entitlement or tenant-seat writes. */
export async function lockTenantStack(tx: StackTransaction, tenantId: string): Promise<StackRow | undefined> {
  const [row] = await tx.select().from(tenantApplicationSubscriptions)
    .where(eq(tenantApplicationSubscriptions.tenantId, tenantId)).limit(1).for('update');
  return row;
}

export async function lockExpectedStack(
  tx: StackTransaction,
  expected: StackMutationSnapshot,
): Promise<StackRow> {
  const [row] = await tx.select().from(tenantApplicationSubscriptions)
    .where(and(eq(tenantApplicationSubscriptions.id, expected.id),
      eq(tenantApplicationSubscriptions.tenantId, expected.tenantId))).limit(1).for('update');
  if (!row || captureStackMutationSnapshot(row).fingerprint !== expected.fingerprint) {
    throw new StackMutationConflictError();
  }
  return row;
}

export function withStackTransaction<T>(
  executor: StackTransaction | undefined,
  action: (tx: StackTransaction) => Promise<T>,
): Promise<T> {
  return executor ? action(executor) : db.transaction(action);
}

/** Provider/catalog work belongs before this short, database-only transaction. */
export function withStackMutation<T>(
  expected: StackMutationSnapshot,
  action: (tx: StackTransaction, current: StackRow) => Promise<T>,
  executor?: StackTransaction,
): Promise<T> {
  return withStackTransaction(executor, async tx => action(tx, await lockExpectedStack(tx, expected)));
}
