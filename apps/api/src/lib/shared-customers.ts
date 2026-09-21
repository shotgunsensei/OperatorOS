import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '../db.js';
import { DirectoryFailure, normalizeDirectoryText, normalizeDirectoryEmail } from './business-directory.js';

type Executor = Pick<typeof db, 'execute'>;
export interface SharedCustomer {
  id: string;
  name: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  contactId: string | null;
  version: number;
  revision: string;
}

/** Read the shared business identity only. Private module notes and transactions
 * deliberately never enter this projection. Every join includes the tenant. */
export async function listSharedCustomers(tenantId: string, input: {
  search?: string; id?: string; ids?: string[]; limit?: number; offset?: number;
} = {}, executor: Executor = db): Promise<SharedCustomer[]> {
  const search = input.search ? `%${input.search.replace(/[\\%_]/g, '\\$&')}%` : null;
  const result = await executor.execute(sql`
    SELECT o.id,o.name,o.website,o.version,
      c.id AS "contactId",c.email,c.phone,
      NULLIF(COALESCE(o.customer_address,a.address,t.address),'') AS address
    FROM directory_organizations o
    LEFT JOIN LATERAL (
      SELECT p.id,p.email,p.phone FROM directory_organization_contacts link
      JOIN directory_contacts p ON p.tenant_id=link.tenant_id AND p.id=link.contact_id
      WHERE link.tenant_id=o.tenant_id AND link.organization_id=o.id
        AND p.archived_at IS NULL AND p.status='active'
      ORDER BY link.is_primary DESC,link.created_at,p.id LIMIT 1
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT concat_ws(', ',ad.line1,NULLIF(ad.line2,''),ad.city,ad.region,ad.postal_code,ad.country_code) AS address
      FROM directory_sites s JOIN directory_addresses ad ON ad.tenant_id=s.tenant_id AND ad.id=s.address_id
      WHERE s.tenant_id=o.tenant_id AND s.organization_id=o.id AND s.archived_at IS NULL
        AND s.status='active' AND ad.archived_at IS NULL
      ORDER BY s.created_at,s.id LIMIT 1
    ) a ON true
    LEFT JOIN LATERAL (
      SELECT address FROM tradeflowkit_customers
      WHERE tenant_id=o.tenant_id AND organization_id=o.id AND deleted_at IS NULL
      ORDER BY updated_at DESC,id LIMIT 1
    ) t ON true
    WHERE o.tenant_id=${tenantId} AND o.archived_at IS NULL AND o.status='active'
      AND (${input.id ?? null}::text IS NULL OR o.id=${input.id ?? null})
      ${input.ids ? sql`AND o.id IN (${sql.join(input.ids.map(id => sql`${id}`), sql`, `)})` : sql``}
      AND (${search}::text IS NULL OR o.name ILIKE ${search} OR c.email ILIKE ${search})
    ORDER BY o.normalized_name,o.id
    LIMIT ${Math.min(100, Math.max(1, input.limit ?? 50))} OFFSET ${Math.max(0, input.offset ?? 0)}
  `);
  return result.rows.map(row => ({ ...row, revision: createHash('sha256').update(JSON.stringify(row)).digest('hex') })) as unknown as SharedCustomer[];
}

export async function findSharedCustomer(tenantId: string, id: string, executor: Executor = db) {
  return (await listSharedCustomers(tenantId, { id, limit: 1 }, executor))[0] ?? null;
}

/** Must be called inside the same transaction as the module record. No matching
 * by name/email silently merges two customers; uniqueness conflicts roll back. */
export async function createSharedCustomer(actor: { tenantId: string; userId: string }, input: {
  name: string; email?: string | null; phone?: string | null; address?: string | null;
}, executor: Executor) {
  const organization = await executor.execute(sql`
    INSERT INTO directory_organizations(tenant_id,name,normalized_name,type,status,customer_address,created_by_user_id,updated_by_user_id)
    VALUES (${actor.tenantId},${input.name.trim()},${normalizeDirectoryText(input.name)},'customer','active',${input.address ?? null},${actor.userId},${actor.userId}) RETURNING id
  `);
  const id = String(organization.rows[0].id);
  let contactId: string | null = null;
  if (input.email || input.phone) {
    const contact = await executor.execute(sql`
      INSERT INTO directory_contacts(tenant_id,first_name,last_name,normalized_name,email,normalized_email,phone,created_by_user_id,updated_by_user_id)
      VALUES (${actor.tenantId},${input.name.trim()},'',${normalizeDirectoryText(input.name)},${input.email ?? null},${normalizeDirectoryEmail(input.email)},${input.phone ?? null},${actor.userId},${actor.userId}) RETURNING id
    `);
    contactId = String(contact.rows[0].id);
    await executor.execute(sql`INSERT INTO directory_organization_contacts(tenant_id,organization_id,contact_id,role,is_primary,created_by_user_id)
      VALUES (${actor.tenantId},${id},${contactId},'primary',true,${actor.userId})`);
  }
  await executor.execute(sql`INSERT INTO activity_feed(tenant_id,user_id,action,entity_type,entity_id,metadata)
    VALUES (${actor.tenantId},${actor.userId},'created','shared_customer',${id},'{}'::jsonb)`);
  return { id, contactId };
}

export async function updateSharedCustomer(actor: { tenantId: string; userId: string; moduleSlug: string }, id: string, input: {
  expectedRevision: string; name: string; email: string | null; phone: string | null; address: string | null; website: string | null;
}) {
  return db.transaction(async tx => {
    const locked = await tx.execute(sql`SELECT id FROM directory_organizations WHERE tenant_id=${actor.tenantId} AND id=${id} AND archived_at IS NULL AND status='active' FOR UPDATE`);
    if (!locked.rows.length) throw new DirectoryFailure(404, 'SHARED_CUSTOMER_NOT_FOUND', 'Shared customer not found.');
    const initial = await findSharedCustomer(actor.tenantId, id, tx);
    if (initial?.contactId) await tx.execute(sql`SELECT id FROM directory_contacts WHERE tenant_id=${actor.tenantId} AND id=${initial.contactId} FOR UPDATE`);
    const current = await findSharedCustomer(actor.tenantId, id, tx);
    if (!current || current.revision !== input.expectedRevision) throw new DirectoryFailure(409, 'SHARED_CUSTOMER_CHANGED', 'Someone updated this customer. Reload the customer before saving.');
    await tx.execute(sql`UPDATE directory_organizations SET name=${input.name},normalized_name=${normalizeDirectoryText(input.name)},website=${input.website},customer_address=${input.address ?? ''},version=version+1,updated_at=NOW(),updated_by_user_id=${actor.userId} WHERE tenant_id=${actor.tenantId} AND id=${id}`);
    let contactId = current.contactId;
    if (contactId) {
      await tx.execute(sql`UPDATE directory_contacts SET email=${input.email},normalized_email=${normalizeDirectoryEmail(input.email)},phone=${input.phone},version=version+1,updated_at=NOW(),updated_by_user_id=${actor.userId} WHERE tenant_id=${actor.tenantId} AND id=${contactId}`);
    } else if (input.email || input.phone) {
      const created = await tx.execute(sql`INSERT INTO directory_contacts(tenant_id,first_name,last_name,normalized_name,email,normalized_email,phone,created_by_user_id,updated_by_user_id)
        VALUES (${actor.tenantId},${input.name},'',${normalizeDirectoryText(input.name)},${input.email},${normalizeDirectoryEmail(input.email)},${input.phone},${actor.userId},${actor.userId}) RETURNING id`);
      contactId = String(created.rows[0].id);
      await tx.execute(sql`INSERT INTO directory_organization_contacts(tenant_id,organization_id,contact_id,role,is_primary,created_by_user_id) VALUES (${actor.tenantId},${id},${contactId},'primary',true,${actor.userId})`);
    }
    // These are editable customer records, never issued invoice/report contents.
    await tx.execute(sql`UPDATE tradeflowkit_customers SET name=${input.name},email=${input.email},phone=${input.phone},address=${input.address},primary_contact_id=${contactId},version=version+1,updated_at=NOW() WHERE tenant_id=${actor.tenantId} AND organization_id=${id} AND deleted_at IS NULL`);
    await tx.execute(sql`INSERT INTO activity_feed(tenant_id,user_id,action,entity_type,entity_id,metadata)
      VALUES (${actor.tenantId},${actor.userId},'updated','shared_customer',${id},${JSON.stringify({ moduleSlug: actor.moduleSlug, fields: ['name', 'email', 'phone', 'address', 'website'] })}::jsonb)`);
    return findSharedCustomer(actor.tenantId, id, tx);
  });
}

/** Display current directory details without rewriting historical job/report data. */
export async function withSharedCustomer<T extends { directoryOrganizationId?: string | null }>(tenantId: string, row: T) {
  return { ...row, sharedCustomer: row.directoryOrganizationId ? await findSharedCustomer(tenantId, row.directoryOrganizationId) : null };
}

export async function withSharedCustomers<T extends { directoryOrganizationId?: string | null }>(tenantId: string, rows: T[]) {
  const ids = [...new Set(rows.map(row => row.directoryOrganizationId).filter((id): id is string => Boolean(id)))];
  const customers = ids.length ? await listSharedCustomers(tenantId, { ids, limit: 100 }) : [];
  const byId = new Map(customers.map(customer => [customer.id, customer]));
  return rows.map(row => ({ ...row, sharedCustomer: byId.get(row.directoryOrganizationId ?? '') ?? null }));
}
