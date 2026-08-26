import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createPulseDeskAdapterContext,
  mapOperatorOSTenantRoleToPulseDeskRole,
} from '../../../apps/modules/pulsedesk/adapter.ts';
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

test('PulseDesk source snapshot is staged under apps/modules/pulsedesk without runtime artifacts', () => {
  for (const path of [
    'apps/modules/pulsedesk/source/package.json',
    'apps/modules/pulsedesk/source/client/src/App.tsx',
    'apps/modules/pulsedesk/source/client/src/lib/auth.tsx',
    'apps/modules/pulsedesk/source/server/routes/index.ts',
    'apps/modules/pulsedesk/source/server/routes/auth.ts',
    'apps/modules/pulsedesk/source/server/routes/sso.ts',
    'apps/modules/pulsedesk/source/server/routes/billing.ts',
    'apps/modules/pulsedesk/source/server/middleware.ts',
    'apps/modules/pulsedesk/source/server/auth/operatoros-sso.ts',
    'apps/modules/pulsedesk/source/server/services/operatorosEntitlements.ts',
    'apps/modules/pulsedesk/source/shared/schema.ts',
    'apps/modules/pulsedesk/source/shared/roles.ts',
    'apps/modules/pulsedesk/source/docs/pulsedesk-operatoros-deployment.md',
    'apps/modules/pulsedesk/source/docs/stripe-setup.md',
  ]) {
    assert.ok(existsSync(repoPath(path)), `${path} should exist`);
  }

  for (const excluded of [
    'apps/modules/pulsedesk/source/.git',
    'apps/modules/pulsedesk/source/.agents',
    'apps/modules/pulsedesk/source/.codex',
    'apps/modules/pulsedesk/source/node_modules',
    'apps/modules/pulsedesk/source/dist',
    'apps/modules/pulsedesk/source/data',
    'apps/modules/pulsedesk/source/package-lock.json',
  ]) {
    assert.equal(existsSync(repoPath(excluded)), false, `${excluded} should not be imported`);
  }
});

test('PulseDesk source audit identifies auth, SSO, billing, tenants, APIs, and data models', () => {
  const pkg = JSON.parse(readRepoFile('apps/modules/pulsedesk/source/package.json'));
  const app = readRepoFile('apps/modules/pulsedesk/source/client/src/App.tsx');
  const routeIndex = readRepoFile('apps/modules/pulsedesk/source/server/routes/index.ts');
  const middleware = readRepoFile('apps/modules/pulsedesk/source/server/middleware.ts');
  const sso = readRepoFile('apps/modules/pulsedesk/source/server/routes/sso.ts');
  const auth = readRepoFile('apps/modules/pulsedesk/source/server/routes/auth.ts');
  const billing = readRepoFile('apps/modules/pulsedesk/source/server/routes/billing.ts');
  const billingDoc = readRepoFile('apps/modules/pulsedesk/source/docs/stripe-setup.md');
  const schema = readRepoFile('apps/modules/pulsedesk/source/shared/schema.ts');
  const roles = readRepoFile('apps/modules/pulsedesk/source/shared/roles.ts');
  const masterAdmin = readRepoFile('apps/modules/pulsedesk/source/server/config/masterAdmin.ts');

  assert.ok(pkg.dependencies.express);
  assert.ok(pkg.dependencies['drizzle-orm']);
  assert.ok(pkg.dependencies.stripe);
  assert.ok(pkg.dependencies['stripe-replit-sync']);

  for (const route of [
    'path="/dashboard"',
    'path="/tickets"',
    'path="/departments"',
    'path="/assets"',
    'path="/supply-requests"',
    'path="/facility-requests"',
    'path="/vendors"',
    'path="/analytics"',
    'path="/admin"',
  ]) {
    assert.ok(app.includes(route), `missing client route ${route}`);
  }

  for (const routerName of [
    'authRouter',
    'ticketsRouter',
    'departmentsRouter',
    'assetsRouter',
    'supplyRequestsRouter',
    'facilityRequestsRouter',
    'vendorsRouter',
    'analyticsRouter',
    'adminRouter',
    'ssoRouter',
    'healthRouter',
  ]) {
    assert.ok(routeIndex.includes(routerName), `missing server route ${routerName}`);
  }

  for (const guard of [
    'requireAuth',
    'requireOrg',
    'requireMinRole',
    'requireOperatorOsModuleAccess',
    'requireOperatorOsModuleRole',
  ]) {
    assert.ok(middleware.includes(guard), `missing middleware guard ${guard}`);
  }

  assert.match(sso, /operatoros_sso_success/);
  assert.match(sso, /req\.session\.authSource = "operatoros"/);
  assert.match(sso, /cacheOperatorOsEntitlementSnapshot/);
  assert.match(auth, /function isLocalAuthEnabled\(\): boolean \{\s+return false;/);
  assert.match(auth, /managed_by_operatoros/);
  assert.match(auth, /m365_login_rejected/);
  assert.match(auth, /\/api\/auth\/login/);
  assert.match(auth, /\/api\/auth\/register/);
  assert.doesNotMatch(auth, /PULSEDESK_LOCAL_AUTH_ENABLED/);
  assert.match(billing, /\/api\/billing\/checkout/);
  assert.match(billing, /managed_by_operatoros/);
  assert.match(billing, /plan: "operatoros"/);
  assert.doesNotMatch(billing, /stripe\.checkout\.sessions\.create/);
  assert.doesNotMatch(billing, /stripe\.billingPortal\.sessions\.create/);
  assert.doesNotMatch(billing, /getUncachableStripeClient/);
  assert.match(billingDoc, /PulseDesk is no longer deployed with local Stripe billing/);
  assert.match(schema, /export const orgs = pgTable\("orgs"/);
  assert.match(schema, /export const memberships = pgTable\("memberships"/);
  assert.match(schema, /export const operatorOsEntitlementSnapshots = pgTable/);
  assert.match(roles, /owner/);
  assert.match(roles, /readonly/);
  assert.match(masterAdmin, /john@shotgunninjas\.com/);
});

test('PulseDesk adapter receives OperatorOS context and does not grant local owner authority', () => {
  assert.equal(mapOperatorOSTenantRoleToPulseDeskRole('owner', false), 'admin');
  assert.equal(mapOperatorOSTenantRoleToPulseDeskRole('admin', false), 'admin');
  assert.equal(mapOperatorOSTenantRoleToPulseDeskRole('supervisor', false), 'supervisor');
  assert.equal(mapOperatorOSTenantRoleToPulseDeskRole('technician', false), 'technician');
  assert.equal(mapOperatorOSTenantRoleToPulseDeskRole('readonly', false), 'readonly');
  assert.equal(mapOperatorOSTenantRoleToPulseDeskRole('member', false), 'staff');
  assert.equal(mapOperatorOSTenantRoleToPulseDeskRole(null, true), 'admin');

  const ctx = createPulseDeskAdapterContext({
    currentUser: {
      id: 'user-1',
      email: 'john@shotgunninjas.com',
      platformRole: 'super_admin',
    },
    tenantId: 'tenant-1',
    role: 'owner',
    entitlements: { modules: [{ slug: 'pulsedesk', enabled: true }] },
    platformAdmin: true,
  });

  assert.equal(ctx.moduleId, 'pulsedesk');
  assert.equal(ctx.tenantId, 'tenant-1');
  assert.equal(ctx.platformAdmin, true);
  assert.equal(ctx.entitled, true);
  assert.equal(ctx.localRole, 'admin');
  assert.equal(ctx.standaloneLoginMode, 'operatoros_managed');
  assert.notEqual(ctx.localRole, 'owner');
  assert.equal(ctx.hostnames.production, 'pulsedesk.operatoros.net');
  assert.equal(ctx.localFallbackPath, '/modules/pulsedesk');
  assert.ok(ctx.coreRoutes.some(route => route.id === 'tickets'));
});

test('OperatorOS module route shell wires PulseDesk host/local fallback to the adapter shell', () => {
  const appSlugPage = readRepoFile('apps/web/src/app/apps/[slug]/page.tsx');
  const moduleFallback = readRepoFile('apps/web/src/app/modules/[slug]/page.tsx');
  const shell = readRepoFile('apps/web/src/components/module-shells/PulseDeskShell.tsx');
  assert.match(appSlugPage, /PulseDeskShell/);
  assert.match(appSlugPage, /'pulsedesk':\s*PulseDeskShell/);
  assert.match(appSlugPage, /TenantProvider/);
  assert.match(moduleFallback, /const \{ slug \} = await params/);
  assert.match(moduleFallback, /return <ModuleHost slug=\{slug\} requestedHost=\{query\?\.host\} \/>/);
  assert.match(shell, /createPulseDeskAdapterContext/);
  assert.match(shell, /hasPlatformAdminAuthority/);
  assert.match(shell, /app\/platform\/modules\/pulsedesk/);
  assert.match(shell, /testId="pulsedesk-module-shell"/);
  assert.match(shell, /pageHeaderTestId="pulsedesk-module-header"/);
  assert.match(shell, /pulsedesk-return-command-center/);
  assert.match(shell, /state=\{isLoading \? 'loading' : !hasTenantContext \? 'empty' : restrictedProviderRoute \? 'forbidden' : 'ready'\}/);
  assert.match(shell, /stateMessage=\{!hasTenantContext/);
  assert.match(shell, /mobileNavigation="drawer"/);
  assert.equal(getModuleById('pulsedesk')?.hostname, 'pulsedesk.operatoros.net');
  assert.equal(getModuleByHost('https://pulsedesk.operatoros.net/sso?code=probe')?.id, 'pulsedesk');
});

test('PulseDesk Phase 13 docs cover import notes, auth mapping, risks, and smoke checks', () => {
  const readme = readRepoFile('apps/modules/pulsedesk/README.md');
  const moduleReadme = readRepoFile('apps/modules/README.md');
  const importNotes = readRepoFile('docs/pulsedesk-import-notes.md');
  const authMapping = readRepoFile('docs/pulsedesk-auth-mapping.md');
  const risks = readRepoFile('docs/pulsedesk-risk-register.md');
  const ssoConversion = readRepoFile('docs/pulsedesk-sso-conversion.md');
  const polishNotes = readRepoFile('docs/pulsedesk-polish-notes.md');
  const manualQa = readRepoFile('docs/pulsedesk-manual-qa.md');
  const demoScript = readRepoFile('docs/pulsedesk-demo-script.md');

  for (const needle of [
    'apps/modules/pulsedesk/source',
    '/modules/pulsedesk',
    'pulsedesk.operatoros.net',
    '`/login` shows OperatorOS launch/relaunch UI instead of credentials',
    '`/api/billing/checkout` returns managed-by-OperatorOS behavior if mounted',
  ]) {
    assert.ok(importNotes.includes(needle), `missing import note: ${needle}`);
  }

  for (const needle of [
    'OperatorOS owns',
    'PulseDesk must not become a second source of truth',
    'PulseDesk `owner` exists in the imported source',
    '/api/auth/login',
    '/api/billing/checkout',
    'managed_by_operatoros',
  ]) {
    assert.ok(authMapping.includes(needle), `missing auth mapping note: ${needle}`);
  }

  for (const needle of [
    'Residual Local Auth Compatibility Code',
    'Residual Stripe Files Still Imported',
    'Module-Local Master Admin Defaults',
    'Separate Org Model',
    'Manual QA Checklist',
    'Missing entitlement is blocked',
  ]) {
    assert.ok(risks.includes(needle), `missing risk note: ${needle}`);
  }

  for (const [name, text, needles] of [
    ['ssoConversion', ssoConversion, ['Disabled Local Auth Paths', 'Billing Cleanup', 'Server-Side Enforcement']],
    ['polishNotes', polishNotes, ['OperatorOS Shell', 'Imported PulseDesk App', 'Demo Readiness Checklist']],
    ['manualQa', manualQa, ['Launch from Command Center', 'Removed pricing', 'Removed duplicate login']],
    ['demoScript', demoScript, ['PulseDesk Demo Script', 'Negative Checks', 'Local PulseDesk login/register and checkout should not be available']],
  ] as const) {
    for (const needle of needles) {
      assert.ok(text.includes(needle), `${name} missing ${needle}`);
    }
  }

  assert.match(readme, /Phase 13 Status/);
  assert.match(moduleReadme, /pulsedesk` - active shared-runtime shell plus imported source snapshot/);
});

test('PulseDesk Phase 13 removes duplicate local login and checkout ownership from active surfaces', () => {
  const authPage = readRepoFile('apps/modules/pulsedesk/source/client/src/pages/auth-page.tsx');
  const authClient = readRepoFile('apps/modules/pulsedesk/source/client/src/lib/auth.tsx');
  const landing = readRepoFile('apps/modules/pulsedesk/source/client/src/pages/landing.tsx');
  const sidebar = readRepoFile('apps/modules/pulsedesk/source/client/src/components/app-sidebar.tsx');
  const settings = readRepoFile('apps/modules/pulsedesk/source/client/src/pages/settings.tsx');
  const middleware = readRepoFile('apps/modules/pulsedesk/source/server/middleware.ts');
  const auth = readRepoFile('apps/modules/pulsedesk/source/server/routes/auth.ts');
  const billing = readRepoFile('apps/modules/pulsedesk/source/server/routes/billing.ts');
  const email = readRepoFile('apps/modules/pulsedesk/source/server/routes/email.ts');
  const shell = readRepoFile('apps/web/src/components/module-shells/PulseDeskShell.tsx');

  for (const needle of [
    'card-operatoros-managed-auth',
    'button-launch-operatoros',
    'pulsedesk-sso-error',
    'pulsedesk-relaunch-prompt',
  ]) {
    assert.ok(authPage.includes(needle), `auth page missing ${needle}`);
  }

  for (const removedNeedle of [
    'input-login-password',
    'input-register-password',
    'button-register',
    'tab-register',
    'button-m365-login',
    'Local Sign In',
    'Reviewer Setup',
  ]) {
    assert.equal(authPage.includes(removedNeedle), false, `auth page still exposes ${removedNeedle}`);
  }

  assert.doesNotMatch(authClient, /fetch\("\/api\/auth\/login"/);
  assert.doesNotMatch(authClient, /fetch\("\/api\/auth\/register"/);
  assert.match(authClient, /OperatorOS SSO/);
  assert.match(authClient, /registration is managed by OperatorOS/);

  assert.doesNotMatch(landing, /href="\/login"/);
  assert.match(landing, /https:\/\/app\.operatoros\.net\/app\/apps\/pulsedesk/);
  assert.match(landing, /Launch from OperatorOS/);

  assert.match(sidebar, /link-return-operatoros/);
  assert.match(sidebar, /OperatorOS Module/);

  assert.match(settings, /operatoros-managed-profile-security/);
  assert.match(settings, /operatoros-managed-auth-settings/);
  assert.match(settings, /button-open-operatoros-account/);
  assert.match(settings, /button-open-operatoros-sso/);
  assert.match(settings, /<OperatorOsAuthenticationSettings \/>/);
  assert.doesNotMatch(settings, /<AuthenticationSettings \/>/);
  assert.doesNotMatch(settings, /apiRequest\("POST", "\/api\/auth\/change-password"/);

  assert.match(middleware, /OPERATOROS_SSO_REQUIRED/);
  assert.match(middleware, /requireOperatorOsSession/);
  assert.match(middleware, /if \(!isSnapshotActive\(snapshot\)\)/);
  assert.match(middleware, /user\?\.isSuperAdmin/);
  assert.doesNotMatch(middleware, /PULSEDESK_LOCAL_AUTH_ENABLED/);

  assert.match(auth, /managed_by_operatoros/);
  assert.match(auth, /getOperatorOsLaunchUrl/);
  assert.match(auth, /change_password/);
  assert.match(auth, /delete_account/);
  assert.match(auth, /m365_login_rejected/);
  assert.doesNotMatch(auth, /PULSEDESK_LOCAL_AUTH_ENABLED/);

  assert.match(billing, /managed_by_operatoros/);
  assert.match(billing, /getOperatorOsBillingUrl/);
  assert.match(billing, /plan: "operatoros"/);
  assert.match(billing, /syncOrgPlanFromStripe/);
  assert.doesNotMatch(billing, /stripe\.checkout\.sessions\.create/);
  assert.doesNotMatch(billing, /stripe\.billingPortal\.sessions\.create/);
  assert.doesNotMatch(billing, /getUncachableStripeClient/);
  assert.doesNotMatch(billing, /getStripePublishableKey/);
  assert.doesNotMatch(email, /PULSEDESK_LOCAL_AUTH_ENABLED/);
  assert.match(email, /const eligible = snapshotAllowsFeature\(snapshot, "emailToTicket"\);/);

  assert.match(shell, /Identity and access.*OperatorOS manages sign-in/);
  assert.doesNotMatch(shell, /Standalone login|shared runtime|module entitlement state/i);
});
