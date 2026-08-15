import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 11D routes enforce OperatorOS authority, tenant predicates, usage, and review', () => {
  const routes = read('apps/api/src/routes/ninja-launch-kit-routes.ts');
  assert.match(routes, /requireTenantModuleAccess\('ninja-launch-kit'\)/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  assert.match(routes, /WHERE tenant_id=\$\{tenantId\}/);
  assert.match(routes, /beginIdempotentOperation/);
  assert.match(routes, /recordUsageEvent/);
  assert.match(routes, /status='draft'/);
  assert.match(routes, /LAUNCHKIT_NOT_READY/);
  assert.doesNotMatch(routes, /request\.body.*tenantId/);
});

test('Phase 11D schema is additive, tenant-composite, indexed, and readiness-lifecycle constrained', () => {
  const ddl = read('apps/api/src/lib/ninja-launch-kit-db-init.ts');
  for (const table of [
    'launchkit_launches', 'launchkit_phases', 'launchkit_milestones',
    'launchkit_tasks', 'launchkit_generations', 'launchkit_artifacts', 'launchkit_exports',
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(ddl, /FOREIGN KEY \(tenant_id,launch_id\)/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id,depends_on_task_id\)/);
  assert.match(ddl, /uq_launchkit_artifact_active_kind/);
  assert.match(ddl, /launchkit_artifact_status_check/);
  assert.match(read('apps/api/src/lib/database-release-contract.ts'), /id: 'ninja_launch_kit_tables'/);
  assert.match(read('apps/api/src/lib/database-release.ts'), /launchkit_artifacts/);
});

test('Phase 11D replaces the unfinished scaffold surface with real workspace and deep links', () => {
  const shell = read('apps/web/src/components/module-shells/NinjaLaunchKitShell.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  const deepLinks = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  const moduleRoutes = read('apps/api/src/routes/module-shell-routes.ts');
  assert.match(shell, /moduleShellApi\.launchkit\.workspace/);
  assert.match(shell, /The server computes this score/);
  assert.match(shell, /Generated content stays draft until review and approval/);
  assert.match(shell, /Audited exports/);
  assert.doesNotMatch(shell, /Math\.random|Generate scaffold|starter stack/i);
  assert.match(client, /\/modules\/ninja-launch-kit\/launches/);
  assert.doesNotMatch(moduleRoutes, /ninja-launch-kit\/scaffolds/);
  for (const sectionId of [
    'launchkit-dashboard',
    'launchkit-execution',
    'launchkit-builder',
    'launchkit-templates',
    'launchkit-exports',
  ]) {
    assert.match(deepLinks, new RegExp(sectionId));
  }
});

test('Phase 11D records product boundary, threats, migration exclusions, and source provenance', () => {
  const adr = read('docs/adr/ADR-0024-ninja-launch-kit-product-and-readiness-boundary.md');
  const parity = read('docs/modules/ninja-launch-kit/PARITY_MATRIX.md');
  assert.match(adr, /BrandForgeOS remains the authority/);
  assert.match(adr, /server-computed readiness/);
  assert.match(adr, /legacy URL-token SSO/);
  assert.match(parity, /30bd1abc05846926e97bc7b26c5b7d6625e8f161/);
  assert.match(parity, /Cross-tenant launch enumeration/);
  assert.match(parity, /no apply mode in Phase 11D/i);
  assert.match(parity, /Deployed-host acceptance/);
});
