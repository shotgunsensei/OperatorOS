import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db.js';
import {
  activityFeed,
  directoryOrganizations,
  directorySites,
  modules,
  techdeckAssets,
  techdeckConfigurationRelationships,
  techdeckDocumentFolders,
  techdeckDocumentLinks,
  techdeckDocumentRevisions,
  techdeckDocuments,
  techdeckEvidence,
  techdeckReports,
  techdeckTicketComments,
  techdeckTickets,
  techdeckTimeEntries,
} from '../schema.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';
import {
  createAttachment,
  getAttachmentContent,
  listAttachments,
  softDeleteAttachment,
} from '../lib/shared-attachments.js';
import {
  parseTechDeckAssetCreate,
  parseTechDeckAssetPatch,
  parseTechDeckVersion,
  rejectTechDeckServerOwned,
  sanitizeTechDeckContent,
  TECHDECK_DOCUMENT_ROLES,
  TECHDECK_DOCUMENT_TYPES,
  TECHDECK_EVIDENCE_TYPES,
  TECHDECK_RELATIONSHIP_TYPES,
  TECHDECK_REPORT_TYPES,
  techDeckDate,
  techDeckEnum,
  techDeckObject,
  techDeckSlug,
  techDeckText,
  TechDeckOpsValidationError,
} from '../lib/techdeck-ops.js';

const readGuards = [requireTenantMember, requireTenantModuleAccess('techdeck')];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...writeGuards, requireTenantAdmin];
const ATTACHMENT_OBJECTS = new Set(['configuration_item', 'document', 'evidence']);

type TechDeckContext = { tenantId: string; role: 'owner' | 'admin' | 'member'; viaPlatformRole: boolean };
type TechDeckUser = { id: string };
type Executor = Pick<typeof db, 'insert'>;

function tenant(request: FastifyRequest): string {
  return ((request as any).tenantContext as TechDeckContext).tenantId;
}

function user(request: FastifyRequest): string {
  return ((request as any).user as TechDeckUser).id;
}

function validationFailure(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof TechDeckOpsValidationError)) return false;
  reply.code(400).send({ error: 'Invalid TechDeck input', code: error.code, field: error.field });
  return true;
}

function notFound(reply: FastifyReply, entity: string) {
  return reply.code(404).send({ error: `${entity} not found`, code: `${entity.toUpperCase().replaceAll(' ', '_')}_NOT_FOUND` });
}

function pageLimit(raw: unknown): number {
  const value = Number((raw as Record<string, unknown> | undefined)?.limit ?? 100);
  if (!Number.isInteger(value) || value < 1 || value > 250) throw new TechDeckOpsValidationError('LIMIT_INVALID', 'limit');
  return value;
}

function strings(value: unknown, field: string, maxItems = 30): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new TechDeckOpsValidationError('FIELD_INVALID', field);
  return [...new Set(value.map((entry, index) => techDeckText(entry, `${field}.${index}`, 160, { required: true })!))];
}

function nullableId(value: unknown, field: string): string | null {
  return techDeckText(value, field, 36, { nullable: true }) ?? null;
}

function positiveInteger(value: unknown, field: string, max: number): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > max) throw new TechDeckOpsValidationError('FIELD_INVALID', field);
  return value as number;
}

async function audit(executor: Executor, input: { tenantId: string; userId: string; action: string; entityType: string; entityId: string; metadata?: Record<string, unknown> }) {
  await executor.insert(activityFeed).values({
    tenantId: input.tenantId,
    userId: input.userId,
    action: input.action,
    entityType: `techdeck_${input.entityType}`,
    entityId: input.entityId,
    metadata: input.metadata ?? {},
  });
}

async function techDeckModuleId(): Promise<string> {
  const [row] = await db.select({ id: modules.id }).from(modules).where(eq(modules.slug, 'techdeck')).limit(1);
  if (!row) throw new Error('TechDeck module registry row is missing');
  return row.id;
}

async function assertDirectoryReferences(tenantId: string, organizationId: string | null, siteId: string | null): Promise<void> {
  if (siteId && !organizationId) throw new TechDeckOpsValidationError('DIRECTORY_ORGANIZATION_REQUIRED', 'directoryOrganizationId');
  if (organizationId) {
    const [organization] = await db.select({ id: directoryOrganizations.id }).from(directoryOrganizations).where(and(
      eq(directoryOrganizations.tenantId, tenantId), eq(directoryOrganizations.id, organizationId), isNull(directoryOrganizations.archivedAt),
    )).limit(1);
    if (!organization) throw new TechDeckOpsValidationError('DIRECTORY_ORGANIZATION_NOT_FOUND', 'directoryOrganizationId');
  }
  if (siteId) {
    const [site] = await db.select({ id: directorySites.id, organizationId: directorySites.organizationId }).from(directorySites).where(and(
      eq(directorySites.tenantId, tenantId), eq(directorySites.id, siteId), isNull(directorySites.archivedAt),
    )).limit(1);
    if (!site || (organizationId && site.organizationId !== organizationId)) throw new TechDeckOpsValidationError('DIRECTORY_SITE_NOT_FOUND', 'directorySiteId');
  }
}

async function attachmentObjectExists(request: FastifyRequest, objectType: string, objectId: string): Promise<boolean> {
  const tenantId = tenant(request);
  if (objectType === 'configuration_item') {
    const [row] = await db.select({ id: techdeckAssets.id }).from(techdeckAssets).where(and(eq(techdeckAssets.tenantId, tenantId), eq(techdeckAssets.id, objectId), isNull(techdeckAssets.deletedAt))).limit(1);
    return !!row;
  }
  if (objectType === 'document') {
    const [row] = await db.select({ id: techdeckDocuments.id }).from(techdeckDocuments).where(and(
      eq(techdeckDocuments.tenantId, tenantId), eq(techdeckDocuments.id, objectId), isNull(techdeckDocuments.archivedAt),
      inArray(techdeckDocuments.minimumRole, documentVisibility(request)),
    )).limit(1);
    return !!row;
  }
  if (objectType === 'evidence') {
    const [row] = await db.select({ id: techdeckEvidence.id }).from(techdeckEvidence).where(and(eq(techdeckEvidence.tenantId, tenantId), eq(techdeckEvidence.id, objectId), isNull(techdeckEvidence.archivedAt))).limit(1);
    return !!row;
  }
  return false;
}

function documentVisibility(request: FastifyRequest) {
  const context = (request as any).tenantContext as TechDeckContext;
  if (context.viaPlatformRole || context.role === 'owner') return ['member', 'admin', 'owner'];
  if (context.role === 'admin') return ['member', 'admin'];
  return ['member'];
}

async function assertTechDeckReferences(request: FastifyRequest, references: {
  folderId?: string | null;
  configurationItemId?: string | null;
  documentId?: string | null;
  ticketId?: string | null;
}): Promise<void> {
  const tenantId = tenant(request);
  if (references.folderId) {
    const [row] = await db.select({ id: techdeckDocumentFolders.id }).from(techdeckDocumentFolders).where(and(
      eq(techdeckDocumentFolders.tenantId, tenantId), eq(techdeckDocumentFolders.id, references.folderId), isNull(techdeckDocumentFolders.archivedAt),
    )).limit(1);
    if (!row) throw new TechDeckOpsValidationError('REFERENCE_NOT_FOUND', 'folderId');
  }
  if (references.configurationItemId) {
    const [row] = await db.select({ id: techdeckAssets.id }).from(techdeckAssets).where(and(
      eq(techdeckAssets.tenantId, tenantId), eq(techdeckAssets.id, references.configurationItemId), isNull(techdeckAssets.deletedAt),
    )).limit(1);
    if (!row) throw new TechDeckOpsValidationError('REFERENCE_NOT_FOUND', 'configurationItemId');
  }
  if (references.documentId) {
    const [row] = await db.select({ id: techdeckDocuments.id }).from(techdeckDocuments).where(and(
      eq(techdeckDocuments.tenantId, tenantId), eq(techdeckDocuments.id, references.documentId), isNull(techdeckDocuments.archivedAt),
      inArray(techdeckDocuments.minimumRole, documentVisibility(request)),
    )).limit(1);
    if (!row) throw new TechDeckOpsValidationError('REFERENCE_NOT_FOUND', 'documentId');
  }
  if (references.ticketId) {
    const [row] = await db.select({ id: techdeckTickets.id }).from(techdeckTickets).where(and(
      eq(techdeckTickets.tenantId, tenantId), eq(techdeckTickets.id, references.ticketId), isNull(techdeckTickets.deletedAt),
    )).limit(1);
    if (!row) throw new TechDeckOpsValidationError('REFERENCE_NOT_FOUND', 'ticketId');
  }
}

function parseDocument(raw: unknown, mode: 'create' | 'patch') {
  const body = techDeckObject(raw);
  rejectTechDeckServerOwned(body, ['id', 'tenantId', 'status', 'version', 'createdByUserId', 'updatedByUserId', 'reviewedByUserId', 'approvedByUserId', 'publishedByUserId', 'createdAt', 'updatedAt', 'archivedAt']);
  const title = mode === 'create' || 'title' in body ? techDeckText(body.title, 'title', 240, { required: true })! : undefined;
  const result = {
    directoryOrganizationId: nullableId(body.directoryOrganizationId, 'directoryOrganizationId'),
    directorySiteId: nullableId(body.directorySiteId, 'directorySiteId'),
    folderId: nullableId(body.folderId, 'folderId'),
    pageType: techDeckEnum(body.pageType, 'pageType', TECHDECK_DOCUMENT_TYPES, 'documentation'),
    title,
    slug: mode === 'create' ? techDeckSlug(body.slug, title) : ('slug' in body ? techDeckSlug(body.slug, title) : undefined),
    summary: techDeckText(body.summary, 'summary', 2_000, { nullable: true }) ?? null,
    content: 'content' in body || mode === 'create' ? sanitizeTechDeckContent(body.content ?? '', 'content') : undefined,
    minimumRole: techDeckEnum(body.minimumRole, 'minimumRole', TECHDECK_DOCUMENT_ROLES, 'member'),
    tags: strings(body.tags, 'tags'),
    changeNote: techDeckText(body.changeNote, 'changeNote', 500, { nullable: true }) ?? null,
  };
  if (mode === 'create') return result;
  const patch: Record<string, unknown> = {};
  for (const key of ['directoryOrganizationId', 'directorySiteId', 'folderId', 'pageType', 'title', 'slug', 'summary', 'content', 'minimumRole', 'tags'] as const) {
    if (key in body) patch[key] = result[key];
  }
  if (Object.keys(patch).length === 0) throw new TechDeckOpsValidationError('PATCH_EMPTY');
  return { patch, changeNote: result.changeNote, expectedVersion: parseTechDeckVersion(body).expectedVersion };
}

async function insertRevision(executor: any, document: typeof techdeckDocuments.$inferSelect, actorId: string, changeNote: string | null) {
  await executor.insert(techdeckDocumentRevisions).values({
    tenantId: document.tenantId,
    documentId: document.id,
    version: document.version,
    title: document.title,
    summary: document.summary,
    content: document.content,
    status: document.status,
    minimumRole: document.minimumRole,
    tags: document.tags,
    changeNote,
    createdByUserId: actorId,
  });
}

export async function registerTechDeckRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/modules/techdeck/workspace', { preHandler: [...readGuards] }, async (request) => {
    const tenantId = tenant(request);
    const visibility = documentVisibility(request);
    const [configurationItems, relationships, folders, documents, evidence, reports, timeEntries, comments] = await Promise.all([
      db.select().from(techdeckAssets).where(and(eq(techdeckAssets.tenantId, tenantId), isNull(techdeckAssets.deletedAt))).orderBy(desc(techdeckAssets.updatedAt)).limit(250),
      db.select().from(techdeckConfigurationRelationships).where(and(eq(techdeckConfigurationRelationships.tenantId, tenantId), isNull(techdeckConfigurationRelationships.deletedAt))).orderBy(desc(techdeckConfigurationRelationships.createdAt)).limit(500),
      db.select().from(techdeckDocumentFolders).where(and(eq(techdeckDocumentFolders.tenantId, tenantId), isNull(techdeckDocumentFolders.archivedAt))).orderBy(asc(techdeckDocumentFolders.name)).limit(250),
      db.select().from(techdeckDocuments).where(and(eq(techdeckDocuments.tenantId, tenantId), isNull(techdeckDocuments.archivedAt), inArray(techdeckDocuments.minimumRole, visibility))).orderBy(desc(techdeckDocuments.updatedAt)).limit(250),
      db.select().from(techdeckEvidence).where(and(eq(techdeckEvidence.tenantId, tenantId), isNull(techdeckEvidence.archivedAt))).orderBy(desc(techdeckEvidence.createdAt)).limit(250),
      db.select().from(techdeckReports).where(and(eq(techdeckReports.tenantId, tenantId), isNull(techdeckReports.archivedAt))).orderBy(desc(techdeckReports.createdAt)).limit(100),
      db.select().from(techdeckTimeEntries).where(and(eq(techdeckTimeEntries.tenantId, tenantId), isNull(techdeckTimeEntries.deletedAt))).orderBy(desc(techdeckTimeEntries.workedAt)).limit(250),
      db.select().from(techdeckTicketComments).where(and(eq(techdeckTicketComments.tenantId, tenantId), isNull(techdeckTicketComments.deletedAt))).orderBy(desc(techdeckTicketComments.createdAt)).limit(250),
    ]);
    const now = Date.now();
    const lifecycleDue = configurationItems.filter(item => [item.expirationDate, item.renewalDate, item.warrantyEndDate].some(value => value && value.getTime() <= now + 30 * 86_400_000));
    return {
      configurationItems, relationships, folders, documents, evidence, reports, timeEntries, comments,
      alerts: configurationItems.filter(item => ['warning', 'critical', 'offline'].includes(item.health)),
      lifecycleDue,
      incomplete: configurationItems.filter(item => !item.directoryOrganizationId || (!item.hostname && !item.ipAddress && !item.cidr && !item.serialNumber)),
      execution: { enabled: false, reason: 'Runbooks are documentation only; no approved signed endpoint-agent trust boundary exists.' },
    };
  });

  app.get('/v1/modules/techdeck/configuration-items', { preHandler: [...readGuards] }, async (request, reply) => {
    let limit;
    try { limit = pageLimit(request.query); } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    return db.select().from(techdeckAssets).where(and(eq(techdeckAssets.tenantId, tenant(request)), isNull(techdeckAssets.deletedAt))).orderBy(desc(techdeckAssets.updatedAt)).limit(limit);
  });

  app.get('/v1/modules/techdeck/configuration-items/:id', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const [item] = await db.select().from(techdeckAssets).where(and(eq(techdeckAssets.tenantId, tenantId), eq(techdeckAssets.id, id), isNull(techdeckAssets.deletedAt))).limit(1);
    if (!item) return notFound(reply, 'configuration item');
    const [relationships, attachments] = await Promise.all([
      db.select().from(techdeckConfigurationRelationships).where(and(eq(techdeckConfigurationRelationships.tenantId, tenantId), isNull(techdeckConfigurationRelationships.deletedAt), or(eq(techdeckConfigurationRelationships.sourceAssetId, id), eq(techdeckConfigurationRelationships.targetAssetId, id)))).orderBy(desc(techdeckConfigurationRelationships.createdAt)),
      techDeckModuleId().then(moduleId => listAttachments({ tenantId, moduleId, objectType: 'configuration_item', objectId: id })),
    ]);
    return { ...item, relationships, attachments };
  });

  app.post('/v1/modules/techdeck/configuration-items', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input;
    try { input = parseTechDeckAssetCreate(request.body); await assertDirectoryReferences(tenant(request), input.directoryOrganizationId, input.directorySiteId); }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const tenantId = tenant(request);
    const actorId = user(request);
    const created = await db.transaction(async tx => {
      const [item] = await tx.insert(techdeckAssets).values({ tenantId, createdByUserId: actorId, ...input }).returning();
      await audit(tx, { tenantId, userId: actorId, action: 'created', entityType: 'configuration_item', entityId: item.id, metadata: { type: item.type, health: item.health } });
      return item;
    });
    return reply.code(201).send(created);
  });

  app.patch('/v1/modules/techdeck/configuration-items/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const [current] = await db.select().from(techdeckAssets).where(and(
      eq(techdeckAssets.tenantId, tenantId), eq(techdeckAssets.id, id), isNull(techdeckAssets.deletedAt),
    )).limit(1);
    if (!current) return notFound(reply, 'configuration item');
    let input;
    try {
      input = parseTechDeckAssetPatch(request.body);
      if ('directoryOrganizationId' in input.patch || 'directorySiteId' in input.patch) {
        await assertDirectoryReferences(
          tenantId,
          ('directoryOrganizationId' in input.patch ? input.patch.directoryOrganizationId : current.directoryOrganizationId) as string | null,
          ('directorySiteId' in input.patch ? input.patch.directorySiteId : current.directorySiteId) as string | null,
        );
      }
    } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const actorId = user(request);
    const [updated] = await db.transaction(async tx => {
      const rows = await tx.update(techdeckAssets).set({ ...input.patch, version: sql`${techdeckAssets.version} + 1`, updatedAt: new Date() }).where(and(
        eq(techdeckAssets.tenantId, tenantId), eq(techdeckAssets.id, id), eq(techdeckAssets.version, input.expectedVersion), isNull(techdeckAssets.deletedAt),
      )).returning();
      if (!rows[0]) return [];
      await audit(tx, { tenantId, userId: actorId, action: 'updated', entityType: 'configuration_item', entityId: id, metadata: { changedFields: Object.keys(input.patch) } });
      return rows;
    });
    if (!updated) return reply.code(409).send({ error: 'Configuration item changed or was not found', code: 'CONFIGURATION_ITEM_VERSION_CONFLICT' });
    return updated;
  });

  app.post('/v1/modules/techdeck/relationships', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input;
    try {
      const body = techDeckObject(request.body);
      input = {
        sourceAssetId: techDeckText(body.sourceAssetId, 'sourceAssetId', 36, { required: true })!,
        targetAssetId: techDeckText(body.targetAssetId, 'targetAssetId', 36, { required: true })!,
        relationshipType: techDeckEnum(body.relationshipType, 'relationshipType', TECHDECK_RELATIONSHIP_TYPES, 'depends_on'),
        notes: techDeckText(body.notes, 'notes', 2_000, { nullable: true }) ?? null,
      };
      if (input.sourceAssetId === input.targetAssetId) throw new TechDeckOpsValidationError('RELATIONSHIP_SELF_FORBIDDEN', 'targetAssetId');
    } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const tenantId = tenant(request);
    const actorId = user(request);
    const all = await db.select({ id: techdeckAssets.id }).from(techdeckAssets).where(and(eq(techdeckAssets.tenantId, tenantId), inArray(techdeckAssets.id, [input.sourceAssetId, input.targetAssetId]), isNull(techdeckAssets.deletedAt)));
    if (all.length !== 2) return notFound(reply, 'configuration item');
    const created = await db.transaction(async tx => {
      const [relationship] = await tx.insert(techdeckConfigurationRelationships).values({ tenantId, createdByUserId: actorId, ...input }).returning();
      await audit(tx, { tenantId, userId: actorId, action: 'linked', entityType: 'configuration_item', entityId: input.sourceAssetId, metadata: { targetAssetId: input.targetAssetId, relationshipType: input.relationshipType } });
      return relationship;
    });
    return reply.code(201).send(created);
  });

  app.delete('/v1/modules/techdeck/relationships/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const [deleted] = await db.update(techdeckConfigurationRelationships).set({ deletedAt: new Date() }).where(and(eq(techdeckConfigurationRelationships.tenantId, tenantId), eq(techdeckConfigurationRelationships.id, id), isNull(techdeckConfigurationRelationships.deletedAt))).returning();
    if (!deleted) return notFound(reply, 'relationship');
    await audit(db, { tenantId, userId: user(request), action: 'unlinked', entityType: 'configuration_relationship', entityId: id });
    return { ok: true };
  });

  app.post('/v1/modules/techdeck/folders', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input;
    try {
      const body = techDeckObject(request.body);
      input = { directoryOrganizationId: nullableId(body.directoryOrganizationId, 'directoryOrganizationId'), parentId: nullableId(body.parentId, 'parentId'), name: techDeckText(body.name, 'name', 160, { required: true })! };
      await assertDirectoryReferences(tenant(request), input.directoryOrganizationId, null);
    } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const tenantId = tenant(request);
    const actorId = user(request);
    if (input.parentId) {
      const [parent] = await db.select({ id: techdeckDocumentFolders.id }).from(techdeckDocumentFolders).where(and(eq(techdeckDocumentFolders.tenantId, tenantId), eq(techdeckDocumentFolders.id, input.parentId), isNull(techdeckDocumentFolders.archivedAt))).limit(1);
      if (!parent) return notFound(reply, 'folder');
    }
    const [folder] = await db.insert(techdeckDocumentFolders).values({ tenantId, createdByUserId: actorId, ...input }).returning();
    await audit(db, { tenantId, userId: actorId, action: 'created', entityType: 'folder', entityId: folder.id });
    return reply.code(201).send(folder);
  });

  app.get('/v1/modules/techdeck/documents', { preHandler: [...readGuards] }, async (request, reply) => {
    let limit;
    try { limit = pageLimit(request.query); } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    return db.select().from(techdeckDocuments).where(and(eq(techdeckDocuments.tenantId, tenant(request)), isNull(techdeckDocuments.archivedAt), inArray(techdeckDocuments.minimumRole, documentVisibility(request)))).orderBy(desc(techdeckDocuments.updatedAt)).limit(limit);
  });

  app.get('/v1/modules/techdeck/documents/:id', { preHandler: [...readGuards] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const [document] = await db.select().from(techdeckDocuments).where(and(eq(techdeckDocuments.tenantId, tenantId), eq(techdeckDocuments.id, id), isNull(techdeckDocuments.archivedAt), inArray(techdeckDocuments.minimumRole, documentVisibility(request)))).limit(1);
    if (!document) return notFound(reply, 'document');
    const moduleId = await techDeckModuleId();
    const [revisions, outboundLinks, inboundLinks, attachments] = await Promise.all([
      db.select().from(techdeckDocumentRevisions).where(and(eq(techdeckDocumentRevisions.tenantId, tenantId), eq(techdeckDocumentRevisions.documentId, id))).orderBy(desc(techdeckDocumentRevisions.version)),
      db.select().from(techdeckDocumentLinks).where(and(eq(techdeckDocumentLinks.tenantId, tenantId), eq(techdeckDocumentLinks.sourceDocumentId, id))),
      db.select().from(techdeckDocumentLinks).where(and(eq(techdeckDocumentLinks.tenantId, tenantId), eq(techdeckDocumentLinks.targetDocumentId, id))),
      listAttachments({ tenantId, moduleId, objectType: 'document', objectId: id }),
    ]);
    return { ...document, revisions, outboundLinks, inboundLinks, attachments };
  });

  app.post('/v1/modules/techdeck/documents', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input: any;
    try {
      input = parseDocument(request.body, 'create');
      await assertDirectoryReferences(tenant(request), input.directoryOrganizationId, input.directorySiteId);
      await assertTechDeckReferences(request, { folderId: input.folderId });
    }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    if (!documentVisibility(request).includes(input.minimumRole)) return reply.code(403).send({ error: 'Document visibility exceeds caller role', code: 'DOCUMENT_ROLE_FORBIDDEN' });
    const tenantId = tenant(request);
    const actorId = user(request);
    const created = await db.transaction(async tx => {
      const { changeNote, ...documentValues } = input;
      const [document] = await tx.insert(techdeckDocuments).values({ tenantId, createdByUserId: actorId, updatedByUserId: actorId, ...documentValues }).returning();
      await insertRevision(tx, document, actorId, changeNote || 'Initial version');
      await audit(tx, { tenantId, userId: actorId, action: 'created', entityType: 'document', entityId: document.id, metadata: { pageType: document.pageType, status: document.status } });
      return document;
    });
    return reply.code(201).send(created);
  });

  app.patch('/v1/modules/techdeck/documents/:id', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input: any;
    try { input = parseDocument(request.body, 'patch'); }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const actorId = user(request);
    const [current] = await db.select().from(techdeckDocuments).where(and(
      eq(techdeckDocuments.tenantId, tenantId), eq(techdeckDocuments.id, id), isNull(techdeckDocuments.archivedAt),
      inArray(techdeckDocuments.minimumRole, documentVisibility(request)),
    )).limit(1);
    if (!current) return notFound(reply, 'document');
    if (current.status !== 'draft') return reply.code(409).send({ error: 'Only draft documents can be edited', code: 'DOCUMENT_NOT_DRAFT' });
    if (typeof input.patch.minimumRole === 'string' && !documentVisibility(request).includes(input.patch.minimumRole)) return reply.code(403).send({ error: 'Document visibility exceeds caller role', code: 'DOCUMENT_ROLE_FORBIDDEN' });
    const organizationId = 'directoryOrganizationId' in input.patch ? input.patch.directoryOrganizationId : current.directoryOrganizationId;
    const siteId = 'directorySiteId' in input.patch ? input.patch.directorySiteId : current.directorySiteId;
    try {
      await assertDirectoryReferences(tenantId, organizationId, siteId);
      await assertTechDeckReferences(request, { folderId: 'folderId' in input.patch ? input.patch.folderId : current.folderId });
    }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const updated = await db.transaction(async tx => {
      const [document] = await tx.update(techdeckDocuments).set({ ...input.patch, version: sql`${techdeckDocuments.version} + 1`, updatedByUserId: actorId, updatedAt: new Date() }).where(and(eq(techdeckDocuments.tenantId, tenantId), eq(techdeckDocuments.id, id), eq(techdeckDocuments.version, input.expectedVersion), eq(techdeckDocuments.status, 'draft'), isNull(techdeckDocuments.archivedAt), inArray(techdeckDocuments.minimumRole, documentVisibility(request)))).returning();
      if (!document) return null;
      await insertRevision(tx, document, actorId, input.changeNote);
      await audit(tx, { tenantId, userId: actorId, action: 'updated', entityType: 'document', entityId: id, metadata: { changedFields: Object.keys(input.patch), version: document.version } });
      return document;
    });
    if (!updated) return reply.code(409).send({ error: 'Document changed; reload and retry', code: 'DOCUMENT_VERSION_CONFLICT' });
    return updated;
  });

  const transition = (path: string, guards: typeof writeGuards, from: string, to: string, actorColumn: 'reviewedByUserId' | 'approvedByUserId' | 'publishedByUserId', dateColumn: 'reviewedAt' | 'approvedAt' | 'publishedAt') => {
    app.post(path, { preHandler: [...guards] }, async (request, reply) => {
      let expectedVersion;
      try { expectedVersion = parseTechDeckVersion(request.body).expectedVersion; }
      catch (error) { if (validationFailure(reply, error)) return; throw error; }
      const { id } = request.params as { id: string };
      const tenantId = tenant(request);
      const actorId = user(request);
      const [document] = await db.transaction(async tx => {
        const rows = await tx.update(techdeckDocuments).set({ status: to, [actorColumn]: actorId, [dateColumn]: new Date(), version: sql`${techdeckDocuments.version} + 1`, updatedByUserId: actorId, updatedAt: new Date() }).where(and(eq(techdeckDocuments.tenantId, tenantId), eq(techdeckDocuments.id, id), eq(techdeckDocuments.status, from), eq(techdeckDocuments.version, expectedVersion), isNull(techdeckDocuments.archivedAt), inArray(techdeckDocuments.minimumRole, documentVisibility(request)))).returning();
        if (!rows[0]) return [];
        await audit(tx, { tenantId, userId: actorId, action: to, entityType: 'document', entityId: id, metadata: { fromStatus: from, toStatus: to } });
        return rows;
      });
      if (!document) return reply.code(409).send({ error: 'Document state or version changed', code: 'DOCUMENT_TRANSITION_CONFLICT' });
      return document;
    });
  };
  transition('/v1/modules/techdeck/documents/:id/review', writeGuards, 'draft', 'in_review', 'reviewedByUserId', 'reviewedAt');
  transition('/v1/modules/techdeck/documents/:id/approve', adminGuards, 'in_review', 'approved', 'approvedByUserId', 'approvedAt');
  transition('/v1/modules/techdeck/documents/:id/publish', adminGuards, 'approved', 'published', 'publishedByUserId', 'publishedAt');

  app.post('/v1/modules/techdeck/documents/:id/links', { preHandler: [...writeGuards] }, async (request, reply) => {
    let targetDocumentId: string;
    let label: string | null;
    try { const body = techDeckObject(request.body); targetDocumentId = techDeckText(body.targetDocumentId, 'targetDocumentId', 36, { required: true })!; label = techDeckText(body.label, 'label', 160, { nullable: true }) ?? null; }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const { id } = request.params as { id: string };
    if (id === targetDocumentId) return reply.code(400).send({ error: 'A document cannot link to itself', code: 'DOCUMENT_LINK_SELF_FORBIDDEN' });
    const tenantId = tenant(request);
    const documents = await db.select({ id: techdeckDocuments.id }).from(techdeckDocuments).where(and(eq(techdeckDocuments.tenantId, tenantId), inArray(techdeckDocuments.id, [id, targetDocumentId]), isNull(techdeckDocuments.archivedAt), inArray(techdeckDocuments.minimumRole, documentVisibility(request))));
    if (documents.length !== 2) return notFound(reply, 'document');
    const [link] = await db.insert(techdeckDocumentLinks).values({ tenantId, sourceDocumentId: id, targetDocumentId, label, createdByUserId: user(request) }).returning();
    await audit(db, { tenantId, userId: user(request), action: 'linked', entityType: 'document', entityId: id, metadata: { targetDocumentId } });
    return reply.code(201).send(link);
  });

  app.post('/v1/modules/techdeck/evidence', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input;
    try {
      const body = techDeckObject(request.body);
      input = {
        directoryOrganizationId: nullableId(body.directoryOrganizationId, 'directoryOrganizationId'), directorySiteId: nullableId(body.directorySiteId, 'directorySiteId'),
        configurationItemId: nullableId(body.configurationItemId, 'configurationItemId'), documentId: nullableId(body.documentId, 'documentId'), ticketId: nullableId(body.ticketId, 'ticketId'),
        title: techDeckText(body.title, 'title', 240, { required: true })!, evidenceType: techDeckEnum(body.evidenceType, 'evidenceType', TECHDECK_EVIDENCE_TYPES, 'observation'),
        summary: techDeckText(body.summary, 'summary', 10_000, { nullable: true }) ?? null, sourceReference: techDeckText(body.sourceReference, 'sourceReference', 1_000, { nullable: true }) ?? null,
        observedAt: techDeckDate(body.observedAt, 'observedAt') ?? null, tags: strings(body.tags, 'tags'),
      };
      await assertDirectoryReferences(tenant(request), input.directoryOrganizationId, input.directorySiteId);
      await assertTechDeckReferences(request, { configurationItemId: input.configurationItemId, documentId: input.documentId, ticketId: input.ticketId });
    } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const tenantId = tenant(request);
    const actorId = user(request);
    const [evidence] = await db.insert(techdeckEvidence).values({ tenantId, createdByUserId: actorId, ...input }).returning();
    await audit(db, { tenantId, userId: actorId, action: 'created', entityType: 'evidence', entityId: evidence.id, metadata: { evidenceType: evidence.evidenceType } });
    return reply.code(201).send(evidence);
  });

  app.post('/v1/modules/techdeck/reports', { preHandler: [...writeGuards] }, async (request, reply) => {
    let name: string;
    let reportType: string;
    try { const body = techDeckObject(request.body); name = techDeckText(body.name, 'name', 240, { required: true })!; reportType = techDeckEnum(body.reportType, 'reportType', TECHDECK_REPORT_TYPES); }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const tenantId = tenant(request);
    const [assets, tickets, evidence, time] = await Promise.all([
      db.select({ type: techdeckAssets.type, status: techdeckAssets.status, health: techdeckAssets.health }).from(techdeckAssets).where(and(eq(techdeckAssets.tenantId, tenantId), isNull(techdeckAssets.deletedAt))),
      db.select({ status: techdeckTickets.status, priority: techdeckTickets.priority }).from(techdeckTickets).where(and(eq(techdeckTickets.tenantId, tenantId), isNull(techdeckTickets.deletedAt))),
      db.select({ id: techdeckEvidence.id }).from(techdeckEvidence).where(and(eq(techdeckEvidence.tenantId, tenantId), isNull(techdeckEvidence.archivedAt))),
      db.select({ minutes: techdeckTimeEntries.minutes, billable: techdeckTimeEntries.billable }).from(techdeckTimeEntries).where(and(eq(techdeckTimeEntries.tenantId, tenantId), isNull(techdeckTimeEntries.deletedAt))),
    ]);
    const countBy = (values: string[]) => values.sort().reduce<Record<string, number>>((acc, value) => ({ ...acc, [value]: (acc[value] ?? 0) + 1 }), {});
    const snapshot = {
      reportType,
      configurationItems: { total: assets.length, byType: countBy(assets.map(row => row.type)), byStatus: countBy(assets.map(row => row.status)), byHealth: countBy(assets.map(row => row.health)) },
      tickets: { total: tickets.length, byStatus: countBy(tickets.map(row => row.status)), byPriority: countBy(tickets.map(row => row.priority)) },
      evidenceCount: evidence.length,
      time: { entries: time.length, minutes: time.reduce((sum, row) => sum + row.minutes, 0), billableMinutes: time.filter(row => row.billable).reduce((sum, row) => sum + row.minutes, 0) },
    };
    const sha256 = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    const [report] = await db.insert(techdeckReports).values({ tenantId, name, reportType, filters: {}, snapshot, sha256, createdByUserId: user(request) }).returning();
    await audit(db, { tenantId, userId: user(request), action: 'generated', entityType: 'report', entityId: report.id, metadata: { reportType, sha256 } });
    return reply.code(201).send(report);
  });

  app.post('/v1/modules/techdeck/time', { preHandler: [...writeGuards] }, async (request, reply) => {
    let input;
    try {
      const body = techDeckObject(request.body);
      input = { ticketId: nullableId(body.ticketId, 'ticketId'), directoryOrganizationId: nullableId(body.directoryOrganizationId, 'directoryOrganizationId'), directorySiteId: nullableId(body.directorySiteId, 'directorySiteId'), configurationItemId: nullableId(body.configurationItemId, 'configurationItemId'), workedAt: techDeckDate(body.workedAt, 'workedAt'), minutes: positiveInteger(body.minutes, 'minutes', 1440), billable: body.billable === true, notes: techDeckText(body.notes, 'notes', 5_000, { nullable: true }) ?? null };
      if (!input.workedAt) throw new TechDeckOpsValidationError('FIELD_REQUIRED', 'workedAt');
      await assertDirectoryReferences(tenant(request), input.directoryOrganizationId, input.directorySiteId);
      await assertTechDeckReferences(request, { configurationItemId: input.configurationItemId, ticketId: input.ticketId });
    } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const tenantId = tenant(request);
    const actorId = user(request);
    const [entry] = await db.insert(techdeckTimeEntries).values({ tenantId, userId: actorId, ...input, workedAt: input.workedAt! }).returning();
    await audit(db, { tenantId, userId: actorId, action: 'created', entityType: 'time_entry', entityId: entry.id, metadata: { minutes: entry.minutes, billable: entry.billable } });
    return reply.code(201).send(entry);
  });

  app.post('/v1/modules/techdeck/tickets/:id/comments', { preHandler: [...writeGuards] }, async (request, reply) => {
    let body: string;
    try { body = techDeckText(techDeckObject(request.body).body, 'body', 10_000, { required: true })!; }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const { id } = request.params as { id: string };
    const tenantId = tenant(request);
    const [ticket] = await db.select({ id: techdeckTickets.id }).from(techdeckTickets).where(and(eq(techdeckTickets.tenantId, tenantId), eq(techdeckTickets.id, id), isNull(techdeckTickets.deletedAt))).limit(1);
    if (!ticket) return notFound(reply, 'ticket');
    const [comment] = await db.insert(techdeckTicketComments).values({ tenantId, ticketId: id, authorUserId: user(request), body }).returning();
    await audit(db, { tenantId, userId: user(request), action: 'commented', entityType: 'ticket', entityId: id, metadata: { commentId: comment.id } });
    return reply.code(201).send(comment);
  });

  app.get('/v1/modules/techdeck/attachments/:objectType/:objectId', { preHandler: [...readGuards] }, async (request, reply) => {
    const { objectType, objectId } = request.params as { objectType: string; objectId: string };
    if (!ATTACHMENT_OBJECTS.has(objectType) || !await attachmentObjectExists(request, objectType, objectId)) return notFound(reply, 'attachment object');
    return listAttachments({ tenantId: tenant(request), moduleId: await techDeckModuleId(), objectType, objectId });
  });

  app.post('/v1/modules/techdeck/attachments/:objectType/:objectId', { preHandler: [...writeGuards] }, async (request, reply) => {
    const { objectType, objectId } = request.params as { objectType: string; objectId: string };
    if (!ATTACHMENT_OBJECTS.has(objectType) || !await attachmentObjectExists(request, objectType, objectId)) return notFound(reply, 'attachment object');
    let originalName: string;
    let declaredMimeType: string | null;
    let content: Buffer;
    try {
      const body = techDeckObject(request.body);
      originalName = techDeckText(body.originalName, 'originalName', 240, { required: true })!;
      declaredMimeType = techDeckText(body.declaredMimeType, 'declaredMimeType', 120, { nullable: true }) ?? null;
      const base64 = techDeckText(body.contentBase64, 'contentBase64', 40_000_000, { required: true })!;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) throw new TechDeckOpsValidationError('ATTACHMENT_BASE64_INVALID', 'contentBase64');
      content = Buffer.from(base64, 'base64');
    } catch (error) { if (validationFailure(reply, error)) return; throw error; }
    try {
      const attachment = await createAttachment({ tenantId: tenant(request), moduleId: await techDeckModuleId(), objectType, objectId, originalName, declaredMimeType, content, createdByUserId: user(request) });
      await audit(db, { tenantId: tenant(request), userId: user(request), action: 'attachment_added', entityType: objectType, entityId: objectId, metadata: { attachmentId: attachment.id, originalName, sizeBytes: content.length } });
      return reply.code(201).send(attachment);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code) return reply.code(400).send({ error: (error as Error).message, code });
      throw error;
    }
  });

  app.get('/v1/modules/techdeck/attachments/:objectType/:objectId/:attachmentId/content', { preHandler: [...readGuards] }, async (request, reply) => {
    const { objectType, objectId, attachmentId } = request.params as { objectType: string; objectId: string; attachmentId: string };
    if (!ATTACHMENT_OBJECTS.has(objectType) || !await attachmentObjectExists(request, objectType, objectId)) return notFound(reply, 'attachment object');
    try {
      const result = await getAttachmentContent({ tenantId: tenant(request), moduleId: await techDeckModuleId(), attachmentId, objectType, objectId });
      if (!result) return notFound(reply, 'attachment');
      return reply.header('content-type', String(result.metadata.detected_mime_type)).header('content-disposition', `attachment; filename="${String(result.metadata.original_name).replace(/["\r\n]/g, '')}"`).send(result.content);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code) return reply.code(code === 'ATTACHMENT_QUARANTINED' ? 403 : 409).send({ error: (error as Error).message, code });
      throw error;
    }
  });

  app.delete('/v1/modules/techdeck/attachments/:objectType/:objectId/:attachmentId', { preHandler: [...writeGuards] }, async (request, reply) => {
    let version;
    try { version = parseTechDeckVersion(request.body).expectedVersion; }
    catch (error) { if (validationFailure(reply, error)) return; throw error; }
    const { objectType, objectId, attachmentId } = request.params as { objectType: string; objectId: string; attachmentId: string };
    if (!ATTACHMENT_OBJECTS.has(objectType) || !await attachmentObjectExists(request, objectType, objectId)) return notFound(reply, 'attachment object');
    const deleted = await softDeleteAttachment({ tenantId: tenant(request), moduleId: await techDeckModuleId(), attachmentId, deletedByUserId: user(request), version, objectType, objectId });
    if (!deleted) return reply.code(409).send({ error: 'Attachment changed or was not found', code: 'ATTACHMENT_VERSION_CONFLICT' });
    await audit(db, { tenantId: tenant(request), userId: user(request), action: 'attachment_deleted', entityType: objectType, entityId: objectId, metadata: { attachmentId } });
    return deleted;
  });
}
