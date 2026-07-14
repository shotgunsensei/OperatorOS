import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

process.env.SESSION_SECRET ||= 'operatoros-test-session-secret-short-circuit';

test('authenticate returns the sent reply so a denied request never reaches the route handler', async () => {
  const { authenticate } = await import('../src/lib/auth.js');
  const app = Fastify({ logger: false });
  let handlerCalls = 0;

  app.get('/protected', { preHandler: [authenticate] }, async () => {
    handlerCalls += 1;
    return { ok: true };
  });

  const response = await app.inject({ method: 'GET', url: '/protected' });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), {
    error: 'Authentication required',
    code: 'AUTH_REQUIRED',
  });
  assert.equal(handlerCalls, 0, 'route handler must not run after authenticate sends a denial');

  await app.close();
});
