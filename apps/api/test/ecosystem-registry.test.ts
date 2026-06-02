import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getEcosystemRegistry,
  getEcosystemModule,
  getAllModules,
  getActiveModules,
  getModuleUrl,
  getLegacyUrl,
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
  assert.equal(reg.platformDomains.admin, 'https://admin.operatoros.net');
  assert.equal(reg.platformDomains.auth, 'https://auth.operatoros.net');
  assert.equal(reg.platformDomains.docs, 'https://docs.operatoros.net');
  assert.equal(reg.platformDomains.status, 'https://status.operatoros.net');
});

test('techdeck module exists, leads the ordering, and carries the right URLs', () => {
  const td = getEcosystemModule('techdeck');
  assert.ok(td, 'techdeck module is present');
  assert.equal(td!.ecosystemUrl, 'https://techdeck.operatoros.net');
  assert.equal(td!.legacyUrl, 'https://techdeck.app');
  assert.equal(getModuleUrl('techdeck'), 'https://techdeck.operatoros.net');
  assert.equal(getLegacyUrl('techdeck'), 'https://techdeck.app');
  assert.equal(getAllModules()[0].slug, 'techdeck', 'techdeck is ordered first');
});

test('renamed modules map slug -> ecosystem subdomain correctly', () => {
  assert.equal(getModuleUrl('brandforgeos'), 'https://brandforge.operatoros.net');
  assert.equal(getModuleUrl('studyforge-ai'), 'https://studyforge.operatoros.net');
  assert.equal(getModuleUrl('ninja-launch-kit'), 'https://launchkit.operatoros.net');
  assert.equal(getModuleUrl('callcommand-ai'), 'https://callcommand.operatoros.net');
});

test('torqueshed is retained in the ecosystem (additive)', () => {
  assert.ok(getEcosystemModule('torqueshed'), 'torqueshed is present');
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
  assert.ok(active.every(m => m.status === 'active'));
  const ai = getModulesByCategory('ai');
  assert.ok(ai.every(m => m.category === 'ai'));
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

  const admin = detectOperatorOSHost('admin.operatoros.net');
  assert.equal(admin.isAdminDomain, true);

  const td = detectOperatorOSHost('techdeck.operatoros.net');
  assert.equal(td.matchedModuleSlug, 'techdeck');

  const brand = detectOperatorOSHost('brandforge.operatoros.net');
  assert.equal(brand.matchedModuleSlug, 'brandforgeos', 'subdomain label maps to catalog slug');

  // Foreign hosts (Replit dev, localhost) must be safe and inert.
  for (const h of ['workspace.janeway.replit.dev', 'localhost', '']) {
    const info = detectOperatorOSHost(h);
    assert.equal(info.isRootDomain, false);
    assert.equal(info.isAppDomain, false);
    assert.equal(info.matchedModuleSlug, null);
    assert.equal(info.subdomain, null);
  }
});
