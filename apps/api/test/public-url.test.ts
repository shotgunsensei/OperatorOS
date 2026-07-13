import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPublicUrl,
  getPublicOrigin,
  isLocalHost,
  isProductionHost,
  isSameSiteHost,
  normalizeHost,
  resolveHostRole,
  sanitizeReturnTo,
} from '../../../packages/modules/public-url.js';
import { getModuleByHost } from '../../../packages/modules/registry.js';

test('normalizeHost strips ports, scheme, trailing dot, and case', () => {
  assert.equal(normalizeHost('Auth.OperatorOS.net:5000'), 'auth.operatoros.net');
  assert.equal(normalizeHost('https://app.operatoros.net/login'), 'app.operatoros.net');
  assert.equal(normalizeHost('operatoros.net.'), 'operatoros.net');
  assert.equal(normalizeHost(''), '');
  assert.equal(normalizeHost(undefined), '');
});

test('isProductionHost recognizes the root domain and its subdomains only', () => {
  assert.equal(isProductionHost('operatoros.net'), true);
  assert.equal(isProductionHost('auth.operatoros.net'), true);
  assert.equal(isProductionHost('techdeck.operatoros.net:5000'), true);
  assert.equal(isProductionHost('operatoros.net.evil.com'), false);
  assert.equal(isProductionHost('localhost:5000'), false);
});

test('isLocalHost / isSameSiteHost classify dev + preview hosts', () => {
  assert.equal(isLocalHost('localhost:5000'), true);
  assert.equal(isLocalHost('foo.replit.dev'), true);
  assert.equal(isLocalHost('operatoros.net'), false);
  assert.equal(isSameSiteHost('app.operatoros.net'), true);
  assert.equal(isSameSiteHost('localhost'), true);
  assert.equal(isSameSiteHost('evil.com'), false);
});

test('getPublicOrigin collapses production hosts to clean HTTPS with no port', () => {
  // The classic bug: inbound request behind the proxy carries :5000 + http.
  assert.equal(
    getPublicOrigin({ host: 'localhost:5000', forwardedHost: 'auth.operatoros.net', forwardedProto: 'http' }),
    'https://auth.operatoros.net',
  );
  assert.equal(
    getPublicOrigin({ host: 'techdeck.operatoros.net:5000' }),
    'https://techdeck.operatoros.net',
  );
  // Comma-separated forwarded chains take the first hop.
  assert.equal(
    getPublicOrigin({ forwardedHost: 'app.operatoros.net, internal-proxy', forwardedProto: 'https, http' }),
    'https://app.operatoros.net',
  );
});

test('getPublicOrigin preserves protocol + port for local/dev hosts', () => {
  assert.equal(getPublicOrigin({ host: 'localhost:5000' }), 'http://localhost:5000');
  assert.equal(
    getPublicOrigin({ host: 'localhost:5000', forwardedProto: 'https' }),
    'https://localhost:5000',
  );
  assert.equal(getPublicOrigin({ host: '' }), 'http://localhost');
});

test('buildPublicUrl maps platform roles to clean HTTPS origins', () => {
  assert.equal(buildPublicUrl('/login', 'auth'), 'https://auth.operatoros.net/login');
  assert.equal(buildPublicUrl('dashboard', 'app'), 'https://app.operatoros.net/dashboard');
  assert.equal(buildPublicUrl('/', 'root'), 'https://operatoros.net/');
});

test('resolveHostRole classifies platform + module hosts', () => {
  assert.equal(resolveHostRole('operatoros.net'), 'root');
  assert.equal(resolveHostRole('app.operatoros.net'), 'app');
  assert.equal(resolveHostRole('auth.operatoros.net'), 'auth');
  assert.equal(resolveHostRole('api.operatoros.net'), 'api');
  assert.equal(resolveHostRole('techdeck.operatoros.net'), 'module');
  assert.equal(resolveHostRole('nope.example.com'), 'unknown');
});

test('sanitizeReturnTo blocks open redirects but keeps same-site destinations', () => {
  assert.equal(sanitizeReturnTo('/app/platform/tenants'), '/app/platform/tenants');
  assert.equal(sanitizeReturnTo('//evil.com'), '/app');
  assert.equal(sanitizeReturnTo('https://evil.com/app'), '/app');
  assert.equal(sanitizeReturnTo('javascript:alert(1)'), '/app');
  assert.equal(sanitizeReturnTo(null), '/app');
  assert.equal(sanitizeReturnTo(undefined, '/home'), '/home');
  assert.equal(
    sanitizeReturnTo('https://techdeck.operatoros.net/dashboard'),
    'https://techdeck.operatoros.net/dashboard',
  );
});

test('sanitizeReturnTo collapses hostile targets to a canonical, non-host-derived fallback', () => {
  // The middleware fallback must NOT be built from the inbound Host header
  // (Task #140). A canonical constant is passed instead; a spoofed host can
  // never leak into it.
  const CANON = buildPublicUrl('/app', 'root');
  assert.equal(CANON, 'https://operatoros.net/app');
  assert.equal(sanitizeReturnTo('https://evil.com/app', CANON), CANON);
  assert.equal(sanitizeReturnTo('//evil.com', CANON), CANON);
  assert.equal(sanitizeReturnTo('http://evil.com:5000/app/x', CANON), CANON);
  assert.equal(sanitizeReturnTo('https://operatoros.net.evil.com/app', CANON), CANON);
  // Legit same-site destinations still pass through untouched.
  assert.equal(
    sanitizeReturnTo('https://techdeck.operatoros.net/x', CANON),
    'https://techdeck.operatoros.net/x',
  );
});

test('getModuleByHost resolves the three module subdomains and ignores ports', () => {
  for (const slug of ['techdeck', 'pulsedesk', 'tradeflowkit'] as const) {
    const byHost = getModuleByHost(`${slug}.operatoros.net`);
    assert.ok(byHost, `expected a module for ${slug}.operatoros.net`);
    assert.equal(byHost?.slug, slug);
    const byHostWithPort = getModuleByHost(`${slug}.operatoros.net:5000`);
    assert.equal(byHostWithPort?.slug, slug);
  }
});
