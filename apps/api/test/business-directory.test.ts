process.env.SESSION_SECRET ||= 'operatoros-business-directory-test-secret-v1';

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq } from 'drizzle-orm';
import { db } from '../src/db.js';
import {
  activityFeed, directoryAddresses, directoryContacts, directoryOrganizationContacts,
  directoryOrganizations, directoryRelationships, directorySiteContacts, directorySites,
  directoryTagAssignments, directoryTags, pulsedeskServiceClientProfiles,
  techdeckManagedClientProfiles, tenantModules, tenantUserModuleAccess, tenantUsers,
  tradeflowkitCustomerProfiles,
} from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any;
let ownerA: any;
let ownerB: any;
let admin: any;
let member: any;
let viewer: any;
let moduleViewer: any;
let modules: any[] = [];
let signToken: typeof import('../src/lib/auth.js').signToken;

function headers(user: any, tenantId: string) {
  return {
    authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`,
    'x-tenant-id': tenantId,
  };
}

function url(slug: string, path = '') { return `/v1/modules/${slug}/directory${path}`; }

before(async () => {
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  [ownerA, ownerB, admin, member, viewer, moduleViewer] = await Promise.all([
    createTestUser(), createTestUser(), createTestUser(), createTestUser(), createTestUser(), createTestUser(),
  ]);
  modules = await Promise.all(['tradeflowkit', 'techdeck', 'pulsedesk'].map(slug => createTestModule(slug)));
  await db.insert(tenantUsers).values([
    { tenantId: ownerA.currentTenantId, userId: admin.id, role: 'admin' },
    { tenantId: ownerA.currentTenantId, userId: member.id, role: 'member' },
    { tenantId: ownerA.currentTenantId, userId: viewer.id, role: 'viewer' },
    { tenantId: ownerA.currentTenantId, userId: moduleViewer.id, role: 'member' },
  ]);
  await db.insert(tenantModules).values(modules.flatMap(module => [
    { tenantId: ownerA.currentTenantId, moduleId: module.id, status: 'enabled' as const, source: 'admin' as const, allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: module.id, status: 'enabled' as const, source: 'admin' as const, allowAllMembers: true },
  ]));
  await db.insert(tenantUserModuleAccess).values(modules.map(module => ({
    tenantId: ownerA.currentTenantId, userId: moduleViewer.id, moduleId: module.id, accessLevel: 'viewer' as const,
  })));

  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerDirectoryRoutes } = await import('../src/routes/directory-routes.js');
  app = Fastify();
  await app.register(cookie);
  await registerDirectoryRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const tenantId of [ownerA?.currentTenantId, ownerB?.currentTenantId].filter(Boolean)) {
    try { await db.delete(directoryTagAssignments).where(eq(directoryTagAssignments.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryTags).where(eq(directoryTags.tenantId, tenantId)); } catch {}
    try { await db.delete(pulsedeskServiceClientProfiles).where(eq(pulsedeskServiceClientProfiles.tenantId, tenantId)); } catch {}
    try { await db.delete(techdeckManagedClientProfiles).where(eq(techdeckManagedClientProfiles.tenantId, tenantId)); } catch {}
    try { await db.delete(tradeflowkitCustomerProfiles).where(eq(tradeflowkitCustomerProfiles.tenantId, tenantId)); } catch {}
    try { await db.delete(directorySiteContacts).where(eq(directorySiteContacts.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryOrganizationContacts).where(eq(directoryOrganizationContacts.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryRelationships).where(eq(directoryRelationships.tenantId, tenantId)); } catch {}
    try { await db.delete(directorySites).where(eq(directorySites.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryAddresses).where(eq(directoryAddresses.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryContacts).where(eq(directoryContacts.tenantId, tenantId)); } catch {}
    try { await db.delete(directoryOrganizations).where(eq(directoryOrganizations.tenantId, tenantId)); } catch {}
    try { await db.delete(activityFeed).where(eq(activityFeed.tenantId, tenantId)); } catch {}
  }
  for (const module of modules) {
    try { await db.delete(tenantUserModuleAccess).where(eq(tenantUserModuleAccess.moduleId, module.id)); } catch {}
    try { await db.delete(tenantModules).where(eq(tenantModules.moduleId, module.id)); } catch {}
  }
  for (const user of [moduleViewer, viewer, member, admin, ownerB, ownerA]) if (user) await cleanupUser(user.id);
  for (const module of modules) await cleanupModule(module.id);
});

test('P22-ADAPTER-DIRECTORY-001: shared organizations, contacts, sites, relationships, tags, and profiles persist without duplication', async () => {
  const createOrg = await app.inject({ method: 'POST', url: url('tradeflowkit', '/organizations'), headers: headers(ownerA, ownerA.currentTenantId), payload: { name: 'Acme Health Systems', type: 'facility', website: 'https://acme.test' } });
  assert.equal(createOrg.statusCode, 201, createOrg.body);
  const organization = createOrg.json();

  const duplicate = await app.inject({ method: 'POST', url: url('techdeck', '/organizations'), headers: headers(ownerA, ownerA.currentTenantId), payload: { name: '  ACME   HEALTH systems  ', type: 'client' } });
  assert.equal(duplicate.statusCode, 409, duplicate.body);
  assert.equal(duplicate.json().code, 'DIRECTORY_DUPLICATE');

  const sameNameOtherTenant = await app.inject({ method: 'POST', url: url('tradeflowkit', '/organizations'), headers: headers(ownerB, ownerB.currentTenantId), payload: { name: 'Acme Health Systems', type: 'customer' } });
  assert.equal(sameNameOtherTenant.statusCode, 201, sameNameOtherTenant.body);

  const contactRes = await app.inject({ method: 'POST', url: url('tradeflowkit', '/contacts'), headers: headers(member, ownerA.currentTenantId), payload: { firstName: 'Morgan', lastName: 'Lee', email: 'Morgan.Lee@Acme.Test', title: 'Operations Director' } });
  assert.equal(contactRes.statusCode, 201, contactRes.body);
  const contact = contactRes.json();
  const duplicateEmail = await app.inject({ method: 'POST', url: url('pulsedesk', '/contacts'), headers: headers(ownerA, ownerA.currentTenantId), payload: { firstName: 'Other', email: 'morgan.lee@acme.test' } });
  assert.equal(duplicateEmail.statusCode, 409, duplicateEmail.body);

  const siteRes = await app.inject({ method: 'POST', url: url('techdeck', '/sites'), headers: headers(ownerA, ownerA.currentTenantId), payload: { organizationId: organization.id, name: 'Main Campus', type: 'facility', address: { line1: '100 Care Way', city: 'Atlanta', region: 'GA', postalCode: '30303', countryCode: 'US' } } });
  assert.equal(siteRes.statusCode, 201, siteRes.body);
  const site = siteRes.json();
  assert.equal(site.address.city, 'Atlanta');

  const orgContact = await app.inject({ method: 'POST', url: url('tradeflowkit', `/organizations/${organization.id}/contacts`), headers: headers(member, ownerA.currentTenantId), payload: { contactId: contact.id, role: 'Primary operator', isPrimary: true } });
  assert.equal(orgContact.statusCode, 201, orgContact.body);
  const siteContact = await app.inject({ method: 'POST', url: url('techdeck', `/sites/${site.id}/contacts`), headers: headers(ownerA, ownerA.currentTenantId), payload: { contactId: contact.id, isPrimary: true } });
  assert.equal(siteContact.statusCode, 201, siteContact.body);

  const partnerRes = await app.inject({ method: 'POST', url: url('tradeflowkit', '/organizations'), headers: headers(ownerA, ownerA.currentTenantId), payload: { name: 'Field Services Partner', type: 'partner' } });
  const partner = partnerRes.json();
  const relationship = await app.inject({ method: 'POST', url: url('tradeflowkit', '/relationships'), headers: headers(ownerA, ownerA.currentTenantId), payload: { fromOrganizationId: organization.id, toOrganizationId: partner.id, type: 'service_partner' } });
  assert.equal(relationship.statusCode, 201, relationship.body);

  const tagRes = await app.inject({ method: 'POST', url: url('pulsedesk', '/tags'), headers: headers(ownerA, ownerA.currentTenantId), payload: { name: 'Critical facility', color: '#dc2626' } });
  assert.equal(tagRes.statusCode, 201, tagRes.body);
  const assignment = await app.inject({ method: 'POST', url: url('pulsedesk', `/tags/${tagRes.json().id}/assignments`), headers: headers(ownerA, ownerA.currentTenantId), payload: { entityType: 'organization', entityId: organization.id } });
  assert.equal(assignment.statusCode, 201, assignment.body);

  const profiles = [
    ['tradeflowkit', { customerStatus: 'active', paymentTermsDays: 30 }],
    ['techdeck', { serviceTier: 'managed', accountCode: 'ACME-001' }],
    ['pulsedesk', { facilityCategory: 'hospital', phiRestricted: true }],
  ] as const;
  for (const [slug, payload] of profiles) {
    const response = await app.inject({ method: 'PUT', url: url(slug, `/organizations/${organization.id}/profile`), headers: headers(ownerA, ownerA.currentTenantId), payload });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().organizationId, organization.id);
  }
  const crossModuleProfile = await app.inject({
    method: 'PUT',
    url: url('techdeck', `/organizations/${organization.id}/profile`),
    headers: headers(ownerA, ownerA.currentTenantId),
    payload: { phiRestricted: true },
  });
  assert.equal(crossModuleProfile.statusCode, 422, crossModuleProfile.body);
  assert.equal(crossModuleProfile.json().code, 'DIRECTORY_VALIDATION_FAILED');
  const [tfkProfiles, techProfiles, pulseProfiles] = await Promise.all([
    db.select().from(tradeflowkitCustomerProfiles).where(and(eq(tradeflowkitCustomerProfiles.tenantId, ownerA.currentTenantId), eq(tradeflowkitCustomerProfiles.organizationId, organization.id))),
    db.select().from(techdeckManagedClientProfiles).where(and(eq(techdeckManagedClientProfiles.tenantId, ownerA.currentTenantId), eq(techdeckManagedClientProfiles.organizationId, organization.id))),
    db.select().from(pulsedeskServiceClientProfiles).where(and(eq(pulsedeskServiceClientProfiles.tenantId, ownerA.currentTenantId), eq(pulsedeskServiceClientProfiles.organizationId, organization.id))),
  ]);
  assert.deepEqual([tfkProfiles.length, techProfiles.length, pulseProfiles.length], [1, 1, 1]);
  assert.ok([tfkProfiles[0].organizationId, techProfiles[0].organizationId, pulseProfiles[0].organizationId].every(id => id === organization.id));

  const list = await app.inject({ method: 'GET', url: url('tradeflowkit', '/organizations?search=acme&limit=1&offset=0&sort=name'), headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(list.statusCode, 200, list.body);
  assert.equal(list.json().pagination.total, 1);
  assert.equal(list.json().organizations[0].id, organization.id);

  const detail = await app.inject({ method: 'GET', url: url('techdeck', `/organizations/${organization.id}`), headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(detail.statusCode, 200, detail.body);
  assert.equal(detail.json().sites[0].id, site.id);
  assert.equal(detail.json().contacts[0].id, contact.id);
  assert.equal(detail.json().profile.accountCode, 'ACME-001');
  assert.equal(detail.json().profiles, undefined, 'module-specific profile data must not cross module boundaries');
});

test('directory authorization, non-enumeration, optimistic concurrency, and archive rules fail closed', async () => {
  const created = await app.inject({ method: 'POST', url: url('tradeflowkit', '/organizations'), headers: headers(ownerA, ownerA.currentTenantId), payload: { name: 'Concurrency Client', type: 'customer' } });
  const organization = created.json();

  const updated = await app.inject({ method: 'PATCH', url: url('tradeflowkit', `/organizations/${organization.id}`), headers: headers(member, ownerA.currentTenantId), payload: { expectedVersion: 1, notes: 'member update' } });
  assert.equal(updated.statusCode, 200, updated.body);
  assert.equal(updated.json().version, 2);
  const stale = await app.inject({ method: 'PATCH', url: url('tradeflowkit', `/organizations/${organization.id}`), headers: headers(ownerA, ownerA.currentTenantId), payload: { expectedVersion: 1, notes: 'stale' } });
  assert.equal(stale.statusCode, 409, stale.body);
  assert.equal(stale.json().code, 'DIRECTORY_VERSION_CONFLICT');

  const foreign = await app.inject({ method: 'GET', url: url('tradeflowkit', `/organizations/${organization.id}`), headers: headers(ownerB, ownerB.currentTenantId) });
  assert.equal(foreign.statusCode, 404, foreign.body);
  assert.equal(foreign.json().code, 'DIRECTORY_ORGANIZATION_NOT_FOUND');

  const viewerRead = await app.inject({ method: 'GET', url: url('tradeflowkit', '/organizations'), headers: headers(viewer, ownerA.currentTenantId) });
  assert.equal(viewerRead.statusCode, 200, viewerRead.body);
  const viewerWrite = await app.inject({ method: 'POST', url: url('tradeflowkit', '/contacts'), headers: headers(viewer, ownerA.currentTenantId), payload: { firstName: 'Denied' } });
  assert.equal(viewerWrite.statusCode, 403, viewerWrite.body);
  assert.equal(viewerWrite.json().code, 'TENANT_WRITE_ACCESS_REQUIRED');

  const moduleViewerRead = await app.inject({ method: 'GET', url: url('techdeck', '/organizations'), headers: headers(moduleViewer, ownerA.currentTenantId) });
  assert.equal(moduleViewerRead.statusCode, 200, moduleViewerRead.body);
  const moduleViewerWrite = await app.inject({ method: 'POST', url: url('techdeck', '/contacts'), headers: headers(moduleViewer, ownerA.currentTenantId), payload: { firstName: 'Denied' } });
  assert.equal(moduleViewerWrite.statusCode, 403, moduleViewerWrite.body);
  assert.equal(moduleViewerWrite.json().code, 'TENANT_MODULE_WRITE_ACCESS_REQUIRED');

  const memberArchive = await app.inject({ method: 'DELETE', url: url('tradeflowkit', `/organizations/${organization.id}`), headers: headers(member, ownerA.currentTenantId), payload: { expectedVersion: 2 } });
  assert.equal(memberArchive.statusCode, 403, memberArchive.body);
  assert.equal(memberArchive.json().code, 'TENANT_ROLE_INSUFFICIENT');
  const adminArchive = await app.inject({ method: 'DELETE', url: url('tradeflowkit', `/organizations/${organization.id}`), headers: headers(admin, ownerA.currentTenantId), payload: { expectedVersion: 2 } });
  assert.equal(adminArchive.statusCode, 200, adminArchive.body);
  assert.ok(adminArchive.json().archivedAt);
  const hidden = await app.inject({ method: 'GET', url: url('tradeflowkit', '/organizations?search=Concurrency'), headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(hidden.json().pagination.total, 0);

  const anonymous = await app.inject({ method: 'GET', url: url('tradeflowkit', '/organizations') });
  assert.equal(anonymous.statusCode, 401, anonymous.body);
  const unsupported = await app.inject({ method: 'GET', url: url('torqueshed', '/organizations'), headers: headers(ownerA, ownerA.currentTenantId) });
  assert.equal(unsupported.statusCode, 404, unsupported.body);
  assert.equal(unsupported.json().code, 'DIRECTORY_MODULE_NOT_FOUND');
});
