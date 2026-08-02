import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 10B route surface is guarded and never accepts browser tenant authority', () => {
  const routes = read('apps/api/src/routes/ninja-pool-hall-routes.ts');
  assert.match(routes, /const ninjaPoolReadGuards = \[requireTenantModuleAccess\('ninja-pool-hall'\)\]/);
  assert.match(routes, /const ninjaPoolWriteGuards = \[\.\.\.ninjaPoolReadGuards, requireTenantModuleWriteAccess\]/);
  for (const path of [
    '/v1/modules/ninja-pool-hall/profile',
    '/v1/modules/ninja-pool-hall/matches',
    '/v1/modules/ninja-pool-hall/matches/:id',
    '/v1/modules/ninja-pool-hall/matches/:id/shots',
    '/v1/modules/ninja-pool-hall/matches/:id/choices',
    '/v1/modules/ninja-pool-hall/matches/:id/abandon',
  ]) {
    assert.match(routes, new RegExp(path.replace(/[/:]/g, (value) => value === '/' ? '\\/' : value)));
  }
  assert.doesNotMatch(routes, /request\.body.*tenantId/);
  assert.doesNotMatch(routes, /request\.body.*userId/);
  assert.match(routes, /eq\(ninjaPoolMatchSessions\.tenantId, ctx\.tenantId\)/);
  assert.match(routes, /eq\(ninjaPoolMatchSessions\.userId, user\.id\)/);
});

test('Phase 10B persistence has tenant relationships, lifecycle constraints, and idempotency', () => {
  const ddl = read('apps/api/src/lib/ninja-pool-hall-db-init.ts');
  const schema = read('apps/api/src/schema.ts');
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS ninja_pool_player_profiles/);
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS ninja_pool_match_sessions/);
  assert.match(ddl, /CREATE TABLE IF NOT EXISTS ninja_pool_match_events/);
  assert.match(ddl, /FOREIGN KEY \(tenant_id, match_id\)/);
  assert.match(ddl, /UNIQUE \(tenant_id, match_id, client_action_id\)/);
  assert.match(ddl, /WHERE status='active'/);
  assert.match(ddl, /client_reported_server_rules/);
  assert.match(schema, /uniqueIndex\('uq_ninja_pool_match_start'\)/);
  assert.match(schema, /uniqueIndex\('uq_ninja_pool_event_client'\)/);
});

test('Phase 10B UI exposes only implemented modes and durable deep links', () => {
  const shell = read('apps/web/src/components/module-shells/NinjaPoolHallShell.tsx');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  const match = read('apps/web/src/components/module-shells/NinjaPoolHallMatch.tsx');
  const profile = read('apps/web/src/components/module-shells/NinjaPoolHallProfile.tsx');
  assert.match(shell, /path === '\/practice'/);
  assert.match(shell, /path === '\/cpu'/);
  assert.match(shell, /path === '\/local'/);
  assert.match(shell, /path === '\/profile'/);
  assert.match(shell, /\^\\\/matches\\\/\(\[a-z0-9-\]\+\)\$/i);
  assert.match(shell, /syncRoute\(\)/);
  assert.match(routeMap, /'ninja-pool-hall'/);
  assert.match(routeMap, /resource === 'matches'/);
  assert.doesNotMatch(routeMap, /'\/host'|'\/join'/);
  assert.match(shell, /Online rooms are coming later/);
  assert.match(shell, /For now, enjoy CPU and pass-and-play matches/);
  assert.doesNotMatch(shell, /Host online room/);
  assert.doesNotMatch(shell, /Join online room/);
  assert.match(match, /chooseBotShot/);
  assert.match(match, /applyShotResult/);
  assert.match(match, /saveMatchShot/);
  assert.match(match, /client-reported/i);
  assert.match(match, /physical shot details come from this device/i);
  assert.match(profile, /Personal progress, no public leaderboard/i);
});

test('standalone room identity and child server stay quarantined', () => {
  const shell = read('apps/web/src/components/module-shells/NinjaPoolHallShell.tsx');
  const client = read('apps/web/src/lib/auth.ts');
  assert.doesNotMatch(shell, /createPoolNet|\/ws\/pool|localStorage/);
  assert.doesNotMatch(client, /\/ws\/pool|clientId.*localStorage/);
  assert.match(client, /credentials: 'include'/);
  assert.match(client, /\/modules\/ninja-pool-hall\/matches/);
});
