import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createNinjaPoolSocketAuthority, NINJA_POOL_SOCKET_AUTHORITY_MS } from '../src/lib/ninja-pool-socket-authority.js';

const actor = { tenantId: 'tenant-a', userId: 'user-a' };
type Guard = (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
function fixture(guard?: Guard) {
  let time = 1_000;
  let denials = 0;
  const original = {
    headers: { cookie: 'operatoros_session=synthetic-cookie', 'x-tenant-id': 'tenant-a' },
    cookies: { operatoros_session: 'synthetic-cookie' },
    params: { id: 'room-a' }, url: '/v1/modules/ninja-pool-hall/rooms/room-a/socket', method: 'GET',
    user: { id: actor.userId }, authSession: { sessionType: 'module', tenantId: actor.tenantId, moduleId: 'ninja-pool-hall', exp: 60 },
    [Symbol.for('operatoros.tenantAuthCache')]: { context: { tenantId: 'stale-tenant' } },
  } as unknown as FastifyRequest;
  const allow: Guard = async request => {
    Object.assign(request, { user: { id: actor.userId }, tenantContext: { tenantId: actor.tenantId }, tenantModuleAccessLevel: 'user',
      authSession: { sessionType: 'module', moduleId: 'ninja-pool-hall', tenantId: actor.tenantId, exp: 60 } });
  };
  const authority = createNinjaPoolSocketAuthority(original, actor, [allow, ...(guard ? [guard] : [])], () => { denials++; }, () => time);
  return { original, authority, advance(ms: number) { time += ms; }, denials: () => denials };
}

test('each check uses fresh canonical authority, pinned actor and no tenant cache', async () => {
  const seen: FastifyRequest[] = [];
  const f = fixture(async request => { seen.push(request); });
  assert.equal(await f.authority.refresh(), true);
  assert.equal(f.authority.maySend(), true);
  assert.equal(await f.authority.refresh(), true);
  assert.notEqual(seen[0], f.original);
  assert.notEqual(seen[0], seen[1]);
  assert.equal(Symbol.for('operatoros.tenantAuthCache') in seen[0]!, false);
  assert.equal((seen[0]!.params as any).tenantId, actor.tenantId);
});

test('revocation closes once and never renews a stopped socket', async () => {
  let revoked = false;
  const f = fixture(async (_request, reply) => { if (revoked) reply.code(403).send({ code: 'REVOKED' }); });
  assert.equal(await f.authority.refresh(), true);
  revoked = true;
  assert.equal(await f.authority.refresh(), false);
  assert.equal(f.authority.maySend(), false);
  revoked = false;
  assert.equal(await f.authority.refresh(), false);
  assert.equal(f.denials(), 1);
});

test('authority lookup failure fails closed', async () => {
  const f = fixture(async () => { throw new Error('Synthetic lookup outage'); });
  assert.equal(await f.authority.refresh(), false);
  assert.equal(f.authority.maySend(), false);
  assert.equal(f.denials(), 1);
});

test('an expired lease blocks outbound broadcasts until a fresh successful read', async () => {
  const f = fixture();
  assert.equal(await f.authority.refresh(), true);
  f.advance(NINJA_POOL_SOCKET_AUTHORITY_MS);
  assert.equal(f.authority.maySend(), false);
  assert.equal(await f.authority.refresh(), true);
  assert.equal(f.authority.maySend(), true);
});

test('session expiry cannot be prolonged by subsequent checks', async () => {
  const f = fixture();
  assert.equal(await f.authority.refresh(), true);
  f.advance(59_000);
  assert.equal(f.authority.maySend(), false);
  assert.equal(await f.authority.refresh(), false);
  assert.equal(f.denials(), 1);
});

test('changed user, tenant, module or read-only access cannot retain a socket', async () => {
  for (const changed of [
    { user: { id: 'user-b' } }, { tenantContext: { tenantId: 'tenant-b' } }, { tenantModuleAccessLevel: 'viewer' },
    { authSession: { sessionType: 'module', moduleId: 'outcall', tenantId: 'tenant-a', exp: 60 } },
  ]) {
    const f = fixture(async request => { Object.assign(request, changed); });
    assert.equal(await f.authority.refresh(), false);
    assert.equal(f.authority.maySend(), false);
  }
});

test('pending checks are shared and cannot resurrect a disconnected socket', async () => {
  let release: () => void = () => {};
  const wait = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async () => wait);
  const first = f.authority.refresh();
  assert.equal(f.authority.refresh(), first);
  f.authority.stop();
  release();
  assert.equal(await first, false);
  assert.equal(f.authority.maySend(), false);
  assert.equal(f.denials(), 0);
});

test('slow successful authority cannot create an already-expired lease', async () => {
  let release: () => void = () => {};
  const wait = new Promise<void>(resolve => { release = resolve; });
  const f = fixture(async () => wait);
  const checking = f.authority.refresh();
  f.advance(NINJA_POOL_SOCKET_AUTHORITY_MS);
  release();
  assert.equal(await checking, false);
  assert.equal(f.authority.maySend(), false);
});
