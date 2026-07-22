import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

test('FaultlineLab has a dedicated persistent workspace rather than the generic workflow shell', () => {
  const page = read('apps/web/src/app/apps/[slug]/page.tsx');
  const workspace = read('apps/web/src/components/module-shells/FaultlineLabWorkspace.tsx');
  const generic = read('apps/web/src/components/module-shells/WorkflowModuleShell.tsx');
  assert.match(page, /'faultlinelab':\s+FaultlineLabWorkspace/);
  assert.doesNotMatch(page, /WorkflowModuleShell moduleSlug="faultlinelab"/);
  assert.doesNotMatch(generic, /faultlinelab/);
  for (const section of [
    'faultlinelab-dashboard',
    'faultlinelab-challenges',
    'faultlinelab-session',
    'faultlinelab-assignments',
    'faultlinelab-progress',
    'faultlinelab-authoring',
    'faultlinelab-analytics',
  ]) assert.ok(workspace.includes(`id="${section}"`), `missing ${section}`);
  assert.match(workspace, /faultlinelab\.startSession/);
  assert.match(workspace, /faultlinelab\.addAction/);
  assert.match(workspace, /faultlinelab\.submit/);
  assert.match(workspace, /faultlinelab\.createAssignment/);
  assert.match(workspace, /faultlinelab\.createChallenge/);
});

test('FaultlineLab API preserves OperatorOS authority and server-only scoring', () => {
  const routes = read('apps/api/src/routes/faultlinelab-routes.ts');
  const dbInit = read('apps/api/src/lib/faultlinelab-db-init.ts');
  assert.match(routes, /authority:\s*'operatoros'/);
  assert.match(routes, /scoring:\s*'server-only'/);
  assert.match(routes, /available:\s*false/);
  assert.match(routes, /requireTenantModuleAccess\('faultlinelab'\)/);
  assert.match(routes, /requireTenantModuleWriteAccess/);
  assert.match(routes, /requireTenantAdmin/);
  assert.match(routes, /scoreFaultlineSubmission/);
  assert.match(dbInit, /faultlinelab_reject_append_only_mutation/);
  assert.match(dbInit, /FOREIGN KEY \(tenant_id, challenge_id\)/);
  assert.match(dbInit, /FOREIGN KEY \(tenant_id, session_id\)/);
});
