import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { middleware } from '../../web/src/middleware.js';
import {
  buildOperatorOSHelpUrl,
  buildOperatorOSNavigationUrls,
  DEFAULT_OPERATOROS_APPS_URL,
  resolveOperatorOSAppsUrl,
} from '../../../packages/modules/navigation.js';
import {
  OPERATOROS_MODULE_REGISTRY,
  getModuleById,
  resolveModuleContext,
  resolveModuleRouteAccess,
} from '../../../packages/modules/registry.js';

const requireFromWeb = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'));
const { NextRequest } = requireFromWeb('next/server') as { NextRequest: new (...args: any[]) => any };

function request(url: string, authenticated = true): any {
  const parsed = new URL(url);
  return new NextRequest(url, {
    headers: {
      host: parsed.host,
      'x-forwarded-host': parsed.host,
      'x-forwarded-proto': parsed.protocol.replace(':', ''),
      ...(authenticated ? { cookie: 'operatoros_session=test-session' } : {}),
    },
  });
}

test('legacy /app redirects to the canonical launcher without forwarding redirect parameters', async () => {
  for (const host of ['operatoros.net', 'app.operatoros.net']) {
    const response = await middleware(request(`https://${host}/app?next=https://evil.example`));
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), DEFAULT_OPERATOROS_APPS_URL);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('module-host /app remains a source-compatible module route', async () => {
  for (const host of ['techdeck.operatoros.net', 'studyforge-ai.operatoros.net']) {
    const response = await middleware(request(`https://${host}/app`));
    assert.equal(response.status, 200);
    const rewrite = new URL(response.headers.get('x-middleware-rewrite')!);
    assert.equal(rewrite.pathname, `/modules/${host.split('.')[0]}/app`);
  }
});

test('direct authenticated navigation to the canonical apps URL mounts the existing launcher', async () => {
  const response = await middleware(request(DEFAULT_OPERATOROS_APPS_URL));
  assert.equal(response.status, 200);
  assert.equal(new URL(response.headers.get('x-middleware-rewrite')!).pathname, '/app');
});

test('anonymous canonical navigation starts session renewal on the auth host', async () => {
  const response = await middleware(request(DEFAULT_OPERATOROS_APPS_URL, false));
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get('location')!).hostname, 'auth.operatoros.net');
});

test('configured apps URL validation rejects open redirect targets', () => {
  assert.equal(resolveOperatorOSAppsUrl(DEFAULT_OPERATOROS_APPS_URL, 'production'), DEFAULT_OPERATOROS_APPS_URL);
  for (const invalid of [
    'https://evil.example/',
    'https://app.operatoros.net/?next=https://evil.example',
    'https://user:pass@app.operatoros.net/',
    '//evil.example/',
  ]) {
    assert.throws(() => resolveOperatorOSAppsUrl(invalid, 'production'));
  }
  assert.equal(
    resolveOperatorOSAppsUrl('http://localhost:5000/app', 'development'),
    'http://localhost:5000/app',
  );
});

test('shared navigation contract exposes one canonical platform URL set', () => {
  const urls = buildOperatorOSNavigationUrls();
  assert.equal(urls.appsUrl, DEFAULT_OPERATOROS_APPS_URL);
  assert.equal(new URL(urls.profileUrl).searchParams.get('page'), 'settings');
  assert.equal(new URL(urls.billingUrl).searchParams.get('page'), 'billing');
  assert.equal(urls.supportUrl, 'https://operatoros.net/help');
  assert.equal(new URL(urls.logoutUrl).pathname, '/logout');
  assert.equal(new URL(urls.logoutUrl).hostname, 'app.operatoros.net');
});

test('help navigation is public, page-aware, and rejects unsafe context', () => {
  assert.equal(buildOperatorOSHelpUrl(), 'https://operatoros.net/help');
  const help = new URL(buildOperatorOSHelpUrl({ module: 'techdeck', page: '/tickets/example' }));
  assert.equal(help.origin, 'https://operatoros.net');
  assert.equal(help.pathname, '/help');
  assert.equal(help.searchParams.get('module'), 'techdeck');
  assert.equal(help.searchParams.get('page'), '/tickets/example');
  assert.throws(() => buildOperatorOSHelpUrl({ module: '../john' }));
  assert.throws(() => buildOperatorOSHelpUrl({ page: 'https://evil.example/' }));
  assert.throws(() => buildOperatorOSHelpUrl({ page: '/tickets\\foreign' }));
});

test('every registry entry exposes the complete module navigation metadata', () => {
  for (const module of OPERATOROS_MODULE_REGISTRY) {
    for (const [field, value] of Object.entries({
      id: module.id,
      slug: module.slug,
      name: module.name,
      subdomainUrl: module.subdomainUrl,
      launchUrl: module.launchUrl,
      returnUrl: module.returnUrl,
      icon: module.icon,
      description: module.description,
      entitlementKey: module.entitlementKey,
      healthCheckUrl: module.healthCheckUrl,
      ssoCallbackUrl: module.ssoCallbackUrl,
      logoutUrl: module.logoutUrl,
    })) assert.ok(value, `${module.slug}.${field} is present`);
    assert.equal(typeof module.enabled, 'boolean');
    assert.equal(module.returnUrl, DEFAULT_OPERATOROS_APPS_URL);
  }
});

test('four primary module launches use canonical subdomains and callbacks', () => {
  for (const [slug, launchPath] of Object.entries({
    tradeflowkit: '/dashboard',
    torqueshed: '/',
    techdeck: '/',
    pulsedesk: '/dashboard',
  })) {
    const module = getModuleById(slug);
    assert.ok(module);
    assert.equal(new URL(module.launchUrl).hostname, `${slug}.operatoros.net`);
    assert.equal(new URL(module.launchUrl).pathname, launchPath);
    assert.equal(module.ssoCallbackUrl, `https://${slug}.operatoros.net/sso`);
    const access = resolveModuleContext({
      host: `${slug}.operatoros.net`,
      pathname: '/',
      user: { id: 'user-1', email: 'user@example.com', platformRole: 'user' },
      entitlements: { [slug]: true },
    });
    assert.equal(access.status, 'allowed');
    assert.equal(access.module?.slug, slug);
  }
});

test('invalid, disabled, and missing-entitlement decisions fail closed', () => {
  assert.equal(getModuleById('not-a-module'), undefined);
  const module = getModuleById('techdeck');
  assert.ok(module);
  const user = { id: 'user-1', email: 'user@example.com', platformRole: 'user' as const };
  assert.equal(resolveModuleRouteAccess({ ...module, status: 'disabled', enabled: false }, { user, entitlements: { techdeck: true } }).status, 'module_unavailable');
  assert.equal(resolveModuleRouteAccess(module, { user, entitlements: {} }).status, 'access_denied');
});
