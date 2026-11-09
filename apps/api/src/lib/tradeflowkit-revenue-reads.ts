import { sql, type SQL, getTableColumns } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { tradeflowkitCustomers, tradeflowkitJobs, tradeflowkitQuotes, tradeflowkitInvoices } from '../schema.js';

export const revenueTables = { customers: tradeflowkitCustomers, jobs: tradeflowkitJobs, quotes: tradeflowkitQuotes, invoices: tradeflowkitInvoices };
export type RevenueKind = keyof typeof revenueTables;
export type RevenueRow = typeof tradeflowkitCustomers.$inferSelect | typeof tradeflowkitJobs.$inferSelect | typeof tradeflowkitQuotes.$inferSelect | typeof tradeflowkitInvoices.$inferSelect;
export type RevenueRelated = { customers: Pick<typeof tradeflowkitCustomers.$inferSelect, 'id' | 'name' | 'deletedAt'>[]; jobs: Pick<typeof tradeflowkitJobs.$inferSelect, 'id' | 'customerId' | 'title' | 'deletedAt'>[]; invoicedQuoteIds: string[] };
export type RevenueQuery = { q: string; limit: number; customerId?: string; cursor?: { at: string; id: string } };
export class RevenueReadInputError extends Error {}
const invalid = (): never => { throw new RevenueReadInputError('Invalid revenue query'); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function revenueId(value: unknown): string { return typeof value === 'string' && uuid.test(value) ? value : invalid(); }
export function revenueKind(value: unknown): RevenueKind { return typeof value === 'string' && Object.hasOwn(revenueTables, value) ? value as RevenueKind : invalid(); }
function object(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid(); }
export function parseRevenueQuery(kind: RevenueKind, raw: unknown): RevenueQuery {
  const value = object(raw);
  if (Object.keys(value).some(key => !['q', 'limit', 'cursor', ...(kind === 'customers' ? [] : ['customerId'])].includes(key))) invalid();
  if (value.q !== undefined && (typeof value.q !== 'string' || value.q.length > 160 || /[\x00-\x1f\x7f]/.test(value.q))) invalid();
  const q = (value.q as string | undefined)?.trim() ?? '';
  if (value.limit !== undefined && (typeof value.limit !== 'string' || !/^(?:[1-9]|[1-4][0-9]|50)$/.test(value.limit))) invalid();
  const result: RevenueQuery = { q, limit: value.limit === undefined ? 25 : Number(value.limit) };
  if (value.customerId !== undefined) result.customerId = revenueId(value.customerId);
  if (value.cursor !== undefined) {
    if (typeof value.cursor !== 'string' || value.cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value.cursor)) invalid();
    let cursor: Record<string, unknown>;
    try { cursor = object(JSON.parse(Buffer.from(value.cursor as string, 'base64url').toString('utf8'))); } catch { return invalid(); }
    if (Object.keys(cursor).sort().join(',') !== 'at,customerId,id,kind,q,v' || cursor.v !== 1 || cursor.kind !== kind || cursor.q !== q || cursor.customerId !== (result.customerId ?? null)) invalid();
    if (typeof cursor.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}$/.test(cursor.at)) invalid();
    const at = cursor.at as string;
    const parsed = new Date(at + 'Z');
    if (at.startsWith('0000-') || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 23) !== at.slice(0, 23)) invalid();
    result.cursor = { at, id: revenueId(cursor.id) };
  }
  return result;
}
export function revenueCursor(kind: RevenueKind, query: RevenueQuery, at: string, id: string): string {
  return Buffer.from(JSON.stringify({ v: 1, kind, q: query.q, customerId: query.customerId ?? null, at, id })).toString('base64url');
}
export function revenueReadSql(tenantId: string, kind: RevenueKind, query: RevenueQuery, id?: string): SQL {
  const table = revenueTables[kind];
  const fields = Object.entries(getTableColumns(table)).map(([key, column]) => sql`${column} as ${sql.identifier(key)}`);
  const conditions = [sql`${table.tenantId} = ${tenantId}`, sql`${table.deletedAt} is null`];
  if (id) conditions.push(sql`${table.id} = ${id}`);
  if (query.customerId && 'customerId' in table) conditions.push(sql`${table.customerId} = ${query.customerId}`);
  if (query.cursor) conditions.push(sql`(${table.createdAt}, ${table.id}) < (${query.cursor.at}::timestamp, ${query.cursor.id})`);
  if (query.q) {
    const pattern = '%' + query.q.replace(/[\\%_]/g, '\\$&') + '%';
    const match = (column: SQL) => sql`${column} ilike ${pattern} escape ${'\\'}`;
    const search = uuid.test(query.q) ? [sql`${table.id} = ${query.q}`] : [];
    if (kind === 'customers') search.push(match(sql`${tradeflowkitCustomers.name}`), match(sql`${tradeflowkitCustomers.email}`));
    else {
      if ('title' in table) search.push(match(sql`${table.title}`));
      if ('number' in table) search.push(match(sql`${table.number}::text`));
      if ('customerId' in table) search.push(sql`exists (select 1 from ${tradeflowkitCustomers} where ${tradeflowkitCustomers.tenantId} = ${tenantId} and ${tradeflowkitCustomers.id} = ${table.customerId} and ${match(sql`${tradeflowkitCustomers.name}`)})`);
    }
    conditions.push(sql`(${sql.join(search, sql` or `)})`);
  }
  return sql`select ${sql.join(fields, sql`, `)}, to_char(${table.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US') as "cursorAt" from ${table} where ${sql.join(conditions, sql` and `)} order by ${table.createdAt} desc, ${table.id} desc limit ${id ? 1 : query.limit + 1}`;
}
export interface RevenueReadRepository {
  read(tenantId: string, kind: RevenueKind, query: RevenueQuery, id?: string): Promise<(RevenueRow & { cursorAt: string })[]>;
  related(tenantId: string, kind: RevenueKind, rows: RevenueRow[]): Promise<RevenueRelated>;
}
// Raw execute bypasses Drizzle's selection mapper. Apply the same column decoders
// as select() so timestamps serialize as legacy UTC ISO dates, not driver strings.
// The synthetic cursorAt is deliberately untouched to preserve all microseconds.
function decodeRevenueRow(table: typeof revenueTables[RevenueKind], row: Record<string, unknown>): Record<string, unknown> {
  const decoded = { ...row };
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (row[key] !== null && row[key] !== undefined) decoded[key] = column.mapFromDriverValue(row[key]);
  }
  return decoded;
}
export function createRevenueReadRepository(db: Pick<NodePgDatabase, 'execute'>): RevenueReadRepository {
  return {
    async read(tenantId, kind, query, id) { return (await db.execute(revenueReadSql(tenantId, kind, query, id))).rows.map(row => decodeRevenueRow(revenueTables[kind], row)) as (RevenueRow & { cursorAt: string })[]; },
    async related(tenantId, kind, rows) {
      const customerIds = [...new Set(rows.flatMap(row => 'customerId' in row ? [row.customerId] : []))];
      const jobIds = [...new Set(rows.flatMap(row => 'jobId' in row && row.jobId ? [row.jobId] : []))];
      // Historical labels are intentionally retained. Archived rows are not choices.
      const fetchRelated = async (table: typeof tradeflowkitCustomers | typeof tradeflowkitJobs, ids: string[]) => {
        if (!ids.length) return [];
        const allowed = table === tradeflowkitCustomers ? ['id', 'name', 'deletedAt'] : ['id', 'customerId', 'title', 'deletedAt'];
        const fields = Object.entries(getTableColumns(table)).filter(([key]) => allowed.includes(key)).map(([key, column]) => sql`${column} as ${sql.identifier(key)}`);
        return (await db.execute(sql`select ${sql.join(fields, sql`, `)} from ${table} where ${table.tenantId} = ${tenantId} and ${table.id} in (${sql.join(ids.map(id => sql`${id}`), sql`, `)}) limit ${ids.length}`)).rows.map(row => decodeRevenueRow(table, Object.fromEntries(allowed.map(key => [key, row[key]]))));
      };
      const [customers, jobs] = await Promise.all([fetchRelated(tradeflowkitCustomers, customerIds), fetchRelated(tradeflowkitJobs, jobIds)]);
      const quoteIds = kind === 'quotes' ? rows.map(row => row.id) : [];
      const invoices = quoteIds.length ? (await db.execute(sql`select distinct ${tradeflowkitInvoices.sourceQuoteId} as id from ${tradeflowkitInvoices} where ${tradeflowkitInvoices.tenantId} = ${tenantId} and ${tradeflowkitInvoices.deletedAt} is null and ${tradeflowkitInvoices.sourceQuoteId} in (${sql.join(quoteIds.map(id => sql`${id}`), sql`, `)}) limit ${quoteIds.length}`)).rows : [];
      return { customers: customers as RevenueRelated['customers'], jobs: jobs as RevenueRelated['jobs'], invoicedQuoteIds: invoices.map(row => row.id as string) };
    },
  };
}
