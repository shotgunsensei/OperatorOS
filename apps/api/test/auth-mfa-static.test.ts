import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('account MFA is wired through central login, profile settings, and invitation sign-in', () => {
  const routes = read('apps/api/src/routes/auth-routes.ts');
  const login = read('apps/web/src/components/pages/LoginPage.tsx');
  const settings = read('apps/web/src/components/pages/SettingsPage.tsx');
  const invitation = read('apps/web/src/app/invites/[token]/page.tsx');
  const client = read('apps/web/src/lib/auth.ts');

  for (const path of ['/v1/auth/login/mfa', '/v1/auth/mfa/status', '/v1/auth/mfa/setup', '/v1/auth/mfa/verify', '/v1/auth/mfa/disable', '/v1/auth/mfa/recovery-codes']) {
    assert.ok(routes.includes(path), `${path} must remain registered on the identity authority`);
  }
  assert.match(login, /input-mfa-code/);
  assert.match(login, /completeMfaLogin/);
  assert.match(settings, /settings-mfa-section/);
  assert.match(settings, /Save these recovery codes now/);
  assert.match(invitation, /form-invite-mfa/);
  assert.match(invitation, /completeMfaLogin/);
  assert.match(client, /\/auth\/mfa\/recovery-codes/);
});
