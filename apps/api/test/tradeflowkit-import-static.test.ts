import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTradeFlowKitAdapterContext,
  mapOperatorOSTenantRoleToTradeFlowKitRole,
} from '../../../apps/modules/tradeflowkit/adapter.ts';
import {
  getModuleByHost,
  getModuleById,
} from '../../../packages/modules/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function repoPath(path: string): string {
  return resolve(repoRoot, path);
}

function readRepoFile(path: string): string {
  return readFileSync(repoPath(path), 'utf8');
}

test('TradeFlowKit source snapshot is staged without runtime artifacts', () => {
  for (const path of [
    'apps/modules/tradeflowkit/source/package.json',
    'apps/modules/tradeflowkit/source/client/src/App.tsx',
    'apps/modules/tradeflowkit/source/client/src/lib/auth.tsx',
    'apps/modules/tradeflowkit/source/client/index.html',
    'apps/modules/tradeflowkit/source/server/routes/index.ts',
    'apps/modules/tradeflowkit/source/server/routes/auth.ts',
    'apps/modules/tradeflowkit/source/server/routes/sso.ts',
    'apps/modules/tradeflowkit/source/server/routes/subscriptions.ts',
    'apps/modules/tradeflowkit/source/server/routes/stripeConnect.ts',
    'apps/modules/tradeflowkit/source/server/routes/invoices.ts',
    'apps/modules/tradeflowkit/source/server/routes/callRecovery.ts',
    'apps/modules/tradeflowkit/source/server/routes/entitlements.ts',
    'apps/modules/tradeflowkit/source/server/middleware.ts',
    'apps/modules/tradeflowkit/source/server/env.ts',
    'apps/modules/tradeflowkit/source/shared/schema.ts',
    'apps/modules/tradeflowkit/source/shared/entitlements.ts',
    'apps/modules/tradeflowkit/source/docs/lead-conversion-center-demo-script.md',
  ]) {
    assert.ok(existsSync(repoPath(path)), `${path} should exist`);
  }

  for (const excluded of [
    'apps/modules/tradeflowkit/source/.git',
    'apps/modules/tradeflowkit/source/.agents',
    'apps/modules/tradeflowkit/source/.codex',
    'apps/modules/tradeflowkit/source/.github',
    'apps/modules/tradeflowkit/source/dist',
    'apps/modules/tradeflowkit/source/data',
    'apps/modules/tradeflowkit/source/package-lock.json',
    'apps/modules/tradeflowkit/source/test-results',
    'apps/modules/tradeflowkit/source/playwright-report',
  ]) {
    assert.equal(existsSync(repoPath(excluded)), false, `${excluded} should not be imported`);
  }
  assert.match(
    readRepoFile('apps/modules/tradeflowkit/source/.gitignore'),
    /^node_modules$/m,
    'local snapshot dependencies must remain ignored',
  );
});

test('TradeFlowKit source audit identifies web, API, SSO, auth, billing, tenant, and workflow surfaces', () => {
  const pkg = JSON.parse(readRepoFile('apps/modules/tradeflowkit/source/package.json'));
  const app = readRepoFile('apps/modules/tradeflowkit/source/client/src/App.tsx');
  const html = readRepoFile('apps/modules/tradeflowkit/source/client/index.html');
  const routeIndex = readRepoFile('apps/modules/tradeflowkit/source/server/routes/index.ts');
  const middleware = readRepoFile('apps/modules/tradeflowkit/source/server/middleware.ts');
  const sso = readRepoFile('apps/modules/tradeflowkit/source/server/routes/sso.ts');
  const auth = readRepoFile('apps/modules/tradeflowkit/source/server/routes/auth.ts');
  const env = readRepoFile('apps/modules/tradeflowkit/source/server/env.ts');
  const subscriptions = readRepoFile('apps/modules/tradeflowkit/source/server/routes/subscriptions.ts');
  const stripeConnect = readRepoFile('apps/modules/tradeflowkit/source/server/routes/stripeConnect.ts');
  const invoices = readRepoFile('apps/modules/tradeflowkit/source/server/routes/invoices.ts');
  const callRecovery = readRepoFile('apps/modules/tradeflowkit/source/server/routes/callRecovery.ts');
  const entitlements = readRepoFile('apps/modules/tradeflowkit/source/server/routes/entitlements.ts');
  const schema = readRepoFile('apps/modules/tradeflowkit/source/shared/schema.ts');
  const sharedEntitlements = readRepoFile('apps/modules/tradeflowkit/source/shared/entitlements.ts');

  assert.ok(pkg.dependencies.express);
  assert.ok(pkg.dependencies['drizzle-orm']);
  assert.ok(pkg.dependencies.pg);
  assert.ok(pkg.dependencies.stripe);
  assert.ok(pkg.dependencies['@sendgrid/mail']);
  assert.ok(pkg.dependencies.wouter);
  assert.equal(pkg.dependencies.expo, undefined);
  assert.equal(pkg.dependencies.supabase, undefined);
  assert.equal(pkg.dependencies['@supabase/supabase-js'], undefined);

  for (const route of [
    'path="/dashboard"',
    'path="/leads"',
    'path="/customers"',
    'path="/jobs"',
    'path="/quotes"',
    'path="/invoices"',
    'path="/settings"',
    'path="/subscription"',
    'path="/analytics"',
    'path="/call-recovery"',
    'path="/admin"',
    'path="/portal/:token"',
  ]) {
    assert.ok(app.includes(route), `missing client route ${route}`);
  }

  assert.match(app, /MobileBottomNav/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /serviceWorker\.register/);

  for (const routerName of [
    'authRouter',
    'ssoRouter',
    'orgsRouter',
    'customersRouter',
    'jobsRouter',
    'quotesRouter',
    'invoicesRouter',
    'subscriptionsRouter',
    'callRecoveryRouter',
    'analyticsRouter',
    'stripeConnectRouter',
    'adminRouter',
    'operatorosRouter',
    'entitlementsRouter',
    'leadsRouter',
  ]) {
    assert.ok(routeIndex.includes(routerName), `missing server route ${routerName}`);
  }

  for (const guard of [
    'requireAuth',
    'requireOrg',
    'requireSuperAdmin',
    'requireOrgRole',
    'requireFeature',
    'resolveRequestAccess',
  ]) {
    assert.ok(middleware.includes(guard), `missing middleware guard ${guard}`);
  }

  assert.match(sso, /router\.get\("\/sso"/);
  assert.match(sso, /exchangeSsoCode/);
  assert.match(sso, /operatoros_sso/);
  assert.match(sso, /isSuperAdmin/);
  assert.match(env, /OPERATOROS_SSO_CLIENT_SECRET/);
  assert.match(env, /OPERATOROS_BASE_URL/);
  assert.match(env, /OPERATOROS_API_URL/);
  assert.match(env, /OPERATOROS_SERVICE_TOKEN/);

  for (const authPath of [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/change-password',
    '/api/auth/switch-org',
  ]) {
    assert.ok(auth.includes(authPath), `missing auth route ${authPath}`);
  }

  assert.match(subscriptions, /\/api\/stripe\/create-checkout/);
  assert.match(subscriptions, /\/api\/stripe\/create-portal/);
  assert.match(subscriptions, /managed_by_operatoros/);
  assert.match(subscriptions, /stripe\.checkout\.sessions\.create/);
  assert.match(subscriptions, /stripe\.billingPortal\.sessions\.create/);

  assert.match(stripeConnect, /\/api\/stripe\/connect\/authorize/);
  assert.match(stripeConnect, /managed_by_operatoros/);
  assert.match(stripeConnect, /stripe\.oauth/);

  assert.match(invoices, /\/api\/invoices\/:id\/payment-link/);
  assert.match(invoices, /stripe\.checkout\.sessions\.create/);
  assert.match(callRecovery, /\/api\/call-recovery\/checkout/);
  assert.match(callRecovery, /stripe\.checkout\.sessions\.create/);
  assert.match(entitlements, /\/api\/operatoros\/entitlements\/sync/);
  assert.match(entitlements, /OPERATOROS_SERVICE_TOKEN/);

  for (const table of [
    'export const users = pgTable("users"',
    'export const orgs = pgTable("orgs"',
    'export const memberships = pgTable("memberships"',
    'export const customers = pgTable("customers"',
    'export const jobs = pgTable("jobs"',
    'export const quotes = pgTable("quotes"',
    'export const invoices = pgTable("invoices"',
    'export const leads = pgTable("leads"',
    'export const processedStripeEvents = pgTable("processed_stripe_events"',
  ]) {
    assert.ok(schema.includes(table), `missing schema table ${table}`);
  }

  assert.match(schema, /operatorosTenantId/);
  assert.match(schema, /operatorosOrganizationId/);
  assert.match(schema, /stripeConnectAccountId/);
  assert.match(sharedEntitlements, /TenantEntitlementSnapshotSchema/);
  assert.match(sharedEntitlements, /UserEntitlementSnapshotSchema/);
  assert.match(sharedEntitlements, /isLinkedOrg/);
  assert.match(sharedEntitlements, /resolveAccess/);
});

test('TradeFlowKit adapter receives OperatorOS context and does not grant local owner authority', () => {
  assert.equal(mapOperatorOSTenantRoleToTradeFlowKitRole('owner', false), 'admin');
  assert.equal(mapOperatorOSTenantRoleToTradeFlowKitRole('admin', false), 'admin');
  assert.equal(mapOperatorOSTenantRoleToTradeFlowKitRole('viewer', false), 'viewer');
  assert.equal(mapOperatorOSTenantRoleToTradeFlowKitRole('readonly', false), 'viewer');
  assert.equal(mapOperatorOSTenantRoleToTradeFlowKitRole('member', false), 'tech');
  assert.equal(mapOperatorOSTenantRoleToTradeFlowKitRole(null, true), 'admin');

  const ctx = createTradeFlowKitAdapterContext({
    currentUser: {
      id: 'user-1',
      email: 'john@shotgunninjas.com',
      platformRole: 'super_admin',
    },
    tenantId: 'tenant-1',
    role: 'owner',
    entitlements: { modules: [{ slug: 'tradeflowkit', enabled: true }] },
    platformAdmin: true,
  });

  assert.equal(ctx.moduleId, 'tradeflowkit');
  assert.equal(ctx.tenantId, 'tenant-1');
  assert.equal(ctx.platformAdmin, true);
  assert.equal(ctx.entitled, true);
  assert.equal(ctx.localRole, 'admin');
  assert.notEqual(ctx.localRole, 'owner');
  assert.equal(ctx.standaloneLoginMode, 'operatoros_managed');
  assert.equal(ctx.billingMode, 'operatoros_managed');
  assert.equal(ctx.legacySourcePath, 'apps/modules/tradeflowkit/source');
  assert.equal(ctx.hostnames.production, 'tradeflowkit.operatoros.net');
  assert.equal(ctx.localFallbackPath, '/modules/tradeflowkit');
  assert.ok(ctx.coreRoutes.some(route => route.id === 'jobs'));
  assert.ok(ctx.coreRoutes.some(route => route.id === 'invoices'));
  assert.ok(ctx.externalDependencies.some(dep => dep.id === 'stripe'));
  assert.ok(ctx.externalDependencies.some(dep => dep.id === 'openai'));
});

test('OperatorOS module route shell wires TradeFlowKit host/local fallback to the adapter shell', () => {
  const appSlugPage = readRepoFile('apps/web/src/app/apps/[slug]/page.tsx');
  const moduleFallback = readRepoFile('apps/web/src/app/modules/[slug]/page.tsx');
  const webTsconfig = readRepoFile('apps/web/tsconfig.json');
  const shell = readRepoFile('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');

  assert.match(appSlugPage, /TradeFlowKitShell/);
  assert.match(appSlugPage, /'tradeflowkit':\s*TradeFlowKitShell/);
  assert.match(appSlugPage, /TenantProvider/);
  assert.match(moduleFallback, /return <InternalAppPage \/>/);
  assert.match(webTsconfig, /tradeflowkit\/adapter\.ts/);

  assert.match(shell, /createTradeFlowKitAdapterContext/);
  assert.match(shell, /hasPlatformAdminAuthority/);
  assert.match(shell, /tradeflowkit-platform-manage-link/);
  assert.match(shell, /data-testid="tradeflowkit-module-shell"/);
  assert.match(shell, /data-testid="tradeflowkit-module-header"/);
  assert.match(shell, /data-testid="tradeflowkit-module-sidebar"/);
  assert.match(shell, /tradeflowkit-return-command-center/);
  assert.match(shell, /tradeflowkit-loading-state/);
  assert.match(shell, /tradeflowkit-empty-state/);
  assert.match(shell, /tradeflowkit-error-state/);
  assert.match(shell, /tradeflowkit-settings-panel/);
  assert.match(shell, /adapter\.hostnames\.production/);

  assert.equal(getModuleById('tradeflowkit')?.hostname, 'tradeflowkit.operatoros.net');
  assert.equal(getModuleByHost('https://tradeflowkit.operatoros.net/sso?code=probe')?.id, 'tradeflowkit');
});

test('TradeFlowKit Phase 14 docs cover import notes, auth mapping, risks, and smoke checks', () => {
  const readme = readRepoFile('apps/modules/tradeflowkit/README.md');
  const moduleReadme = readRepoFile('apps/modules/README.md');
  const importNotes = readRepoFile('docs/tradeflowkit-import-notes.md');
  const authMapping = readRepoFile('docs/tradeflowkit-auth-mapping.md');
  const risks = readRepoFile('docs/tradeflowkit-risk-register.md');

  for (const needle of [
    'apps/modules/tradeflowkit/source',
    '/modules/tradeflowkit',
    'tradeflowkit.operatoros.net',
    'No Expo or separate native client',
    'Stripe Connect',
    'Call Recovery',
    'Missing entitlement is blocked',
  ]) {
    assert.ok(importNotes.includes(needle), `missing import note: ${needle}`);
  }

  for (const needle of [
    'OperatorOS owns',
    'TradeFlowKit must not become a second source of',
    'truth for these concerns',
    'TradeFlowKit local owner authority is not minted',
    '/api/auth/login',
    '/api/stripe/create-checkout',
    '/api/operatoros/entitlements/sync',
  ]) {
    assert.ok(authMapping.includes(needle), `missing auth mapping note: ${needle}`);
  }

  for (const needle of [
    'Standalone Auth Still Exists',
    'Local Stripe Subscription and Add-On Code Still Exists',
    'Stripe Connect and Invoice Payments Need Separate Classification',
    'Separate Org Model',
    'Mobile PWA Surface',
    'Manual QA Checklist',
    'Missing entitlement is blocked',
  ]) {
    assert.ok(risks.includes(needle), `missing risk note: ${needle}`);
  }

  assert.match(readme, /Consolidated Runtime Status/);
  assert.match(readme, /standalone server is not executed/);
  assert.match(moduleReadme, /tradeflowkit` - active shared-runtime shell plus imported source snapshot/);
});
