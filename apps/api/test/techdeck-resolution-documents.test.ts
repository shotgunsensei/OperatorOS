import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { tenantUsers, tenantModules, tenantUserModuleAccess, modules } from '../src/schema.js';
import { createTestUser, cleanupUser, ensureSchemaReady } from './_setup.js';
import { registerTechDeckResolutionRoutes } from '../src/routes/techdeck-resolution-routes.js';
import { registerTechDeckRoutes } from '../src/routes/techdeck-routes.js';
import { importResolutionExport, type ResolutionContext } from '../src/lib/techdeck-resolution-ingestion.js';
import { buildTechDeckCompliancePacket } from '../src/lib/techdeck-compliance-export.js';
import { assertDisposableDatabaseEnvironment } from '../../../scripts/parity/lib/database.mjs';

const raw = readFileSync(new URL('./fixtures/techdeck-resolution-cam-wal-v1.json', import.meta.url), 'utf8');
const base = '/v1/modules/techdeck/resolution-intelligence';
const docs = '/v1/modules/techdeck/documents';
type Actor = Awaited<ReturnType<typeof createTestUser>>;
let owner: Actor, foreign: Actor, member: Actor, viewer: Actor, moduleViewer: Actor, admin: Actor, portal: Actor;
let app: FastifyInstance, moduleId: string;
let signToken: typeof import('../src/lib/auth.js').signToken;
const actors: Actor[] = [];
const context = (): ResolutionContext => ({ tenantId: owner.currentTenantId!, actorUserId: owner.id, moduleId, role: 'owner' });
const headers = (actor: Actor) => ({ authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`, 'x-tenant-id': owner.currentTenantId! });
const request = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, actor = owner, key?: string) => app.inject({ method, url, headers: { ...headers(actor), ...(key ? { 'idempotency-key': key } : {}) }, ...(payload === undefined ? {} : { payload }) });
async function imported(change?: (value: any) => void) {
  const value = JSON.parse(raw); value.incident.title = `Synthetic draft ${randomUUID()}`; change?.(value);
  return importResolutionExport(context(), { rawText: JSON.stringify(value), humanReport: null, links: {} }, randomUUID());
}
async function preview(id: string, kind = 'knowledge_base', version = 1) {
  const response = await request('POST', `${base}/incidents/${id}/document-drafts/preview`, { kind, expectedVersion: version });
  assert.equal(response.statusCode, 200, response.body); return response.json();
}
async function draft(id: string, kind = 'knowledge_base', version = 1) {
  const body = await preview(id, kind, version);
  const response = await request('POST', `${base}/incidents/${id}/document-drafts`, { kind, expectedVersion: version, previewSha256: body.previewSha256, privacyReviewed: true }, owner, randomUUID());
  assert.equal(response.statusCode, 201, response.body); return response.json().documentId as string;
}
before(async () => {
  assertDisposableDatabaseEnvironment(process.env); assert.equal(process.env.APP_ENV, 'test');
  await ensureSchemaReady(); ({ signToken } = await import('../src/lib/auth.js'));
  for (let index = 0; index < 7; index++) actors.push(await createTestUser());
  [owner, foreign, member, viewer, moduleViewer, admin, portal] = actors;
  const [module] = await db.select().from(modules).where(eq(modules.slug, 'techdeck')); moduleId = module.id;
  await db.insert(tenantModules).values({ tenantId: owner.currentTenantId!, moduleId, status: 'enabled', source: 'admin', allowAllMembers: true });
  for (const [actor, role, access] of [[member, 'member', 'user'], [viewer, 'viewer', 'user'], [moduleViewer, 'admin', 'viewer'], [admin, 'admin', 'manager'], [portal, 'member', 'user']] as const) {
    await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId!, userId: actor.id, role });
    await db.insert(tenantUserModuleAccess).values({ tenantId: owner.currentTenantId!, userId: actor.id, moduleId, accessLevel: access });
  }
  const organization = (await db.execute(sql`INSERT INTO directory_organizations(tenant_id,name,normalized_name,type,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},'Synthetic documents client','synthetic documents client','client',${owner.id},${owner.id}) RETURNING id`)).rows[0].id;
  await db.execute(sql`INSERT INTO techdeck_portal_assignments(tenant_id,user_id,directory_organization_id,created_by_user_id) VALUES (${owner.currentTenantId},${portal.id},${organization},${owner.id})`);
  app = Fastify(); await app.register(cookie); await registerTechDeckResolutionRoutes(app); await registerTechDeckRoutes(app); await app.ready();
});
afterEach(async () => {
  const hashes = [`techdeck-resolution:tenant:${owner.currentTenantId}`, ...actors.map(actor => `techdeck-resolution:actor:${owner.currentTenantId}:${actor.id}`)].map(key => createHash('sha256').update(key).digest('hex'));
  await db.execute(sql`DELETE FROM auth_request_limits WHERE key_hash IN (${sql.join(hashes.map(hash => sql`${hash}`), sql`,`)})`);
});
after(async () => {
  if (app) await app.close();
  if (owner) {
    await db.execute(sql`DELETE FROM techdeck_resolution_incidents WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM techdeck_document_links WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM techdeck_documents WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM techdeck_portal_assignments WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM directory_organizations WHERE tenant_id=${owner.currentTenantId}`);
  }
  for (const actor of actors.reverse()) await cleanupUser(actor.id); await closeDatabasePool();
});

test('preview is deterministic, nonpersistent, source-cited and preserves uncertainty, failures and warnings', async () => {
  const incident = await imported(data => { data.knowledge.lessons_learned.push('<script>inert source</script>'); });
  const first = await preview(incident.incidentId), second = await preview(incident.incidentId);
  assert.deepEqual(first, second); assert.equal(first.minimumRole, 'member');
  for (const value of ['Disabling camsvc', 'pending', 'FAILURE', 'temporal_association', '/validation/pending', 'not an approved repair procedure', 'Not recorded']) assert.ok(first.content.includes(value), value);
  assert.ok(first.citations.length > 20); assert.ok(!first.content.includes('<script>')); assert.ok(first.content.includes('‹script›'));
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM techdeck_resolution_document_links WHERE tenant_id=${owner.currentTenantId} AND incident_id=${incident.incidentId}`)).rows[0].n, 0);
});

test('creation is atomic, concurrent retries dedupe, edits survive and raw source is unchanged', async () => {
  const incident = await imported(), p = await preview(incident.incidentId);
  const payload = { kind: p.kind, expectedVersion: p.sourceVersion, previewSha256: p.previewSha256, privacyReviewed: true };
  const key = randomUUID();
  const responses = await Promise.all([request('POST', `${base}/incidents/${incident.incidentId}/document-drafts`, payload, owner, key), request('POST', `${base}/incidents/${incident.incidentId}/document-drafts`, payload, owner, randomUUID())]);
  assert.deepEqual(responses.map(r => r.statusCode).sort(), [200, 201]);
  const id = responses[0].json().documentId; assert.equal(responses[1].json().documentId, id);
  const document = (await request('GET', `${docs}/${id}`)).json(); assert.equal(document.status, 'draft'); assert.equal(document.version, 1); assert.equal(document.content, p.content); assert.equal(document.resolutionSources[0].sourceRevision, 1);
  const edited = await request('PATCH', `${docs}/${id}`, { expectedVersion: 1, content: 'Reviewed local notes', changeNote: 'Synthetic edit' }); assert.equal(edited.statusCode, 200, edited.body);
  const replay = await request('POST', `${base}/incidents/${incident.incidentId}/document-drafts`, payload, owner, key); assert.equal(replay.statusCode, 200); assert.equal(replay.json().replayed, true);
  assert.equal((await request('GET', `${docs}/${id}`)).json().content, 'Reviewed local notes');
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM shared_activity_events WHERE tenant_id=${owner.currentTenantId} AND object_id=${id} AND event_type='techdeck.resolution.document_drafted'`)).rows[0].n, 1);
  const source = await db.execute(sql`SELECT raw_text,raw_sha256 FROM techdeck_resolution_raw_exports WHERE tenant_id=${owner.currentTenantId} AND incident_id=${incident.incidentId} AND revision=1`);
  assert.equal(createHash('sha256').update(String(source.rows[0].raw_text)).digest('hex'), source.rows[0].raw_sha256);
});

test('preview confirmation, forged fields, stale versions and changed hashes fail without saving', async () => {
  const incident = await imported(), p = await preview(incident.incidentId);
  for (const [patch, status] of [[{ privacyReviewed: false }, 400], [{ previewSha256: '0'.repeat(64) }, 409], [{ expectedVersion: 2 }, 409], [{ tenantId: foreign.currentTenantId }, 400], [{ content: 'forged' }, 400]] as const) {
    const response = await request('POST', `${base}/incidents/${incident.incidentId}/document-drafts`, { kind: p.kind, expectedVersion: 1, previewSha256: p.previewSha256, privacyReviewed: true, ...patch }, owner, randomUUID()); assert.equal(response.statusCode, status, response.body);
  }
  assert.equal((await db.execute(sql`SELECT count(*)::int AS n FROM techdeck_resolution_document_links WHERE tenant_id=${owner.currentTenantId} AND incident_id=${incident.incidentId}`)).rows[0].n, 0);
});

test('readers, foreign users and portal assignments cannot create or preview evidence drafts', async () => {
  const incident = await imported();
  for (const actor of [viewer, moduleViewer, foreign, portal]) {
    const result = await request('POST', `${base}/incidents/${incident.incidentId}/document-drafts/preview`, { kind: 'runbook', expectedVersion: 1 }, actor);
    assert.ok([403, 404].includes(result.statusCode), result.body);
  }
  const documentId = await draft(incident.incidentId);
  assert.equal((await request('GET', `${docs}/${documentId}`, undefined, viewer)).statusCode, 200);
  assert.equal((await request('GET', `${docs}/${documentId}`, undefined, portal)).statusCode, 404);
  assert.equal((await request('GET', `${docs}/${documentId}`, undefined, foreign)).statusCode, 404);
});

test('generic list, workspace, detail, history and links enforce current source visibility and archive', async () => {
  const incident = await imported(), id = await draft(incident.incidentId);
  const ordinary = await request('POST', docs, { title: 'Ordinary link parent', pageType: 'knowledge_base', content: 'Ordinary non-source document' }); assert.equal(ordinary.statusCode, 201, ordinary.body);
  const parentId = ordinary.json().id;
  assert.equal((await request('POST', `${docs}/${parentId}/links`, { targetDocumentId: id, label: 'Private document link' })).statusCode, 201);
  assert.equal((await request('PATCH', `${base}/incidents/${incident.incidentId}`, { expectedVersion: 1, minimumRole: 'owner' })).statusCode, 200);
  for (const actor of [member, admin, viewer, portal]) {
    assert.equal((await request('GET', `${docs}/${id}`, undefined, actor)).statusCode, 404);
    for (const url of [docs, '/v1/modules/techdeck/workspace', `${docs}/${parentId}`]) { const result = await request('GET', url, undefined, actor); assert.equal(result.statusCode, 200, result.body); assert.ok(!result.body.includes(id), url); }
  }
  assert.equal((await request('PATCH', `${docs}/${id}`, { expectedVersion: 1, minimumRole: 'member' })).statusCode, 409);
  assert.equal((await request('GET', `${docs}/${id}`)).statusCode, 200);
  assert.equal((await request('POST', `${base}/incidents/${incident.incidentId}/archive`, { expectedVersion: 2 })).statusCode, 200);
  assert.equal((await request('GET', `${docs}/${id}`)).statusCode, 404);
});

test('linked knowledge is paginated and filtered before titles, counts or provenance are returned', async () => {
  const incident = await imported(), kb = await draft(incident.incidentId), runbook = await draft(incident.incidentId, 'runbook');
  const first = await request('GET', `${base}/documents?incidentId=${incident.incidentId}&limit=1`); assert.equal(first.statusCode, 200, first.body); assert.equal(first.json().items.length, 1); assert.ok(first.json().nextCursor);
  const next = (await request('GET', `${base}/documents?incidentId=${incident.incidentId}&limit=1&cursor=${first.json().nextCursor}`)).json(); assert.deepEqual([first.json().items[0].id, next.items[0].id].sort(), [kb, runbook].sort()); assert.equal(next.nextCursor, null);
  assert.equal((await request('GET', `${base}/documents?limit=1000`)).statusCode, 400);
  assert.equal((await request('GET', `${base}/documents`, undefined, portal)).statusCode, 403);
});

test('existing review approval publication and revision workflow remain authoritative', async () => {
  const incident = await imported(), id = await draft(incident.incidentId, 'runbook');
  assert.equal((await request('POST', `${docs}/${id}/publish`, { expectedVersion: 1 })).statusCode, 409);
  const edited = await request('PATCH', `${docs}/${id}`, { expectedVersion: 1, title: 'Reviewed runbook', changeNote: 'Title review' }, member); assert.equal(edited.statusCode, 200, edited.body);
  assert.equal((await request('PATCH', `${docs}/${id}`, { expectedVersion: 1, title: 'Stale edit' }, member)).statusCode, 409);
  assert.equal((await request('POST', `${docs}/${id}/review`, { expectedVersion: 2 }, member)).statusCode, 200);
  assert.equal((await request('POST', `${docs}/${id}/approve`, { expectedVersion: 3 }, member)).statusCode, 403);
  assert.equal((await request('POST', `${docs}/${id}/approve`, { expectedVersion: 3 }, admin)).statusCode, 200);
  assert.equal((await request('POST', `${docs}/${id}/publish`, { expectedVersion: 4 }, admin)).statusCode, 200);
  const document = (await request('GET', `${docs}/${id}`)).json(); assert.equal(document.status, 'published'); assert.deepEqual(document.revisions.map((r: any) => r.version), [5, 4, 3, 2, 1]);
  assert.equal(document.resolutionSources[0].documentVersion, 1);
});

test('reprocessing retains old document content, marks stale provenance and blocks approval', async () => {
  const incident = await imported(), id = await draft(incident.incidentId), old = (await request('GET', `${docs}/${id}`)).json();
  assert.equal((await request('POST', `${docs}/${id}/review`, { expectedVersion: 1 })).statusCode, 200);
  const changed = JSON.parse(raw); changed.incident.title = `Reprocessed ${randomUUID()}`;
  await importResolutionExport(context(), { rawText: JSON.stringify(changed), humanReport: null, links: {} }, randomUUID(), { incidentId: incident.incidentId, expectedVersion: 1 });
  assert.equal((await request('POST', `${docs}/${id}/approve`, { expectedVersion: 2 })).statusCode, 409);
  const listing = (await request('GET', `${base}/documents?incidentId=${incident.incidentId}`)).json(); assert.equal(listing.items[0].source_current, false);
  const current = (await request('GET', `${docs}/${id}`)).json(); assert.equal(current.content, old.content); assert.equal(current.resolutionSources[0].currentRevision, 2);
  const next = await draft(incident.incidentId, 'knowledge_base', 2); assert.notEqual(next, id);
});

test('tenant-wide compliance packets exclude source-linked documents from their broader audience', async () => {
  const incident = await imported(), id = await draft(incident.incidentId);
  assert.equal((await request('POST', `${docs}/${id}/review`, { expectedVersion: 1 })).statusCode, 200);
  const packet = await buildTechDeckCompliancePacket({ tenantId: owner.currentTenantId!, moduleId, filters: {} });
  assert.ok(!JSON.stringify(packet).includes(id));
  // Stored ZIP entries can be read as UTF-8 without a decompressor.
  const bytes = packet.content;
  assert.ok(Buffer.isBuffer(bytes), 'Exporter must return its ZIP buffer'); assert.ok(!bytes.toString('utf8').includes(id));
});

test('large evidence previews stay bounded and explicitly disclose shortened or omitted material', async () => {
  const incident = await imported(data => { data.knowledge.lessons_learned = Array.from({ length: 40 }, (_, i) => `Observation ${i}: ${'Recorded information. '.repeat(150)}`); });
  const p = await preview(incident.incidentId, 'runbook');
  assert.equal(p.abbreviated, true); assert.ok(p.content.length < 100000); assert.match(p.content, /excerpt shortened/); assert.match(p.content, /BOUNDED PREVIEW/);
});

test('many incidents can link one draft, preserving edits and enforcing every source audience', async () => {
  const first = await imported(), second = await imported(), documentId = await draft(first.incidentId);
  assert.equal((await request('PATCH', `${base}/incidents/${second.incidentId}`, { expectedVersion: 1, minimumRole: 'owner' })).statusCode, 200);
  const payload = { documentId, expectedVersion: 2, expectedDocumentVersion: 1 };
  assert.equal((await request('POST', `${base}/incidents/${second.incidentId}/document-links`, payload)).statusCode, 403);
  assert.equal((await request('PATCH', `${docs}/${documentId}`, { expectedVersion: 1, minimumRole: 'owner', content: 'Preserve technician edits' })).statusCode, 200);
  const linked = await request('POST', `${base}/incidents/${second.incidentId}/document-links`, { ...payload, expectedDocumentVersion: 2 }); assert.equal(linked.statusCode, 200, linked.body);
  const document = (await request('GET', `${docs}/${documentId}`)).json(); assert.equal(document.resolutionSources.length, 2); assert.match(document.content, /^Preserve technician edits/); assert.equal(document.version, 3);
  assert.equal((await request('POST', `${base}/incidents/${second.incidentId}/document-links`, { ...payload, expectedDocumentVersion: 2 })).json().existing, true);
  assert.equal((await request('GET', `${docs}/${documentId}`, undefined, admin)).statusCode, 404);
  assert.equal((await request('POST', `${base}/incidents/${first.incidentId}/archive`, { expectedVersion: 1 })).statusCode, 200);
  assert.equal((await request('GET', `${docs}/${documentId}`)).statusCode, 404);
});

test('cached draft responses revalidate access and conflicting keys cannot create another document', async () => {
  const incident = await imported(), p = await preview(incident.incidentId), key = randomUUID();
  const payload = { kind: p.kind, expectedVersion: 1, previewSha256: p.previewSha256, privacyReviewed: true };
  const created = await request('POST', `${base}/incidents/${incident.incidentId}/document-drafts`, payload, owner, key); assert.equal(created.statusCode, 201);
  assert.equal((await request('POST', `${base}/incidents/${incident.incidentId}/document-drafts`, { ...payload, kind: 'runbook' }, owner, key)).statusCode, 409);
  assert.equal((await request('POST', `${base}/incidents/${incident.incidentId}/archive`, { expectedVersion: 1 })).statusCode, 200);
  const replay = await request('POST', `${base}/incidents/${incident.incidentId}/document-drafts`, payload, owner, key); assert.equal(replay.statusCode, 404); assert.ok(!replay.body.includes(created.json().documentId));
});
