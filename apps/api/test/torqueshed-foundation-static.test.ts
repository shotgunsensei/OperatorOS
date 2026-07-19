import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string): string {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
}

test('TorqueShed foundation is namespaced, tenant-bound, versioned, indexed, and release-gated', () => {
  const ddl = read('apps/api/src/lib/torqueshed-db-init.ts');
  for (const table of [
    'torqueshed_vehicles',
    'torqueshed_mileage_events',
    'torqueshed_vendors',
    'torqueshed_service_records',
    'torqueshed_service_parts',
    'torqueshed_builds',
    'torqueshed_build_stages',
    'torqueshed_build_tasks',
    'torqueshed_service_reminders',
    'torqueshed_diagnostic_sessions',
    'torqueshed_diagnostic_trouble_codes',
    'torqueshed_diagnostic_entries',
    'torqueshed_diagnostic_templates',
    'torqueshed_migration_refs',
  ])
    assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(
    ddl,
    /FOREIGN KEY \(tenant_id, vehicle_id\) REFERENCES torqueshed_vehicles\(tenant_id, id\)/,
  );
  assert.match(
    ddl,
    /FOREIGN KEY \(tenant_id, build_id, stage_id\) REFERENCES torqueshed_build_stages\(tenant_id, build_id, id\)/,
  );
  assert.match(ddl, /labor_cost_minor INTEGER/);
  assert.match(ddl, /vin_sha256 VARCHAR\(64\), vin_last6 VARCHAR\(6\)/);
  assert.doesNotMatch(ddl, /vin VARCHAR|password|session_cookie|subscriptions|stripe/i);
  assert.match(ddl, /version INTEGER NOT NULL DEFAULT 1/);
  assert.match(ddl, /CREATE INDEX IF NOT EXISTS idx_torqueshed_diagnostics_vehicle/);
  const release = read('apps/api/src/lib/database-release-contract.ts');
  assert.match(release, /id: 'torqueshed_tables'/);
  assert.ok(release.indexOf("id: 'torqueshed_tables'") > release.indexOf("id: 'pulsedesk_tables'"));
});

test('TorqueShed routes enforce OperatorOS access and expose foundation workflows without AI or billing', () => {
  const routes = read('apps/api/src/routes/torqueshed-routes.ts');
  assert.match(routes, /requireTenantModuleAccess\('torqueshed'\)/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  for (const path of [
    '/vehicles',
    '/builds',
    '/diagnostics',
    '/diagnostic-templates',
    '/vendors',
    '/reminders',
  ])
    assert.ok(routes.includes(`/v1/modules/torqueshed${path}`), path);
  assert.match(routes, /Idempotency-Key/);
  assert.match(routes, /TORQUESHED_VERSION_CONFLICT/);
  assert.match(routes, /createAttachment/);
  assert.match(routes, /async function vendorRow[\s\S]*owner_user_id = \$\{user\(request\)\}/);
  assert.match(routes, /part\.vendorId && !\(await vendorRow\(request, part\.vendorId\)\)/);
  assert.doesNotMatch(routes, /torque-assist|token-ledger|marketplace|community|stripe/i);
});

test('TorqueShed native workspace and durable deep routes are registered', () => {
  const page = read('apps/web/src/app/apps/[slug]/page.tsx');
  const workspace = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');
  const map = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  assert.match(page, /'torqueshed':\s+TorqueShedWorkspace/);
  for (const state of [
    'torqueshed-dashboard',
    'torqueshed-garage',
    'torqueshed-service',
    'torqueshed-builds',
    'torqueshed-diagnostics',
    'torqueshed-diagnostic-timeline',
    'torqueshed-templates',
  ])
    assert.match(workspace, new RegExp(state));
  assert.match(workspace, /VINs are retained only as a masked suffix/);
  assert.match(map, /'\/diagnostics': \{ sectionId: 'torqueshed-diagnostics'/);
  assert.match(map, /resource === 'diagnostics'/);
});

test('TorqueShed immutable source provenance remains separate from active runtime', () => {
  const snapshot = JSON.parse(read('apps/modules/torqueshed/source/SOURCE_SNAPSHOT.json'));
  assert.equal(snapshot.moduleSlug, 'torqueshed');
  assert.equal(snapshot.sourceCommit, 'c33ade5cef525d62d371a63946b814c58a72a4a7');
  assert.equal(snapshot.highConfidenceSecretFindings, 0);
  const routeRegistration = read('apps/api/src/routes/module-shell-routes.ts');
  assert.match(routeRegistration, /registerTorqueShedRoutes/);
  assert.doesNotMatch(routeRegistration, /apps\/modules\/torqueshed\/source/);
});
