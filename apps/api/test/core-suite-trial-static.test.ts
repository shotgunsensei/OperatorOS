import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Core Suite trial remains server-owned and does not impersonate billing or tenant grants', () => {
  const policy = read('apps/api/src/lib/core-suite-trial.ts');
  const entitlement = read('apps/api/src/lib/tenant-entitlements.ts');
  const routes = read('apps/api/src/routes/core-suite-trial-routes.ts');
  const schema = read('apps/api/src/lib/core-suite-trial-db-init.ts');
  const ui = read('apps/web/src/components/pages/MyAppsPage.tsx');
  const authRoutes = read('apps/api/src/routes/auth-routes.ts');
  const verification = read('apps/api/src/lib/email-verification.ts');
  const sso = read('apps/api/src/routes/sso-routes.ts');
  const login = read('apps/web/src/app/login/page.tsx');

  assert.match(policy, /'tradeflowkit',[\s\S]*'techdeck',[\s\S]*'pulsedesk'/);
  assert.doesNotMatch(policy, /snapproofos|callcommand|torqueshed/);
  assert.match(policy, /account_trials\.ends_at > NOW\(\)/);
  assert.match(policy, /tenants\.type = 'personal'/);
  assert.match(entitlement, /const trial = await resolveCoreSuiteTrialAccess/);
  assert.ok(entitlement.indexOf('ownerPlanGrantsModule') < entitlement.lastIndexOf('resolveCoreSuiteTrialAccess'));
  assert.doesNotMatch(routes, /stripe|card|tenantModules|tenantEntitlements/);
  assert.match(schema, /ON DELETE SET NULL/);
  assert.match(schema, /uq_account_trials_identity_offer/);
  assert.match(schema, /ends_at > started_at/);
  assert.match(ui, /Companion applications remain separately gated/);
  assert.match(ui, /Your records are preserved/);
  assert.match(authRoutes, /\/v1\/auth\/email-verification\/request/);
  assert.match(authRoutes, /\/v1\/auth\/email-verification\/confirm/);
  assert.match(authRoutes, /emailVerifiedAt: null/);
  assert.match(verification, /createHash\('sha256'\)/);
  assert.match(verification, /fingerprintEmail\(currentUser\.email\) !== verification\.email_fingerprint/);
  assert.doesNotMatch(verification, /token:\s*text\(|token:\s*varchar\(/);
  assert.match(sso, /moduleSessionMaxAgeSeconds\(moduleAccessExpiresAt\)/);
  assert.match(login, /mode === 'verify-email'/);
});
