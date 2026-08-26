import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 11A routes use OperatorOS tenant, entitlement, and write authority', () => {
  const routes = read('apps/api/src/routes/brandforgeos-routes.ts');
  assert.match(routes, /const readGuards = \[requireTenantModuleAccess\('brandforgeos'\)\]/);
  assert.match(routes, /const writeGuards = \[\.\.\.readGuards, requireTenantModuleWriteAccess\]/);
  for (const path of [
    '/workspace',
    '/dashboard',
    '/brands',
    '/personas',
    '/campaigns',
    '/copy-assets',
    '/calendar-items',
    '/generations',
    '/export',
  ]) assert.match(routes, new RegExp(path.replace('/', '\\/')));
  assert.doesNotMatch(routes, /request\.body.*tenantId/);
  assert.match(routes, /eq\(brandforgeBrands\.tenantId, ctx\.tenantId\)/);
  assert.match(routes, /eq\(brandforgeCampaigns\.tenantId, ctx\.tenantId\)/);
  assert.match(routes, /eq\(brandforgeGenerations\.tenantId, ctx\.tenantId\)/);
  assert.match(routes, /beginIdempotentOperation/);
  assert.match(routes, /recordUsageEvent/);
  assert.match(routes, /BRANDFORGE_GENERATION_RATE_LIMITED/);
});

test('Phase 11A persistence has scoped foreign keys, constraints, indexes, and safe user deletion', () => {
  const ddl = read('apps/api/src/lib/brandforgeos-db-init.ts');
  const release = read('apps/api/src/lib/database-release-contract.ts');
  for (const table of [
    'brandforge_workspace_settings',
    'brandforge_brands',
    'brandforge_personas',
    'brandforge_campaigns',
    'brandforge_copy_assets',
    'brandforge_calendar_items',
    'brandforge_campaign_metrics',
    'brandforge_generations',
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(ddl, /FOREIGN KEY \(tenant_id,brand_id\)/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id,campaign_id\)/);
  assert.match(ddl, /ON DELETE SET NULL/);
  assert.match(ddl, /uq_brandforge_generation_idempotency/);
  assert.match(ddl, /brandforge_metric_counts_check/);
  assert.match(release, /id: 'brandforgeos_tables'/);
});

test('Phase 11A dedicated UI exposes persistent capabilities and no simulated product claims', () => {
  const workspace = read('apps/web/src/components/module-shells/BrandForgeWorkspace.tsx');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  const modulePage = read('apps/web/src/app/apps/[slug]/page.tsx');
  assert.match(workspace, /data-testid="brandforgeos-workspace"/);
  for (const capability of ['Dashboard', 'Brands', 'Personas', 'Campaigns', 'Copy Studio', 'Calendar', 'Analytics', 'AI Workflows', 'Settings']) {
    assert.match(workspace, new RegExp(capability));
  }
  assert.match(workspace, /evidence.*persisted_records_only/);
  assert.match(workspace, /moduleShellApi\.brandforgeos/);
  assert.match(routeMap, /brandforgeos/);
  assert.match(routeMap, /resource === 'brands'/);
  assert.match(routeMap, /resource === 'campaigns'/);
  assert.match(modulePage, /'brandforgeos':\s+BrandForgeRouteShell/);
  assert.doesNotMatch(workspace, /Math\.random|mock data|fake counter|Coming soon|href="#"/i);
});

test('Phase 11A keeps child identity, billing, fake analytics, and integrations quarantined', () => {
  const adr = read('docs/adr/ADR-0021-brandforgeos-creative-workspace-boundary.md');
  const parity = read('docs/modules/brandforgeos/PARITY_MATRIX.md');
  const activeRoutes = read('apps/api/src/routes/brandforgeos-routes.ts');
  assert.match(adr, /OperatorOS remains the only identity/i);
  assert.match(parity, /random analytics.*Replace/i);
  assert.match(parity, /Integrations.*Exclude/i);
  assert.doesNotMatch(activeRoutes, /replit|openid|password|stripe|checkout|credit balance|Math\.random/i);
});
