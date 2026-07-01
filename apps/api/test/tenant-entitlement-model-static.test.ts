import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readRepoFile(repoPath: string): string {
  return fs.readFileSync(path.join(root, repoPath), 'utf8');
}

test('tenant entitlement model exposes the Phase 6 helper contract', () => {
  const service = readRepoFile('apps/api/src/lib/tenant-entitlements.ts');

  for (const helper of [
    'getUserTenants',
    'getTenantMembership',
    'getTenantEntitlements',
    'tenantHasModuleEntitlement',
    'requireTenantModuleAccess',
    'grantModuleEntitlement',
    'revokeModuleEntitlement',
  ]) {
    assert.match(service, new RegExp(`export async function ${helper}\\b`), `missing helper export: ${helper}`);
  }

  assert.match(service, /hasPlatformAdminAuthority/);
  assert.match(service, /tenantHasActiveEntitlement/);
  assert.match(service, /isUserWithinTenantSeatLimit/);
  assert.match(service, /tenant_module_entitlement_granted/);
  assert.match(service, /tenant_module_entitlement_revoked/);
});

test('module launch, SSO, and route guards delegate to the central tenant entitlement model', () => {
  const entitlementService = readRepoFile('apps/api/src/lib/entitlement-service.ts');
  const tenantAuth = readRepoFile('apps/api/src/lib/tenant-auth.ts');
  const ssoRoutes = readRepoFile('apps/api/src/routes/sso-routes.ts');

  assert.match(entitlementService, /resolveTenantModuleAccess/);
  assert.match(entitlementService, /await resolveTenantModuleAccess\(userId,\s*tenantId,\s*moduleSlug\)/);

  assert.match(tenantAuth, /requireTenantModuleAccess as requireTenantModuleAccessDecision/);
  assert.match(tenantAuth, /await requireTenantModuleAccessDecision\(request,\s*ctx\.tenantId,\s*moduleSlug\)/);

  assert.match(ssoRoutes, /resolveTenantModuleAccess/);
  assert.doesNotMatch(ssoRoutes, /tenantHasActiveEntitlement/);
});

test('Shotgun Ninjas bootstrap seeds internal tenant module entitlements without Stripe wiring', () => {
  const launchFix = readRepoFile('apps/api/src/lib/launch-fix-init.ts');

  assert.match(launchFix, /Shotgun Ninjas Productions/);
  assert.match(launchFix, /tenantEntitlements/);
  assert.match(launchFix, /\['techdeck', 'pulsedesk', 'tradeflowkit'\]/);
  assert.match(launchFix, /source:\s*'admin'/);
  assert.doesNotMatch(launchFix, /STRIPE_PRICE_TECHDECK_MONTHLY/);
});
