import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function functionBody(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing ${start}`);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

test('Deploy Ops threads tenant write capability through both workspaces', () => {
  const routeShell = read('apps/web/src/components/module-shells/NinjaLaunchKitRouteShell.tsx');
  const productShell = read('apps/web/src/components/module-shells/NinjaLaunchKitProductShell.tsx');
  const complete = read('apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx');

  assert.match(routeShell, /useModuleAccessLevel/);
  assert.match(routeShell, /moduleAccessLevel === 'user' \|\| moduleAccessLevel === 'manager'/);
  assert.match(routeShell, /canWrite=\{canWriteModule\}/);
  assert.match(productShell, /canWrite = true/);
  assert.match(productShell, /NinjaLaunchKitCompleteWorkspace[\s\S]{0,400}canWrite=\{canWrite\}/);
  assert.match(productShell, /NinjaLaunchKitShell baseUrl=\{baseUrl\} canWrite=\{canWrite\}/);
  assert.match(complete, /NinjaLaunchKitShell baseUrl=\{baseUrl\} idPrefix="launchkit-execution" canWrite=\{canWrite\}/);
});

test('release-package viewers can preview and read, but cannot persist package changes', () => {
  const source = read('apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx');

  assert.match(source, /data-testid="deployops-read-only"/);
  assert.match(source, /data-can-write=\{canWrite \? 'true' : 'false'\}/);
  for (const [start, end] of [
    ['async function createKit', 'async function kitAction'],
    ['async function createBrand', 'async function exportKit'],
  ]) {
    assert.match(functionBody(source, start, end), /if \(!canWrite\)/);
    assert.match(functionBody(source, start, end), /READ_ONLY_MESSAGE/);
  }
  for (const [start, end] of [
    ['async function kitAction', 'async function createBrand'],
    ['async function exportKit', 'const plan'],
  ]) {
    assert.match(functionBody(source, start, end), /if \(!canManageSelected\)/);
    assert.match(functionBody(source, start, end), /SHARED_REVIEW_MESSAGE/);
  }

  const preview = functionBody(source, 'async function previewKit', 'async function createKit');
  assert.match(preview, /previewProductKit/);
  assert.doesNotMatch(preview, /if \(!canWrite\)/);
  assert.match(source, /onClick=\{previewKit\}[\s\S]{0,100}disabled=\{!!busy\}/);
  assert.match(source, /type="submit" disabled=\{!!busy \|\| !canWrite\}/);
  assert.match(source, /disabled=\{!canWrite \|\| plan === 'free' \|\| !!busy\}/);
  assert.match(source, /!canManageSelected \|\|\s*!selected \|\|/);

  // Selecting templates and opening an existing kit are local/read operations and remain available.
  assert.match(source, /onClick=\{\(\) => chooseTemplate\(template\)\}/);
  assert.match(source, /onClick=\{\(\) => void load\(kit\.id\)\}/);
});

test('exact Phase 34 package links expose tenant review without widening list or mutation ownership', () => {
  const api = read('apps/api/src/routes/ninja-launch-kit-phase34-routes.ts');
  const workspace = read('apps/web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx');

  const writeCapability = functionBody(
    api,
    'function mayWriteOwnedKit',
    '/** Exact shared-workflow links',
  );
  assert.match(writeCapability, /moduleAccessLevel === 'user' \|\| moduleAccessLevel === 'manager'/);
  assert.doesNotMatch(writeCapability, /moduleAccessLevel !==/);

  const exactRead = functionBody(
    api,
    'app.get(`${base}/kits/:id`',
    'app.post(`${base}/kits`',
  );
  assert.match(exactRead, /loadReviewableKit\(request, identifier\(request\)\)/);
  assert.match(exactRead, /ownedByCurrentUser:?[,\s]/);
  assert.match(exactRead, /canManage: ownedByCurrentUser && mayWriteOwnedKit\(request\)/);

  const list = functionBody(
    api,
    'app.get(`${base}/kits`,',
    'app.get(`${base}/kits/:id`',
  );
  assert.match(list, /WHERE tenant_id=\$\{tenant\(request\)\} AND user_id=\$\{actor\(request\)\}/);

  const actorPrivateMutations = functionBody(
    api,
    "for (const action of ['archive', 'restore'] as const)",
    "app.delete(`${base}/kits/:id`",
  );
  assert.match(actorPrivateMutations, /loadKit\(tenant\(request\), actor\(request\), identifier\(request\)\)/);
  assert.doesNotMatch(actorPrivateMutations, /loadReviewableKit/);
  assert.equal(
    (api.match(/loadKit\(tenant\(request\), actor\(request\), identifier\(request\)/g) ?? []).length,
    7,
    'every Phase 34 kit mutation must keep the actor-owned loader',
  );
  assert.equal(
    (api.match(/await loadReviewableKit\(/g) ?? []).length,
    1,
    'the tenant-review loader is only callable from the exact read route',
  );

  assert.match(workspace, /const canManageSelected = canWrite && detail\?\.capabilities\?\.canManage === true/);
  assert.match(workspace, /data-testid="deployops-shared-kit-read-only"/);
  assert.match(workspace, /data-selected-can-manage=\{selected \? \(canManageSelected \? 'true' : 'false'\)/);
  assert.ok((workspace.match(/disabled=\{!!busy \|\| !canManageSelected\}/g) ?? []).length >= 4);
  assert.match(workspace, /!canManageSelected \|\|\s*!selected \|\|/);

  // A reviewer may still create their own package or brand; only the selected teammate record is locked.
  assert.match(functionBody(workspace, 'async function createKit', 'async function kitAction'), /if \(!canWrite\)/);
  assert.match(functionBody(workspace, 'async function createBrand', 'async function exportKit'), /if \(!canWrite\)/);
});

test('legacy readiness viewers cannot mutate status, tasks, artifacts, exports, or completion', () => {
  const source = read('apps/web/src/components/module-shells/NinjaLaunchKitShell.tsx');

  assert.match(source, /data-testid="deployops-execution-read-only"/);
  assert.match(source, /fieldset disabled=\{!canWrite\}/);
  for (const [start, end] of [
    ['async function createLaunch', 'async function toggleTask'],
    ['async function toggleTask', 'async function advanceArtifact'],
    ['async function advanceArtifact', 'async function generate'],
    ['async function generate', 'async function exportLaunch'],
    ['async function exportLaunch', 'async function markLaunched'],
    ['async function markLaunched', 'return ('],
  ]) {
    assert.match(functionBody(source, start, end), /if \(!canWrite\)/);
    assert.match(functionBody(source, start, end), /READ_ONLY_MESSAGE/);
  }

  assert.match(source, /disabled=\{!canWrite \|\| readiness\?\.score !== 100/);
  assert.match(source, /data-testid="input-launchkit-external-evidence"[\s\S]{0,100}disabled=\{!canWrite\}/);
  assert.match(source, /data-testid="checkbox-launchkit-external-confirmed"[\s\S]{0,100}disabled=\{!canWrite\}/);
  assert.match(source, /disabled=\{!canWrite \|\| busy === `task:\$\{task\.id\}`\}/);
  assert.match(source, /data-testid="button-launchkit-generate"[\s\S]{0,160}disabled=\{!canWrite \|\| !draftingAvailable \|\| !!busy\}/);
  assert.match(source, /disabled=\{!canWrite \|\| artifact\.status === 'archived' \|\| !!busy\}/);
  assert.match(source, /data-testid=\{`button-launchkit-export-\$\{format\}`\}[\s\S]{0,120}disabled=\{!canWrite \|\| !!busy\}/);

  // Opening an existing workspace remains a read operation.
  assert.match(source, /data-testid=\{`button-launchkit-open-\$\{item\.id\}`\}[\s\S]{0,120}onClick=\{\(\) => void load\(item\.id\)\}/);
});
