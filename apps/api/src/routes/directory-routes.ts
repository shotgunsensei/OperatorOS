import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  archiveContact,
  archiveOrganization,
  archiveRelationship,
  archiveSite,
  associateOrganizationContact,
  associateSiteContact,
  createContact,
  createOrganization,
  createRelationship,
  createSite,
  createTag,
  DirectoryFailure,
  getOrganization,
  isDirectoryModuleSlug,
  listContacts,
  listOrganizations,
  listSites,
  listTags,
  removeOrganizationContact,
  removeSiteContact,
  assignTag,
  updateContact,
  updateOrganization,
  updateSite,
  upsertModuleProfile,
  type DirectoryActor,
  type DirectoryModuleSlug,
} from '../lib/business-directory.js';
import {
  requireTenantAdmin,
  requireTenantMember,
  requireTenantModuleAccess,
  requireTenantModuleWriteAccess,
} from '../lib/tenant-auth.js';

const idSchema = z.string().uuid();
const expectedVersionSchema = z.object({ expectedVersion: z.number().int().positive() });
const organizationSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(['customer', 'client', 'vendor', 'partner', 'facility', 'other']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  website: z.string().trim().url().max(500).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
});
const organizationUpdateSchema = organizationSchema.partial().extend({ expectedVersion: z.number().int().positive() });
const contactSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(320).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  title: z.string().trim().max(160).nullable().optional(),
  status: z.enum(['active', 'inactive']).optional(),
});
const contactUpdateSchema = contactSchema.partial().extend({ expectedVersion: z.number().int().positive() });
const addressSchema = z.object({
  label: z.string().trim().max(100).nullable().optional(),
  line1: z.string().trim().min(2).max(200),
  line2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(120),
  region: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(2).max(24),
  countryCode: z.string().trim().length(2).optional(),
});
const siteSchema = z.object({
  organizationId: idSchema,
  name: z.string().trim().min(2).max(200),
  type: z.enum(['headquarters', 'office', 'facility', 'service', 'remote', 'other']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  timezone: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  address: addressSchema.nullable().optional(),
});
const siteUpdateSchema = siteSchema.omit({ organizationId: true }).partial().extend({ expectedVersion: z.number().int().positive() });
const associationSchema = z.object({
  contactId: idSchema,
  role: z.string().trim().max(120).nullable().optional(),
  isPrimary: z.boolean().optional(),
});
const relationshipSchema = z.object({
  fromOrganizationId: idSchema,
  toOrganizationId: idSchema,
  type: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(2000).nullable().optional(),
});
const tagSchema = z.object({ name: z.string().trim().min(1).max(80), color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional() });
const tagAssignmentSchema = z.object({ entityType: z.enum(['organization', 'contact', 'site']), entityId: idSchema });

function moduleSlug(request: FastifyRequest): DirectoryModuleSlug | null {
  const value = (request.params as { moduleSlug?: string })?.moduleSlug;
  return value && isDirectoryModuleSlug(value) ? value : null;
}

async function requireDirectoryModule(request: FastifyRequest, reply: FastifyReply) {
  const slug = moduleSlug(request);
  if (!slug) return reply.code(404).send({ error: 'Directory module not found', code: 'DIRECTORY_MODULE_NOT_FOUND' });
  return requireTenantModuleAccess(slug)(request, reply);
}

const readGuards = [requireTenantMember, requireDirectoryModule];
const writeGuards = [...readGuards, requireTenantModuleWriteAccess];
const adminGuards = [...readGuards, requireTenantAdmin, requireTenantModuleWriteAccess];

function actor(request: FastifyRequest): DirectoryActor {
  const ctx = (request as any).tenantContext;
  const user = (request as any).user;
  return { tenantId: ctx.tenantId, userId: user.id, moduleSlug: moduleSlug(request)! };
}

function parse<S extends z.ZodTypeAny>(schema: S, value: unknown, reply: FastifyReply): z.output<S> | undefined {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  reply.code(422).send({
    error: 'Directory request validation failed',
    code: 'DIRECTORY_VALIDATION_FAILED',
    fields: result.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })),
  });
  return undefined;
}

function pageQuery(request: FastifyRequest, reply: FastifyReply) {
  const schema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
    search: z.string().trim().max(200).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    includeArchived: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  }).passthrough();
  return parse(schema, request.query ?? {}, reply);
}

async function respond(reply: FastifyReply, operation: () => Promise<unknown>, successCode = 200) {
  try {
    const result = await operation();
    return reply.code(successCode).send(result);
  } catch (error) {
    if (error instanceof DirectoryFailure) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code, ...error.safeFields });
    }
    throw error;
  }
}

export async function registerDirectoryRoutes(app: FastifyInstance) {
  app.get('/v1/modules/:moduleSlug/directory/organizations', { preHandler: readGuards }, async (request, reply) => {
    const query = pageQuery(request, reply); if (!query) return;
    const extra = request.query as Record<string, string | undefined>;
    const sort = parse(z.enum(['name', 'createdAt', 'updatedAt']).optional(), extra.sort, reply); if (reply.sent) return;
    const direction = parse(z.enum(['asc', 'desc']).optional(), extra.direction, reply); if (reply.sent) return;
    const type = parse(z.enum(['customer', 'client', 'vendor', 'partner', 'facility', 'other']).optional(), extra.type, reply); if (reply.sent) return;
    return respond(reply, () => listOrganizations(actor(request), { page: query, search: query.search, status: query.status, includeArchived: query.includeArchived, type, sort, direction }));
  });

  app.post('/v1/modules/:moduleSlug/directory/organizations', { preHandler: writeGuards }, async (request, reply) => {
    const input = parse(organizationSchema, request.body, reply); if (!input) return;
    return respond(reply, () => createOrganization(actor(request), input), 201);
  });

  app.get('/v1/modules/:moduleSlug/directory/organizations/:id', { preHandler: readGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); if (!id) return;
    return respond(reply, () => getOrganization(actor(request), id));
  });

  app.patch('/v1/modules/:moduleSlug/directory/organizations/:id', { preHandler: writeGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(organizationUpdateSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => updateOrganization(actor(request), id, input));
  });

  app.delete('/v1/modules/:moduleSlug/directory/organizations/:id', { preHandler: adminGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(expectedVersionSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => archiveOrganization(actor(request), id, input.expectedVersion));
  });

  app.get('/v1/modules/:moduleSlug/directory/contacts', { preHandler: readGuards }, async (request, reply) => {
    const query = pageQuery(request, reply); if (!query) return;
    return respond(reply, () => listContacts(actor(request), { page: query, search: query.search, status: query.status, includeArchived: query.includeArchived }));
  });

  app.post('/v1/modules/:moduleSlug/directory/contacts', { preHandler: writeGuards }, async (request, reply) => {
    const input = parse(contactSchema, request.body, reply); if (!input) return;
    return respond(reply, () => createContact(actor(request), input), 201);
  });

  app.patch('/v1/modules/:moduleSlug/directory/contacts/:id', { preHandler: writeGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(contactUpdateSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => updateContact(actor(request), id, input));
  });

  app.delete('/v1/modules/:moduleSlug/directory/contacts/:id', { preHandler: adminGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(expectedVersionSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => archiveContact(actor(request), id, input.expectedVersion));
  });

  app.get('/v1/modules/:moduleSlug/directory/sites', { preHandler: readGuards }, async (request, reply) => {
    const query = pageQuery(request, reply); if (!query) return;
    const organizationId = parse(idSchema.optional(), (request.query as any)?.organizationId, reply); if (reply.sent) return;
    return respond(reply, () => listSites(actor(request), { page: query, search: query.search, status: query.status, includeArchived: query.includeArchived, organizationId }));
  });

  app.post('/v1/modules/:moduleSlug/directory/sites', { preHandler: writeGuards }, async (request, reply) => {
    const input = parse(siteSchema, request.body, reply); if (!input) return;
    return respond(reply, () => createSite(actor(request), input), 201);
  });

  app.patch('/v1/modules/:moduleSlug/directory/sites/:id', { preHandler: writeGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(siteUpdateSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => updateSite(actor(request), id, input));
  });

  app.delete('/v1/modules/:moduleSlug/directory/sites/:id', { preHandler: adminGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(expectedVersionSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => archiveSite(actor(request), id, input.expectedVersion));
  });

  app.post('/v1/modules/:moduleSlug/directory/organizations/:id/contacts', { preHandler: writeGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(associationSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => associateOrganizationContact(actor(request), id, input), 201);
  });

  app.delete('/v1/modules/:moduleSlug/directory/organizations/:id/contacts/:contactId', { preHandler: adminGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const contactId = parse(idSchema, (request.params as any).contactId, reply); if (!id || !contactId) return;
    return respond(reply, () => removeOrganizationContact(actor(request), id, contactId));
  });

  app.post('/v1/modules/:moduleSlug/directory/sites/:id/contacts', { preHandler: writeGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(associationSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => associateSiteContact(actor(request), id, input), 201);
  });

  app.delete('/v1/modules/:moduleSlug/directory/sites/:id/contacts/:contactId', { preHandler: adminGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const contactId = parse(idSchema, (request.params as any).contactId, reply); if (!id || !contactId) return;
    return respond(reply, () => removeSiteContact(actor(request), id, contactId));
  });

  app.post('/v1/modules/:moduleSlug/directory/relationships', { preHandler: writeGuards }, async (request, reply) => {
    const input = parse(relationshipSchema, request.body, reply); if (!input) return;
    return respond(reply, () => createRelationship(actor(request), input), 201);
  });

  app.delete('/v1/modules/:moduleSlug/directory/relationships/:id', { preHandler: adminGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(expectedVersionSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => archiveRelationship(actor(request), id, input.expectedVersion));
  });

  app.get('/v1/modules/:moduleSlug/directory/tags', { preHandler: readGuards }, async (request, reply) => respond(reply, async () => ({ tags: await listTags(actor(request)) })));

  app.post('/v1/modules/:moduleSlug/directory/tags', { preHandler: writeGuards }, async (request, reply) => {
    const input = parse(tagSchema, request.body, reply); if (!input) return;
    return respond(reply, () => createTag(actor(request), input), 201);
  });

  app.post('/v1/modules/:moduleSlug/directory/tags/:id/assignments', { preHandler: writeGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply); const input = parse(tagAssignmentSchema, request.body, reply); if (!id || !input) return;
    return respond(reply, () => assignTag(actor(request), id, input), 201);
  });

  app.put('/v1/modules/:moduleSlug/directory/organizations/:id/profile', { preHandler: writeGuards }, async (request, reply) => {
    const id = parse(idSchema, (request.params as any).id, reply);
    const input = parse(z.record(z.string(), z.unknown()), request.body, reply); if (!id || !input) return;
    return respond(reply, () => upsertModuleProfile(actor(request), id, input));
  });
}
