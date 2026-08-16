import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { Activity } from 'lucide-react';
import {
  canAccessModuleRoute,
  findActiveModuleRoute,
  isModuleRouteActive,
  moduleThemeStyle,
  normalizeModulePath,
  type ModuleRouteManifestGroup,
  type ModuleThemeTokens,
} from '../../web/src/components/module-application-shell/contracts.js';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const routes: readonly ModuleRouteManifestGroup<'read' | 'manage', 'member' | 'admin'>[] = [{
  id: 'main', label: 'Main', items: [
    { id: 'home', canonicalPath: '/module/home', label: 'Home', icon: Activity, activeMatch: { kind: 'exact' }, requiredCapability: 'read' },
    { id: 'records', canonicalPath: '/module/records', label: 'Records', icon: Activity, activeMatch: { kind: 'prefix' }, requiredCapability: 'read' },
    { id: 'admin', canonicalPath: '/module/admin', label: 'Admin', icon: Activity, activeMatch: { kind: 'paths', paths: ['/module/admin', '/module/settings'] }, requiredCapability: 'manage', requiredRoles: ['admin'] },
  ],
}];

test('route manifest matching is canonical, detail-aware, and access-aware', () => {
  assert.equal(normalizeModulePath('/module/records/?page=2#top'), '/module/records');
  assert.equal(isModuleRouteActive(routes[0].items[0], '/module/home/detail'), false);
  assert.equal(isModuleRouteActive(routes[0].items[1], '/module/records/record-1'), true);
  assert.equal(findActiveModuleRoute(routes, '/module/settings/profile')?.id, 'admin');
  assert.equal(canAccessModuleRoute(routes[0].items[2], { capabilities: new Set(['read']), roles: new Set(['member']) }), false);
  assert.equal(canAccessModuleRoute(routes[0].items[2], { capabilities: new Set(['read', 'manage']), roles: new Set(['admin']) }), true);
});

test('theme tokens stay instance-scoped and retain product-specific identity', () => {
  const theme = (id: string, primary: string): ModuleThemeTokens => ({
    id, colorScheme: 'dark',
    colors: { background: '#000', panel: '#111', panelRaised: '#222', text: '#fff', muted: '#aaa', border: '#333', primary, secondary: '#08f', accent: '#f80', danger: '#f00', success: '#0f0', focus: '#ff0' },
    radius: { small: '3px', medium: '7px', large: '13px' }, density: 'comfortable',
    typography: { body: 'system-ui', heading: 'serif' },
  });
  const orange = moduleThemeStyle(theme('orange-product', '#f97316')) as Record<string, string>;
  const cyan = moduleThemeStyle(theme('cyan-product', '#22d3ee')) as Record<string, string>;
  assert.equal(orange['--module-primary'], '#f97316');
  assert.equal(cyan['--module-primary'], '#22d3ee');
  assert.notEqual(orange['--module-primary'], cyan['--module-primary']);
});

test('shared shell owns structure and states while TradeFlowKit keeps business logic and branded CSS', () => {
  const shell = read('apps/web/src/components/module-application-shell/ModuleApplicationShell.tsx');
  const tradeFlow = read('apps/web/src/components/module-shells/TradeFlowKitShell.tsx');
  const contract = read('apps/web/src/components/module-shells/TradeFlowKitShell.contract.ts');
  const harness = read('apps/web/src/components/module-application-shell/__harness__/ModuleApplicationShellHarness.tsx');
  for (const state of ['loading', 'empty', 'error', 'forbidden', 'provider-disabled']) assert.match(shell, new RegExp(`'${state}'`));
  assert.match(shell, /ops-skip-link/);
  assert.match(shell, /aria-controls=\{`\$\{props\.moduleId\}-route-navigation`\}/);
  assert.match(shell, /findActiveModuleRoute/);
  assert.match(tradeFlow, /<ModuleApplicationShell<TradeFlowKitCapability, TradeFlowKitRole>/);
  assert.match(tradeFlow, /TradeFlowKitScreen/);
  assert.match(contract, /id: 'tradeflowkit-orange-navy'/);
  assert.match(contract, /primary: 'hsl\(25 95% 36%\)'/);
  assert.match(harness, /id: 'phase48-ocean-harness'/);
  assert.match(harness, /primary: '#22d3ee'/);
  assert.doesNotMatch(harness, /TRADEFLOWKIT_THEME|#f97316/);
});
