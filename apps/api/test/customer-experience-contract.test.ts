import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('shared experience system preserves zoom, focus, reduced motion, and skip navigation', () => {
  const layout = read('apps/web/src/app/layout.tsx');
  const styles = read('apps/web/src/app/globals.css');
  const shell = read('apps/web/src/components/SaasLayout.tsx');

  assert.match(layout, /import '\.\/globals\.css'/);
  assert.doesNotMatch(layout, /maximumScale|userScalable/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /\.ops-skip-link/);
  assert.match(shell, /href="#workspace-main"/);
  assert.match(shell, /id="workspace-main"/);
  assert.match(shell, /aria-current=\{isActive \? 'page'/);
  assert.match(shell, /aria-label="Switch OperatorOS tool"/);
});

test('workspace navigation and home use plain customer language', () => {
  const nav = read('apps/web/src/lib/sidebar-nav.ts');
  const home = read('apps/web/src/components/pages/MyAppsPage.tsx');
  const appRoute = read('apps/web/src/app/app/page.tsx');

  for (const label of [
    'Workspace',
    'Home',
    'Browse tools',
    'Organization',
    'Team members',
    'Tool access',
    'Profile and security',
    'Help and support',
  ]) assert.ok(nav.includes(label), label);

  assert.match(home, /Choose what you want to work on/);
  assert.match(home, /Your tools/);
  assert.match(home, /Open \$\{card\.name\}/);
  assert.doesNotMatch(home, /Parent command layer/);
  assert.match(appRoute, /<MyAppsPage onNavigate=\{handleNavigate\}/);
  assert.match(appRoute, /<AppsPage onNavigate=\{handleNavigate\}/);
  assert.match(appRoute, /<TenantCommandCenterPage onNavigate=\{handleNavigate\}/);
  assert.match(appRoute, /url\.searchParams\.set\('page', page\)/);
  assert.match(appRoute, /window\.history\.pushState/);
  assert.match(appRoute, /window\.addEventListener\('popstate', restoreRoute\)/);
  assert.doesNotMatch(appRoute, /<MyAppsPage onNavigate=\{setActivePage\}/);
});

test('account forms have programmatic labels and recoverable error messages', () => {
  const settings = read('apps/web/src/components/pages/SettingsPage.tsx');

  for (const id of [
    'settings-current-email',
    'settings-name',
    'settings-current-password',
    'settings-new-password',
    'settings-new-email',
    'settings-email-password',
    'settings-delete-confirm',
    'settings-delete-password',
  ]) {
    assert.match(settings, new RegExp(`htmlFor="${id}"`), `${id} label`);
    assert.match(settings, new RegExp(`id="${id}"`), `${id} input`);
  }

  assert.match(settings, /Your account is unchanged/);
  assert.match(settings, /Your current email is unchanged/);
  assert.match(settings, /Permanently delete my account/);
  assert.doesNotMatch(settings, /err\.error/);
});

test('catalog and billing surfaces provide specific actions and safe recovery', () => {
  const catalog = read('apps/web/src/components/pages/AppsPage.tsx');
  const billing = read('apps/web/src/components/pages/BillingPage.tsx');

  assert.match(catalog, /htmlFor="marketplace-search"/);
  assert.match(catalog, /type="search"/);
  assert.match(catalog, /aria-pressed=\{isActive\}/);
  assert.match(catalog, /Clear all filters/);
  assert.match(catalog, /Browse tools/);
  assert.match(catalog, /No tools match your filters/);
  assert.match(catalog, /Open \$\{m\.name\}/);
  assert.doesNotMatch(catalog, /STRIPE_PRICE_/);

  assert.match(billing, /Organization billing/);
  assert.match(billing, /Billing details could not be loaded/);
  assert.match(billing, /Application Stack is the forward offer/);
  assert.match(billing, /Manage payment method, invoices, or cancellation/);
  assert.match(billing, /No billing activity yet/);
  assert.doesNotMatch(billing, /billingApi\.subscribe\s*\(/);
  assert.doesNotMatch(billing, /billingApi\.(?:cancel|reactivate)\s*\(/);
  assert.doesNotMatch(billing, />Downgrade Warning</);
  assert.doesNotMatch(billing, />Are you sure\?</);
});

test('every module receives organization context and customer-facing account navigation', () => {
  const header = read('apps/web/src/components/module-shells/OperatorOSEcosystemHeader.tsx');

  assert.match(header, /Organization:/);
  assert.match(header, /Signed in as/);
  assert.match(header, /Profile and security/);
  assert.match(header, /Billing and plans/);
  assert.match(header, /Help and support/);
  assert.match(header, /Sign out/);
});

test('six representative customer workflows expose a plain first action and trust boundary', () => {
  const home = read('apps/web/src/components/pages/MyAppsPage.tsx');
  const tradeFlowKit = read('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');
  const tradeFlowKitStyles = read('apps/web/src/components/module-shells/TradeFlowKitShell.module.css');
  const tradeFlowKitRevenue = read('apps/web/src/components/module-shells/TradeFlowKitRevenueFlow.tsx');
  const torqueShed = read('apps/web/src/components/module-shells/TorqueShedWorkspace.tsx');
  const pulseDesk = read('apps/web/src/components/module-shells/PulseDeskShell.tsx');
  const pulseDeskContract = read('apps/web/src/components/module-shells/PulseDeskRoute.contract.ts');
  const techDeck = read('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const catalog = read('apps/web/src/components/pages/AppsPage.tsx');
  const billing = read('apps/web/src/components/pages/BillingPage.tsx');

  assert.match(home, /Finish organization setup/);
  assert.match(home, /button-finish-organization-setup/);
  assert.match(home, /tenantApi\.ensurePersonal/);
  assert.doesNotMatch(home, /Get organization setup help|operatoros\.net\/john/);

  assert.match(tradeFlowKit, /Start with a lead/);
  assert.match(tradeFlowKit, /Protected by OperatorOS/);
  assert.match(tradeFlowKitStyles, /\.shell\[data-theme='dark'\][\s\S]*color-scheme:\s*dark/);
  assert.match(tradeFlowKitStyles, /@media \(prefers-color-scheme: dark\)/);
  assert.match(tradeFlowKitRevenue, /panel: 'var\(--tfk-panel\)'/);
  assert.doesNotMatch(tradeFlowKitStyles, /#f6fbf8/);
  assert.match(torqueShed, /Start diagnostic/);
  assert.match(torqueShed, /maintenance costs, files, or private diagnostic notes/);
  assert.match(pulseDesk, /Open request queue/);
  assert.match(pulseDesk, /Do not store patient charts, clinical records/);
  assert.match(pulseDeskContract, /background: '#07111b'/);
  assert.match(pulseDeskContract, /colorScheme: 'dark'/);
  assert.doesNotMatch(pulseDeskContract, /background: '#f5f9fc'/);
  assert.match(techDeck, /Open ticket queue/);
  assert.match(techDeck, /OperatorOS manages sign-in, subscription access, roles, and workspace membership/);

  assert.match(catalog, /How to get access/);
  assert.match(catalog, /Configure Application Stack/);
  assert.match(billing, /Only the organization owner can make billing changes/);
  assert.match(billing, /nothing can be charged|Nothing changed|unchanged/i);
});

test('customer surfaces do not expose provider or migration implementation language', () => {
  const files = [
    'apps/web/src/components/module-shells/TradeFlowKitShell.tsx',
    'apps/web/src/components/module-shells/PulseDeskShell.tsx',
    'apps/web/src/components/module-shells/TechDeckShell.tsx',
    'apps/web/src/components/module-shells/TorqueShedWorkspace.tsx',
    'apps/web/src/components/pages/AppsPage.tsx',
    'apps/web/src/components/pages/BillingPage.tsx',
  ];

  const combined = files.map(read).join('\n');
  for (const phrase of [
    'idempotent notification routing',
    'consolidation boundary',
    'test-only provider',
    'hashed-link',
    'STRIPE_PRICE_',
  ]) assert.ok(!combined.includes(phrase), phrase);
});

test('provider-disabled publish explanation fails closed without an unfinished HTTP status', () => {
  const api = read('apps/api/src/index.ts');
  const start = api.indexOf("'/v1/publish/explain'");
  const end = api.indexOf("app.get<{ Params: { workspaceId: string } }>", start);
  const route = api.slice(start, end);
  assert.match(route, /status\(503\)/);
  assert.match(route, /AI_PROVIDER_DISABLED/);
  assert.doesNotMatch(route, /status\(501\)|not configured' \}\)/);
});
