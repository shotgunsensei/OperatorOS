import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import Fastify from 'fastify';
import { registerToolFulfillmentWorker } from '../src/lib/tool-fulfillment-worker.js';

const enabled = { enabled: true as const, signing: { issuer: 'https://authority.example.test', audience: 'https://office.example.test',
  keyId: 'fixture-only', privateKey: 'unused-injected-test-no-key' } };
const result = { enabled: true, claimed: 0, delivered: 0, deferred: 0 };
test('default closed registration does not deliver or leave background work', async () => {
  const app = Fastify(); let calls = 0;
  registerToolFulfillmentWorker(app, { enabled: false }, async () => { calls++; return result; });
  await app.ready(); await turn(); await app.close(); assert.equal(calls, 0);
});
test('explicit worker cannot overlap slow deliveries and closes its interval', async context => {
  context.mock.timers.enable({ apis: ['setInterval'] });
  const app = Fastify(); let calls = 0;
  let resolve!: (value: typeof result) => void;
  const pending = new Promise<typeof result>(done => { resolve = done; });
  registerToolFulfillmentWorker(app, enabled, async () => { calls++; return calls === 1 ? pending : result; });
  await app.ready(); await turn(); assert.equal(calls, 1);
  context.mock.timers.tick(120_000); await turn(); assert.equal(calls, 1);
  resolve(result); await turn(); context.mock.timers.tick(60_000); await turn(); assert.equal(calls, 2);
  await app.close(); context.mock.timers.tick(120_000); await turn(); assert.equal(calls, 2);
});
test('shutdown waits for an in-flight delivery without starting more work', async () => {
  const app = Fastify(); let resolve!: (value: typeof result) => void;
  registerToolFulfillmentWorker(app, enabled, async () => new Promise<typeof result>(done => { resolve = done; }));
  let databaseClosed = false;
  // Matches the real composition: the database onClose hook is registered
  // after routes, so its LIFO order must not race a delivery acknowledgement.
  app.addHook('onClose', async () => { databaseClosed = true; });
  await app.ready(); await turn(); let closed = false;
  const closing = app.close().then(() => { closed = true; }); await turn();
  const closedBeforeDelivery = closed, databaseClosedBeforeDelivery = databaseClosed;
  resolve(result); await closing;
  assert.equal(closedBeforeDelivery, false); assert.equal(databaseClosedBeforeDelivery, false);
  assert.equal(closed, true); assert.equal(databaseClosed, true);
});
