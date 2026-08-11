import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { eq } from 'drizzle-orm';
import type { WebSocket } from 'ws';
import { db } from '../src/db.js';
import { ninjaPoolOnlineEvents, ninjaPoolOnlineRateLimits, ninjaPoolOnlineRooms, tenantModules, tenantUsers } from '../src/schema.js';
import { simulateOnlineShot } from '../src/lib/ninja-pool-online.js';
import type { GameState, Settings, Shot } from '../src/lib/ninja-pool-game.js';
import { cleanupModule, cleanupUser, createTestModule, createTestUser, ensureSchemaReady } from './_setup.js';

let app: ReturnType<typeof Fastify>;
let moduleRow: Awaited<ReturnType<typeof createTestModule>>;
let hostUser: Awaited<ReturnType<typeof createTestUser>>;
let guestUser: Awaited<ReturnType<typeof createTestUser>>;
let outsider: Awaited<ReturnType<typeof createTestUser>>;
let hostCookie: string;
let guestCookie: string;
let outsiderCookie: string;

async function moduleCookie(user: Awaited<ReturnType<typeof createTestUser>>, tenantId = user.currentTenantId) {
  const { signToken } = await import('../src/lib/auth.js');
  return `operatoros_session=${signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    sessionType: 'module',
    tenantId,
    moduleId: 'ninja-pool-hall',
  })}`;
}

interface SocketHarness {
  ws: WebSocket;
  next(type: string, timeoutMs?: number): Promise<Record<string, any>>;
}

async function openSocket(path: string, authCookie: string): Promise<SocketHarness> {
  const messages: Array<Record<string, any>> = [];
  const waiters: Array<{ type: string; resolve: (message: Record<string, any>) => void }> = [];
  const ws = await app.injectWS(path, { headers: { cookie: authCookie } }, {
    onInit(socket) {
      socket.on('message', (value) => {
        const message = JSON.parse(value.toString()) as Record<string, any>;
        const waiterIndex = waiters.findIndex((waiter) => waiter.type === message.type);
        if (waiterIndex >= 0) waiters.splice(waiterIndex, 1)[0]!.resolve(message);
        else messages.push(message);
      });
    },
  });
  return {
    ws,
    next(type, timeoutMs = 4_000) {
      const existingIndex = messages.findIndex((message) => message.type === type);
      if (existingIndex >= 0) return Promise.resolve(messages.splice(existingIndex, 1)[0]!);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve };
        waiters.push(waiter);
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error(`Timed out waiting for ${type}; queued=${messages.map((message) => message.type).join(',')}`));
        }, timeoutMs);
        timer.unref();
        waiter.resolve = (message) => { clearTimeout(timer); resolve(message); };
      });
    },
  };
}

before(async () => {
  await ensureSchemaReady();
  moduleRow = await createTestModule('ninja-pool-hall');
  hostUser = await createTestUser();
  guestUser = await createTestUser();
  outsider = await createTestUser();
  await db.insert(tenantModules).values([
    { tenantId: hostUser.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'included', allowAllMembers: true },
    { tenantId: outsider.currentTenantId, moduleId: moduleRow.id, status: 'enabled', source: 'included', allowAllMembers: true },
  ]);
  await db.insert(tenantUsers).values({ tenantId: hostUser.currentTenantId, userId: guestUser.id, role: 'member' });
  hostCookie = await moduleCookie(hostUser);
  guestCookie = await moduleCookie(guestUser, hostUser.currentTenantId);
  outsiderCookie = await moduleCookie(outsider);
  app = Fastify();
  await app.register(cookie);
  await app.register(websocket);
  const { registerNinjaPoolOnlineRoutes } = await import('../src/routes/ninja-pool-online-routes.js');
  await registerNinjaPoolOnlineRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
  if (hostUser) {
    await db.delete(ninjaPoolOnlineEvents).where(eq(ninjaPoolOnlineEvents.tenantId, hostUser.currentTenantId));
    await db.delete(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.tenantId, hostUser.currentTenantId));
    await db.delete(ninjaPoolOnlineRateLimits).where(eq(ninjaPoolOnlineRateLimits.tenantId, hostUser.currentTenantId));
  }
  for (const user of [hostUser, guestUser, outsider]) if (user) await cleanupUser(user.id);
  if (moduleRow) await cleanupModule(moduleRow.id);
});

test('two authenticated clients play, reject stale/cross-tenant access, leave, rejoin, and recover state', async () => {
  const anonymous = await app.inject({ method: 'POST', url: '/v1/modules/ninja-pool-hall/rooms', payload: { clientRoomId: 'room-anonymous-0001' } });
  assert.equal(anonymous.statusCode, 401);

  const created = await app.inject({
    method: 'POST', url: '/v1/modules/ninja-pool-hall/rooms', headers: { cookie: hostCookie },
    payload: { clientRoomId: 'room-phase30-host-0001' },
  });
  assert.equal(created.statusCode, 201, created.body);
  const roomId = created.json().id as string;
  const code = created.json().code as string;
  assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(created.json().status, 'waiting');

  const duplicate = await app.inject({
    method: 'POST', url: '/v1/modules/ninja-pool-hall/rooms', headers: { cookie: hostCookie },
    payload: { clientRoomId: 'room-phase30-host-0001' },
  });
  assert.equal(duplicate.statusCode, 200, duplicate.body);
  assert.equal(duplicate.json().id, roomId);

  const joined = await app.inject({
    method: 'POST', url: '/v1/modules/ninja-pool-hall/rooms/join', headers: { cookie: guestCookie }, payload: { code },
  });
  assert.equal(joined.statusCode, 200, joined.body);
  assert.equal(joined.json().status, 'active');
  assert.equal(joined.json().version, 2);

  const socketPath = `/v1/tenants/${hostUser.currentTenantId}/modules/ninja-pool-hall/rooms/${roomId}/socket`;
  const host = await openSocket(socketPath, hostCookie).catch((error) => {
    throw new Error(`Host WebSocket failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  const guest = await openSocket(socketPath, guestCookie).catch((error) => {
    throw new Error(`Guest WebSocket failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  assert.equal((await host.next('joined')).role, 'host');
  assert.equal((await guest.next('joined')).role, 'guest');

  await assert.rejects(
    app.injectWS(socketPath, { headers: { cookie: outsiderCookie } }),
    /Unexpected server response: 403/,
  );

  const initial = (await app.inject({ method: 'GET', url: `/v1/modules/ninja-pool-hall/rooms/${roomId}`, headers: { cookie: hostCookie } })).json().room;
  const hostShot: Shot = { angle: 0, power: 0.55 };
  const hostResult = simulateOnlineShot(initial.authoritativeState as GameState, hostShot, initial.rulesSettings as Settings);
  host.ws.send(JSON.stringify({
    type: 'hostShotResult', expectedVersion: initial.version, clientShotId: 'shot-host-break-0001',
    shooterSeat: 0, shot: hostShot, resultHash: hostResult.resultHash,
  }));
  let snapshot = await guest.next('roomSnapshot');
  while (snapshot.room.version < 3) snapshot = await guest.next('roomSnapshot');
  assert.equal(snapshot.room.version, 3);
  assert.equal(snapshot.room.authoritativeState.currentPlayer, 1);

  host.ws.send(JSON.stringify({
    type: 'hostShotResult', expectedVersion: 2, clientShotId: 'shot-host-stale-0001',
    shooterSeat: 0, shot: hostShot, resultHash: hostResult.resultHash,
  }));
  const stale = await host.next('staleVersion');
  assert.equal(stale.expectedVersion, 3);

  const guestShot: Shot = { angle: 0.18, power: 0.42, tipOffset: { x: 0.15, y: -0.1 } };
  guest.ws.send(JSON.stringify({ type: 'shotIntent', expectedVersion: 3, clientShotId: 'shot-guest-0001', shot: guestShot }));
  const intent = await host.next('guestShotIntent');
  assert.equal(intent.clientShotId, 'shot-guest-0001');
  const beforeGuest = (await app.inject({ method: 'GET', url: `/v1/modules/ninja-pool-hall/rooms/${roomId}`, headers: { cookie: hostCookie } })).json().room;
  const guestResult = simulateOnlineShot(beforeGuest.authoritativeState as GameState, guestShot, beforeGuest.rulesSettings as Settings);
  host.ws.send(JSON.stringify({
    type: 'hostShotResult', expectedVersion: 3, clientShotId: 'shot-guest-0001',
    shooterSeat: 1, shot: guestShot, resultHash: guestResult.resultHash,
  }));
  snapshot = await guest.next('roomSnapshot');
  while (snapshot.room.version < 4) snapshot = await guest.next('roomSnapshot');
  assert.equal(snapshot.room.version, 4);
  assert.equal(snapshot.room.authoritativeState.shotCount, 2);

  guest.ws.send(JSON.stringify({ type: 'leave' }));
  await new Promise<void>((resolve) => guest.ws.once('close', () => resolve()));
  const rejoined = await app.inject({
    method: 'POST', url: '/v1/modules/ninja-pool-hall/rooms/join', headers: { cookie: guestCookie }, payload: { code },
  });
  assert.equal(rejoined.statusCode, 200, rejoined.body);
  assert.equal(rejoined.json().status, 'active');
  assert.equal(rejoined.json().version, 6);

  const recoveredGuest = await openSocket(socketPath, guestCookie);
  const recovered = await recoveredGuest.next('joined');
  assert.equal(recovered.room.version, 6);
  assert.equal(recovered.room.authoritativeState.shotCount, 2);

  host.ws.terminate();
  await new Promise((resolve) => setTimeout(resolve, 25));
  const persisted = await app.inject({ method: 'GET', url: `/v1/modules/ninja-pool-hall/rooms/${roomId}`, headers: { cookie: guestCookie } });
  assert.equal(persisted.statusCode, 200, persisted.body);
  assert.equal(persisted.json().room.status, 'active');
  assert.equal(persisted.json().room.version, 6);
  const recoveredClosed = new Promise<void>((resolve) => recoveredGuest.ws.once('close', () => resolve()));
  recoveredGuest.ws.close();
  await recoveredClosed;
  await new Promise((resolve) => setTimeout(resolve, 25));
  const outsideReconnectWindow = new Date(Date.now() - 6 * 60_000);
  await db.update(ninjaPoolOnlineRooms).set({ hostLeftAt: outsideReconnectWindow, guestLeftAt: outsideReconnectWindow })
    .where(eq(ninjaPoolOnlineRooms.id, roomId));
  const expiredAccess = await app.inject({ method: 'GET', url: `/v1/modules/ninja-pool-hall/rooms/${roomId}`, headers: { cookie: guestCookie } });
  assert.equal(expiredAccess.statusCode, 404, expiredAccess.body);
  const [expiredRoom] = await db.select().from(ninjaPoolOnlineRooms).where(eq(ninjaPoolOnlineRooms.id, roomId));
  assert.equal(expiredRoom?.status, 'abandoned');
});
