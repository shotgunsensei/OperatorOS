import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATOROS_MODULE_REGISTRY,
  getActiveModules,
  getHostSurface,
  getLaunchableModulesForEntitlements,
  getModuleByHost,
  getModuleById,
  isKnownModuleHost,
  normalizeHost,
  resolveModuleContext,
  resolveModuleRouteAccess,
} from '../../../packages/modules/registry.js';

const REQUIRED_MODULE_IDS = [
  'operatoros',
  'techdeck',
  'pulsedesk',
  'tradeflowkit',
  'torqueshed',
  'snapproofos',
  'faultlinelab',
  'ninja-pool-hall',
  'brandforgeos',
  'studyforge-ai',
  'ninja-launch-kit',
  'callcommand-ai',
  'ninjamation',
  'outcall',
] as const;

test('central module registry exposes the required OperatorOS modules', () => {
  const ids = new Set(OPERATOROS_MODULE_REGISTRY.map((module) => module.id));
  for (const id of REQUIRED_MODULE_IDS) {
    assert.ok(ids.has(id), `registry includes ${id}`);
  }
});

test('central module registry entries include the required routing and entitlement fields', () => {
  for (const module of OPERATOROS_MODULE_REGISTRY) {
    assert.equal(module.id.length > 0, true, `id present for ${module.slug}`);
    assert.equal(module.name.length > 0, true, `name present for ${module.slug}`);
    assert.equal(module.slug.length > 0, true, `slug present for ${module.id}`);
    assert.equal(module.hostname.length > 0, true, `hostname present for ${module.slug}`);
    assert.equal(
      module.routePath.startsWith('/'),
      true,
      `routePath is local path for ${module.slug}`,
    );
    assert.equal(
      module.defaultRoute.startsWith('/'),
      true,
      `defaultRoute is local path for ${module.slug}`,
    );
    assert.equal(
      module.launchUrl.startsWith('https://'),
      true,
      `launchUrl is https for ${module.slug}`,
    );
    assert.equal(
      module.entitlementKey.length > 0,
      true,
      `entitlementKey present for ${module.slug}`,
    );
    assert.ok(['active', 'planned', 'hidden', 'disabled'].includes(module.status));
    assert.equal(module.iconName.length > 0, true, `iconName present for ${module.slug}`);
    assert.equal(module.returnUrl, 'https://app.operatoros.net/');
    assert.equal(module.subdomainUrl.startsWith('https://'), true);
    assert.equal(module.healthCheckUrl.startsWith(module.subdomainUrl), true);
    assert.equal(module.ssoCallbackUrl.startsWith(module.subdomainUrl), true);
    assert.equal(module.logoutUrl.startsWith(module.subdomainUrl), true);
    assert.equal(typeof module.enabled, 'boolean');
    assert.equal(typeof module.requiresSubscription, 'boolean');
    assert.equal(typeof module.requiresTenant, 'boolean');
    assert.ok(['platform', 'main-module', 'companion-application'].includes(module.applicationType));
    assert.ok(Array.isArray(module.legacyHostnames));
  }
});

test('getModuleById and getModuleByHost resolve platform and module hosts', () => {
  assert.equal(getModuleById('operatoros')?.hostname, 'operatoros.net');
  assert.equal(getModuleById('techdeck')?.hostname, 'techdeck.operatoros.net');
  assert.equal(getModuleById('outcall')?.hostname, 'outcall.operatoros.net');

  assert.equal(getModuleByHost('https://techdeck.operatoros.net/sso?code=probe')?.id, 'techdeck');
  assert.equal(getModuleByHost('brandforgeos.operatoros.net:443')?.id, 'brandforgeos');
  assert.equal(getModuleByHost('operatoros.net')?.id, 'operatoros');
  assert.equal(getModuleByHost('www.operatoros.net')?.id, 'operatoros');
  assert.equal(getModuleByHost('auth.operatoros.net')?.id, 'operatoros');

  assert.equal(isKnownModuleHost('callcommand-ai.operatoros.net'), true);
  assert.equal(isKnownModuleHost('operatorpoolhall.operatoros.net'), true);
  assert.equal(isKnownModuleHost('deployops.operatoros.net'), true);
  assert.equal(isKnownModuleHost('scriptops.operatoros.net'), true);
  // Rename-era aliases remain resolvable only so middleware can redirect them.
  assert.equal(isKnownModuleHost('ninja-pool-hall.operatoros.net'), true);
  assert.equal(isKnownModuleHost('ninjalaunchkit.operatoros.net'), true);
  assert.equal(isKnownModuleHost('ninjamation.operatoros.net'), true);
  assert.equal(isKnownModuleHost('unknown.operatoros.net'), false);
  assert.equal(isKnownModuleHost('localhost'), false);
});

test('normalizeHost strips scheme, port, path, and casing', () => {
  assert.equal(
    normalizeHost('HTTPS://TechDeck.OperatorOS.NET:443/sso?code=probe'),
    'techdeck.operatoros.net',
  );
  assert.equal(normalizeHost('brandforgeos.operatoros.net:443'), 'brandforgeos.operatoros.net');
  assert.equal(normalizeHost('operatoros.net.'), 'operatoros.net');
});

test('getHostSurface classifies production platform and module hosts', () => {
  assert.equal(getHostSurface('operatoros.net'), 'root');
  assert.equal(getHostSurface('app.operatoros.net'), 'app');
  assert.equal(getHostSurface('auth.operatoros.net'), 'auth');
  assert.equal(getHostSurface('api.operatoros.net'), 'api');
  assert.equal(getHostSurface('techdeck.operatoros.net'), 'module');
  assert.equal(getHostSurface('operatorpoolhall.operatoros.net'), 'module');
  assert.equal(getHostSurface('ninja-pool-hall.operatoros.net'), 'module');
  assert.equal(getHostSurface('unknown.operatoros.net'), 'unknown');
  assert.equal(getHostSurface('localhost'), 'unknown');
});

test('resolveModuleContext resolves host-routed modules with entitlement access', () => {
  const context = resolveModuleContext({
    host: 'techdeck.operatoros.net',
    pathname: '/sso',
    user: { id: 'user-1', email: 'tech@example.com', platformRole: 'user' },
    entitlements: { techdeck: true },
  });

  assert.equal(context.surface, 'module');
  assert.equal(context.module?.id, 'techdeck');
  assert.equal(context.status, 'allowed');
  assert.equal(context.routePath, '/app/apps/techdeck');
  assert.equal(context.localRoutePath, '/modules/techdeck');
});

test('resolveModuleContext resolves local module fallback paths', () => {
  const context = resolveModuleContext({
    host: 'localhost:3001',
    pathname: '/modules/pulsedesk',
    user: { id: 'user-1', email: 'ops@example.com', platformRole: 'user' },
    entitlements: { pulsedesk: { enabled: true } },
  });

  assert.equal(context.surface, 'local-module');
  assert.equal(context.module?.id, 'pulsedesk');
  assert.equal(context.isLocalFallback, true);
  assert.equal(context.status, 'allowed');
});

test('production root does not treat /modules/<slug> as a local module surface', () => {
  const context = resolveModuleContext({
    host: 'operatoros.net',
    pathname: '/modules/pulsedesk',
    user: { id: 'user-1', email: 'ops@example.com', platformRole: 'user' },
    entitlements: { pulsedesk: { enabled: true } },
  });

  assert.equal(context.surface, 'root');
  assert.equal(context.isLocalFallback, false);
  assert.equal(context.module?.id, 'operatoros');
  assert.equal(context.status, 'public');
});

test('resolveModuleContext handles unknown OperatorOS subdomains safely', () => {
  const context = resolveModuleContext({
    host: 'unknown.operatoros.net',
    pathname: '/',
  });

  assert.equal(context.surface, 'unknown');
  assert.equal(context.isOperatorOSHost, true);
  assert.equal(context.isKnownHost, false);
  assert.equal(context.status, 'unknown_host');
});

test('resolveModuleContext requires authentication for module routes', () => {
  const context = resolveModuleContext({
    host: 'techdeck.operatoros.net',
    pathname: '/sso',
  });

  assert.equal(context.surface, 'module');
  assert.equal(context.module?.id, 'techdeck');
  assert.equal(context.status, 'unauthenticated');
  assert.equal(context.redirectTo, '/login?next=%2Fsso');
});

test('resolveModuleRouteAccess denies disabled modules', () => {
  const techdeck = getModuleById('techdeck');
  assert.ok(techdeck);
  const decision = resolveModuleRouteAccess(
    { ...techdeck, status: 'disabled' },
    {
      user: { id: 'user-1', email: 'tech@example.com', platformRole: 'user' },
      entitlements: { techdeck: true },
    },
  );

  assert.equal(decision.status, 'module_unavailable');
  assert.equal(decision.reason, 'Module status is disabled');
});

test('resolveModuleRouteAccess denies missing module entitlements', () => {
  const techdeck = getModuleById('techdeck');
  assert.ok(techdeck);
  const decision = resolveModuleRouteAccess(techdeck, {
    user: { id: 'user-1', email: 'tech@example.com', platformRole: 'user' },
    entitlements: {},
  });

  assert.equal(decision.status, 'access_denied');
  assert.equal(decision.entitlementChecked, true);
  assert.equal(decision.hasEntitlement, false);
});

test('resolveModuleRouteAccess allows root super-admin without module entitlement', () => {
  const pulsedesk = getModuleById('pulsedesk');
  assert.ok(pulsedesk);
  const decision = resolveModuleRouteAccess(pulsedesk, {
    user: { id: 'root-1', email: 'john@shotgunninjas.com', platformRole: 'user' },
    entitlements: {},
  });

  assert.equal(decision.status, 'allowed');
  assert.equal(decision.isPlatformAdmin, true);
  assert.equal(decision.hasEntitlement, true);
});

test('getActiveModules returns only active registry entries', () => {
  const active = getActiveModules();
  assert.ok(active.length > 0);
  assert.ok(active.every((module) => module.status === 'active'));
  assert.ok(active.some((module) => module.id === 'operatoros'));
});

test('getLaunchableModulesForEntitlements gates subscription modules by enabled entitlement', () => {
  const launchable = getLaunchableModulesForEntitlements({
    modules: [
      { slug: 'techdeck', enabled: true },
      { slug: 'pulsedesk', enabled: false },
    ],
  });
  const ids = launchable.map((module) => module.id);
  assert.ok(ids.includes('operatoros'), 'platform remains launchable without module entitlement');
  assert.ok(ids.includes('techdeck'), 'enabled module is launchable');
  assert.ok(!ids.includes('pulsedesk'), 'disabled entitlement is not launchable');
});

test('getLaunchableModulesForEntitlements accepts record-shaped entitlement maps', () => {
  const launchable = getLaunchableModulesForEntitlements({
    operatoros: true,
    tradeflowkit: { enabled: true },
    techdeck: false,
  });
  const ids = launchable.map((module) => module.id);
  assert.ok(ids.includes('operatoros'));
  assert.ok(ids.includes('tradeflowkit'));
  assert.ok(!ids.includes('techdeck'));
});
