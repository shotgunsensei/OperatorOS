import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getEcosystemRegistry,
  getEcosystemModule,
  getAllModules,
  getActiveModules,
  getCompanionApplications,
  getMainModules,
  getModuleUrl,
  getModulesByCategory,
  detectOperatorOSHost,
} from '@operatoros/sdk';

test('ecosystem registry loads with modules and platform domains', () => {
  const reg = getEcosystemRegistry();
  assert.ok(Array.isArray(reg.modules), 'modules is an array');
  assert.ok(reg.modules.length > 0, 'registry has at least one module');
  assert.equal(reg.platformDomains.root, 'https://operatoros.net');
  assert.equal(reg.platformDomains.app, 'https://app.operatoros.net');
  assert.equal(reg.platformDomains.api, 'https://api.operatoros.net');
  assert.equal(reg.platformDomains.auth, 'https://auth.operatoros.net');
  assert.deepEqual(Object.keys(reg.platformDomains).sort(), ['api', 'app', 'auth', 'root']);
});

test('main modules lead in the canonical TradeFlowKit, PulseDesk, TechDeck order', () => {
  const td = getEcosystemModule('techdeck');
  assert.ok(td, 'techdeck module is present');
  assert.equal(td!.ecosystemUrl, 'https://techdeck.operatoros.net');
  assert.equal(getModuleUrl('techdeck'), 'https://techdeck.operatoros.net');
  assert.deepEqual(td!.legacyUrls, []);
  assert.deepEqual(getMainModules().map(module => module.slug), [
    'tradeflowkit',
    'pulsedesk',
    'techdeck',
  ]);
  assert.deepEqual(getAllModules().slice(0, 3).map(module => module.slug), [
    'tradeflowkit',
    'pulsedesk',
    'techdeck',
  ]);
  assert.ok(getCompanionApplications().every(module => module.applicationType === 'companion-application'));
});

test('renamed applications preserve stable slugs while canonicalizing display names and hosts', () => {
  assert.equal(getModuleUrl('brandforgeos'), 'https://brandforgeos.operatoros.net');
  assert.equal(getModuleUrl('studyforge-ai'), 'https://studyforge-ai.operatoros.net');
  assert.equal(getModuleUrl('callcommand-ai'), 'https://callcommand-ai.operatoros.net');

  const pool = getEcosystemModule('ninja-pool-hall');
  const deploy = getEcosystemModule('ninja-launch-kit');
  const scripts = getEcosystemModule('ninjamation');
  assert.deepEqual(
    [pool?.name, pool?.ecosystemUrl, deploy?.name, deploy?.ecosystemUrl, scripts?.name, scripts?.ecosystemUrl],
    ['Operator Pool Hall', 'https://operatorpoolhall.operatoros.net', 'Deploy Ops', 'https://deployops.operatoros.net', 'Script Ops', 'https://scriptops.operatoros.net'],
  );
  assert.deepEqual(pool?.legacyUrls, ['https://ninja-pool-hall.operatoros.net']);
  assert.deepEqual(deploy?.legacyUrls, ['https://ninjalaunchkit.operatoros.net']);
  assert.deepEqual(scripts?.legacyUrls, ['https://ninjamation.operatoros.net']);
});

test('torqueshed is retained in the ecosystem (additive)', () => {
  assert.ok(getEcosystemModule('torqueshed'), 'torqueshed is present');
});

test('outcall remains planned with central SSO and billing authority until Phase 37 activation gates pass', () => {
  const outcall = getEcosystemModule('outcall');
  assert.ok(outcall, 'outcall is present');
  assert.equal(outcall!.ecosystemUrl, 'https://outcall.operatoros.net');
  assert.equal(outcall!.status, 'planned');
  assert.equal(outcall!.authMode, 'sso');
  assert.equal(outcall!.billingMode, 'operatoros');
});

test('no module has an empty slug or empty ecosystemUrl', () => {
  for (const m of getAllModules()) {
    assert.ok(typeof m.slug === 'string' && m.slug.length > 0, `slug present for ${m.name}`);
    assert.ok(
      typeof m.ecosystemUrl === 'string' && m.ecosystemUrl.length > 0,
      `ecosystemUrl present for ${m.slug}`,
    );
  }
});

test('filter helpers return consistent subsets', () => {
  const all = getAllModules();
  const active = getActiveModules();
  assert.ok(active.length <= all.length);
  assert.ok(active.every((m) => m.status === 'active'));
  const ai = getModulesByCategory('ai');
  assert.ok(ai.every((m) => m.category === 'ai'));
});

test('ecosystem.registry.json matches the TS registry', () => {
  const path = new URL('../../../ecosystem.registry.json', import.meta.url);
  const fromDisk = JSON.parse(readFileSync(path, 'utf8'));
  const fromTs = JSON.parse(JSON.stringify(getEcosystemRegistry()));
  assert.deepEqual(fromDisk, fromTs);
});

test('detectOperatorOSHost classifies ecosystem and foreign hosts', () => {
  const root = detectOperatorOSHost('operatoros.net');
  assert.equal(root.isRootDomain, true);
  assert.equal(root.matchedModuleSlug, null);

  const www = detectOperatorOSHost('www.operatoros.net');
  assert.equal(www.isRootDomain, true);

  const app = detectOperatorOSHost('app.operatoros.net');
  assert.equal(app.isAppDomain, true);
  assert.equal(app.subdomain, 'app');

  const api = detectOperatorOSHost('api.operatoros.net:443');
  assert.equal(api.isApiDomain, true);
  assert.equal(api.hostname, 'api.operatoros.net', 'port is stripped');

  const auth = detectOperatorOSHost('auth.operatoros.net');
  assert.equal(auth.isAuthDomain, true);

  for (const unregistered of ['admin.operatoros.net', 'docs.operatoros.net', 'status.operatoros.net']) {
    const info = detectOperatorOSHost(unregistered);
    assert.equal(info.isRootDomain, false);
    assert.equal(info.isAppDomain, false);
    assert.equal(info.isApiDomain, false);
    assert.equal(info.isAuthDomain, false);
    assert.equal(info.matchedModuleSlug, null);
  }

  const td = detectOperatorOSHost('techdeck.operatoros.net');
  assert.equal(td.matchedModuleSlug, 'techdeck');

  const brand = detectOperatorOSHost('brandforgeos.operatoros.net');
  assert.equal(brand.matchedModuleSlug, 'brandforgeos', 'subdomain label maps to catalog slug');

  for (const [host, slug] of [
    ['operatorpoolhall.operatoros.net', 'ninja-pool-hall'],
    ['deployops.operatoros.net', 'ninja-launch-kit'],
    ['scriptops.operatoros.net', 'ninjamation'],
    ['ninja-pool-hall.operatoros.net', 'ninja-pool-hall'],
    ['ninjalaunchkit.operatoros.net', 'ninja-launch-kit'],
    ['ninjamation.operatoros.net', 'ninjamation'],
  ] as const) {
    assert.equal(detectOperatorOSHost(host).matchedModuleSlug, slug);
  }

  // Foreign hosts (Replit dev, localhost) must be safe and inert.
  for (const h of ['workspace.janeway.replit.dev', 'localhost', '']) {
    const info = detectOperatorOSHost(h);
    assert.equal(info.isRootDomain, false);
    assert.equal(info.isAppDomain, false);
    assert.equal(info.matchedModuleSlug, null);
    assert.equal(info.subdomain, null);
  }
});
