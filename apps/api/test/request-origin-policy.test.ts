import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { isBrowserRequestOriginAllowed } from '../src/lib/request-origin.ts';

test('production accepts the exact public host origin', () => {
  assert.equal(isBrowserRequestOriginAllowed({
    origin: 'https://auth.operatoros.net',
    host: '127.0.0.1:5001',
    forwardedHost: 'auth.operatoros.net',
    trustProxy: true,
    production: true,
  }), true);
});

test('trusted forwarded host is authoritative when direct and public hosts conflict', () => {
  assert.equal(isBrowserRequestOriginAllowed({
    origin: 'https://auth.operatoros.net',
    host: 'auth.operatoros.net',
    forwardedHost: 'techdeck.operatoros.net',
    trustProxy: true,
    production: true,
  }), false, 'the direct Host cannot override a trusted forwarded host');
  assert.equal(isBrowserRequestOriginAllowed({
    origin: 'https://techdeck.operatoros.net',
    host: '127.0.0.1:5001',
    forwardedHost: 'techdeck.operatoros.net',
    trustProxy: true,
    production: true,
  }), true, 'the trusted public host remains valid behind the proxy');
});

test('production rejects credential-capable sibling and insecure origins', () => {
  const base = {
    host: 'auth.operatoros.net',
    forwardedHost: undefined,
    trustProxy: false,
    production: true,
  } as const;
  assert.equal(isBrowserRequestOriginAllowed({
    ...base,
    origin: 'https://tradeflowkit.operatoros.net',
  }), false);
  assert.equal(isBrowserRequestOriginAllowed({
    ...base,
    origin: 'http://auth.operatoros.net',
  }), false);
  assert.equal(isBrowserRequestOriginAllowed({
    ...base,
    origin: 'not a url',
  }), false);
});

test('non-browser calls and development remain available', () => {
  assert.equal(isBrowserRequestOriginAllowed({
    origin: undefined,
    host: 'api.operatoros.net',
    forwardedHost: undefined,
    trustProxy: false,
    production: true,
  }), true);
  assert.equal(isBrowserRequestOriginAllowed({
    origin: 'http://localhost:3000',
    host: 'localhost:5001',
    forwardedHost: undefined,
    trustProxy: false,
    production: false,
  }), true);
});

test('a sibling Origin is rejected before a protected mutation runs', async () => {
  const app = Fastify();
  let mutations = 0;
  app.addHook('onRequest', async (request, reply) => {
    const allowed = isBrowserRequestOriginAllowed({
      origin: typeof request.headers.origin === 'string' ? request.headers.origin : undefined,
      host: request.headers.host,
      forwardedHost: request.headers['x-forwarded-host'],
      trustProxy: false,
      production: true,
    });
    if (!allowed) return reply.code(403).send({ code: 'ORIGIN_HOST_MISMATCH' });
  });
  app.post('/mutate', async () => {
    mutations += 1;
    return { ok: true };
  });

  const rejected = await app.inject({
    method: 'POST',
    url: '/mutate',
    headers: {
      host: 'auth.operatoros.net',
      origin: 'https://tradeflowkit.operatoros.net',
    },
  });
  assert.equal(rejected.statusCode, 403);
  assert.equal(rejected.json().code, 'ORIGIN_HOST_MISMATCH');
  assert.equal(mutations, 0);
  await app.close();
});
