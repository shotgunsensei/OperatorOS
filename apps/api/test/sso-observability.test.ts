process.env.APP_ENV = 'test';
process.env.SESSION_SECRET ||= 'sso-observability-session-secret-32-plus';

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

let app: any;

before(async () => {
  const Fastify = (await import('fastify')).default;
  const cookie = (await import('@fastify/cookie')).default;
  const { registerSsoRoutes } = await import('../src/routes/sso-routes.js');
  app = Fastify({ logger: false });
  await app.register(cookie);
  await registerSsoRoutes(app);
  await app.ready();
});

after(async () => {
  if (app) await app.close();
});

test('SSO JSON errors include a server correlation ID and no credential echo', async () => {
  const secretCode = 'do-not-echo-this-authorization-code';
  const response = await app.inject({
    method: 'POST',
    url: '/v1/sso/browser-exchange',
    payload: { code: secretCode },
  });
  assert.equal(response.statusCode, 400);
  const correlationId = response.headers['x-correlation-id'];
  assert.match(String(correlationId), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const body = response.json();
  assert.equal(body.code, 'BAD_REQUEST');
  assert.equal(body.correlationId, correlationId);
  assert.doesNotMatch(response.body, new RegExp(secretCode));
});

test('SSO aliases share the same bounded correlation contract', async () => {
  for (const url of ['/api/sso/browser-exchange', '/v1/sso/browser-exchange']) {
    const response = await app.inject({ method: 'POST', url, payload: {} });
    assert.equal(response.statusCode, 400);
    assert.match(String(response.headers['x-correlation-id']), /^[0-9a-f-]{36}$/i);
    assert.equal(response.json().correlationId, response.headers['x-correlation-id']);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
  }
});
