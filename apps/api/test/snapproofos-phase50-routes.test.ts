import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 50 SnapProofOS exposes a route-first application shell and honest workspace map', () => {
  const contract = read('apps/web/src/components/module-shells/SnapProofRoute.contract.ts');
  const shell = read('apps/web/src/components/module-shells/SnapProofShell.tsx');
  const workspace = read('apps/web/src/components/module-shells/SnapProofWorkspace.tsx');
  const modulePage = read('apps/web/src/app/apps/[slug]/page.tsx');
  for (const route of [
    '/customers', '/projects', '/jobs', '/capture', '/work', '/costs', '/templates',
    '/team', '/activity', '/cases', '/evidence', '/review', '/findings', '/reports',
    '/share', '/exports', '/custody', '/retention', '/branding', '/settings',
  ]) assert.match(contract, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(contract, /Use each job as a workspace for the people, proof, findings, costs, and final report/i);
  assert.match(shell, /ModuleApplicationShell/);
  assert.match(shell, /SNAPPROOF_THEME/);
  assert.match(shell, /DEFAULT_OPERATOROS_NAVIGATION_URLS/);
  assert.match(workspace, /data-workspace-view=\{view\}/);
  assert.match(modulePage, /'snapproofos':\s+SnapProofShell/);
  assert.doesNotMatch(workspace, /window\.history|popstate|setTab\(/);
});

test('Phase 50 SnapProofOS preserves compatibility aliases and first-class record deep links', () => {
  const contract = read('apps/web/src/components/module-shells/SnapProofRoute.contract.ts');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  for (const alias of ['/dashboard', '/cases', '/jobs/new', '/files', '/findings', '/profile', '/billing']) {
    assert.match(routeMap, new RegExp(alias.replaceAll('/', '\\/')));
  }
  assert.match(routeMap, /resource === 'cases'.*sectionId: 'snapproofos-cases'/s);
  assert.doesNotMatch(routeMap, /resource === 'cases'.*redirectPath: `\/jobs\/\$\{encodeURIComponent\(id\)\}`/s);
  assert.match(routeMap, /resource === 'jobs'/);
  assert.match(contract, /recordId/);
  assert.match(contract, /SNAPPROOF_LEGACY_REDIRECTS/);
});

test('Phase 50 SnapProofOS loads route data narrowly while retaining capture and delivery controls', () => {
  const routes = read('apps/api/src/routes/snapproofos-phase32-routes.ts');
  const workspace = read('apps/web/src/components/module-shells/SnapProofWorkspace.tsx');
  const field = read('apps/web/src/components/module-shells/SnapProofFieldWorkspace.tsx');
  assert.match(workspace, /const needsCases = \['dashboard', 'cases', 'evidence', 'review', 'findings', 'reports', 'custody', 'retention'\]/);
  assert.match(workspace, /tab === 'cases'.*<CasesPanel/s);
  assert.match(workspace, /tab === 'findings'.*<FindingsPanel/s);
  assert.match(field, /const needsJobs = \['jobs', 'capture', 'work', 'costs', 'templates', 'reports', 'share', 'exports'\]/);
  assert.match(field, /tab === 'customers'/);
  assert.match(field, /tab === 'capture'.*listSnapProofCaptures\(\)/s);
  assert.match(field, /createShareLink/);
  assert.match(field, /createReportExport/);
  assert.match(field, /New secure share URL/);
  assert.match(field, /reconcileSnapProofCaptures/);
  assert.match(routes, /tu\.joined_at FROM tenant_users/);
  assert.doesNotMatch(routes, /tu\.created_at FROM tenant_users/);
  assert.doesNotMatch(field, /Promise\.all\(\[\s*moduleShellApi\.snapproofos\.customers\(\),\s*moduleShellApi\.snapproofos\.jobs\(\),\s*moduleShellApi\.snapproofos\.templates\(\)/s);
});
