import {
  and, asc, desc, eq, ilike, isNull, or, sql,
} from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  directoryAddresses,
  directoryContacts,
  directoryOrganizationContacts,
  directoryOrganizations,
  directoryRelationships,
  directorySiteContacts,
  directorySites,
  directoryTagAssignments,
  directoryTags,
  pulsedeskServiceClientProfiles,
  techdeckManagedClientProfiles,
  tradeflowkitCustomerProfiles,
} from '../schema.js';

export const DIRECTORY_MODULE_SLUGS = ['tradeflowkit', 'techdeck', 'pulsedesk', 'snapproofos'] as const;
export type DirectoryModuleSlug = (typeof DIRECTORY_MODULE_SLUGS)[number];

export interface DirectoryActor {
  tenantId: string;
  userId: string;
  moduleSlug: DirectoryModuleSlug;
}

export interface DirectoryPage {
  limit: number;
  offset: number;
}

export class DirectoryFailure extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly safeFields: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function normalizeDirectoryText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function normalizeDirectoryEmail(value?: string | null): string | null {
  if (!value?.trim()) return null;
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function normalizeAddressKey(input: {
  line1: string; line2?: string | null; city: string; region: string; postalCode: string; countryCode?: string;
}): string {
  return [input.line1, input.line2 ?? '', input.city, input.region, input.postalCode, input.countryCode ?? 'US']
    .map(normalizeDirectoryText)
    .join('|');
}

export function isDirectoryModuleSlug(value: string): value is DirectoryModuleSlug {
  return (DIRECTORY_MODULE_SLUGS as readonly string[]).includes(value);
}

function pagination(total: number, page: DirectoryPage) {
  return { total, limit: page.limit, offset: page.offset, hasMore: page.offset + page.limit < total };
}

async function audit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actor: DirectoryActor,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  await tx.insert(activityFeed).values({
    tenantId: actor.tenantId,
    userId: actor.userId,
    action,
    entityType,
    entityId,
    metadata: { moduleSlug: actor.moduleSlug, ...metadata },
  });
}

function duplicate(message: string, entity: string): DirectoryFailure {
  return new DirectoryFailure(409, 'DIRECTORY_DUPLICATE', message, { entity });
}

export function rethrowDirectoryDatabaseError(error: unknown, entity: string): never {
  if (error instanceof DirectoryFailure) throw error;
  let current: unknown = error;
  let code: string | undefined;
  for (let depth = 0; depth < 5 && current && typeof current === 'object'; depth += 1) {
    code = (current as { code?: string }).code;
    if (code) break;
    current = (current as { cause?: unknown }).cause;
  }
  if (code === '23505') {
    throw duplicate(`An active ${entity} with these normalized values already exists`, entity);
  }
  throw error;
}

export async function listOrganizations(actor: DirectoryActor, input: {
  page: DirectoryPage; search?: string; type?: string; status?: string; includeArchived?: boolean;
  sort?: 'name' | 'createdAt' | 'updatedAt'; direction?: 'asc' | 'desc';
}) {
  const conditions = [eq(directoryOrganizations.tenantId, actor.tenantId)];
  if (!input.includeArchived) conditions.push(isNull(directoryOrganizations.archivedAt));
  if (input.search) conditions.push(ilike(directoryOrganizations.name, `%${input.search}%`));
  if (input.type) conditions.push(eq(directoryOrganizations.type, input.type as typeof directoryOrganizations.type.enumValues[number]));
  if (input.status) conditions.push(eq(directoryOrganizations.status, input.status as 'active' | 'inactive'));
  const where = and(...conditions);
  const sortColumn = input.sort === 'createdAt' ? directoryOrganizations.createdAt
    : input.sort === 'updatedAt' ? directoryOrganizations.updatedAt : directoryOrganizations.normalizedName;
  const order = input.direction === 'desc' ? desc(sortColumn) : asc(sortColumn);
  const [rows, countRows] = await Promise.all([
    db.select().from(directoryOrganizations).where(where).orderBy(order, asc(directoryOrganizations.id))
      .limit(input.page.limit).offset(input.page.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(directoryOrganizations).where(where),
  ]);
  const total = countRows[0]?.count ?? 0;
  return { organizations: rows, pagination: pagination(total, input.page) };
}

export async function getOrganization(actor: DirectoryActor, id: string) {
  const [organization] = await db.select().from(directoryOrganizations).where(and(
    eq(directoryOrganizations.tenantId, actor.tenantId), eq(directoryOrganizations.id, id),
  )).limit(1);
  if (!organization) throw new DirectoryFailure(404, 'DIRECTORY_ORGANIZATION_NOT_FOUND', 'Organization not found');
  const profileQuery = actor.moduleSlug === 'tradeflowkit'
    ? db.select().from(tradeflowkitCustomerProfiles).where(and(eq(tradeflowkitCustomerProfiles.tenantId, actor.tenantId), eq(tradeflowkitCustomerProfiles.organizationId, id))).limit(1)
    : actor.moduleSlug === 'techdeck'
      ? db.select().from(techdeckManagedClientProfiles).where(and(eq(techdeckManagedClientProfiles.tenantId, actor.tenantId), eq(techdeckManagedClientProfiles.organizationId, id))).limit(1)
      : actor.moduleSlug === 'pulsedesk'
        ? db.select().from(pulsedeskServiceClientProfiles).where(and(eq(pulsedeskServiceClientProfiles.tenantId, actor.tenantId), eq(pulsedeskServiceClientProfiles.organizationId, id))).limit(1)
        : Promise.resolve([]);
  const [sites, contactLinks, relationships, profile] = await Promise.all([
    db.select().from(directorySites).where(and(eq(directorySites.tenantId, actor.tenantId), eq(directorySites.organizationId, id), isNull(directorySites.archivedAt))).orderBy(asc(directorySites.normalizedName)),
    db.select({ association: directoryOrganizationContacts, contact: directoryContacts })
      .from(directoryOrganizationContacts)
      .innerJoin(directoryContacts, and(eq(directoryContacts.tenantId, directoryOrganizationContacts.tenantId), eq(directoryContacts.id, directoryOrganizationContacts.contactId)))
      .where(and(eq(directoryOrganizationContacts.tenantId, actor.tenantId), eq(directoryOrganizationContacts.organizationId, id), isNull(directoryContacts.archivedAt))),
    db.select().from(directoryRelationships).where(and(
      eq(directoryRelationships.tenantId, actor.tenantId), isNull(directoryRelationships.archivedAt),
      or(eq(directoryRelationships.fromOrganizationId, id), eq(directoryRelationships.toOrganizationId, id)),
    )),
    profileQuery,
  ]);
  return {
    organization, sites,
    contacts: contactLinks.map(row => ({ ...row.contact, association: row.association })),
    relationships,
    profile: profile[0] ?? null,
  };
}

export async function createOrganization(actor: DirectoryActor, input: {
  name: string; type?: string; status?: string; website?: string | null; notes?: string | null;
}) {
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.insert(directoryOrganizations).values({
        tenantId: actor.tenantId, name: input.name.trim(), normalizedName: normalizeDirectoryText(input.name),
        type: (input.type ?? 'client') as typeof directoryOrganizations.type.enumValues[number],
        status: (input.status ?? 'active') as 'active' | 'inactive', website: input.website?.trim() || null,
        notes: input.notes?.trim() || null, createdByUserId: actor.userId, updatedByUserId: actor.userId,
      }).returning();
      await audit(tx, actor, 'created', 'directory_organization', row.id, { type: row.type });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'organization'); }
}

export async function updateOrganization(actor: DirectoryActor, id: string, input: {
  expectedVersion: number; name?: string; type?: string; status?: string; website?: string | null; notes?: string | null;
}) {
  const patch: Record<string, unknown> = { updatedByUserId: actor.userId, updatedAt: new Date(), version: sql`${directoryOrganizations.version} + 1` };
  if (input.name !== undefined) { patch.name = input.name.trim(); patch.normalizedName = normalizeDirectoryText(input.name); }
  if (input.type !== undefined) patch.type = input.type;
  if (input.status !== undefined) patch.status = input.status;
  if (input.website !== undefined) patch.website = input.website?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.update(directoryOrganizations).set(patch).where(and(
        eq(directoryOrganizations.tenantId, actor.tenantId), eq(directoryOrganizations.id, id),
        eq(directoryOrganizations.version, input.expectedVersion), isNull(directoryOrganizations.archivedAt),
      )).returning();
      if (!row) {
        const [current] = await tx.select({ version: directoryOrganizations.version }).from(directoryOrganizations).where(and(
          eq(directoryOrganizations.tenantId, actor.tenantId), eq(directoryOrganizations.id, id), isNull(directoryOrganizations.archivedAt),
        )).limit(1);
        if (!current) throw new DirectoryFailure(404, 'DIRECTORY_ORGANIZATION_NOT_FOUND', 'Organization not found');
        throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Organization was changed by another request', { currentVersion: current.version });
      }
      await audit(tx, actor, 'updated', 'directory_organization', id, { version: row.version });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'organization'); }
}

export async function archiveOrganization(actor: DirectoryActor, id: string, expectedVersion: number) {
  return db.transaction(async tx => {
    const now = new Date();
    const [row] = await tx.update(directoryOrganizations).set({ archivedAt: now, status: 'inactive', updatedAt: now, updatedByUserId: actor.userId, version: sql`${directoryOrganizations.version} + 1` }).where(and(
      eq(directoryOrganizations.tenantId, actor.tenantId), eq(directoryOrganizations.id, id), eq(directoryOrganizations.version, expectedVersion), isNull(directoryOrganizations.archivedAt),
    )).returning();
    if (!row) {
      const [current] = await tx.select({ version: directoryOrganizations.version }).from(directoryOrganizations).where(and(eq(directoryOrganizations.tenantId, actor.tenantId), eq(directoryOrganizations.id, id), isNull(directoryOrganizations.archivedAt))).limit(1);
      if (!current) throw new DirectoryFailure(404, 'DIRECTORY_ORGANIZATION_NOT_FOUND', 'Organization not found');
      throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Organization was changed by another request', { currentVersion: current.version });
    }
    await tx.update(directorySites).set({
      archivedAt: now,
      status: 'inactive',
      updatedAt: now,
      updatedByUserId: actor.userId,
      version: sql`${directorySites.version} + 1`,
    }).where(and(
      eq(directorySites.tenantId, actor.tenantId),
      eq(directorySites.organizationId, id),
      isNull(directorySites.archivedAt),
    ));
    await tx.update(directoryRelationships).set({
      archivedAt: now,
      updatedAt: now,
      updatedByUserId: actor.userId,
      version: sql`${directoryRelationships.version} + 1`,
    }).where(and(
      eq(directoryRelationships.tenantId, actor.tenantId),
      or(eq(directoryRelationships.fromOrganizationId, id), eq(directoryRelationships.toOrganizationId, id)),
      isNull(directoryRelationships.archivedAt),
    ));
    await audit(tx, actor, 'archived', 'directory_organization', id, { version: row.version });
    return row;
  });
}

export async function listContacts(actor: DirectoryActor, input: { page: DirectoryPage; search?: string; status?: string; includeArchived?: boolean }) {
  const conditions = [eq(directoryContacts.tenantId, actor.tenantId)];
  if (!input.includeArchived) conditions.push(isNull(directoryContacts.archivedAt));
  if (input.status) conditions.push(eq(directoryContacts.status, input.status as 'active' | 'inactive'));
  if (input.search) conditions.push(or(ilike(directoryContacts.firstName, `%${input.search}%`), ilike(directoryContacts.lastName, `%${input.search}%`), ilike(directoryContacts.email, `%${input.search}%`))!);
  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db.select().from(directoryContacts).where(where).orderBy(asc(directoryContacts.normalizedName), asc(directoryContacts.id)).limit(input.page.limit).offset(input.page.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(directoryContacts).where(where),
  ]);
  return { contacts: rows, pagination: pagination(countRows[0]?.count ?? 0, input.page) };
}

export async function createContact(actor: DirectoryActor, input: { firstName: string; lastName?: string; email?: string | null; phone?: string | null; title?: string | null; status?: string }) {
  try {
    return await db.transaction(async tx => {
      const lastName = input.lastName?.trim() ?? '';
      const [row] = await tx.insert(directoryContacts).values({
        tenantId: actor.tenantId, firstName: input.firstName.trim(), lastName,
        normalizedName: normalizeDirectoryText(`${input.firstName} ${lastName}`), email: input.email?.trim() || null,
        normalizedEmail: normalizeDirectoryEmail(input.email), phone: input.phone?.trim() || null, title: input.title?.trim() || null,
        status: (input.status ?? 'active') as 'active' | 'inactive', createdByUserId: actor.userId, updatedByUserId: actor.userId,
      }).returning();
      await audit(tx, actor, 'created', 'directory_contact', row.id);
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'contact'); }
}

export async function updateContact(actor: DirectoryActor, id: string, input: { expectedVersion: number; firstName?: string; lastName?: string; email?: string | null; phone?: string | null; title?: string | null; status?: string }) {
  const [current] = await db.select().from(directoryContacts).where(and(eq(directoryContacts.tenantId, actor.tenantId), eq(directoryContacts.id, id), isNull(directoryContacts.archivedAt))).limit(1);
  if (!current) throw new DirectoryFailure(404, 'DIRECTORY_CONTACT_NOT_FOUND', 'Contact not found');
  const firstName = input.firstName?.trim() ?? current.firstName;
  const lastName = input.lastName?.trim() ?? current.lastName;
  const patch: Record<string, unknown> = { firstName, lastName, normalizedName: normalizeDirectoryText(`${firstName} ${lastName}`), updatedByUserId: actor.userId, updatedAt: new Date(), version: sql`${directoryContacts.version} + 1` };
  if (input.email !== undefined) { patch.email = input.email?.trim() || null; patch.normalizedEmail = normalizeDirectoryEmail(input.email); }
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.title !== undefined) patch.title = input.title?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.update(directoryContacts).set(patch).where(and(eq(directoryContacts.tenantId, actor.tenantId), eq(directoryContacts.id, id), eq(directoryContacts.version, input.expectedVersion), isNull(directoryContacts.archivedAt))).returning();
      if (!row) throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Contact was changed by another request', { currentVersion: current.version });
      await audit(tx, actor, 'updated', 'directory_contact', id, { version: row.version });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'contact'); }
}

export async function archiveContact(actor: DirectoryActor, id: string, expectedVersion: number) {
  return db.transaction(async tx => {
    const now = new Date();
    const [row] = await tx.update(directoryContacts).set({ archivedAt: now, status: 'inactive', updatedAt: now, updatedByUserId: actor.userId, version: sql`${directoryContacts.version} + 1` }).where(and(eq(directoryContacts.tenantId, actor.tenantId), eq(directoryContacts.id, id), eq(directoryContacts.version, expectedVersion), isNull(directoryContacts.archivedAt))).returning();
    if (!row) {
      const [current] = await tx.select({ version: directoryContacts.version }).from(directoryContacts).where(and(eq(directoryContacts.tenantId, actor.tenantId), eq(directoryContacts.id, id), isNull(directoryContacts.archivedAt))).limit(1);
      if (!current) throw new DirectoryFailure(404, 'DIRECTORY_CONTACT_NOT_FOUND', 'Contact not found');
      throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Contact was changed by another request', { currentVersion: current.version });
    }
    await audit(tx, actor, 'archived', 'directory_contact', id, { version: row.version });
    return row;
  });
}

async function findOrCreateAddress(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], actor: DirectoryActor, input: {
  label?: string | null; line1: string; line2?: string | null; city: string; region: string; postalCode: string; countryCode?: string;
}) {
  const normalizedKey = normalizeAddressKey(input);
  const [existing] = await tx.select().from(directoryAddresses).where(and(eq(directoryAddresses.tenantId, actor.tenantId), eq(directoryAddresses.normalizedKey, normalizedKey), isNull(directoryAddresses.archivedAt))).limit(1);
  if (existing) return existing;
  const [created] = await tx.insert(directoryAddresses).values({
    tenantId: actor.tenantId, label: input.label?.trim() || null, line1: input.line1.trim(), line2: input.line2?.trim() || null,
    city: input.city.trim(), region: input.region.trim(), postalCode: input.postalCode.trim(), countryCode: (input.countryCode ?? 'US').toUpperCase(),
    normalizedKey, createdByUserId: actor.userId, updatedByUserId: actor.userId,
  }).returning();
  return created;
}

export async function listSites(actor: DirectoryActor, input: { page: DirectoryPage; search?: string; organizationId?: string; status?: string; includeArchived?: boolean }) {
  const conditions = [eq(directorySites.tenantId, actor.tenantId)];
  if (!input.includeArchived) {
    conditions.push(isNull(directorySites.archivedAt));
    conditions.push(isNull(directoryOrganizations.archivedAt));
  }
  if (input.organizationId) conditions.push(eq(directorySites.organizationId, input.organizationId));
  if (input.status) conditions.push(eq(directorySites.status, input.status as 'active' | 'inactive'));
  if (input.search) conditions.push(ilike(directorySites.name, `%${input.search}%`));
  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db.select({ site: directorySites, organization: directoryOrganizations, address: directoryAddresses })
      .from(directorySites)
      .innerJoin(directoryOrganizations, and(eq(directoryOrganizations.tenantId, directorySites.tenantId), eq(directoryOrganizations.id, directorySites.organizationId)))
      .leftJoin(directoryAddresses, and(eq(directoryAddresses.tenantId, directorySites.tenantId), eq(directoryAddresses.id, directorySites.addressId)))
      .where(where).orderBy(asc(directorySites.normalizedName), asc(directorySites.id)).limit(input.page.limit).offset(input.page.offset),
    db.select({ count: sql<number>`count(*)::int` }).from(directorySites)
      .innerJoin(directoryOrganizations, and(eq(directoryOrganizations.tenantId, directorySites.tenantId), eq(directoryOrganizations.id, directorySites.organizationId)))
      .where(where),
  ]);
  return { sites: rows.map(row => ({ ...row.site, organization: row.organization, address: row.address })), pagination: pagination(countRows[0]?.count ?? 0, input.page) };
}

export async function createSite(actor: DirectoryActor, input: {
  organizationId: string; name: string; type?: string; status?: string; timezone?: string | null; notes?: string | null;
  address?: { label?: string | null; line1: string; line2?: string | null; city: string; region: string; postalCode: string; countryCode?: string } | null;
}) {
  try {
    return await db.transaction(async tx => {
      const [organization] = await tx.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(eq(directoryOrganizations.tenantId, actor.tenantId), eq(directoryOrganizations.id, input.organizationId), isNull(directoryOrganizations.archivedAt))).limit(1);
      if (!organization) throw new DirectoryFailure(404, 'DIRECTORY_ORGANIZATION_NOT_FOUND', 'Organization not found');
      const address = input.address ? await findOrCreateAddress(tx, actor, input.address) : null;
      const [row] = await tx.insert(directorySites).values({
        tenantId: actor.tenantId, organizationId: organization.id, addressId: address?.id ?? null,
        name: input.name.trim(), normalizedName: normalizeDirectoryText(input.name), type: (input.type ?? 'office') as typeof directorySites.type.enumValues[number],
        status: (input.status ?? 'active') as 'active' | 'inactive', timezone: input.timezone?.trim() || null, notes: input.notes?.trim() || null,
        createdByUserId: actor.userId, updatedByUserId: actor.userId,
      }).returning();
      await audit(tx, actor, 'created', 'directory_site', row.id, { organizationId: organization.id });
      return { ...row, address };
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'site'); }
}

export async function updateSite(actor: DirectoryActor, id: string, input: {
  expectedVersion: number; name?: string; type?: string; status?: string; timezone?: string | null; notes?: string | null;
  address?: { label?: string | null; line1: string; line2?: string | null; city: string; region: string; postalCode: string; countryCode?: string } | null;
}) {
  try {
    return await db.transaction(async tx => {
      const patch: Record<string, unknown> = { updatedByUserId: actor.userId, updatedAt: new Date(), version: sql`${directorySites.version} + 1` };
      if (input.name !== undefined) { patch.name = input.name.trim(); patch.normalizedName = normalizeDirectoryText(input.name); }
      if (input.type !== undefined) patch.type = input.type;
      if (input.status !== undefined) patch.status = input.status;
      if (input.timezone !== undefined) patch.timezone = input.timezone?.trim() || null;
      if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
      if (input.address !== undefined) patch.addressId = input.address ? (await findOrCreateAddress(tx, actor, input.address)).id : null;
      const [row] = await tx.update(directorySites).set(patch).where(and(eq(directorySites.tenantId, actor.tenantId), eq(directorySites.id, id), eq(directorySites.version, input.expectedVersion), isNull(directorySites.archivedAt))).returning();
      if (!row) {
        const [current] = await tx.select({ version: directorySites.version }).from(directorySites).where(and(eq(directorySites.tenantId, actor.tenantId), eq(directorySites.id, id), isNull(directorySites.archivedAt))).limit(1);
        if (!current) throw new DirectoryFailure(404, 'DIRECTORY_SITE_NOT_FOUND', 'Site not found');
        throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Site was changed by another request', { currentVersion: current.version });
      }
      await audit(tx, actor, 'updated', 'directory_site', id, { version: row.version });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'site'); }
}

export async function archiveSite(actor: DirectoryActor, id: string, expectedVersion: number) {
  return db.transaction(async tx => {
    const now = new Date();
    const [row] = await tx.update(directorySites).set({ archivedAt: now, status: 'inactive', updatedAt: now, updatedByUserId: actor.userId, version: sql`${directorySites.version} + 1` }).where(and(eq(directorySites.tenantId, actor.tenantId), eq(directorySites.id, id), eq(directorySites.version, expectedVersion), isNull(directorySites.archivedAt))).returning();
    if (!row) {
      const [current] = await tx.select({ version: directorySites.version }).from(directorySites).where(and(eq(directorySites.tenantId, actor.tenantId), eq(directorySites.id, id), isNull(directorySites.archivedAt))).limit(1);
      if (!current) throw new DirectoryFailure(404, 'DIRECTORY_SITE_NOT_FOUND', 'Site not found');
      throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Site was changed by another request', { currentVersion: current.version });
    }
    await audit(tx, actor, 'archived', 'directory_site', id, { version: row.version });
    return row;
  });
}

async function requireActiveIds(actor: DirectoryActor, organizationId?: string, contactId?: string, siteId?: string) {
  const [organization, contact, site] = await Promise.all([
    organizationId ? db.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(eq(directoryOrganizations.tenantId, actor.tenantId), eq(directoryOrganizations.id, organizationId), isNull(directoryOrganizations.archivedAt))).limit(1) : Promise.resolve([{ id: '' }]),
    contactId ? db.select({ id: directoryContacts.id }).from(directoryContacts).where(and(eq(directoryContacts.tenantId, actor.tenantId), eq(directoryContacts.id, contactId), isNull(directoryContacts.archivedAt))).limit(1) : Promise.resolve([{ id: '' }]),
    siteId ? db.select({ id: directorySites.id }).from(directorySites).where(and(eq(directorySites.tenantId, actor.tenantId), eq(directorySites.id, siteId), isNull(directorySites.archivedAt))).limit(1) : Promise.resolve([{ id: '' }]),
  ]);
  if (organizationId && !organization[0]) throw new DirectoryFailure(404, 'DIRECTORY_ORGANIZATION_NOT_FOUND', 'Organization not found');
  if (contactId && !contact[0]) throw new DirectoryFailure(404, 'DIRECTORY_CONTACT_NOT_FOUND', 'Contact not found');
  if (siteId && !site[0]) throw new DirectoryFailure(404, 'DIRECTORY_SITE_NOT_FOUND', 'Site not found');
}

export async function associateOrganizationContact(actor: DirectoryActor, organizationId: string, input: { contactId: string; role?: string | null; isPrimary?: boolean }) {
  await requireActiveIds(actor, organizationId, input.contactId);
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.insert(directoryOrganizationContacts).values({ tenantId: actor.tenantId, organizationId, contactId: input.contactId, role: input.role?.trim() || null, isPrimary: input.isPrimary ?? false, createdByUserId: actor.userId }).returning();
      await audit(tx, actor, 'associated', 'directory_organization_contact', row.id, { organizationId, contactId: input.contactId });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'organization contact association'); }
}

export async function removeOrganizationContact(actor: DirectoryActor, organizationId: string, contactId: string) {
  return db.transaction(async tx => {
    const [row] = await tx.delete(directoryOrganizationContacts).where(and(eq(directoryOrganizationContacts.tenantId, actor.tenantId), eq(directoryOrganizationContacts.organizationId, organizationId), eq(directoryOrganizationContacts.contactId, contactId))).returning();
    if (!row) throw new DirectoryFailure(404, 'DIRECTORY_ASSOCIATION_NOT_FOUND', 'Association not found');
    await audit(tx, actor, 'removed', 'directory_organization_contact', row.id, { organizationId, contactId });
    return { ok: true as const };
  });
}

export async function associateSiteContact(actor: DirectoryActor, siteId: string, input: { contactId: string; role?: string | null; isPrimary?: boolean }) {
  await requireActiveIds(actor, undefined, input.contactId, siteId);
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.insert(directorySiteContacts).values({ tenantId: actor.tenantId, siteId, contactId: input.contactId, role: input.role?.trim() || null, isPrimary: input.isPrimary ?? false, createdByUserId: actor.userId }).returning();
      await audit(tx, actor, 'associated', 'directory_site_contact', row.id, { siteId, contactId: input.contactId });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'site contact association'); }
}

export async function removeSiteContact(actor: DirectoryActor, siteId: string, contactId: string) {
  return db.transaction(async tx => {
    const [row] = await tx.delete(directorySiteContacts).where(and(eq(directorySiteContacts.tenantId, actor.tenantId), eq(directorySiteContacts.siteId, siteId), eq(directorySiteContacts.contactId, contactId))).returning();
    if (!row) throw new DirectoryFailure(404, 'DIRECTORY_ASSOCIATION_NOT_FOUND', 'Association not found');
    await audit(tx, actor, 'removed', 'directory_site_contact', row.id, { siteId, contactId });
    return { ok: true as const };
  });
}

export async function createRelationship(actor: DirectoryActor, input: { fromOrganizationId: string; toOrganizationId: string; type: string; notes?: string | null }) {
  await requireActiveIds(actor, input.fromOrganizationId);
  await requireActiveIds(actor, input.toOrganizationId);
  if (input.fromOrganizationId === input.toOrganizationId) throw new DirectoryFailure(422, 'DIRECTORY_RELATIONSHIP_SELF', 'An organization cannot relate to itself');
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.insert(directoryRelationships).values({ tenantId: actor.tenantId, ...input, type: input.type.trim(), notes: input.notes?.trim() || null, createdByUserId: actor.userId, updatedByUserId: actor.userId }).returning();
      await audit(tx, actor, 'created', 'directory_relationship', row.id, { fromOrganizationId: input.fromOrganizationId, toOrganizationId: input.toOrganizationId, type: row.type });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'relationship'); }
}

export async function archiveRelationship(actor: DirectoryActor, id: string, expectedVersion: number) {
  return db.transaction(async tx => {
    const [row] = await tx.update(directoryRelationships).set({ archivedAt: new Date(), updatedAt: new Date(), updatedByUserId: actor.userId, version: sql`${directoryRelationships.version} + 1` }).where(and(eq(directoryRelationships.tenantId, actor.tenantId), eq(directoryRelationships.id, id), eq(directoryRelationships.version, expectedVersion), isNull(directoryRelationships.archivedAt))).returning();
    if (!row) {
      const [current] = await tx.select({ version: directoryRelationships.version }).from(directoryRelationships).where(and(
        eq(directoryRelationships.tenantId, actor.tenantId), eq(directoryRelationships.id, id), isNull(directoryRelationships.archivedAt),
      )).limit(1);
      if (!current) throw new DirectoryFailure(404, 'DIRECTORY_RELATIONSHIP_NOT_FOUND', 'Relationship not found');
      throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Relationship was changed by another request', { currentVersion: current.version });
    }
    await audit(tx, actor, 'archived', 'directory_relationship', id, { version: row.version });
    return row;
  });
}

export async function listTags(actor: DirectoryActor) {
  return db.select().from(directoryTags).where(and(eq(directoryTags.tenantId, actor.tenantId), isNull(directoryTags.archivedAt))).orderBy(asc(directoryTags.normalizedName));
}

export async function createTag(actor: DirectoryActor, input: { name: string; color?: string | null }) {
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.insert(directoryTags).values({ tenantId: actor.tenantId, name: input.name.trim(), normalizedName: normalizeDirectoryText(input.name), color: input.color?.trim() || null, createdByUserId: actor.userId }).returning();
      await audit(tx, actor, 'created', 'directory_tag', row.id);
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'tag'); }
}

export async function assignTag(actor: DirectoryActor, tagId: string, input: { entityType: 'organization' | 'contact' | 'site'; entityId: string }) {
  const [tag] = await db.select({ id: directoryTags.id }).from(directoryTags).where(and(eq(directoryTags.tenantId, actor.tenantId), eq(directoryTags.id, tagId), isNull(directoryTags.archivedAt))).limit(1);
  if (!tag) throw new DirectoryFailure(404, 'DIRECTORY_TAG_NOT_FOUND', 'Tag not found');
  await requireActiveIds(actor, input.entityType === 'organization' ? input.entityId : undefined, input.entityType === 'contact' ? input.entityId : undefined, input.entityType === 'site' ? input.entityId : undefined);
  try {
    return await db.transaction(async tx => {
      const [row] = await tx.insert(directoryTagAssignments).values({ tenantId: actor.tenantId, tagId, entityType: input.entityType, organizationId: input.entityType === 'organization' ? input.entityId : null, contactId: input.entityType === 'contact' ? input.entityId : null, siteId: input.entityType === 'site' ? input.entityId : null, createdByUserId: actor.userId }).returning();
      await audit(tx, actor, 'assigned', 'directory_tag_assignment', row.id, { tagId, entityType: input.entityType, entityId: input.entityId });
      return row;
    });
  } catch (error) { rethrowDirectoryDatabaseError(error, 'tag assignment'); }
}

export async function upsertModuleProfile(actor: DirectoryActor, organizationId: string, input: Record<string, unknown>) {
  await requireActiveIds(actor, organizationId);
  return db.transaction(async tx => {
    if (actor.moduleSlug === 'tradeflowkit') {
      const [existing] = await tx.select().from(tradeflowkitCustomerProfiles).where(and(eq(tradeflowkitCustomerProfiles.tenantId, actor.tenantId), eq(tradeflowkitCustomerProfiles.organizationId, organizationId))).limit(1);
      if (!existing) {
        const [row] = await tx.insert(tradeflowkitCustomerProfiles).values({ tenantId: actor.tenantId, organizationId, customerStatus: typeof input.customerStatus === 'string' ? input.customerStatus : 'active', paymentTermsDays: typeof input.paymentTermsDays === 'number' ? input.paymentTermsDays : null, notes: typeof input.notes === 'string' ? input.notes : null, createdByUserId: actor.userId, updatedByUserId: actor.userId }).returning();
        await audit(tx, actor, 'created', 'tradeflowkit_customer_profile', row.id, { organizationId }); return row;
      }
      if (input.expectedVersion !== existing.version) throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Profile was changed by another request', { currentVersion: existing.version });
      const [row] = await tx.update(tradeflowkitCustomerProfiles).set({ customerStatus: typeof input.customerStatus === 'string' ? input.customerStatus : existing.customerStatus, paymentTermsDays: input.paymentTermsDays === null || typeof input.paymentTermsDays === 'number' ? input.paymentTermsDays : existing.paymentTermsDays, notes: input.notes === null || typeof input.notes === 'string' ? input.notes : existing.notes, updatedByUserId: actor.userId, updatedAt: new Date(), version: sql`${tradeflowkitCustomerProfiles.version} + 1` }).where(and(eq(tradeflowkitCustomerProfiles.id, existing.id), eq(tradeflowkitCustomerProfiles.tenantId, actor.tenantId), eq(tradeflowkitCustomerProfiles.version, existing.version))).returning();
      await audit(tx, actor, 'updated', 'tradeflowkit_customer_profile', row.id, { organizationId, version: row.version }); return row;
    }
    if (actor.moduleSlug === 'techdeck') {
      const [existing] = await tx.select().from(techdeckManagedClientProfiles).where(and(eq(techdeckManagedClientProfiles.tenantId, actor.tenantId), eq(techdeckManagedClientProfiles.organizationId, organizationId))).limit(1);
      if (!existing) {
        const [row] = await tx.insert(techdeckManagedClientProfiles).values({ tenantId: actor.tenantId, organizationId, serviceTier: typeof input.serviceTier === 'string' ? input.serviceTier : null, accountCode: typeof input.accountCode === 'string' ? input.accountCode : null, notes: typeof input.notes === 'string' ? input.notes : null, createdByUserId: actor.userId, updatedByUserId: actor.userId }).returning();
        await audit(tx, actor, 'created', 'techdeck_managed_client_profile', row.id, { organizationId }); return row;
      }
      if (input.expectedVersion !== existing.version) throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Profile was changed by another request', { currentVersion: existing.version });
      const [row] = await tx.update(techdeckManagedClientProfiles).set({ serviceTier: input.serviceTier === null || typeof input.serviceTier === 'string' ? input.serviceTier : existing.serviceTier, accountCode: input.accountCode === null || typeof input.accountCode === 'string' ? input.accountCode : existing.accountCode, notes: input.notes === null || typeof input.notes === 'string' ? input.notes : existing.notes, updatedByUserId: actor.userId, updatedAt: new Date(), version: sql`${techdeckManagedClientProfiles.version} + 1` }).where(and(eq(techdeckManagedClientProfiles.id, existing.id), eq(techdeckManagedClientProfiles.tenantId, actor.tenantId), eq(techdeckManagedClientProfiles.version, existing.version))).returning();
      await audit(tx, actor, 'updated', 'techdeck_managed_client_profile', row.id, { organizationId, version: row.version }); return row;
    }
    const [existing] = await tx.select().from(pulsedeskServiceClientProfiles).where(and(eq(pulsedeskServiceClientProfiles.tenantId, actor.tenantId), eq(pulsedeskServiceClientProfiles.organizationId, organizationId))).limit(1);
    if (!existing) {
      const [row] = await tx.insert(pulsedeskServiceClientProfiles).values({ tenantId: actor.tenantId, organizationId, facilityCategory: typeof input.facilityCategory === 'string' ? input.facilityCategory : null, phiRestricted: typeof input.phiRestricted === 'boolean' ? input.phiRestricted : true, notes: typeof input.notes === 'string' ? input.notes : null, createdByUserId: actor.userId, updatedByUserId: actor.userId }).returning();
      await audit(tx, actor, 'created', 'pulsedesk_service_client_profile', row.id, { organizationId }); return row;
    }
    if (input.expectedVersion !== existing.version) throw new DirectoryFailure(409, 'DIRECTORY_VERSION_CONFLICT', 'Profile was changed by another request', { currentVersion: existing.version });
    const [row] = await tx.update(pulsedeskServiceClientProfiles).set({ facilityCategory: input.facilityCategory === null || typeof input.facilityCategory === 'string' ? input.facilityCategory : existing.facilityCategory, phiRestricted: typeof input.phiRestricted === 'boolean' ? input.phiRestricted : existing.phiRestricted, notes: input.notes === null || typeof input.notes === 'string' ? input.notes : existing.notes, updatedByUserId: actor.userId, updatedAt: new Date(), version: sql`${pulsedeskServiceClientProfiles.version} + 1` }).where(and(eq(pulsedeskServiceClientProfiles.id, existing.id), eq(pulsedeskServiceClientProfiles.tenantId, actor.tenantId), eq(pulsedeskServiceClientProfiles.version, existing.version))).returning();
    await audit(tx, actor, 'updated', 'pulsedesk_service_client_profile', row.id, { organizationId, version: row.version }); return row;
  });
}
