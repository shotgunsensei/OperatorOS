import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function sourceFiles(path: string): string[] {
  const absolute = resolve(root, path);
  return readdirSync(absolute, { withFileTypes: true }).flatMap(entry => {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) return sourceFiles(join(path, entry.name));
    return /\.(?:css|ts|tsx)$/u.test(entry.name) ? [child] : [];
  });
}

function layerValue(css: string, className: string): number {
  const match = css.match(new RegExp(`\\.${className}\\s*\\{[^}]*z-index\\s*:\\s*(\\d+)`, 'su'));
  assert.ok(match, `Expected ${className} to own an explicit z-index`);
  return Number(match[1]);
}

test('P22-UI-001: tenant-admin Shared Services surface exposes real controls without placeholders', () => {
  const page = read('apps/web/src/components/pages/SharedServicesAdminPage.tsx');
  const auth = read('apps/web/src/lib/auth.ts');
  const app = read('apps/web/src/app/app/page.tsx');
  const nav = read('apps/web/src/lib/sidebar-nav.ts');
  for (const testId of [
    'provider-setup', 'webhook-management', 'api-token-management',
    'export-management', 'shared-service-operations', 'shared-team-access-links',
  ]) assert.match(page, new RegExp(`data-testid="${testId}"`));
  for (const operation of [
    'overview', 'operations', 'saveProvider', 'createWebhookEndpoint',
    'retryDeadLetter', 'createServiceIdentity', 'revokeApiToken',
    'requestExport', 'createDownloadGrant',
  ]) assert.match(auth, new RegExp(`${operation}:`));
  assert.match(app, /case 'tenant-shared-services'/);
  assert.match(nav, /id: 'tenant-shared-services'/);
  assert.doesNotMatch(page, /coming soon|not implemented|placeholder action|TODO-only/i);
});

test('P22-UI-NEGATIVE-001: ordinary users are routed to an explicit authorization denial', () => {
  const app = read('apps/web/src/app/app/page.tsx');
  assert.match(app, /Only organization owners or admins can manage shared services/);
  assert.match(app, /userIsTenantAdmin\s*\?\s*<SharedServicesAdminPage/);
});

test('P53-UI-003: messenger portals its modal tier above every consolidated module layer', () => {
  const messenger = read('apps/web/src/components/TenantMessenger.tsx');
  const messengerCss = read('apps/web/src/components/TenantMessenger.module.css');
  const moduleFiles = [
    ...sourceFiles('apps/web/src/components/module-shells'),
    ...sourceFiles('apps/web/src/components/module-application-shell'),
  ];
  const moduleLayerValues = moduleFiles.flatMap(path => {
    const source = readFileSync(path, 'utf8');
    return [...source.matchAll(/(?:z-index\s*:\s*|zIndex\s*:\s*)([^;,\n}]+)/giu)]
      .map(match => {
        const value = match[1].trim();
        assert.match(value, /^-?\d+$/u, `Module layer must be a statically auditable number in ${path}`);
        return Number(value);
      });
  });
  const highestModuleLayer = Math.max(0, ...moduleLayerValues);
  const backdropLayer = layerValue(messengerCss, 'backdrop');
  const panelLayer = layerValue(messengerCss, 'panel');
  const toastLayer = layerValue(messengerCss, 'toast');

  assert.match(messenger, /import \{ createPortal \} from 'react-dom'/u);
  assert.match(messenger, /createPortal\([\s\S]*document\.body/u);
  assert.match(messenger, /data-testid="tenant-messenger-backdrop"/u);
  assert.ok(backdropLayer > highestModuleLayer, `Messenger backdrop ${backdropLayer} must exceed module maximum ${highestModuleLayer}`);
  assert.ok(panelLayer > backdropLayer, 'Messenger panel must render above its backdrop');
  assert.ok(toastLayer > panelLayer, 'Messenger notifications must render above the open panel');
});
