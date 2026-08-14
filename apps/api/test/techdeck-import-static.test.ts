import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTechDeckAdapterContext,
  mapOperatorOSTenantRoleToTechDeckRole,
} from '../../../apps/modules/techdeck/adapter.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function repoPath(path: string): string {
  return resolve(repoRoot, path);
}

function readRepoFile(path: string): string {
  return readFileSync(repoPath(path), 'utf8');
}

test('TechDeck source snapshot is staged under apps/modules/techdeck without runtime artifacts', () => {
  for (const path of [
    'apps/modules/techdeck/source/package.json',
    'apps/modules/techdeck/source/client/src/App.tsx',
    'apps/modules/techdeck/source/server/routes.ts',
    'apps/modules/techdeck/source/server/auth/sso.ts',
    'apps/modules/techdeck/source/server/auth/routes.ts',
    'apps/modules/techdeck/source/server/modules/operatoros/routes.ts',
    'apps/modules/techdeck/source/server/modules/tickets/routes.ts',
    'apps/modules/techdeck/source/shared/schema.ts',
    'apps/modules/techdeck/source/docs/OPERATOROS_SSO.md',
    'apps/modules/techdeck/source/docs/LOCAL_BILLING_DECOMMISSION.md',
  ]) {
    assert.ok(existsSync(repoPath(path)), `${path} should exist`);
  }

  for (const excluded of [
    'apps/modules/techdeck/source/dist',
    'apps/modules/techdeck/source/data',
    'apps/modules/techdeck/source/package-lock.json',
  ]) {
    assert.equal(existsSync(repoPath(excluded)), false, `${excluded} should not be imported`);
  }
  assert.match(readRepoFile('.gitignore'), /^node_modules\/$/m, 'local dependencies must remain ignored');
});

test('TechDeck source audit identifies auth, billing, tenants, APIs, and data models', () => {
  const pkg = JSON.parse(readRepoFile('apps/modules/techdeck/source/package.json'));
  const routes = readRepoFile('apps/modules/techdeck/source/server/routes.ts');
  const authRoutes = readRepoFile('apps/modules/techdeck/source/server/auth/routes.ts');
  const sso = readRepoFile('apps/modules/techdeck/source/server/auth/sso.ts');
  const billingDoc = readRepoFile('apps/modules/techdeck/source/docs/LOCAL_BILLING_DECOMMISSION.md');
  const schema = readRepoFile('apps/modules/techdeck/source/shared/schema.ts');
  const productionSeed = readRepoFile('apps/modules/techdeck/source/server/productionSeed.ts');

  assert.ok(pkg.dependencies.express);
  assert.ok(pkg.dependencies['drizzle-orm']);
  assert.ok(pkg.dependencies.stripe);
  assert.match(routes, /registerSsoRoutes\(app\)/);
  assert.match(routes, /registerBillingRoutes\(app\)/);
  assert.match(routes, /registerOperatorOsRoutes\(app\)/);
  assert.match(authRoutes, /managed_by_operatoros/);
  assert.match(authRoutes, /TECHDECK_ENABLE_LOCAL_AUTH/);
  assert.match(sso, /OPERATOROS_SSO_AUDIENCE/);
  assert.match(sso, /\/v1\/modules\/sso\/exchange/);
  assert.match(sso, /OPERATOROS_SSO_CLIENT_SECRET/);
  assert.doesNotMatch(sso, /req\.query\.token/);
  assert.match(billingDoc, /Tech Deck no longer owns subscriptions/);
  assert.match(billingDoc, /410 Gone/);
  assert.match(schema, /export const tenants = pgTable\("tenants"/);
  assert.match(schema, /export const tenantMembers = pgTable/);
  assert.match(productionSeed, /OperatorOS owns production super-admin bootstrap/);
  assert.doesNotMatch(productionSeed, /john@shotgunninjas\.com|TECHDECK_BOOTSTRAP_ADMIN_PASSWORD|TECHDECK_XODUS_ADMIN_PASSWORD/);
  assert.doesNotMatch(productionSeed, /Dr0p\$0fJup1t3r|ApplePiesTasteFine4!/);
});

test('TechDeck adapter receives OperatorOS context and never grants local OWNER', () => {
  assert.equal(mapOperatorOSTenantRoleToTechDeckRole('owner', false), 'ADMIN');
  assert.equal(mapOperatorOSTenantRoleToTechDeckRole('admin', false), 'ADMIN');
  assert.equal(mapOperatorOSTenantRoleToTechDeckRole('member', false), 'TECH');
  assert.equal(mapOperatorOSTenantRoleToTechDeckRole(null, true), 'ADMIN');

  const ctx = createTechDeckAdapterContext({
    currentUser: {
      id: 'user-1',
      email: 'john@shotgunninjas.com',
      platformRole: 'super_admin',
    },
    tenantId: 'tenant-1',
    role: 'owner',
    entitlements: { modules: [{ slug: 'techdeck', enabled: true }] },
    platformAdmin: true,
  });

  assert.equal(ctx.moduleId, 'techdeck');
  assert.equal(ctx.tenantId, 'tenant-1');
  assert.equal(ctx.platformAdmin, true);
  assert.equal(ctx.entitled, true);
  assert.equal(ctx.localRole, 'ADMIN');
  assert.equal(ctx.standaloneLoginMode, 'operatoros_managed');
  assert.notEqual(ctx.localRole, 'OWNER');
});

test('OperatorOS module route shell wires TechDeck host/local fallback to the adapter shell', () => {
  const appSlugPage = readRepoFile('apps/web/src/app/apps/[slug]/page.tsx');
  const moduleFallback = readRepoFile('apps/web/src/app/modules/[slug]/page.tsx');
  const shell = readRepoFile('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const registry = readRepoFile('packages/modules/registry.ts');
  const ecosystem = readRepoFile('packages/sdk/src/ecosystem.ts');

  assert.match(appSlugPage, /TechDeckShell/);
  assert.match(appSlugPage, /'techdeck':\s*TechDeckShell/);
  assert.ok(moduleFallback.includes('return <ModuleHost slug={params.slug} requestedHost={searchParams?.host} />'));
  assert.match(shell, /createTechDeckAdapterContext/);
  assert.match(shell, /hasPlatformAdminAuthority/);
  assert.match(shell, /techdeck-platform-manage-link/);
  assert.match(shell, /data-testid="techdeck-module-shell"/);
  assert.match(`${registry}\n${ecosystem}`, /techdeck\.operatoros\.net/);
});

test('TechDeck Phase 10 redirects duplicate auth and pricing ownership to OperatorOS', () => {
  const loginPage = readRepoFile('apps/modules/techdeck/source/client/src/pages/login.tsx');
  const registerPage = readRepoFile('apps/modules/techdeck/source/client/src/pages/register.tsx');
  const pricingPage = readRepoFile('apps/modules/techdeck/source/client/src/pages/pricing.tsx');
  const accountSecurity = readRepoFile('apps/modules/techdeck/source/client/src/pages/account-security.tsx');
  const mfaSetup = readRepoFile('apps/modules/techdeck/source/client/src/pages/mfa-setup.tsx');
  const reviewerLogin = readRepoFile('apps/modules/techdeck/source/client/src/pages/reviewer-login.tsx');
  const authUtils = readRepoFile('apps/modules/techdeck/source/client/src/lib/auth-utils.ts');
  const deleteAccount = readRepoFile('apps/modules/techdeck/source/client/src/pages/delete-account.tsx');
  const operatorosHelper = readRepoFile('apps/modules/techdeck/source/client/src/lib/operatoros.ts');
  const authRoutes = readRepoFile('apps/modules/techdeck/source/server/auth/routes.ts');
  const authErrorPage = readRepoFile('apps/modules/techdeck/source/server/auth/errorPage.ts');
  const reviewerRoutes = readRepoFile('apps/modules/techdeck/source/server/modules/reviewer/routes.ts');
  const billingRoutes = readRepoFile('apps/modules/techdeck/source/server/modules/billing/routes.ts');
  const adminRoutes = readRepoFile('apps/modules/techdeck/source/server/modules/admin/routes.ts');
  const landing = readRepoFile('apps/modules/techdeck/source/client/src/modules/core/pages/landing.tsx');
  const sitemap = readRepoFile('apps/modules/techdeck/source/client/public/sitemap.xml');

  for (const source of [loginPage, registerPage, pricingPage, accountSecurity, mfaSetup, reviewerLogin, authUtils, deleteAccount, authErrorPage]) {
    assert.match(source, /OperatorOS/);
  }

  assert.doesNotMatch(loginPage, /authFetch\("\/api\/auth\/login"|input-password|button-login-submit/);
  assert.doesNotMatch(registerPage, /authFetch\("\/api\/auth\/register"|input-password|button-register-submit/);
  assert.doesNotMatch(accountSecurity, /\/api\/auth\/change-password|\/api\/auth\/mfa\/disable|input-current-password/);
  assert.doesNotMatch(mfaSetup, /\/api\/auth\/mfa\/setup|\/api\/auth\/mfa\/verify|img-mfa-qr/);
  assert.doesNotMatch(reviewerLogin, /\/api\/reviewer-login|input-password|button-login-submit/);
  assert.doesNotMatch(reviewerRoutes, /ReviewerPass1!|hashPassword|upsertUser/);
  assert.doesNotMatch(deleteAccount, /href="\/login"/);
  assert.doesNotMatch(authErrorPage, /href: "\/login"|link-back-to-login/);
  assert.doesNotMatch(landing, /href="#pricing"|href="\/pricing"|MFA \+ bcrypt/);
  assert.doesNotMatch(sitemap, /\/pricing|\/login/);

  assert.match(operatorosHelper, /getOperatorOsLoginUrl/);
  assert.match(operatorosHelper, /getOperatorOsBillingUrl/);
  assert.match(authRoutes, /sendOperatorOsManagedAuth/);
  assert.match(authRoutes, /\/api\/auth\/change-password/);
  assert.match(authRoutes, /\/api\/auth\/mfa\/setup/);
  assert.match(authRoutes, /410/);
  assert.match(reviewerRoutes, /\/api\/reviewer-login/);
  assert.match(reviewerRoutes, /managed_by_operatoros/);
  assert.match(reviewerRoutes, /status\(410\)/);
  assert.match(billingRoutes, /managedBy: "operatoros"/);
  assert.match(billingRoutes, /\/api\/billing\/checkout-session/);
  assert.match(billingRoutes, /\/api\/billing\/customer-portal/);
  assert.match(billingRoutes, /status\(410\)/);
  assert.doesNotMatch(`${operatorosHelper}\n${billingRoutes}\n${adminRoutes}`, /operatoros\.app/);
});

test('TechDeck Phase 9 docs cover import notes, auth mapping, risks, and smoke checks', () => {
  const importNotes = readRepoFile('docs/techdeck-import-notes.md');
  const authMapping = readRepoFile('docs/techdeck-auth-mapping.md');
  const risks = readRepoFile('docs/techdeck-risk-register.md');

  for (const needle of [
    'apps/modules/techdeck/source',
    '/modules/techdeck',
    'techdeck.operatoros.net',
    'Standalone TechDeck login/register/billing routes are not called',
  ]) {
    assert.ok(importNotes.includes(needle), `missing import note: ${needle}`);
  }

  for (const needle of [
    'OperatorOS owns login',
    'TechDeck `OWNER` is intentionally not granted',
    '/api/auth/login',
    '/api/billing/checkout-session',
  ]) {
    assert.ok(authMapping.includes(needle), `missing auth mapping note: ${needle}`);
  }

  for (const needle of [
    'Local Tenant Model Is Separate',
    'Standalone Auth Still Exists',
    'Manual QA Checklist',
    'Missing entitlement is blocked',
  ]) {
    assert.ok(risks.includes(needle), `missing risk note: ${needle}`);
  }
});

test('TechDeck Phase 10 docs cover SSO conversion and manual QA', () => {
  const conversion = readRepoFile('docs/techdeck-sso-conversion.md');
  const manualQa = readRepoFile('docs/techdeck-manual-qa.md');

  for (const needle of [
    '410 managed_by_operatoros',
    'TECHDECK_ENABLE_LOCAL_AUTH=true',
    'The imported TechDeck `/login` and `/register` pages no longer submit credentials',
    'The imported reviewer login page',
    'The imported TechDeck `/pricing` page now redirects to OperatorOS billing',
    'hasPlatformAdminAuthority',
  ]) {
    assert.ok(conversion.includes(needle), `missing conversion note: ${needle}`);
  }

  for (const needle of [
    'Launch from Command Center',
    'Direct visit while logged out',
    'Direct visit without TechDeck entitlement',
    'Root platform super-admin access',
    'TechDeck `/login` redirects to OperatorOS login',
    'TechDeck `/pricing` redirects to OperatorOS billing',
    'Major Feature Routes',
  ]) {
    assert.ok(manualQa.includes(needle), `missing manual QA note: ${needle}`);
  }
});

test('TechDeck shell polish covers header, completed navigation, states, and demo docs', () => {
  const appSlugPage = readRepoFile('apps/web/src/app/apps/[slug]/page.tsx');
  const shell = readRepoFile('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const polishNotes = readRepoFile('docs/techdeck-polish-notes.md');
  const demoScript = readRepoFile('docs/techdeck-demo-script.md');

  for (const needle of [
    'TenantProvider',
    '<TenantProvider>',
  ]) {
    assert.ok(appSlugPage.includes(needle), `missing route wrapper polish: ${needle}`);
  }

  for (const needle of [
    'techdeck-module-header',
    'techdeck-tenant-badge',
    'techdeck-role-badge',
    'techdeck-return-command-center',
    'techdeck-module-sidebar',
    'techdeck-loading-state',
    'techdeck-empty-state',
    'techdeck-error-state',
    'techdeck-settings-panel',
    'techdeck-module-settings-link',
    'hasPlatformAdminAuthority',
    '@media (max-width: 920px)',
    '@media (max-width: 620px)',
  ]) {
    assert.ok(shell.includes(needle), `missing shell polish: ${needle}`);
  }

  for (const needle of [
    'Tickets',
    'Inventory',
    'Network / IPAM',
    'Lifecycle',
    'Documentation',
    'Runbooks',
    'Evidence',
    'Reports',
    'Time',
    'Clients',
  ]) {
    assert.ok(shell.includes(needle), `missing workflow shortcut: ${needle}`);
  }

  for (const needle of [
    'Phase 11 Scope',
    'Admin/User Separation',
    'Demo Readiness Checklist',
    'Workflow shortcuts are shell-section shortcuts',
  ]) {
    assert.ok(polishNotes.includes(needle), `missing polish note: ${needle}`);
  }

  for (const needle of [
    'TechDeck Demo Script',
    'Manual QA Matrix',
    'Root platform admin',
    'Normal user',
    'Mobile viewport',
  ]) {
    assert.ok(demoScript.includes(needle), `missing demo script note: ${needle}`);
  }
});
