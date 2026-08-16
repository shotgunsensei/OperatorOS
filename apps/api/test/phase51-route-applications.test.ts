import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 51 routes every remaining polished module through a distinct shared application shell', () => {
  const page = read('apps/web/src/app/apps/[slug]/page.tsx');
  for (const [slug, shell] of [
    ['brandforgeos', 'BrandForgeRouteShell'], ['studyforge-ai', 'StudyForgeRouteShell'],
    ['ninja-launch-kit', 'NinjaLaunchKitRouteShell'], ['ninjamation', 'NinjamationRouteShell'],
    ['ninja-pool-hall', 'NinjaPoolHallRouteShell'],
  ]) {
    assert.match(page, new RegExp(`['"]${slug}['"]:\\s+${shell}`));
    const source = read(`apps/web/src/components/module-shells/${shell}.tsx`);
    assert.match(source, /ModuleApplicationShell/);
    assert.match(source, /DEFAULT_OPERATOROS_NAVIGATION_URLS\.appsUrl/);
    assert.match(source, /mobileNavigation="drawer"/);
  }
});

test('Phase 51 route contracts preserve focused loading, review boundaries, and adaptive gameplay', () => {
  const brand = read('apps/web/src/components/module-shells/BrandForgeWorkspace.tsx');
  const study = read('apps/web/src/components/module-shells/StudyForgeShell.tsx');
  const launch = read('apps/web/src/components/module-shells/NinjaLaunchKitProductShell.tsx');
  const ninja = read('apps/web/src/components/module-shells/NinjamationShell.tsx');
  const pool = read('apps/web/src/components/module-shells/NinjaPoolHallShell.tsx');
  assert.match(brand, /if \(tab === 'dashboard'\)/);
  assert.match(study, /const legacyView =/);
  assert.match(launch, /view === 'review' \? 'execution'/);
  assert.match(ninja, /if \(active === 'library' \|\| deepScriptId\) await loadLibrary/);
  assert.match(pool, /Leave this active online room/);
  assert.doesNotMatch(pool, /window\.open/);
});

test('Phase 51 compatibility route map exposes all canonical major product areas', () => {
  const routes = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  for (const path of [
    "'/content'", "'/approvals'", "'/sessions'", "'/exports'", "'/projects'", "'/brief'", "'/deliverables'",
    "'/sources'", "'/runs'", "'/versions'", "'/history'", "'/stats'", "'/rules'", "'/settings'",
  ]) assert.match(routes, new RegExp(path.replace(/[/'-]/g, match => `\\${match}`)));
});
