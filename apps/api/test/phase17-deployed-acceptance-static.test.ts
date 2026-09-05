import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const spec = readFileSync(
  resolve(repoRoot, 'apps/web/e2e/phase17-deployed-acceptance.spec.ts'),
  'utf8',
);
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/web/package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

test('deployed Phase 17 acceptance uses pre-provisioned accounts without direct database access', () => {
  for (const variable of [
    'E2E_PHASE17_EMAIL',
    'E2E_PHASE17_PASSWORD',
    'E2E_PHASE17_TENANT_ID',
    'E2E_PHASE17_DENIED_EMAIL',
    'E2E_PHASE17_DENIED_PASSWORD',
    'E2E_PHASE17_DENIED_TENANT_ID',
  ]) {
    assert.match(spec, new RegExp(`requiredEnv\\('${variable}'\\)`));
  }
  assert.doesNotMatch(spec, /from ['"]pg['"]/);
  assert.doesNotMatch(spec, /DATABASE_URL|auth\/register|insert into|update tenant_modules/i);
  assert.match(spec, /trace: 'off', screenshot: 'off', video: 'off'/);
});

test('deployed acceptance covers enabled-host SSO, logout, denial, and the OutCall activation lock', () => {
  assert.match(spec, /config\/operatoros-module-registry\.json/);
  assert.match(spec, /ENABLED_MODULES\.length !== 12/);
  assert.match(spec, /logout-all/);
  assert.match(spec, /techdeck\.operatoros\.net\/logout/);
  assert.match(spec, /MODULE_ACCESS_DENIED/);
  assert.match(spec, /module-status-outcall/);
  assert.match(spec, /MODULE_UNAVAILABLE/);
  assert.match(spec, /moduleId: 'techdeck' \| 'outcall'/);
  assert.match(spec, /assertNoCredentialQuery/);
  assert.match(spec, /assertNoBrowserCredentialStorage/);
  assert.equal(
    packageJson.scripts?.['test:e2e:phase17-deployed'],
    'playwright test --config playwright.deployed.config.ts',
  );
});
