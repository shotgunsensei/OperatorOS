import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 11B routes use OperatorOS tenant, entitlement, write, and reviewer authority', () => {
  const routes = read('apps/api/src/routes/snapproofos-routes.ts');
  assert.match(routes, /const readGuards = \[requireTenantModuleAccess\('snapproofos'\)\]/);
  assert.match(routes, /const writeGuards = \[\.\.\.readGuards, requireTenantModuleWriteAccess\]/);
  assert.match(routes, /const adminGuards = \[\.\.\.writeGuards, requireTenantAdmin\]/);
  for (const path of [
    '/dashboard', '/cases', '/evidence', '/findings', '/comments', '/custody',
    '/retention', '/reports', '/export', '/migration/dry-run',
  ]) assert.match(routes, new RegExp(path.replace('/', '\\/')));
  assert.match(routes, /WHERE tenant_id=\$\{tenantId\}/);
  assert.match(routes, /getAttachmentContent/);
  assert.match(routes, /createAttachment/);
  assert.match(routes, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(routes, /fileUrl|publicUrl|shareToken|Math\.random|localStorage/i);
});

test('Phase 11B persistence enforces tenant foreign keys, integrity, immutability, indexes, and safe attribution', () => {
  const ddl = read('apps/api/src/lib/snapproofos-db-init.ts');
  const release = read('apps/api/src/lib/database-release-contract.ts');
  for (const table of [
    'snapproof_settings',
    'snapproof_cases',
    'snapproof_evidence_items',
    'snapproof_findings',
    'snapproof_comments',
    'snapproof_custody_events',
    'snapproof_reports',
    'snapproof_exports',
  ]) assert.match(ddl, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(ddl, /FOREIGN KEY \(tenant_id,case_id\)/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id,attachment_id\)/);
  assert.match(ddl, /uq_snapproof_custody_sequence/);
  assert.match(ddl, /snapproof_custody_append_only/);
  assert.match(ddl, /snapproof_exports_append_only/);
  assert.match(ddl, /ON DELETE SET NULL/);
  assert.match(release, /id: 'snapproofos_tables'/);
});

test('Phase 11B dedicated UI exposes persisted workflows and canonical deep links without placeholders', () => {
  const workspace = read('apps/web/src/components/module-shells/SnapProofWorkspace.tsx');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  const modulePage = read('apps/web/src/app/apps/[slug]/page.tsx');
  assert.match(workspace, /data-testid=\{`snapproofos-\$\{view\}-route`\}/);
  for (const capability of ['Dashboard', 'Cases', 'Evidence', 'Review', 'Findings', 'Reports', 'Custody', 'Retention', 'Settings']) {
    assert.match(workspace, new RegExp(capability));
  }
  assert.match(workspace, /persisted-private-evidence-only/);
  assert.match(workspace, /moduleShellApi\.snapproofos/);
  assert.match(routeMap, /snapproofos/);
  assert.match(routeMap, /resource === 'cases'/);
  assert.match(routeMap, /resource === 'evidence'/);
  assert.match(routeMap, /resource === 'reports'/);
  assert.match(modulePage, /'snapproofos':\s+SnapProofShell/);
  assert.doesNotMatch(workspace, /Math\.random|mock data|fake counter|Coming soon|href="#"/i);
});

test('Phase 11B keeps child authority, public URLs, fake exports, and arbitrary integrations quarantined', () => {
  const adr = read('docs/adr/ADR-0022-snapproofos-evidence-integrity-boundary.md');
  const parity = read('docs/modules/snapproofos/PARITY_MATRIX.md');
  const threat = read('docs/modules/snapproofos/THREAT_MODEL.md');
  const migration = read('docs/modules/snapproofos/MIGRATION_PLAN.md');
  const activeRoutes = read('apps/api/src/routes/snapproofos-routes.ts');
  assert.match(adr, /OperatorOS remains the only identity/i);
  assert.match(parity, /client `fileUrl`.*Replace/i);
  assert.match(parity, /Exports.*Generate real synchronous/i);
  assert.match(threat, /No raw\/public URL/i);
  assert.match(migration, /no apply mode/i);
  assert.doesNotMatch(activeRoutes, /password|stripe|checkout|share[_-]?token|client.*file[_-]?url/i);
});
