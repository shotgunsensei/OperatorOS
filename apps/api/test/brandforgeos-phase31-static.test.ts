import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 31 is pinned, additive, tenant scoped, and remains cumulative release step v40', () => {
  const source = JSON.parse(read('apps/modules/brandforgeos/source/SOURCE_SNAPSHOT.json'));
  assert.equal(source.sourceCommit, '5e78bc2ee6c8086ddd589bb7416f1d4560ffbb4e');
  assert.equal(source.trackedFileCount, 348);
  assert.equal(source.fileCount, 271);
  const contract = read('apps/api/src/lib/database-release-contract.ts');
  assert.match(contract, /releaseVersion:\s*(?:4[1-9]|[5-9][0-9])/);
  assert.match(contract, /brandforgeos_complete_product_tables/);
  const ddl = read('apps/api/src/lib/brandforgeos-phase31-db-init.ts');
  for (const table of [
    'brandforge_offers', 'brandforge_campaign_tasks', 'brandforge_campaign_comments',
    'brandforge_landing_pages', 'brandforge_ai_workflows', 'brandforge_templates',
    'brandforge_integrations', 'brandforge_sync_runs', 'brandforge_recommendations',
    'brandforge_lead_submissions', 'brandforge_reports', 'brandforge_export_jobs',
    'brandforge_credit_counters',
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(ddl, /brandforgeos\.templates\.premium/);
  assert.doesNotMatch(ddl, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/iu);
});

test('Phase 31 exposes source-compatible product routes and persisted product actions', () => {
  const routes = read('apps/api/src/routes/brandforgeos-phase31-routes.ts');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  const ui = read('apps/web/src/components/module-shells/BrandForgeCompletePanels.tsx');
  for (const path of [
    'product-overview', 'offers', 'campaigns/:campaignId/production', 'campaigns/:campaignId/tasks',
    'campaigns/:campaignId/comments', 'campaigns/:campaignId/landing-pages', 'workflows', 'templates',
    'integrations', 'recommendations', 'leads', 'reports', 'exports', 'activity',
    'notifications', 'plan-usage',
  ]) assert.match(routes, new RegExp(path.replaceAll('/', '\\/')));
  for (const path of [
    '/dashboard', '/brands', '/personas', '/offers', '/campaigns', '/copy-studio',
    '/calendar', '/analytics', '/ai-workflows', '/templates', '/integrations',
    '/reports', '/activity', '/admin', '/onboarding', '/pricing', '/legal', '/privacy',
    '/terms', '/home', '/login', '/settings',
  ]) assert.match(routeMap, new RegExp(`'${path.replaceAll('/', '\\/')}'`));
  for (const testId of [
    'brandforge-offers', 'brandforge-strategy', 'brandforge-templates',
    'brandforge-integrations', 'brandforge-reports', 'brandforge-activity',
    'brandforge-admin',
  ]) assert.match(ui, new RegExp(`data-testid=["']${testId}["']`));
  assert.doesNotMatch(`${routes}\n${ui}`, /Math\.random|fake metric|random report/iu);
});

test('Phase 31 enforces integration features, export-row idempotency, and brand-scoped reports', () => {
  const routes = readFileSync(resolve(root, 'apps/api/src/routes/brandforgeos-phase31-routes.ts'), 'utf8');
  const ddl = readFileSync(resolve(root, 'apps/api/src/lib/brandforgeos-phase31-db-init.ts'), 'utf8');
  assert.match(routes, /BRANDFORGE_INTEGRATION_ENTITLEMENT_REQUIRED/);
  assert.match(routes, /features\[requiredFeature\] === true/);
  assert.match(routes, /ON CONFLICT \(tenant_id,idempotency_key\)/);
  assert.match(routes, /serializeBrandForgeReportCsv/);
  assert.match(routes, /campaign\.brand_id=\$\{report\.brand_id\}/);
  assert.match(ddl, /uq_brandforge_exports_tenant_idempotency/);
});
