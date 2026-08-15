import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('Phase 47 shell keeps command routes addressable and preserves global escape links', () => {
  const shell = read('apps/web/src/components/platform/PlatformCommandShell.tsx');
  const route = read('apps/web/src/app/platform/[[...slug]]/page.tsx');
  const routes = read('apps/web/src/lib/platform-routes.ts');

  for (const label of [
    'Overview', 'Tenants', 'Users', 'Modules', 'Billing Events',
    'Pricing', 'Credit Catalog', 'Health', 'Audit', 'SSO',
  ]) {
    assert.match(shell, new RegExp(`label: '${label}'`));
  }
  assert.match(shell, /data-testid="platform-my-apps"/);
  assert.match(shell, />OperatorOS Home</);
  assert.match(shell, />Profile and security</);
  assert.match(shell, />Help and support</);
  assert.match(shell, /data-testid="platform-global-logout"/);
  assert.doesNotMatch(shell, /target=["']_blank/);

  assert.match(route, /const view: PlatformView = pathToPlatformView\(slug\)/);
  assert.doesNotMatch(route, /useState<PlatformView>/);
  assert.match(route, /router\.push\(platformViewToPath\(nextView\)\)/);
  assert.match(route, /accessState="denied"/);
  assert.match(route, /showNavigation=\{false\}/);

  for (const path of [
    '/tenants', '/modules', '/users', '/billing', '/pricing',
    '/credit-catalog', '/health', '/audit', '/sso',
  ]) {
    assert.match(routes, new RegExp(path.replace('/', '\\/')));
  }
});

test('Phase 47 shell exposes an accessible responsive drawer and safe runtime identity only', () => {
  const shell = read('apps/web/src/components/platform/PlatformCommandShell.tsx');
  const css = read('apps/web/src/components/platform/PlatformCommandShell.module.css');

  assert.match(shell, /aria-label="Breadcrumb"/);
  assert.match(shell, /aria-current=\{active \? 'page'/);
  assert.match(shell, /aria-expanded=\{drawerOpen\}/);
  assert.match(shell, /aria-controls="platform-command-navigation"/);
  assert.match(shell, /Skip to command content/);
  assert.match(shell, /fetch\('\/api\/health'/);
  assert.match(shell, /release\.commit\.slice\(0, 7\)/);
  assert.doesNotMatch(shell, /lockfileSha256|SESSION_SECRET|SSO_CODE_ENCRYPTION_SECRET/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /prefers-reduced-motion/);
});
