import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { MODULE_CATALOG_BY_SLUG } from '../../../packages/sdk/src/catalog.js';
import { getEcosystemModule } from '../../../packages/sdk/src/ecosystem.js';
import { ELIGIBLE_COMPANION_MODULE_KEYS, FREE_WITH_ANY_ACCOUNT, normalizeStackSelection } from '../../../packages/sdk/src/products.js';
import { getModuleById, resolveModuleContext } from '../../../packages/modules/registry.js';
import { moduleSupportsExchangeCode } from '../src/lib/sso-exchange-rollout.js';
import { MODULE_SETUP_GUIDES } from '../../web/src/lib/help/module-setup.js';

test('OutCall source exposes its canonical authenticated launch independently of provider activation', () => {
  const module = getModuleById('outcall');
  assert.ok(module);
  assert.equal(MODULE_CATALOG_BY_SLUG.outcall.defaultStatus, 'live');
  assert.equal(getEcosystemModule('outcall')?.status, 'active');
  assert.equal(module.enabled, true);
  assert.equal(moduleSupportsExchangeCode('outcall'), true);
  assert.deepEqual(module.exactRedirectUris, ['https://outcall.operatoros.net/sso']);
  assert.deepEqual(module.exactAllowedOrigins, ['https://outcall.operatoros.net']);
});

test('OutCall launch still requires authentication and a trusted central entitlement', () => {
  const user = { id: 'outcall-test-user', email: 'outcall@example.invalid', platformRole: 'user' };
  const request = { host: 'outcall.operatoros.net', pathname: '/schedules' };
  assert.equal(resolveModuleContext(request).status, 'unauthenticated');
  assert.equal(resolveModuleContext({ ...request, user, entitlements: {} }).status, 'access_denied');
  assert.equal(resolveModuleContext({ ...request, user, entitlements: { outcall: true } }).status, 'allowed');
  const foreignHost = resolveModuleContext({ ...request, host: 'outcall.operatoros.net.evil.invalid', user, entitlements: { outcall: true } });
  assert.equal(foreignHost.isKnownHost, false);
  assert.equal(foreignHost.module, null);
});

test('OutCall launch does not open free-account grants or unresolved Stack commerce', () => {
  assert.equal(FREE_WITH_ANY_ACCOUNT.some(module => module.key === ('outcall' as never)), false);
  assert.equal(ELIGIBLE_COMPANION_MODULE_KEYS.includes('outcall' as never), false);
  assert.throws(() => normalizeStackSelection({ coreProduct: 'techdeck', freeCompanionModule: 'outcall' as never }), /Unknown companion/);
  assert.throws(() => normalizeStackSelection({ coreProduct: 'techdeck', freeCompanionModule: 'snapproofos', additionalModules: ['outcall' as never] }), /Unknown companion/);
  const seedSource = readFileSync(new URL('../src/lib/saas-db-init.ts', import.meta.url), 'utf8');
  assert.equal(seedSource.includes("spec.slug === 'outcall' && spec.defaultStatus === 'coming_soon'"), false);
  assert.match(seedSource, /if \(spec\.defaultStatus === 'live'\)/);
  assert.match(seedSource, /addonPriceCents: [^\n]+isEligibleCompanionModuleKey\(c\.slug\)/);
  assert.match(MODULE_SETUP_GUIDES.outcall.services, /Existing authorized access/);
  assert.match(MODULE_SETUP_GUIDES.outcall.services, /approved account resource policy/);
  assert.match(MODULE_SETUP_GUIDES.outcall.services, /New enrollment awaits approved commercial terms/);
});
