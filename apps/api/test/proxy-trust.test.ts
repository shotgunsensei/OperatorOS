import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { checkRateLimit } from '../src/lib/rate-limiter.js';
import { parseTrustProxy, runtimeTrustsProxy } from '../src/lib/proxy-trust.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (repoPath: string) => readFileSync(resolve(root, repoPath), 'utf8');
let probeSequence = 0;

function buildIpProbe(trustSetting: unknown) {
  const app = Fastify({
    logger: false,
    trustProxy: parseTrustProxy(trustSetting),
  });
  const namespace = `proxy-ip-probe-${++probeSequence}`;

  app.get('/probe', async (request, reply) => {
    // Mirrors the production security consumers: request.ip is both the
    // audit attribution and the per-IP rate-limit identity.
    const auditIpAddress = request.ip;
    const allowed = checkRateLimit(`${namespace}:${request.ip}`, 1, 60_000);
    return reply.code(allowed ? 200 : 429).send({
      requestIp: request.ip,
      auditIpAddress,
    });
  });

  return app;
}

test('TRUST_PROXY is false by default and accepts only 1/true affirmative values', () => {
  for (const value of [undefined, null, '', '0', 'false', 'yes', 'on', '2', true, 1]) {
    assert.equal(parseTrustProxy(value), false, String(value));
  }
  for (const value of ['1', 'true', ' TRUE ']) {
    assert.equal(parseTrustProxy(value), true, String(value));
  }

  assert.equal(runtimeTrustsProxy({}), false);
  assert.equal(runtimeTrustsProxy({ TRUST_PROXY: 'false' }), false);
  assert.equal(runtimeTrustsProxy({ TRUST_PROXY: '1' }), true);
});

test('trusted proxy mode uses forwarded client IP for request, audit, and rate-limit identity', async (t) => {
  const app = buildIpProbe('true');
  t.after(() => app.close());

  const first = await app.inject({
    method: 'GET',
    url: '/probe',
    headers: { 'x-forwarded-for': '198.51.100.21, 10.0.0.7' },
  });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), {
    requestIp: '198.51.100.21',
    auditIpAddress: '198.51.100.21',
  });

  const limited = await app.inject({
    method: 'GET',
    url: '/probe',
    headers: { 'x-forwarded-for': '198.51.100.21, 10.0.0.7' },
  });
  assert.equal(limited.statusCode, 429);

  const otherClient = await app.inject({
    method: 'GET',
    url: '/probe',
    headers: { 'x-forwarded-for': '198.51.100.22, 10.0.0.7' },
  });
  assert.equal(otherClient.statusCode, 200);
  assert.equal(otherClient.json().requestIp, '198.51.100.22');
});

test('disabled proxy trust ignores spoofed forwarding headers for audit and rate limiting', async (t) => {
  const app = buildIpProbe('false');
  t.after(() => app.close());

  const first = await app.inject({
    method: 'GET',
    url: '/probe',
    headers: { 'x-forwarded-for': '198.51.100.31' },
  });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.json(), {
    requestIp: '127.0.0.1',
    auditIpAddress: '127.0.0.1',
  });

  // A different spoofed value is still the same direct peer and therefore
  // consumes the same rate-limit bucket.
  const spoofedSecondClient = await app.inject({
    method: 'GET',
    url: '/probe',
    headers: { 'x-forwarded-for': '203.0.113.99' },
  });
  assert.equal(spoofedSecondClient.statusCode, 429);
  assert.equal(spoofedSecondClient.json().requestIp, '127.0.0.1');
});

test('production auth rate limits and audit fallback consume Fastify request.ip', () => {
  const bootstrap = read('apps/api/src/index.ts');
  const authRoutes = read('apps/api/src/routes/auth-routes.ts');
  const audit = read('apps/api/src/lib/audit.ts');

  assert.match(bootstrap, /const trustProxy = runtimeTrustsProxy\(\)/);
  assert.match(bootstrap, /Fastify\(\{[\s\S]*?trustProxy,/);
  assert.match(authRoutes, /function getIp\(request: any\): string \{[\s\S]*?request\.ip/);
  assert.match(authRoutes, /checkRateLimit\(`login:\$\{ip\}`/);
  assert.match(audit, /ipAddress: request\.ip \?\? null/);
});
