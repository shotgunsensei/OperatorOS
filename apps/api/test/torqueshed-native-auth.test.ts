process.env.SESSION_SECRET ||= 'operatoros-torqueshed-native-test-session-secret';
process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, tenantModules, users } from '../src/schema.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: any; let ownerA: any; let ownerB: any; let moduleRow: any; let moduleCreated = false;
let signToken: typeof import('../src/lib/auth.js').signToken;
const raw = () => crypto.randomBytes(32).toString('base64url');
const challenge = (value: string) => crypto.createHash('sha256').update(value).digest('base64url');
const platformHeaders = (user: any, tenantId = user.currentTenantId) => ({ authorization: `Bearer ${signToken({ userId: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion, sessionType: 'platform' })}`, 'x-tenant-id': tenantId });

async function authorize(user = ownerA) {
  const proof = { state: raw(), nonce: raw(), codeVerifier: raw(), deviceId: raw() };
  const response = await app.inject({ method: 'POST', url: '/v1/modules/torqueshed/native/authorize', headers: platformHeaders(user), payload: { state: proof.state, nonce: proof.nonce, codeChallenge: challenge(proof.codeVerifier), redirectUri: 'torqueshed://sso', deviceId: proof.deviceId, deviceName: 'Phase 29 test device' } });
  assert.equal(response.statusCode, 200, response.body);
  const callback = new URL(response.json().redirectUri);
  assert.equal(callback.protocol, 'torqueshed:'); assert.equal(callback.hostname, 'sso');
  assert.equal(callback.searchParams.get('state'), proof.state);
  return { ...proof, code: callback.searchParams.get('code')! };
}

async function exchange(proof: Awaited<ReturnType<typeof authorize>>) {
  return app.inject({ method: 'POST', url: '/v1/public/torqueshed/native/exchange', payload: proof });
}

before(async () => {
  await ensureSchemaReady(); ({ signToken } = await import('../src/lib/auth.js'));
  ownerA = await createTestUser(); ownerB = await createTestUser();
  [moduleRow] = await db.select().from(modules).where(eq(modules.slug, 'torqueshed')).limit(1);
  if (!moduleRow) { moduleRow = await createTestModule('torqueshed'); moduleCreated = true; }
  await db.insert(tenantModules).values([
    { tenantId: ownerA.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
    { tenantId: ownerB.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'admin', allowAllMembers: true },
  ]).onConflictDoNothing();
  const Fastify = (await import('fastify')).default; const cookie = (await import('@fastify/cookie')).default;
  const { registerTorqueShedRoutes } = await import('../src/routes/torqueshed-routes.js');
  const { registerTorqueShedWebApiRoutes } = await import('../src/routes/torqueshed-web-api-routes.js');
  const { registerTorqueShedNativeAuthRoutes } = await import('../src/routes/torqueshed-native-auth-routes.js');
  app = Fastify(); await app.register(cookie); await registerTorqueShedRoutes(app); await registerTorqueShedWebApiRoutes(app); await registerTorqueShedNativeAuthRoutes(app); await app.ready();
});

after(async () => {
  if (app) await app.close();
  for (const owner of [ownerA, ownerB]) if (owner) {
    for (const table of ['shared_attachment_blobs','shared_jobs','shared_attachments','torqueshed_build_parts','torqueshed_build_journal_entries','torqueshed_builds','torqueshed_vehicles']) {
      try { await db.execute(sql.raw(`DELETE FROM ${table} WHERE tenant_id='${String(owner.currentTenantId).replaceAll("'", "''")}'`)); } catch {}
    }
    await db.execute(sql`DELETE FROM torqueshed_native_sessions WHERE tenant_id=${owner.currentTenantId}`);
    await db.execute(sql`DELETE FROM torqueshed_native_authorization_codes WHERE tenant_id=${owner.currentTenantId}`);
  }
  if (moduleRow && ownerA && ownerB) await db.delete(tenantModules).where(and(eq(tenantModules.moduleId, moduleRow.id), inArray(tenantModules.tenantId, [ownerA.currentTenantId, ownerB.currentTenantId])));
  for (const owner of [ownerA, ownerB]) if (owner) await cleanupUser(owner.id);
  if (moduleCreated) await cleanupModule(moduleRow.id);
});

test('one-use PKCE exchange returns tenant-bound opaque tokens and supports headless API', async () => {
  const proof = await authorize(); const response = await exchange(proof);
  assert.equal(response.statusCode, 200, response.body); const session = response.json();
  assert.match(session.accessToken, /^tsn_a_[A-Za-z0-9_-]{43}$/); assert.match(session.refreshToken, /^tsn_r_[A-Za-z0-9_-]{43}$/);
  assert.equal(session.tenant.id, ownerA.currentTenantId); assert.equal(session.module, 'torqueshed');
  const dashboard = await app.inject({ method: 'GET', url: '/v1/modules/torqueshed/dashboard', headers: { authorization: `Bearer ${session.accessToken}` } });
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  const nativeHeaders = { authorization: `Bearer ${session.accessToken}` };
  const vehicleResponse = await app.inject({ method: 'POST', url: '/v1/modules/torqueshed/vehicles', headers: nativeHeaders, payload: { year: 2008, make: 'Honda', model: 'Civic', visibility: 'private' } });
  assert.equal(vehicleResponse.statusCode, 201, vehicleResponse.body);
  const buildResponse = await app.inject({ method: 'POST', url: '/v1/modules/torqueshed/builds', headers: nativeHeaders, payload: { vehicleId: vehicleResponse.json().id, title: 'Native queue proof', visibility: 'private' } });
  assert.equal(buildResponse.statusCode, 201, buildResponse.body); const build = buildResponse.json();
  const journalHeaders = { ...nativeHeaders, 'idempotency-key': 'native-journal-mutation-0001' };
  const journalOne = await app.inject({ method: 'POST', url: `/v1/modules/torqueshed/builds/${build.id}/journal`, headers: journalHeaders, payload: { title: 'Queued note', body: 'Sent once after reconnect.' } });
  const journalReplay = await app.inject({ method: 'POST', url: `/v1/modules/torqueshed/builds/${build.id}/journal`, headers: journalHeaders, payload: { title: 'Queued note', body: 'Sent once after reconnect.' } });
  assert.equal(journalOne.statusCode, 201, journalOne.body); assert.equal(journalReplay.statusCode, 200, journalReplay.body); assert.equal(journalReplay.json().entry.id, journalOne.json().entry.id);
  const journalActivity = await db.execute(sql`SELECT count(*)::int AS count FROM shared_activity_events WHERE tenant_id=${ownerA.currentTenantId} AND object_id=${build.id} AND event_type='journal_entry'`);
  const journalAudit = await db.execute(sql`SELECT count(*)::int AS count FROM admin_audit_logs WHERE tenant_id=${ownerA.currentTenantId} AND action='created' AND details->>'targetType'='torqueshed_build_journal_entry' AND details->>'targetId'=${journalOne.json().entry.id}`);
  assert.equal(Number(journalActivity.rows[0]?.count), 1); assert.equal(Number(journalAudit.rows[0]?.count), 1);
  const partHeaders = { ...nativeHeaders, 'idempotency-key': 'native-part-mutation-0001' };
  const partOne = await app.inject({ method: 'POST', url: `/v1/modules/torqueshed/builds/${build.id}/parts`, headers: partHeaders, payload: { name: 'Coilovers', quantity: 1, unitCostMinor: 95000 } });
  const partReplay = await app.inject({ method: 'POST', url: `/v1/modules/torqueshed/builds/${build.id}/parts`, headers: partHeaders, payload: { name: 'Coilovers', quantity: 1, unitCostMinor: 95000 } });
  assert.equal(partOne.statusCode, 201, partOne.body); assert.equal(partReplay.statusCode, 200, partReplay.body); assert.equal(partReplay.json().part.id, partOne.json().part.id);
  const partCount = await db.execute(sql`SELECT count(*)::int AS count FROM torqueshed_build_parts WHERE tenant_id=${ownerA.currentTenantId} AND build_id=${build.id} AND client_mutation_id='native-part-mutation-0001'`);
  assert.equal(Number(partCount.rows[0]?.count), 1);
  const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const mediaHeaders = { ...nativeHeaders, 'idempotency-key': 'native-media-mutation-0001' };
  const mediaOne = await app.inject({ method: 'POST', url: `/v1/modules/torqueshed/builds/${build.id}/attachments`, headers: mediaHeaders, payload: { originalName: 'proof.png', declaredMimeType: 'image/png', contentBase64: image } });
  const mediaReplay = await app.inject({ method: 'POST', url: `/v1/modules/torqueshed/builds/${build.id}/attachments`, headers: mediaHeaders, payload: { originalName: 'proof.png', declaredMimeType: 'image/png', contentBase64: image } });
  assert.equal(mediaOne.statusCode, 201, mediaOne.body); assert.equal(mediaReplay.statusCode, 201, mediaReplay.body); assert.equal(mediaReplay.json().id, mediaOne.json().id);
  const replay = await exchange(proof); assert.equal(replay.statusCode, 401, replay.body);
});

test('refresh rotates both credentials and refresh-bound logout revokes the device session', async () => {
  const proof = await authorize(); const first = (await exchange(proof)).json();
  const refresh = await app.inject({ method: 'POST', url: '/v1/public/torqueshed/native/refresh', payload: { refreshToken: first.refreshToken, deviceId: proof.deviceId } });
  assert.equal(refresh.statusCode, 200, refresh.body); const next = refresh.json(); assert.notEqual(next.accessToken, first.accessToken); assert.notEqual(next.refreshToken, first.refreshToken);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/modules/torqueshed/dashboard', headers: { authorization: `Bearer ${first.accessToken}` } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/public/torqueshed/native/logout', payload: { refreshToken: next.refreshToken, deviceId: raw() } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/modules/torqueshed/dashboard', headers: { authorization: `Bearer ${next.accessToken}` } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/public/torqueshed/native/logout', payload: { refreshToken: next.refreshToken, deviceId: proof.deviceId } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/modules/torqueshed/dashboard', headers: { authorization: `Bearer ${next.accessToken}` } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/v1/public/torqueshed/native/refresh', payload: { refreshToken: next.refreshToken, deviceId: proof.deviceId } })).statusCode, 401);
});

test('cross-tenant authorization and changed global token version fail closed', async () => {
  const cross = await app.inject({ method: 'POST', url: '/v1/modules/torqueshed/native/authorize', headers: platformHeaders(ownerA, ownerB.currentTenantId), payload: { state: raw(), nonce: raw(), codeChallenge: challenge(raw()), redirectUri: 'torqueshed://sso', deviceId: raw(), deviceName: 'wrong tenant' } });
  assert.equal(cross.statusCode, 404, cross.body);
  const proof = await authorize(); const session = (await exchange(proof)).json();
  await db.update(users).set({ tokenVersion: ownerA.tokenVersion + 1 }).where(eq(users.id, ownerA.id));
  assert.equal((await app.inject({ method: 'GET', url: '/v1/modules/torqueshed/dashboard', headers: { authorization: `Bearer ${session.accessToken}` } })).statusCode, 401);
  ownerA.tokenVersion += 1;
});
