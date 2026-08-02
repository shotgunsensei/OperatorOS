import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModuleBySlug } from '../../../packages/modules/registry.js';

process.env.SESSION_SECRET ||= 'ecosystem-hardening-contract-secret-32-plus';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const MODULES = ['tradeflowkit', 'pulsedesk', 'techdeck', 'torqueshed'] as const;

test('the hardened ecosystem exposes one canonical contract for all primary modules', () => {
  for (const slug of MODULES) {
    const module = getModuleBySlug(slug);
    assert.ok(module, `${slug} is registered`);
    assert.equal(module.status, 'active');
    assert.equal(module.contractVersion, 'v1');
    assert.equal(module.returnUrl, 'https://app.operatoros.net/');
    assert.equal(module.ssoCallbackUrl, `https://${slug}.operatoros.net/sso`);
    assert.equal(module.healthCheckUrl, `https://${slug}.operatoros.net/healthz`);
  }
});

test('module route renders shared identity, tenant, navigation, and global logout chrome', () => {
  const page = read('apps/web/src/app/apps/[slug]/page.tsx');
  const consolePage = read('apps/web/src/app/app/page.tsx');
  const header = read('apps/web/src/components/module-shells/OperatorOSEcosystemHeader.tsx');
  assert.match(page, /OperatorOSEcosystemHeader/);
  for (const label of ['My Apps', 'Profile', 'Billing', 'Support', 'Logout']) {
    assert.match(header, new RegExp(`['\"]${label}['\"]`));
  }
  assert.match(header, /activeTenant\?\.name/);
  assert.match(header, /user\?\.name \|\| user\?\.email/);
  assert.match(header, /logoutEverywhere/);
  assert.match(header, /signed_out=global/);
  assert.doesNotMatch(consolePage, /didInitialLand/);
  assert.match(consolePage, /return requested && LINKABLE_CONSOLE_PAGES\.has\(requested\) \? requested : 'my-apps'/);
});

test('session refresh preserves scope and revokes the replaced token', async () => {
  const { isModuleSessionPathAllowed, sessionNeedsRefresh } = await import('../src/lib/auth.js');
  assert.equal(sessionNeedsRefresh({ exp: 1_000 }, 1_000 - 60), true);
  assert.equal(sessionNeedsRefresh({ exp: 1_000 + 2 * 24 * 60 * 60 }, 1_000), false);
  assert.equal(isModuleSessionPathAllowed('techdeck', '/v1/auth/refresh'), true);

  const routes = read('apps/api/src/routes/auth-routes.ts');
  assert.match(routes, /sessionType: session\.sessionType/);
  assert.match(routes, /tenantId: session\.tenantId, moduleId: session\.moduleId/);
  assert.match(routes, /reason: 'session_refresh'/);
  assert.match(routes, /\/v1\/auth\/refresh/);
});

test('TechDeck presents active workflows without migration or runtime notes', () => {
  const shell = read('apps/web/src/components/module-shells/TechDeckShell.tsx');
  assert.match(shell, /Technician workspace for tickets/);
  assert.match(shell, /Preparing your tickets, systems, documentation, and team access/);
  assert.doesNotMatch(shell, /Migration pending|shared runtime|module entitlement state/i);
});

test('TradeFlowKit and PulseDesk present customer workflows without migration notes', () => {
  const completedShells = [
    ['TradeFlowKitShell.tsx', /Move leads into customers, jobs, quotes, invoices, payments/],
    ['PulseDeskShell.tsx', /PulseDeskServiceDeskWorkspace/],
  ] as const;

  for (const [filename, completedMarker] of completedShells) {
    const shell = read(`apps/web/src/components/module-shells/${filename}`);
    assert.match(shell, completedMarker, filename);
    assert.doesNotMatch(shell, /Migration pending|shared runtime|module entitlement state/i, filename);
  }
});

test('production logging and readiness expose safe shared context', () => {
  const api = read('apps/api/src/index.ts');
  assert.match(api, /requestId: request\.id/);
  assert.match(api, /userId: user\?\.id/);
  assert.match(api, /tenantId:/);
  assert.match(api, /moduleId:/);
  assert.match(api, /req\.headers\.authorization/);
  assert.match(api, /disableRequestLogging: true/);
  assert.match(api, /database === 'healthy'/);
  assert.match(api, /externalDependencies/);
  assert.match(api, /reply\.header\('X-Request-Id', request\.id\)/);
});

test('shared authentication and tenant denials terminate Fastify pre-handlers', () => {
  const entitlements = read('apps/api/src/lib/entitlement-service.ts');
  const tenantAuth = read('apps/api/src/lib/tenant-auth.ts');
  assert.match(entitlements, /if \(reply\.sent\) return reply/);
  assert.match(entitlements, /return reply\.code\(403\)\.send\(\{/);
  assert.match(tenantAuth, /if \(reply\.sent\) return reply/);
  assert.match(tenantAuth, /return reply\.code\(404\)\.send\(\{/);
  assert.match(tenantAuth, /return reply\.code\(err\.statusCode\)\.send\(\{/);
  assert.match(tenantAuth, /return reply\.code\(403\)\.send\(\{/);
});

test('required shared integration and operations documents exist', () => {
  for (const path of [
    'docs/OPERATOROS_ECOSYSTEM_INTEGRATION_CONTRACT.md',
    'docs/CROSS_MODULE_READINESS_REPORT.md',
    'docs/DATABASE_BACKUP_RESTORE.md',
  ]) assert.ok(read(path).length > 200, path);
});
