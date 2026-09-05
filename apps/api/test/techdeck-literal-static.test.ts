import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('TechDeck literal routes retain OperatorOS authority and shared safety services', () => {
  const routes = read('apps/api/src/routes/techdeck-literal-routes.ts');
  assert.match(routes, /requireTenantModuleAccess\('techdeck'\)/);
  assert.match(routes, /adminGuards = \[\.\.\.writeGuards, requireTenantAdmin\]/);
  assert.match(routes, /createSharedSchedule/);
  assert.match(routes, /createServiceIdentityAndToken/);
  assert.match(routes, /createOutboundWebhookEndpoint/);
  assert.match(routes, /requestSharedExport/);
  assert.match(routes, /createAttachment/);
  assert.match(routes, /compliance-packets\/:id\/download/);
  assert.match(routes, /objectType: 'shared_export'/);
  assert.match(routes, /TECHDECK_COMPLIANCE_PACKET_NOT_FOUND/);
  assert.match(routes, /bcrypt\.hash\(password,12\)/);
  assert.match(routes, /documentation_only/);
  assert.match(routes, /executionAvailable:false/);
  assert.doesNotMatch(routes, /child[_-]?session|child[_-]?billing|query-string credential/i);
});

test('TechDeck restored shell and deep links expose all literal product areas', () => {
  const shell = read('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const consoleSource = read('apps/web/src/components/module-shells/TechDeckLiteralConsole.tsx');
  const routeMap = read('apps/web/src/app/modules/[slug]/[...path]/route-map.ts');
  assert.match(shell, /TechDeckLiteralConsole/);
  for (const id of ['techdeck-calendar','techdeck-portal','techdeck-licenses','techdeck-status','techdeck-webhooks','techdeck-api-tokens','techdeck-secure-intake','techdeck-compliance']) {
    assert.match(consoleSource, new RegExp(`id=["']${id}["']`));
    assert.match(routeMap, new RegExp(id));
  }
  assert.match(consoleSource, /Copy now — shown once/);
  assert.match(consoleSource, /downloadCompliancePacket/);
  assert.match(consoleSource, /Download package/);
  assert.match(consoleSource, /documentation-only diagnostic guidance/);
});

test('TechDeck public status and intake routes bypass sign-in only through bounded exact paths', () => {
  const middleware = read('apps/web/src/middleware.ts');
  const statusPage = read('apps/web/src/app/public/techdeck/status/[slug]/page.tsx');
  const intakePage = read('apps/web/src/app/public/techdeck/intake/[token]/page.tsx');
  assert.match(middleware, /\^\\\/status\\\/\(\[a-z0-9-\]\{1,120\}\)/);
  assert.match(middleware, /tdi_\[A-Za-z0-9_-\]\{24,200\}/);
  assert.match(middleware, /techDeckPublicDestination/);
  assert.match(statusPage, /credentials: 'omit'/);
  assert.match(intakePage, /credentials:'omit'/);
  assert.match(intakePage, /accept=\{request\.allowedFileTypes\.join/);
});

test('TechDeck release v35 remains additive and provisions literal tables last', () => {
  const contract = read('apps/api/src/lib/database-release-contract.ts');
  const release = read('apps/api/src/lib/database-release.ts');
  assert.ok(Number(contract.match(/releaseVersion:\s*(\d+)/)?.[1] ?? 0) >= 35);
  assert.match(contract, /outcall_product_operations[\s\S]*techdeck_literal_tables/);
  assert.match(release, /techdeck_literal_tables: ensureTechDeckLiteralTables/);
  assert.match(release, /to_regclass\('public\.techdeck_intake_requests'\)/);
});
