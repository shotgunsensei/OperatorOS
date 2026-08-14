import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const spec = readFileSync(resolve(repoRoot, 'apps/web/e2e/sso-v1.spec.ts'), 'utf8');
const ssoRoutes = readFileSync(resolve(repoRoot, 'apps/api/src/routes/sso-routes.ts'), 'utf8');
const registry = JSON.parse(readFileSync(resolve(repoRoot, 'config/operatoros-module-registry.json'), 'utf8')) as Array<{
  moduleId: string;
  slug: string;
  enabled: boolean;
  productionBaseUrl: string;
}>;

test('production-host browser matrix is registry-derived for every enabled module', () => {
  const enabled = registry.filter(entry => entry.moduleId !== 'operatoros' && entry.enabled);
  assert.equal(enabled.length, 12);
  assert.match(spec, /config\/operatoros-module-registry\.json/);
  assert.match(spec, /ENABLED_MODULES\.length !== 12/);
  assert.doesNotMatch(spec, /const CORE_MODULES/);
  for (const module of enabled) {
    const escapedSlug = module.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(spec, new RegExp(`(?:^|\\n)\\s*(?:['\"]${escapedSlug}['\"]|${escapedSlug})\\s*:`, 'm'));
  }

  const issueLimit = ssoRoutes.match(/const ISSUE_RATE_LIMIT = (\d+);/);
  assert.ok(issueLimit, 'SSO issue rate limit must remain explicit');
  assert.ok(Number(issueLimit[1]) >= enabled.length, 'SSO issue limit must allow one launch per enabled module');
});

test('browser matrix covers direct deep links, back, sibling tabs, local logout, and global logout', () => {
  assert.match(spec, /techdeck\.operatoros\.net\/assets/);
  assert.match(spec, /page\.goBack/);
  assert.match(spec, /context\.newPage/);
  assert.match(spec, /techdeck\.operatoros\.net\/logout/);
  assert.match(spec, /authApi|logout-all/);
  assert.match(spec, /forbiddenCredentialParams/);
  assert.match(spec, /tenant denial and the global OutCall activation lock/i);
  assert.match(spec, /denied\.tenant\.body\.code\)\.toBe\('MODULE_ACCESS_DENIED'\)/);
  assert.match(spec, /denied\.outcall\.body\.code\)\.toBe\('MODULE_UNAVAILABLE'\)/);
});
