import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const read=(path:string)=>readFileSync(resolve(root,path),'utf8');

test('Phase 28 uses the pinned complete TorqueShed source and retains its additive step before later cumulative releases',()=>{
  const source=JSON.parse(read('apps/modules/torqueshed/source/SOURCE_SNAPSHOT.json'));
  assert.equal(source.sourceCommit,'508b384b6f66a1eacd3d4cd8d9c5edd4bf47fe75');
  assert.equal(source.highConfidenceSecretFindings,0);
  const contract=read('apps/api/src/lib/database-release-contract.ts');
  assert.match(contract,/releaseVersion:\s*48/);assert.match(contract,/torqueshed_web_api_tables/);
  const ddl=read('apps/api/src/lib/torqueshed-web-api-db-init.ts');
  for(const table of ['torqueshed_build_journal_entries','torqueshed_build_parts','torqueshed_live_bays','torqueshed_live_bay_members','torqueshed_live_bay_messages','torqueshed_share_links','torqueshed_user_settings'])assert.match(ddl,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.doesNotMatch(ddl,/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/i);
});

test('Phase 28 web/API surfaces are real, deep-linked, reconnect-safe and installable',()=>{
  const routes=read('apps/api/src/routes/torqueshed-web-api-routes.ts'),ui=read('apps/web/src/components/module-shells/TorqueShedRestorationPanels.tsx'),workspace=read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx'),routeMap=read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts'),worker=read('apps/web/public/torqueshed-sw.js');
  for(const path of ['builds/:id/workspace','builds/:id/journal','live-bays/:id/messages','diagnostics/:id/report','marketplace/sellers/:userId','search','activity','notifications','settings','exports','share-links'])assert.match(routes,new RegExp(path.replace(/[/:]/g,match=>match==='/'?'\\/':':')));
  assert.match(routes,/last_sequence=last_sequence\+1/);assert.match(routes,/client_message_id/);assert.match(routes,/torqueshed_live_bay_rate_windows/);assert.match(routes,/tenant_id=\$\{tenant\(request\)\}/);
  assert.match(routes,/not a transaction rating or payment guarantee/);assert.match(routes,/does not process payment, escrow, shipping, title, or transaction guarantees/);assert.doesNotMatch(routes,/buyer protection|guaranteed transaction/i);
  for(const testid of ['torqueshed-journal','torqueshed-live-bay','torqueshed-tools'])assert.match(ui,new RegExp(`data-testid="${testid}"`));
  assert.match(ui,/window\.setInterval\(\(\)=>void sync\(\),2000\)/);assert.match(workspace,/serviceWorker\.register\('\/torqueshed-sw\.js'/);assert.match(worker,/event\.request\.method !== 'GET'/);assert.doesNotMatch(worker,/cache\.put\(event\.request/);
  for(const path of ["'/journal'","'/live-bay'","'/search'","'/activity'","'/notifications'","'/exports'","'/settings'"])assert.match(routeMap,new RegExp(path.replace('/','\\/')));
  assert.match(workspace,/@media \(max-width: 900px\)/);assert.match(workspace,/@media \(max-width: 560px\)/);assert.match(workspace,/prefers-reduced-motion/);
});
