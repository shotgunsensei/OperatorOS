import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveCoreModuleDeepLink } from '../../web/src/app/modules/[slug]/[...path]/route-map.ts';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 49 publishes the complete canonical TorqueShed route surface', () => {
  const canonical = [
    '/', '/garage', '/garage/vehicles/new', '/garage/vehicles/vehicle-123', '/service',
    '/builds', '/builds/build-123', '/journal', '/diagnostics', '/diagnostics/new',
    '/diagnostics/diagnostic-123', '/diagnostics/diagnostic-123/assist', '/live-bays',
    '/live-bays/bay-123', '/templates', '/marketplace', '/marketplace/listing-123',
    '/community', '/profile', '/billing/credits', '/activity', '/search', '/exports', '/settings',
  ];
  for (const path of canonical.filter(path => path !== '/')) {
    const resolved = resolveCoreModuleDeepLink('torqueshed', path.split('/').filter(Boolean));
    assert.ok(resolved, `missing canonical route ${path}`);
    assert.equal(resolved.redirectPath, undefined, `canonical route redirects: ${path}`);
  }

  const expectedRedirects = new Map([
    ['/dashboard', '/'], ['/vehicles', '/garage'], ['/maintenance', '/service'], ['/repairs', '/service'],
    ['/reminders', '/service'], ['/build-journal', '/journal'], ['/live-bay', '/live-bays'],
    ['/diagnostic-templates', '/templates'], ['/vendors', '/templates'], ['/notifications', '/activity'],
  ]);
  for (const [path, target] of expectedRedirects) {
    assert.equal(
      resolveCoreModuleDeepLink('torqueshed', path.split('/').filter(Boolean))?.redirectPath,
      target,
      `legacy route ${path}`,
    );
  }
  assert.equal(
    resolveCoreModuleDeepLink('torqueshed', ['vehicles', 'vehicle-123'])?.redirectPath,
    '/garage/vehicles/vehicle-123',
  );
});

test('Phase 49 is URL-driven, route-focused, and keeps credit settlement out of Assist', () => {
  const workspace = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');
  const routes = read('apps/web/src/components/module-shells/TorqueShedRoute.contract.ts');
  const tools = read('apps/web/src/components/module-shells/TorqueShedRestorationPanels.tsx');
  const social = read('apps/web/src/components/module-shells/TorqueShedSocialPanels.tsx');

  assert.match(workspace, /<ModuleApplicationShell/);
  assert.match(workspace, /resolveTorqueShedRoute\(routePath \|\| pathname\)/);
  assert.match(workspace, /router\.push\(hrefFor\(`\/garage\/vehicles\/\$\{row\.id\}`\)\)/);
  assert.match(workspace, /router\.push\(hrefFor\(`\/diagnostics\/\$\{row\.id\}`\)\)/);
  assert.match(workspace, /Promise\.allSettled\(tasks\)/);
  assert.doesNotMatch(workspace, /useState<Tab>|setTab\(|\btab ===/);
  assert.doesNotMatch(workspace, /Promise\.all\(/);
  assert.doesNotMatch(tools, /Promise\.all\(/);
  assert.doesNotMatch(social, /Promise\.all\(/);
  assert.match(social, /Promise\.allSettled\(/);
  assert.match(tools, /Promise\.allSettled\(tasks\)/);
  assert.match(workspace, /dynamic\(\(\) => import\('\.\/TorqueShedSocialPanels'\)/);
  assert.match(workspace, /function TorqueCreditsPanel/);
  assert.match(workspace, /data-testid="torqueshed-credits-route"/);
  assert.match(workspace, /Buy credits and review usage/);
  assert.match(workspace, /payment service confirms payment/);
  assert.match(workspace, /data-testid="torqueshed-credit-balance"/);
  assert.match(workspace, /showAssist=\{route\.kind === 'diagnostic-assist'\}/);
  assert.match(routes, /torqueshed-dark-garage-amber/);
  assert.match(routes, /TORQUESHED_LEGACY_REDIRECTS/);
  for (const route of ['/garage/vehicles/new', '/billing/credits', '/diagnostics/new', '/live-bays', '/settings']) {
    assert.ok(routes.includes(`'${route}'`), route);
  }
});
