import { after, afterEach, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { eq, sql } from 'drizzle-orm';
import { db, closeDatabasePool } from '../src/db.js';
import { tenants, tenantUsers, tenantModules, tenantUserModuleAccess, modules, users } from '../src/schema.js';
import { createTestUser, cleanupUser, ensureSchemaReady } from './_setup.js';
import { registerTechDeckResolutionRoutes } from '../src/routes/techdeck-resolution-routes.js';
import { importResolutionExport, type ResolutionContext } from '../src/lib/techdeck-resolution-ingestion.js';
import { createServiceIdentityAndToken, revokeApiToken } from '../src/lib/shared-platform-control-plane.js';

const rawText = readFileSync(new URL('./fixtures/techdeck-resolution-cam-wal-v1.json', import.meta.url), 'utf8');
const base = '/v1/modules/techdeck/resolution-intelligence', headless = '/v1/headless/techdeck/resolution-intelligence';
type Actor = Awaited<ReturnType<typeof createTestUser>>;
let owner: Actor, foreign: Actor, member: Actor, viewer: Actor, moduleViewer: Actor, admin: Actor, portal: Actor;
let app: FastifyInstance, moduleId: string, organizationId: string, siteId: string, assetId: string;
let signToken: typeof import('../src/lib/auth.js').signToken;
let logs = '';
const actors: Actor[] = [];
function context(actor = owner): ResolutionContext { return { tenantId: actor.currentTenantId!, actorUserId: actor.id, moduleId, role: 'owner' }; }
function headers(actor = owner, tenantId = owner.currentTenantId!) {
  return { authorization: `Bearer ${signToken({ userId: actor.id, email: actor.email, role: actor.role, tokenVersion: actor.tokenVersion, sessionType: 'platform' })}`, 'x-tenant-id': tenantId };
}
function source(title: string) { const data = JSON.parse(rawText); data.incident.title = title; return JSON.stringify(data); }
function request(path = '/exports', actor = owner, payload: unknown = { rawText }, key = randomUUID(), tenantId = owner.currentTenantId!) {
  return app.inject({ method: 'POST', url: base + path, headers: { ...headers(actor, tenantId), 'idempotency-key': key }, payload });
}
async function tokens(scopes: string[], actor = owner, selectedModule = moduleId) {
  return createServiceIdentityAndToken({ tenantId: owner.currentTenantId!, moduleId: selectedModule, actorUserId: actor.id, identityName: `Synthetic intake ${randomUUID()}`, tokenName: 'Synthetic intake', scopes });
}
function headlessRequest(token: string, payload: unknown = { rawText }, extra: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: headless + '/exports', headers: { authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(), ...extra }, payload });
}

before(async () => {
  const url = new URL(process.env.DATABASE_URL ?? 'invalid:');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
  assert.match(url.pathname, /(?:test|disposable|phase21|ci)/i);
  assert.equal(process.env.PARITY_DATABASE_IS_DISPOSABLE, '1'); assert.equal(process.env.APP_ENV, 'test');
  await ensureSchemaReady();
  ({ signToken } = await import('../src/lib/auth.js'));
  for (let index = 0; index < 7; index++) actors.push(await createTestUser());
  [owner, foreign, member, viewer, moduleViewer, admin, portal] = actors;
  const [module] = await db.select().from(modules).where(eq(modules.slug, 'techdeck')); assert.ok(module); moduleId = module.id;
  for (const actor of [owner, foreign]) await db.insert(tenantModules).values({ tenantId: actor.currentTenantId!, moduleId, status: 'enabled', source: 'admin', allowAllMembers: true });
  for (const [actor, role, access] of [[member, 'member', 'user'], [viewer, 'viewer', 'user'], [moduleViewer, 'member', 'viewer'], [admin, 'admin', 'manager'], [portal, 'member', 'user']] as const) {
    await db.insert(tenantUsers).values({ tenantId: owner.currentTenantId!, userId: actor.id, role });
    await db.insert(tenantUserModuleAccess).values({ tenantId: owner.currentTenantId!, userId: actor.id, moduleId, accessLevel: access });
  }
  const organization = await db.execute(sql`INSERT INTO directory_organizations(tenant_id,name,normalized_name,type,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},'Synthetic resolution client','synthetic resolution client','client',${owner.id},${owner.id}) RETURNING id`);
  organizationId = String(organization.rows[0].id);
  const site = await db.execute(sql`INSERT INTO directory_sites(tenant_id,organization_id,name,normalized_name,created_by_user_id,updated_by_user_id) VALUES (${owner.currentTenantId},${organizationId},'Synthetic site','synthetic site',${owner.id},${owner.id}) RETURNING id`); siteId = String(site.rows[0].id);
  const asset = await db.execute(sql`INSERT INTO techdeck_assets(tenant_id,name,type) VALUES (${owner.currentTenantId},'Synthetic resolution device','endpoint') RETURNING id`); assetId = String(asset.rows[0].id);
  await db.execute(sql`INSERT INTO techdeck_portal_assignments(tenant_id,user_id,directory_organization_id,created_by_user_id) VALUES (${owner.currentTenantId},${portal.id},${organizationId},${owner.id})`);
  app = Fastify({ logger: { stream: new Writable({ write(chunk, _encoding, callback) { logs += chunk.toString(); callback(); } }) } });
  await app.register(cookie); await registerTechDeckResolutionRoutes(app); await app.ready();
});
afterEach(async () => {
  const keys = actors.flatMap(actor => [`techdeck-resolution:tenant:${actor.currentTenantId}`, `techdeck-resolution:actor:${owner.currentTenantId}:${actor.id}`]);
  const hashes = keys.map(key => createHash('sha256').update(key).digest('hex'));
  await db.execute(sql`DELETE FROM auth_request_limits WHERE key_hash IN (${sql.join(hashes.map(hash => sql`${hash}`), sql`,`)})`);
});
after(async () => {
  if (app) await app.close();
  if (owner) {
    await db.execute(sql`DELETE FROM techdeck_resolution_incidents WHERE tenant_id IN (${owner.currentTenantId},${foreign.currentTenantId})`);
    await db.execute(sql`DELETE FROM techdeck_portal_assignments WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM techdeck_assets WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM directory_sites WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM directory_organizations WHERE tenant_id=${owner.currentTenantId}`);
  }
  for (const actor of actors.reverse()) await cleanupUser(actor.id);
  await closeDatabasePool();
});

test('preview writes no incident, source, audit or idempotency result', async () => {
  const before = await db.execute(sql`SELECT (SELECT count(*) FROM techdeck_resolution_incidents WHERE tenant_id=${owner.currentTenantId}) AS incidents,(SELECT count(*) FROM shared_activity_events WHERE tenant_id=${owner.currentTenantId}) AS audit,(SELECT count(*) FROM shared_idempotency_keys WHERE tenant_id=${owner.currentTenantId}) AS retries`);
  const response = await request('/exports/validate'); assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().valid, true);
  assert.equal(response.headers['cache-control'], 'no-store'); assert.ok(!response.body.includes('rawText'));
  const after = await db.execute(sql`SELECT (SELECT count(*) FROM techdeck_resolution_incidents WHERE tenant_id=${owner.currentTenantId}) AS incidents,(SELECT count(*) FROM shared_activity_events WHERE tenant_id=${owner.currentTenantId}) AS audit,(SELECT count(*) FROM shared_idempotency_keys WHERE tenant_id=${owner.currentTenantId}) AS retries`);
  assert.deepEqual(after.rows, before.rows);
});

test('import commits exact raw source, normalized provenance, graph, search and audit together', async () => {
  const response = await request('/exports', owner, { rawText, links: { directoryOrganizationId: organizationId, directorySiteId: siteId, assets: [{ index: 0, assetId }] } });
  assert.equal(response.statusCode, 201, response.body); const receipt = response.json(); assert.equal(receipt.embeddingState, 'not_enabled');
  const stored = await db.execute(sql`SELECT raw_text,security_screened FROM techdeck_resolution_raw_exports WHERE tenant_id=${owner.currentTenantId} AND incident_id=${receipt.incidentId}`);
  assert.equal(stored.rows[0].raw_text, rawText); assert.equal(stored.rows[0].security_screened, true);
  const mapping = await db.execute(sql`SELECT asset_id FROM techdeck_resolution_incident_assets WHERE tenant_id=${owner.currentTenantId} AND incident_id=${receipt.incidentId}`); assert.equal(mapping.rows[0].asset_id, assetId);
  const audit = await db.execute(sql`SELECT summary,metadata_json FROM shared_activity_events WHERE tenant_id=${owner.currentTenantId} AND object_id=${receipt.incidentId}`); assert.equal(audit.rows.length, 1); assert.ok(!JSON.stringify(audit.rows).includes('CapabilityAccessManager'));
  const warnings = await db.execute(sql`SELECT description FROM techdeck_resolution_warnings WHERE tenant_id=${owner.currentTenantId} AND incident_id=${receipt.incidentId}`); assert.ok(String(warnings.rows[0].description).includes('was followed by'));
  const exact = await db.execute(sql`SELECT normalized_value FROM techdeck_resolution_identifiers WHERE tenant_id=${owner.currentTenantId} AND incident_id=${receipt.incidentId} AND normalized_value='0x800f0915'`); assert.equal(exact.rows.length, 1);
  const evidence = await db.execute(sql`SELECT numeric_value,source_pointer FROM techdeck_resolution_evidence_links WHERE tenant_id=${owner.currentTenantId} AND incident_id=${receipt.incidentId} AND source_evidence_id='measurement-3'`); assert.equal(String(evidence.rows[0].numeric_value), '59398270752'); assert.equal(evidence.rows[0].source_pointer, '/evidence/2');
});

test('concurrent same-tenant imports create one incident and other tenants independently retain identical evidence', async () => {
  const text = source('Concurrent synthetic case');
  const results = await Promise.all(Array.from({ length: 4 }, () => request('/exports', owner, { rawText: text })));
  assert.deepEqual(results.map(result => result.statusCode).sort(), [200, 200, 200, 201]);
  assert.equal(new Set(results.map(result => result.json().incidentId)).size, 1);
  const other = await request('/exports', foreign, { rawText: text }, randomUUID(), foreign.currentTenantId!); assert.equal(other.statusCode, 201, other.body);
  assert.notEqual(other.json().incidentId, results[0].json().incidentId);
});

test('same idempotency key replays exact operation; changed bytes return conflict', async () => {
  const key = randomUUID(), payload = { rawText: source('Retry synthetic case') };
  const first = await request('/exports', owner, payload, key); assert.equal(first.statusCode, 201, first.body);
  const replay = await request('/exports', owner, payload, key); assert.equal(replay.statusCode, 200, replay.body); assert.equal(replay.json().incidentId, first.json().incidentId); assert.equal(replay.json().replayed, true);
  assert.equal((await request('/exports', owner, { rawText: payload.rawText + '\n' }, key)).statusCode, 409);
});

test('reprocessing appends a coherent revision, preserves prior raw and rejects stale versions', async () => {
  const original = source('Revision one');
  const revisedSource = JSON.parse(source('Revision two'));
  revisedSource.incident.opened_at = '0000-01-01T00:00:00Z';
  const updated = JSON.stringify(revisedSource);
  const first = await request('/exports', owner, { rawText: original }); const id = first.json().incidentId;
  assert.equal(first.statusCode, 201, first.body);
  const next = await request(`/incidents/${id}/reprocess`, admin, { rawText: updated, expectedVersion: 1 }); assert.equal(next.statusCode, 201, next.body); assert.equal(next.json().activeRevision, 2);
  const raw = await db.execute(sql`SELECT revision,raw_text FROM techdeck_resolution_raw_exports WHERE tenant_id=${owner.currentTenantId} AND incident_id=${id} ORDER BY revision`);
  assert.deepEqual(raw.rows.map(row => row.raw_text), [original, updated]);
  const timestamps = await db.execute(sql`SELECT opened_at FROM techdeck_resolution_incidents WHERE tenant_id=${owner.currentTenantId} AND id=${id}`);
  assert.equal(timestamps.rows[0].opened_at, null);
  assert.ok(next.json().warnings.some((warning: { code: string }) => warning.code === 'DATE_UNRESOLVED'));
  const active = await db.execute(sql`SELECT i.title,s.revision FROM techdeck_resolution_incidents i JOIN techdeck_resolution_search_documents s ON s.tenant_id=i.tenant_id AND s.incident_id=i.id AND s.revision=i.active_revision WHERE i.tenant_id=${owner.currentTenantId} AND i.id=${id}`); assert.ok(active.rows.every(row => row.title === 'Revision two' && row.revision === 2));
  assert.equal((await request(`/incidents/${id}/reprocess`, owner, { rawText: source('Revision three'), expectedVersion: 1 })).statusCode, 409);
  assert.equal((await request(`/incidents/${id}/reprocess`, member, { rawText: source('Forbidden revision'), expectedVersion: 2 })).statusCode, 403);
});

test('foreign incidents and native references remain undisclosed', async () => {
  const imported = await request('/exports', foreign, { rawText: source('Foreign synthetic case') }, randomUUID(), foreign.currentTenantId!); assert.equal(imported.statusCode, 201, imported.body);
  assert.equal((await request(`/incidents/${imported.json().incidentId}/reprocess`, owner, { rawText, expectedVersion: 1 })).statusCode, 404);
  const forged = await request('/exports', foreign, { rawText: source('Foreign link'), links: { directoryOrganizationId: organizationId, directorySiteId: siteId } }, randomUUID(), foreign.currentTenantId!); assert.equal(forged.statusCode, 404, forged.body);
  const device = await request('/exports', foreign, { rawText: source('Foreign device'), links: { assets: [{ index: 0, assetId }] } }, randomUUID(), foreign.currentTenantId!); assert.equal(device.statusCode, 404, device.body);
  assert.ok(!forged.body.includes(organizationId));
});

test('member import is allowed; viewer, module-viewer, portal and forged selectors are denied', async () => {
  assert.equal((await request('/exports', member, { rawText: source('Member evidence') })).statusCode, 201);
  for (const actor of [viewer, moduleViewer, portal]) assert.equal((await request('/exports/validate', actor)).statusCode, 403);
  assert.equal((await request('/exports', member, { rawText }, randomUUID(), foreign.currentTenantId!)).statusCode, 404);
  const unauthenticated = await app.inject({ method: 'POST', url: base + '/exports', payload: 'not-json', headers: { 'content-type': 'application/json' } }); assert.equal(unauthenticated.statusCode, 401);
});

test('module sessions cannot change tenant or module to ingest evidence', async () => {
  const auth = signToken({ userId: owner.id, email: owner.email, role: owner.role, tokenVersion: owner.tokenVersion, sessionType: 'module', moduleId: 'techdeck', tenantId: owner.currentTenantId! });
  const response = await app.inject({ method: 'POST', url: base + '/exports', headers: { authorization: `Bearer ${auth}`, 'x-tenant-id': foreign.currentTenantId! }, payload: { rawText } }); assert.equal(response.statusCode, 403, response.body);
  const otherModule = signToken({ userId: owner.id, email: owner.email, role: owner.role, tokenVersion: owner.tokenVersion, sessionType: 'module', moduleId: 'pulsedesk', tenantId: owner.currentTenantId! });
  const wrong = await app.inject({ method: 'POST', url: base + '/exports', headers: { authorization: `Bearer ${otherModule}` }, payload: { rawText } }); assert.equal(wrong.statusCode, 403, wrong.body);
});

test('secrets, malformed source and invalid UTF-8 do not reach persistence or request logs', async () => {
  const marker = 'synthetic-sensitive-marker-ONLY';
  const payload = JSON.parse(rawText); payload.extra = { password: marker };
  const response = await request('/exports', owner, { rawText: JSON.stringify(payload) }); assert.equal(response.statusCode, 422); assert.ok(!response.body.includes(marker));
  const malformed = await request('/exports', owner, { rawText: '{"a":1,"a":2}' }); assert.equal(malformed.statusCode, 400);
  const badUtf8 = await app.inject({ method: 'POST', url: base + '/exports', headers: { ...headers(), 'content-type': 'application/json' }, payload: Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]) }); assert.equal(badUtf8.statusCode, 400);
  const outerDuplicate = await app.inject({ method: 'POST', url: base + '/exports', headers: { ...headers(), 'content-type': 'application/json' }, payload: '{"rawText":"{}","rawText":"{}"}' }); assert.equal(outerDuplicate.statusCode, 400);
  const stored = await db.execute(sql`SELECT count(*)::int AS count FROM techdeck_resolution_raw_exports WHERE tenant_id=${owner.currentTenantId} AND raw_text LIKE ${`%${marker}%`}`); assert.equal(stored.rows[0].count, 0);
  assert.ok(!logs.includes(marker)); assert.ok(!logs.includes('CapabilityAccessManager.db-wal'));
});

test('late audit failure rolls back incident, children, raw and idempotency claim, then retry succeeds', async () => {
  const input = { rawText: source('Atomic rollback synthetic case'), humanReport: null, links: {} }, key = randomUUID();
  const before = await db.execute(sql`SELECT count(*)::int AS count FROM techdeck_resolution_incidents WHERE tenant_id=${owner.currentTenantId}`);
  await db.execute(sql`CREATE FUNCTION resolution_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='techdeck.resolution.imported' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`);
  await db.execute(sql`CREATE TRIGGER resolution_test_fail_audit BEFORE INSERT ON shared_activity_events FOR EACH ROW EXECUTE FUNCTION resolution_test_fail_audit()`);
  try { await assert.rejects(() => importResolutionExport(context(), input, key)); }
  finally { await db.execute(sql`DROP TRIGGER resolution_test_fail_audit ON shared_activity_events`); await db.execute(sql`DROP FUNCTION resolution_test_fail_audit()`); }
  const after = await db.execute(sql`SELECT count(*)::int AS count FROM techdeck_resolution_incidents WHERE tenant_id=${owner.currentTenantId}`); assert.deepEqual(after.rows, before.rows);
  const saved = await importResolutionExport(context(), input, key); assert.equal('status' in saved && saved.status, 'imported');
});

test('replay and duplicate responses recheck visibility and archive state', async () => {
  const raw = source('Visibility synthetic case'), key = randomUUID();
  const first = await request('/exports', member, { rawText: raw }, key); assert.equal(first.statusCode, 201, first.body); const id = first.json().incidentId;
  await db.execute(sql`UPDATE techdeck_resolution_incidents SET minimum_role='owner' WHERE tenant_id=${owner.currentTenantId} AND id=${id}`);
  const replay = await request('/exports', member, { rawText: raw }, key); assert.equal(replay.statusCode, 404); assert.ok(!replay.body.includes(id));
  const duplicate = await request('/exports', member, { rawText: raw }); assert.equal(duplicate.statusCode, 409); assert.ok(!duplicate.body.includes(id));
  await db.execute(sql`UPDATE techdeck_resolution_incidents SET archived_at=NOW() WHERE tenant_id=${owner.currentTenantId} AND id=${id}`);
  assert.equal((await request('/exports', owner, { rawText: raw })).statusCode, 409);
});

test('headless requires narrow central scope and binds current tenant, module, creator and revocation', async () => {
  const token = await tokens(['techdeck:resolution:import']);
  const ok = await headlessRequest(token.rawToken, { rawText: source('Headless synthetic case') }); assert.equal(ok.statusCode, 201, ok.body);
  const broad = await tokens(['techdeck:write']); assert.equal((await headlessRequest(broad.rawToken)).statusCode, 401);
  assert.equal((await headlessRequest(token.rawToken, { rawText }, { 'x-tenant-id': foreign.currentTenantId! })).statusCode, 401);
  const [otherModule] = await db.select().from(modules).where(eq(modules.slug, 'pulsedesk'));
  const wrongModule = await tokens(['techdeck:resolution:import'], owner, otherModule.id); assert.equal((await headlessRequest(wrongModule.rawToken)).statusCode, 401);
  await db.update(users).set({ status: 'suspended' }).where(eq(users.id, owner.id));
  try { assert.equal((await headlessRequest(token.rawToken)).statusCode, 403); }
  finally { await db.update(users).set({ status: 'active' }).where(eq(users.id, owner.id)); }
  await revokeApiToken({ tenantId: owner.currentTenantId!, tokenId: String(token.token.id) }); assert.equal((await headlessRequest(token.rawToken)).statusCode, 401);
  const raw = await app.inject({ method: 'GET', url: headless + '/incidents/unknown/raw/1', headers: { authorization: `Bearer ${token.rawToken}` } }); assert.equal(raw.statusCode, 404);
});

test('suspended tenant, revoked module entitlement and global kill switch deny native and headless intake', async () => {
  const token = await tokens(['techdeck:resolution:import']);
  await db.update(tenants).set({ status: 'suspended' }).where(eq(tenants.id, owner.currentTenantId!));
  try { assert.equal((await request('/exports/validate')).statusCode, 403); assert.equal((await headlessRequest(token.rawToken)).statusCode, 403); }
  finally { await db.update(tenants).set({ status: 'active' }).where(eq(tenants.id, owner.currentTenantId!)); }
  await db.execute(sql`UPDATE tenant_modules SET status='disabled' WHERE tenant_id=${owner.currentTenantId} AND module_id=${moduleId}`);
  try { assert.equal((await request('/exports/validate')).statusCode, 403); assert.equal((await headlessRequest(token.rawToken)).statusCode, 403); }
  finally { await db.execute(sql`UPDATE tenant_modules SET status='enabled' WHERE tenant_id=${owner.currentTenantId} AND module_id=${moduleId}`); }
  const [original] = await db.select().from(modules).where(eq(modules.id, moduleId));
  await db.update(modules).set({ status: 'disabled' }).where(eq(modules.id, moduleId));
  try { assert.equal((await request('/exports/validate')).statusCode, 403); assert.equal((await headlessRequest(token.rawToken)).statusCode, 403); }
  finally { await db.update(modules).set({ status: original.status }).where(eq(modules.id, moduleId)); }
});

test('trusted actor rate budget persists and returns bounded 429', async () => {
  const hash = createHash('sha256').update(`techdeck-resolution:actor:${owner.currentTenantId}:${owner.id}`).digest('hex');
  await db.execute(sql`INSERT INTO auth_request_limits(key_hash,request_count,resets_at) VALUES (${hash},30,NOW()+INTERVAL '1 minute') ON CONFLICT(key_hash) DO UPDATE SET request_count=30,resets_at=EXCLUDED.resets_at`);
  const response = await request('/exports/validate'); assert.equal(response.statusCode, 429); assert.equal(response.headers['retry-after'], '60');
});

test('headless expiration, identity disablement and creator role/portal changes revoke intake immediately', async () => {
  const token = await tokens(['techdeck:resolution:import']);
  const tokenId = String(token.token.id), identityId = String(token.identity.id);
  await db.execute(sql`UPDATE shared_api_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE tenant_id=${owner.currentTenantId} AND id=${tokenId}`);
  assert.equal((await headlessRequest(token.rawToken)).statusCode, 401);
  await db.execute(sql`UPDATE shared_api_tokens SET expires_at=NULL WHERE tenant_id=${owner.currentTenantId} AND id=${tokenId}`);
  await db.execute(sql`UPDATE shared_service_identities SET revoked_at=NOW() WHERE tenant_id=${owner.currentTenantId} AND id=${identityId}`);
  assert.equal((await headlessRequest(token.rawToken)).statusCode, 401);
  await db.execute(sql`UPDATE shared_service_identities SET revoked_at=NULL WHERE tenant_id=${owner.currentTenantId} AND id=${identityId}`);
  await db.execute(sql`UPDATE tenant_users SET role='viewer' WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}`);
  try { assert.equal((await headlessRequest(token.rawToken)).statusCode, 401); }
  finally { await db.execute(sql`UPDATE tenant_users SET role='owner' WHERE tenant_id=${owner.currentTenantId} AND user_id=${owner.id}`); }
  const portalToken = await tokens(['techdeck:resolution:import'], portal); assert.equal((await headlessRequest(portalToken.rawToken)).statusCode, 403);
  const broad = await tokens(['techdeck:write']);
  const response = await app.inject({ method: 'POST', url: headless + '/exports', headers: { authorization: `Bearer ${broad.rawToken}`, 'content-type': 'application/json' }, payload: 'malformed-json' });
  assert.equal(response.statusCode, 401, 'headless authorization runs before parsing');
});

test('large multi-device evidence persists in bounded batches without dropping source observations', async () => {
  const payload = JSON.parse(source('Large synthetic fleet evidence'));
  payload.affected_assets = Array.from({ length: 1200 }, (_, index) => ({ hostname: `synthetic-${index}`, os_build: '10.0.26100.8457' }));
  const response = await request('/exports', owner, { rawText: JSON.stringify(payload) }); assert.equal(response.statusCode, 201, response.body);
  const persisted = await db.execute(sql`SELECT count(*)::int AS count FROM techdeck_resolution_incident_assets WHERE tenant_id=${owner.currentTenantId} AND incident_id=${response.json().incidentId}`);
  assert.equal(persisted.rows[0].count, 1200);
  assert.equal(response.json().counts.incident_assets, 1200);
});
