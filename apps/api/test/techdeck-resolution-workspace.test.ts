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
import { importResolutionExport, type ResolutionContext } from '../src/lib/techdeck-resolution-ingestion.js';
import { extractResolutionIdentifiers } from '../src/lib/techdeck-resolution-search.js';
import { ticketCompletionPrompt, ticketCompletionPromptSha256 } from '../src/generated/techdeck-resolution-contract.js';
import { assertDisposableDatabaseEnvironment } from '../../../scripts/parity/lib/database.mjs';

const rawText = readFileSync(new URL('./fixtures/techdeck-resolution-cam-wal-v1.json', import.meta.url), 'utf8');
const base = '/v1/modules/techdeck/resolution-intelligence';
type Actor = Awaited<ReturnType<typeof createTestUser>>;
let owner: Actor, foreign: Actor, member: Actor, viewer: Actor, moduleViewer: Actor, admin: Actor, portal: Actor;
let app: FastifyInstance, moduleId: string, organizationId: string, assetId: string;
let signToken: typeof import('../src/lib/auth.js').signToken;
const actors: Actor[] = [];
function context(actor = owner): ResolutionContext { return { tenantId: actor.currentTenantId!, actorUserId: actor.id, moduleId, role: 'owner' }; }
function headers(actor = owner, tenantId = owner.currentTenantId!) { return { authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`, 'x-tenant-id': tenantId }; }
const get = (path: string, actor = owner, tenantId = owner.currentTenantId!) => app.inject({ method: 'GET', url: base + path, headers: headers(actor, tenantId) });
const post = (path: string, payload: unknown, actor = owner) => app.inject({ method: 'POST', url: base + path, payload, headers: headers(actor) });
const patch = (id: string, payload: unknown, actor = owner) => app.inject({ method: 'PATCH', url: `${base}/incidents/${id}`, payload, headers: headers(actor) });
async function imported(title: string, actor = owner, change?: (data: any) => void) {
  const data = JSON.parse(rawText); data.incident.title = `${title} ${randomUUID()}`; change?.(data);
  return importResolutionExport(context(actor), { rawText: JSON.stringify(data), humanReport: null, links: {} }, randomUUID());
}
before(async () => {
  assertDisposableDatabaseEnvironment(process.env); assert.equal(process.env.APP_ENV, 'test');
  await ensureSchemaReady(); ({ signToken } = await import('../src/lib/auth.js'));
  for (let index = 0; index < 7; index++) actors.push(await createTestUser());
  [owner, foreign, member, viewer, moduleViewer, admin, portal] = actors;
  const [module] = await db.select().from(modules).where(eq(modules.slug, 'techdeck')); moduleId = module.id;
  for (const actor of [owner, foreign]) await db.insert(tenantModules).values({ tenantId: actor.currentTenantId!, moduleId, status: 'enabled', source: 'admin', allowAllMembers: true });
  for (const [actor, role, access] of [[member, 'member', 'user'], [viewer, 'viewer', 'user'], [moduleViewer, 'admin', 'viewer'], [admin, 'admin', 'manager'], [portal, 'member', 'user']] as const) {
    await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId!, userId: actor.id, role });
    await db.insert(tenantUserModuleAccess).values({ tenantId: owner.currentTenantId!, userId: actor.id, moduleId, accessLevel: access });
  }
  organizationId = String((await db.execute(sql`INSERT INTO directory_organizations(tenant_id,name,normalized_name,type,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},'Synthetic workspace client','synthetic workspace client','client',${owner.id},${owner.id}) RETURNING id`)).rows[0].id);
  assetId = String((await db.execute(sql`INSERT INTO techdeck_assets(tenant_id,name,type) VALUES (${owner.currentTenantId},'Synthetic workspace device','endpoint') RETURNING id`)).rows[0].id);
  await db.execute(sql`INSERT INTO techdeck_portal_assignments(tenant_id,user_id,directory_organization_id,created_by_user_id) VALUES (${owner.currentTenantId},${portal.id},${organizationId},${owner.id})`);
  app = Fastify(); await app.register(cookie); await registerTechDeckResolutionRoutes(app); await app.ready();
});
afterEach(async () => {
  const hashes = actors.flatMap(actor => [`techdeck-resolution:tenant:${actor.currentTenantId}`, `techdeck-resolution:actor:${owner.currentTenantId}:${actor.id}`]).map(key => createHash('sha256').update(key).digest('hex'));
  await db.execute(sql`DELETE FROM auth_request_limits WHERE key_hash IN (${sql.join(hashes.map(hash => sql`${hash}`), sql`,`)})`);
});
after(async () => {
  if (app) await app.close();
  if (owner) {
    await db.execute(sql`DELETE FROM techdeck_resolution_incidents WHERE tenant_id IN (${owner.currentTenantId},${foreign.currentTenantId})`);
    await db.execute(sql`DELETE FROM techdeck_portal_assignments WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM techdeck_assets WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM directory_organizations WHERE tenant_id=${owner.currentTenantId}`);
  }
  for (const actor of actors.reverse()) await cleanupUser(actor.id); await closeDatabasePool();
});

test('typed extraction preserves error codes and requires numeric context', () => {
  assert.deepEqual(extractResolutionIdentifiers('1000'), []);
  const ids = extractResolutionIdentifiers('Error 0x800F0915 event ID 1000 port: 443 service: camsvc host: workstation-01 OS build: 26100.1234 C:\\Windows\\Logs\\CBS.log');
  for (const expected of [{ kind: 'error_code', value: '0x800f0915' }, { kind: 'event_id', value: '1000' }, { kind: 'port', value: '443' }, { kind: 'service', value: 'camsvc' }, { kind: 'hostname', value: 'workstation-01' }, { kind: 'os_build', value: '26100.1234' }, { kind: 'basename', value: 'cbs.log' }]) assert.ok(ids.some(id => id.kind === expected.kind && id.value === expected.value), JSON.stringify(expected));
});
test('canonical prompt, template and schema are guarded, no-store, versioned and distinct', async () => {
  const response = await get('/prompt?version=1.0&download=1'); assert.equal(response.statusCode, 200, response.body); assert.equal(response.body, ticketCompletionPrompt); assert.equal(response.headers['x-resolution-prompt-sha256'], ticketCompletionPromptSha256); assert.equal(response.headers['cache-control'], 'no-store'); assert.match(String(response.headers['content-disposition']), /^attachment/);
  assert.equal((await get('/prompt?version=9')).statusCode, 400);
  assert.equal((await get('/template')).json().schema_version, '1.0'); assert.equal((await get('/schema')).json().type, 'object');
  assert.equal((await get('/prompt', viewer)).statusCode, 200); assert.equal((await get('/prompt', portal)).statusCode, 403);
});
test('supported identifier forms remain bounded and large ordinary ticket text is accepted', () => {
  const text = 'Routine diagnostic observation. '.repeat(2500) + ' event ID: 1000 port=443 /var/log/service.log';
  const ids = extractResolutionIdentifiers(text);
  assert.ok(ids.some(id => id.kind === 'event_id' && id.value === '1000'));
  assert.ok(ids.some(id => id.kind === 'port' && id.value === '443'));
  assert.ok(ids.some(id => id.kind === 'file_path' && id.value === '/var/log/service.log'));
  assert.ok(ids.some(id => id.kind === 'basename' && id.value === 'service.log'));
  assert.ok(extractResolutionIdentifiers(Array.from({ length: 120 }, (_, i) => `host: endpoint-${i}`).join('\n')).length <= 100);
});
test('incident cursors preserve PostgreSQL microseconds without skipping rows', async () => {
  const newest = await imported('Microsecond newest'), next = await imported('Microsecond next');
  await db.execute(sql`UPDATE techdeck_resolution_incidents SET created_at='2090-01-01 00:00:00.123456+00' WHERE tenant_id=${owner.currentTenantId} AND id=${newest.incidentId}`);
  await db.execute(sql`UPDATE techdeck_resolution_incidents SET created_at='2090-01-01 00:00:00.123455+00' WHERE tenant_id=${owner.currentTenantId} AND id=${next.incidentId}`);
  const first = (await get('/incidents?limit=1')).json(); assert.equal(first.items[0].id, newest.incidentId);
  const second = (await get(`/incidents?limit=1&cursor=${first.nextCursor}`)).json(); assert.equal(second.items[0].id, next.incidentId);
  assert.ok(!JSON.stringify(first.items).includes('cursor_timestamp'));
});
test('contextual ports in normalize-v1 imports match exactly after visibility filters', async () => {
  const port = await imported('Port evidence', owner, data => { data.issue.summary = 'Connection to port: 443 was checked.'; });
  const other = await imported('Other port evidence', owner, data => { data.issue.summary = 'Connection to port: 4433 was checked.'; });
  const hidden = await imported('Private port evidence', foreign, data => { data.issue.summary = 'Connection to port: 443 was checked.'; });
  const response = await post('/search', { q: 'port 443', limit: 100 }, member); assert.equal(response.statusCode, 200, response.body);
  const rows = response.json().items; const exact = rows.find((row: any) => row.id === port.incidentId);
  assert.ok(exact.exact_score > 0); assert.ok(exact.match_reasons.some((reason: any) => reason.kind === 'port' && reason.value === '443'));
  assert.ok(!rows.some((row: any) => row.id === hidden.incidentId)); assert.ok(!rows.some((row: any) => row.id === other.incidentId && row.exact_score > 0));
  const long = await post('/search', { q: 'ordinary diagnostics '.repeat(450) + 'port 443' }); assert.equal(long.statusCode, 200, long.body); assert.equal(long.json().fullTextTruncated, true);
});
test('tenant and module readers can read but cannot POST search or mutate; portals are excluded', async () => {
  const incident = await imported('Reader evidence');
  for (const actor of [viewer, moduleViewer]) {
    assert.equal((await get(`/incidents/${incident.incidentId}`, actor)).statusCode, 200);
    assert.equal((await get('/search?q=0x800f0915', actor)).statusCode, 200);
    assert.equal((await post('/search', { q: '0x800f0915' }, actor)).statusCode, 403);
    assert.equal((await patch(incident.incidentId, { expectedVersion: 1, reviewStatus: 'reviewed' }, actor)).statusCode, 403);
    assert.equal((await get('/capabilities', actor)).json().canWrite, false);
  }
  assert.equal((await get('/summary', portal)).statusCode, 403); assert.equal((await get('/incidents', foreign)).statusCode, 404);
  assert.equal((await get('/capabilities', moduleViewer)).json().canDownloadRaw, true);
  assert.equal((await get('/capabilities', viewer)).json().canDownloadRaw, false);
  assert.equal((await get('/capabilities', admin)).json().canSetOwnerVisibility, false);
  assert.equal((await get('/capabilities')).json().canSetOwnerVisibility, true);
  assert.equal((await get(`/incidents/${incident.incidentId}/raw/1`, moduleViewer)).statusCode, 200);
});
test('minimum role, tenant and archive gates apply to candidates, counts, sections, history, related and downloads', async () => {
  const privateIncident = await imported('Private evidence');
  const foreignIncident = await imported('Foreign evidence', foreign);
  assert.equal((await patch(privateIncident.incidentId, { expectedVersion: 1, minimumRole: 'owner' })).statusCode, 200);
  for (const actor of [member, viewer, admin]) for (const suffix of ['', '/history', '/sections/warnings', '/related', '/raw/1']) {
    const response = await get(`/incidents/${privateIncident.incidentId}${suffix}`, actor); assert.ok([403, 404].includes(response.statusCode), response.body);
  }
  const search = await post('/search', { q: '0x800f0915', limit: 100 }, member); assert.equal(search.statusCode, 200, search.body); assert.ok(!search.body.includes(privateIncident.incidentId)); assert.ok(!search.body.includes(foreignIncident.incidentId));
  const owned = await get('/summary'); const visible = await get('/summary', member); assert.ok(owned.json().incidents > visible.json().incidents);
  assert.equal((await get(`/incidents/${foreignIncident.incidentId}`)).statusCode, 404);
});
test('exact identifier results outrank prose and preserve pending validation, warnings and failed actions', async () => {
  const exact = await imported('Exact-first target');
  const prose = await imported('Prose-only target', owner, data => { data.issue.error_codes = []; data.issue.summary = '0x800f0915 '.repeat(100); });
  const response = await post('/search', { q: '0x800f0915', limit: 100 }); assert.equal(response.statusCode, 200, response.body);
  const rows = response.json().items; const row = rows.find((item: any) => item.id === exact.incidentId); assert.ok(row.exact_score > 0); assert.equal(row.validation_status, 'PARTIAL'); assert.ok(row.warning_count > 0); assert.ok(row.failed_action_count > 0);
  assert.ok(rows.findIndex((item: any) => item.id === exact.incidentId) < rows.findIndex((item: any) => item.id === prose.incidentId));
  assert.ok(row.match_reasons.some((reason: any) => reason.kind === 'error_code')); assert.ok(!response.body.includes('raw_text'));
  assert.equal((await post('/search', { q: 'password=super-private-password' })).statusCode, 422);
  assert.equal((await get(`/search?q=${'a'.repeat(201)}`)).statusCode, 400);
  assert.equal((await post('/search', { q: "'); DROP TABLE tenants; --" })).statusCode, 200);
});
test('detail sections retain provenance, paginate without overlap and reject arbitrary tables', async () => {
  const item = await imported('Section evidence');
  const detail = await get(`/incidents/${item.incidentId}`); assert.equal(detail.statusCode, 200); assert.ok(detail.json().section_counts.evidence_links > 1); assert.ok(!detail.body.includes('raw_text'));
  const page1 = await get(`/incidents/${item.incidentId}/sections/evidence_links?limit=1`); assert.equal(page1.statusCode, 200, page1.body); assert.equal(page1.json().items[0].revision, 1); assert.ok(page1.json().items[0].source_pointer.startsWith('/'));
  const page2 = await get(`/incidents/${item.incidentId}/sections/evidence_links?limit=1&cursor=${page1.json().nextCursor}`); assert.notEqual(page1.json().items[0].id, page2.json().items[0].id);
  assert.equal((await get(`/incidents/${item.incidentId}/sections/raw_exports`)).statusCode, 404); assert.equal((await get(`/incidents/${item.incidentId}/sections/actions?limit=101`)).statusCode, 400);
  assert.equal((await get('/incidents?cursor=not-json')).statusCode, 400);
  const list1 = (await get('/incidents?limit=1')).json(); const list2 = (await get(`/incidents?limit=1&cursor=${list1.nextCursor}`)).json(); assert.notEqual(list1.items[0].id, list2.items[0].id);
});
test('raw downloads require admin authority and append an audit without source values', async () => {
  const item = await imported('Raw evidence');
  assert.equal((await get(`/incidents/${item.incidentId}/raw/1`, member)).statusCode, 403);
  const response = await get(`/incidents/${item.incidentId}/raw/1`, admin); assert.equal(response.statusCode, 200, response.body); assert.match(String(response.headers['content-disposition']), /^attachment/); assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.json().schema_version, '1.0');
  const audit = await db.execute(sql`SELECT metadata_json FROM shared_activity_events WHERE tenant_id=${owner.currentTenantId} AND object_id=${item.incidentId} AND event_type='techdeck.resolution.raw_downloaded'`); assert.equal(audit.rows.length, 1); assert.deepEqual(audit.rows[0].metadata_json, { revision: 1 });
});
test('metadata changes use optimistic versions, audit and validated native links without changing source', async () => {
  const item = await imported('Review evidence');
  const first = await patch(item.incidentId, { expectedVersion: 1, reviewStatus: 'reviewed', links: { directoryOrganizationId: organizationId } }, member); assert.equal(first.statusCode, 200, first.body); assert.equal(first.json().version, 2);
  assert.equal((await patch(item.incidentId, { expectedVersion: 1, reviewStatus: 'unreviewed' }, member)).statusCode, 409);
  assert.equal((await patch(item.incidentId, { expectedVersion: 2, title: 'forged' })).statusCode, 400);
  assert.equal((await patch(item.incidentId, { expectedVersion: 2, minimumRole: 'owner' }, admin)).statusCode, 403);
  assert.equal((await patch(item.incidentId, { expectedVersion: 2, links: { directoryOrganizationId: randomUUID() } })).statusCode, 404);
  const filtered = await get(`/incidents?clientId=${organizationId}&review=reviewed`); assert.equal(filtered.json().items.length, 1); assert.equal(filtered.json().items[0].id, item.incidentId);
  assert.equal((await patch(item.incidentId, { expectedVersion: 2, links: {} })).statusCode, 200);
  assert.equal((await get(`/incidents?clientId=${organizationId}`)).json().items.length, 0);
  assert.equal((await get(`/incidents/${item.incidentId}/history`)).json().items.length, 1);
});
test('reprocess removes stale exact and full-text candidates while history retains revisions', async () => {
  const item = await imported('Unique stale phrase quasarwidget', owner, data => { data.issue.error_codes = ['0x1234abcd']; });
  const oldPage = (await get(`/incidents/${item.incidentId}/sections/evidence_links?limit=1`)).json();
  const data = JSON.parse(rawText); data.incident.title = `Fresh source ${randomUUID()}`; data.issue.error_codes = ['0x9999abcd'];
  await importResolutionExport(context(), { rawText: JSON.stringify(data), humanReport: null, links: {} }, randomUUID(), { incidentId: item.incidentId, expectedVersion: 1 });
  for (const q of ['0x1234abcd', 'quasarwidget']) assert.ok(!(await post('/search', { q })).body.includes(item.incidentId));
  assert.ok((await post('/search', { q: '0x9999abcd' })).body.includes(item.incidentId));
  assert.equal((await get(`/incidents/${item.incidentId}/history`)).json().items.length, 2);
  assert.equal((await get(`/incidents/${item.incidentId}/sections/evidence_links?cursor=${oldPage.nextCursor}`)).statusCode, 400);
});
test('archive excludes every retrieval surface and cannot be performed by members', async () => {
  const item = await imported('Archive sentinel');
  assert.equal((await post(`/incidents/${item.incidentId}/archive`, { expectedVersion: 1 }, member)).statusCode, 403);
  assert.equal((await post(`/incidents/${item.incidentId}/archive`, { expectedVersion: 1 })).statusCode, 200);
  for (const suffix of ['', '/sections/warnings', '/history', '/related', '/raw/1']) assert.equal((await get(`/incidents/${item.incidentId}${suffix}`)).statusCode, 404);
  assert.ok(!(await post('/search', { q: 'Archive sentinel' })).body.includes(item.incidentId));
});
test('native link choices are bounded and tenant scoped across all record types', async () => {
  for (const kind of ['client', 'asset', 'ticket']) { const response = await get(`/link-options?kind=${kind}`); assert.equal(response.statusCode, 200, response.body); assert.ok(response.json().items.length <= 30); }
  assert.equal((await get(`/link-options?kind=site&clientId=${organizationId}`)).statusCode, 200); assert.equal((await get('/link-options?kind=users')).statusCode, 400);
  const mapped = await importResolutionExport(context(), { rawText, humanReport: null, links: { assets: [{ index: 0, assetId }] } }, randomUUID());
  assert.equal((await get(`/incidents?assetId=${assetId}`)).json().items[0].id, mapped.incidentId);
});
