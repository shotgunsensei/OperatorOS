import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db.js';

type Executor = Pick<typeof db, 'execute'>;
type Row = Record<string, any>;
export class CustomerWorkspaceError extends Error {
  constructor(readonly code: string, message: string, readonly statusCode = 400) { super(message); }
}
export const directoryContextSchema = z.object({
  organizationId: z.string().uuid(), siteId: z.string().uuid().nullable(), contactId: z.string().uuid().nullable(),
  revision: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();
export type QualifiedDirectoryContext = z.infer<typeof directoryContextSchema>;
type Selection = Pick<QualifiedDirectoryContext, 'organizationId' | 'siteId' | 'contactId'>;

function missing(): never { throw new CustomerWorkspaceError('CUSTOMER_CONTEXT_NOT_FOUND', 'This customer context is unavailable. Refresh and select an active customer.', 404); }
function changed(): never { throw new CustomerWorkspaceError('CUSTOMER_CONTEXT_CHANGED', 'The saved customer or job context changed. Reload and review it before continuing.', 409); }
function customer(row: Row) { return { id: String(row.id), name: String(row.name), type: String(row.type), website: row.website ?? null, version: Number(row.version) }; }

/** Only business identity participates; private notes and module records never do. */
export async function resolveQualifiedDirectoryContext(tenantId: string, selection: Selection, executor: Executor = db, lock = false) {
  const organization = (await executor.execute(sql`
    SELECT id,name,type,website,version,customer_address FROM directory_organizations
    WHERE tenant_id=${tenantId} AND id=${selection.organizationId} AND status='active' AND archived_at IS NULL
    ${lock ? sql`FOR SHARE` : sql``}
  `)).rows[0] as Row | undefined;
  if (!organization) return missing();
  let contact: Row | null = null, association: Row | null = null, site: Row | null = null, address: Row | null = null;
  if (selection.contactId) {
    contact = ((await executor.execute(sql`
      SELECT id,first_name,last_name,email,phone,title,version FROM directory_contacts
      WHERE tenant_id=${tenantId} AND id=${selection.contactId} AND status='active' AND archived_at IS NULL
      ${lock ? sql`FOR SHARE` : sql``}
    `)).rows[0] as Row | undefined) ?? null;
    association = ((await executor.execute(sql`
      SELECT id,is_primary,role FROM directory_organization_contacts
      WHERE tenant_id=${tenantId} AND organization_id=${selection.organizationId} AND contact_id=${selection.contactId}
      ${lock ? sql`FOR SHARE` : sql``}
    `)).rows[0] as Row | undefined) ?? null;
    if (!contact || !association) return missing();
  }
  if (selection.siteId) {
    site = ((await executor.execute(sql`
      SELECT id,name,type,timezone,address_id,version FROM directory_sites
      WHERE tenant_id=${tenantId} AND id=${selection.siteId} AND organization_id=${selection.organizationId}
        AND status='active' AND archived_at IS NULL ${lock ? sql`FOR SHARE` : sql``}
    `)).rows[0] as Row | undefined) ?? null;
    if (!site) return missing();
    if (site.address_id) {
      address = ((await executor.execute(sql`
        SELECT id,line1,line2,city,region,postal_code,country_code,version FROM directory_addresses
        WHERE tenant_id=${tenantId} AND id=${site.address_id} AND archived_at IS NULL ${lock ? sql`FOR SHARE` : sql``}
      `)).rows[0] as Row | undefined) ?? null;
      if (!address) return missing();
    }
  }
  const revision = createHash('sha256').update(JSON.stringify({ organization, contact, association, site, address })).digest('hex');
  return { customer: customer(organization), context: { ...selection, revision } satisfies QualifiedDirectoryContext };
}

export async function listWorkspaceCustomers(tenantId: string, input: { search?: string; limit: number; offset: number }, executor: Executor = db) {
  const search = input.search ? `%${input.search.replace(/[\\%_]/g, '\\$&')}%` : null;
  const selected = await executor.execute(sql`
    SELECT id,name,type,website,version FROM directory_organizations
    WHERE tenant_id=${tenantId} AND status='active' AND archived_at IS NULL
      AND (${search}::text IS NULL OR name ILIKE ${search})
    ORDER BY normalized_name,id LIMIT ${input.limit + 1} OFFSET ${input.offset}
  `);
  return { customers: selected.rows.slice(0, input.limit).map(row => customer(row as Row)),
    pagination: { limit: input.limit, offset: input.offset, hasMore: selected.rows.length > input.limit }, sourceModule: 'tradeflowkit' as const };
}

export async function getWorkspaceCustomer(tenantId: string, selection: Selection, executor: Executor = db) {
  const resolved = await resolveQualifiedDirectoryContext(tenantId, selection, executor);
  const [contacts, sites, jobs] = await Promise.all([
    executor.execute(sql`
      SELECT c.id,c.first_name,c.last_name,c.email,c.phone,c.title,c.version,link.is_primary
      FROM directory_organization_contacts link JOIN directory_contacts c ON c.tenant_id=link.tenant_id AND c.id=link.contact_id
      WHERE link.tenant_id=${tenantId} AND link.organization_id=${selection.organizationId} AND c.status='active' AND c.archived_at IS NULL
      ORDER BY link.is_primary DESC,c.normalized_name,c.id LIMIT 100
    `),
    executor.execute(sql`
      SELECT s.id,s.name,s.type,s.timezone,s.version,
        CASE WHEN a.id IS NULL THEN NULL ELSE concat_ws(', ',a.line1,NULLIF(a.line2,''),a.city,a.region,a.postal_code,a.country_code) END AS address
      FROM directory_sites s LEFT JOIN directory_addresses a ON a.tenant_id=s.tenant_id AND a.id=s.address_id AND a.archived_at IS NULL
      WHERE s.tenant_id=${tenantId} AND s.organization_id=${selection.organizationId} AND s.status='active' AND s.archived_at IS NULL
      ORDER BY s.normalized_name,s.id LIMIT 100
    `),
    executor.execute(sql`
      SELECT j.id,j.number,j.title,j.status,j.version,j.customer_id,c.organization_id,COALESCE(j.site_id,c.primary_site_id) AS primary_site_id,c.primary_contact_id
      FROM tradeflowkit_jobs j JOIN tradeflowkit_customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id AND c.deleted_at IS NULL
      WHERE j.tenant_id=${tenantId} AND c.organization_id=${selection.organizationId} AND j.deleted_at IS NULL
        AND (${selection.siteId}::text IS NULL OR COALESCE(j.site_id,c.primary_site_id)=${selection.siteId})
        AND (${selection.contactId}::text IS NULL OR c.primary_contact_id=${selection.contactId})
      ORDER BY j.updated_at DESC,j.id LIMIT 101
    `),
  ]);
  const mappedJobs = [];
  const contextKey = (value: Selection) => JSON.stringify([value.organizationId, value.siteId, value.contactId]);
  const contexts = new Map<string, Awaited<ReturnType<typeof resolveQualifiedDirectoryContext>>>();
  contexts.set(contextKey(selection), resolved);
  for (const value of jobs.rows.slice(0, 100)) {
    const row = value as Row; let context: QualifiedDirectoryContext | null = null;
    try {
      const selected = { organizationId: String(row.organization_id), siteId: row.primary_site_id ?? null, contactId: row.primary_contact_id ?? null };
      const key = contextKey(selected);
      const cached = contexts.get(key) ?? await resolveQualifiedDirectoryContext(tenantId, selected, executor);
      contexts.set(key, cached); context = cached.context;
    } catch (error) { if (!(error instanceof CustomerWorkspaceError) || error.statusCode !== 404) throw error; }
    mappedJobs.push({ id: String(row.id), number: row.number == null ? null : Number(row.number), title: String(row.title), status: String(row.status), version: Number(row.version), customerId: String(row.customer_id), directoryContext: context, handoffBlocker: context ? null : 'CUSTOMER_CONTEXT_UNAVAILABLE' as const });
  }
  return { customer: resolved.customer,
    contacts: (contacts.rows as Row[]).map(row => ({ id: String(row.id), firstName: String(row.first_name), lastName: String(row.last_name ?? ''), email: row.email ?? null, phone: row.phone ?? null, title: row.title ?? null, version: Number(row.version), isPrimary: Boolean(row.is_primary) })),
    sites: (sites.rows as Row[]).map(row => ({ id: String(row.id), name: String(row.name), type: String(row.type), timezone: row.timezone ?? null, version: Number(row.version), address: row.address ?? null })),
    selection, jobs: mappedJobs, pagination: { hasMoreJobs: jobs.rows.length > 100, jobsLimit: 100 as const } };
}

export async function inspectWorkspaceJob(input: { tenantId: string; jobId: string; expectedSourceVersion: number; directoryContext: QualifiedDirectoryContext }, executor: Executor = db) {
  // Directory first matches shared-customer edits (organization/contact before
  // native customer), avoiding an inverse row-lock order at confirmation.
  const current = await resolveQualifiedDirectoryContext(input.tenantId, input.directoryContext, executor, true);
  const selected = await executor.execute(sql`
    SELECT j.id,j.version,c.organization_id,COALESCE(j.site_id,c.primary_site_id) AS primary_site_id,c.primary_contact_id
    FROM tradeflowkit_jobs j JOIN tradeflowkit_customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id AND c.deleted_at IS NULL
    WHERE j.tenant_id=${input.tenantId} AND j.id=${input.jobId} AND j.deleted_at IS NULL FOR SHARE OF j,c
  `);
  const job = selected.rows[0] as Row | undefined;
  if (!job) return missing();
  if (Number(job.version) !== input.expectedSourceVersion || job.organization_id !== input.directoryContext.organizationId ||
      (job.primary_site_id ?? null) !== input.directoryContext.siteId || (job.primary_contact_id ?? null) !== input.directoryContext.contactId) return changed();
  if (current.context.revision !== input.directoryContext.revision) return changed();
  return current;
}

/** Qualified identity only; this never merges names or rewrites existing facts. */
export async function reuseQualifiedSnapProofCustomer(input: {
  tenantId: string; actorUserId: string; job: Row; expectedContext?: unknown;
}, executor: Executor) {
  const selection: Selection = { organizationId: String(input.job.organization_id), siteId: input.job.site_id ?? input.job.primary_site_id ?? null, contactId: input.job.primary_contact_id ?? null };
  const expected = input.expectedContext === undefined ? null : directoryContextSchema.safeParse(input.expectedContext);
  if (expected && !expected.success) throw new CustomerWorkspaceError('CUSTOMER_WORKSPACE_INPUT_INVALID', 'The reviewed customer context is invalid.');
  if (expected?.success && (expected.data.organizationId !== selection.organizationId || expected.data.siteId !== selection.siteId || expected.data.contactId !== selection.contactId)) return changed();
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`snap-customer:${input.tenantId}:${JSON.stringify(selection)}`},0))`);
  const current = await resolveQualifiedDirectoryContext(input.tenantId, selection, executor, true);
  if (expected?.success && current.context.revision !== expected.data.revision) return changed();
  // The initial adapter read is deliberately unlocked. Acquire source locks
  // only after Directory locks, then fence both source job and customer drift.
  const source = (await executor.execute(sql`
    SELECT j.id,j.version,j.site_id,c.organization_id,c.primary_site_id,c.primary_contact_id,c.version AS customer_version
    FROM tradeflowkit_jobs j JOIN tradeflowkit_customers c ON c.tenant_id=j.tenant_id AND c.id=j.customer_id AND c.deleted_at IS NULL
    WHERE j.tenant_id=${input.tenantId} AND j.id=${input.job.id} AND j.deleted_at IS NULL FOR SHARE OF j,c
  `)).rows[0] as Row | undefined;
  if (!source || Number(source.version) !== Number(input.job.version) || Number(source.customer_version) !== Number(input.job.customer_version) ||
      source.organization_id !== selection.organizationId || (source.site_id ?? source.primary_site_id ?? null) !== selection.siteId ||
      (source.primary_contact_id ?? null) !== selection.contactId) return changed();
  const existing = await executor.execute(sql`
    SELECT id FROM snapproof_customers WHERE tenant_id=${input.tenantId} AND directory_organization_id=${selection.organizationId}
      AND directory_site_id IS NOT DISTINCT FROM ${selection.siteId} AND directory_contact_id IS NOT DISTINCT FROM ${selection.contactId}
      AND archived_at IS NULL ORDER BY id LIMIT 2 FOR UPDATE
  `);
  if (existing.rows.length > 1) throw new CustomerWorkspaceError('FABRIC_CUSTOMER_LINK_AMBIGUOUS', 'More than one active field-proof customer is linked to this exact context. Ask an administrator to reconcile the existing links.', 409);
  if (existing.rows[0]) return String(existing.rows[0].id);
  const created = await executor.execute(sql`
    INSERT INTO snapproof_customers(tenant_id,created_by_user_id,name,email,phone,address,notes,directory_organization_id,directory_site_id,directory_contact_id)
    VALUES (${input.tenantId},${input.actorUserId},${String(input.job.customer_name || current.customer.name).slice(0,200)},
      ${input.job.customer_email ?? null},${input.job.customer_phone ?? null},${input.job.customer_address ?? null},
      ${`Created from TradeFlowKit job ${input.job.number ?? input.job.id}.`},${selection.organizationId},${selection.siteId},${selection.contactId}) RETURNING id
  `);
  return String(created.rows[0].id);
}
