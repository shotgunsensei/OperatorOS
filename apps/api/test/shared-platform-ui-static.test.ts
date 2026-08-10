import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

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
