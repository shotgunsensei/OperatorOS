import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

test('P53-UI-001: messenger follows users through every authenticated title-bar shell', () => {
  const consoleShell = read('apps/web/src/components/SaasLayout.tsx');
  const moduleHeader = read('apps/web/src/components/module-shells/OperatorOSEcosystemHeader.tsx');
  const platformShell = read('apps/web/src/components/platform/PlatformCommandShell.tsx');
  const platformRoute = read('apps/web/src/app/platform/[[...slug]]/page.tsx');

  assert.match(consoleShell, /<TenantMessenger \/>/);
  assert.match(moduleHeader, /<TenantMessenger \/>/);
  assert.match(platformShell, /accessState === 'authorized' && <TenantMessenger \/>/);
  assert.match(platformRoute, /<AuthProvider>[\s\S]*<TenantProvider>[\s\S]*<PlatformGate \/>/);
});

test('P53-UI-002: client exposes live, durable direct/group conversations and user-controlled alerts', () => {
  const component = read('apps/web/src/components/TenantMessenger.tsx');
  const client = read('apps/web/src/lib/messenger.ts');
  const styles = read('apps/web/src/components/TenantMessenger.module.css');

  for (const evidence of [
    'New conversation', 'Create group', 'Online', 'Offline', 'Reply', 'Edit',
    'Confirm delete', 'Remove from my history', 'Mute conversation', 'Rename group',
    'Load earlier messages', 'Enable',
  ]) assert.match(component, new RegExp(evidence));
  assert.match(component, /Notification\.requestPermission\(\)/);
  assert.match(component, /Notification\.permission === 'granted'/);
  assert.match(client, /\/ws\/v1\/tenants\/.*\/messenger\/socket/);
  assert.match(client, /credentials: 'include'/);
  assert.match(client, /cache: 'no-store'/);
  assert.doesNotMatch(client, /localStorage|sessionStorage|authorization|Bearer|document\.cookie/i);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /color-scheme: dark/);
});

test('P53-UI-003: messenger server guards remain tenant-derived and body authority fields are absent', () => {
  const routes = read('apps/api/src/routes/tenant-messenger-routes.ts');
  const service = read('apps/api/src/lib/tenant-messenger.ts');
  const auth = read('apps/api/src/lib/auth.ts');

  assert.match(routes, /resolveTenantContext\(request\)/);
  assert.match(routes, /FROM tenant_users[\s\S]*tenant_id=\$\{context\.tenantId\}[\s\S]*user_id=\$\{String\(user\.id\)\}/);
  assert.match(routes, /SESSION_TENANT_MISMATCH/);
  assert.match(routes, /websocket: true/);
  assert.match(routes, /private, no-store/);
  assert.match(service, /MESSENGER_IDEMPOTENCY_CONFLICT/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /tenant_messenger_presence_connections/);
  assert.match(auth, /tenantMessengerPath/);
  assert.doesNotMatch(routes, /body\.data\.(tenantId|userId|senderUserId|role)/);
});
