import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (repoPath: string) => readFileSync(resolve(root, repoPath), 'utf8');

test('global logout is exposed through the authenticated client and provider', () => {
  const authClient = read('apps/web/src/lib/auth.ts');
  const provider = read('apps/web/src/components/AuthProvider.tsx');

  assert.match(authClient, /logoutAll:\s*\(\) => apiFetch\('\/auth\/logout-all', \{ method: 'POST' \}\)/);
  assert.match(provider, /logoutEverywhere: \(\) => Promise<void>/);
  assert.match(provider, /await authApi\.logoutAll\(\)/);
  assert.doesNotMatch(
    provider.slice(provider.indexOf('const logoutEverywhere'), provider.indexOf('\n\n  return', provider.indexOf('const logoutEverywhere'))),
    /catch/,
  );
});

test('settings reports revocation failures and only navigates after success', () => {
  const settings = read('apps/web/src/components/pages/SettingsPage.tsx');

  const handlerStart = settings.indexOf('const handleGlobalLogout');
  const handlerEnd = settings.indexOf('\n\n  const cardStyle', handlerStart);
  const handler = settings.slice(handlerStart, handlerEnd);

  assert.match(settings, /data-testid="button-logout-everywhere"/);
  assert.match(handler, /await logoutEverywhere\(\)/);
  assert.match(handler, /window\.location\.assign\('\/signed-out\?signed_out=global'\)/);
  assert.match(handler, /setGlobalLogoutMessage/);
  assert.ok(
    handler.indexOf('await logoutEverywhere()') < handler.indexOf("window.location.assign('/signed-out?signed_out=global')"),
    'navigation must follow successful server revocation',
  );
});

test('a rejected protected-host session is cleared before one central-auth restart', () => {
  const provider = read('apps/web/src/components/AuthProvider.tsx');
  const logoutRoute = read('apps/web/src/app/logout/route.ts');

  assert.match(provider, /err\?\.status === 401 && restartCentralAuthAfterInvalidSession\(\)/);
  assert.match(provider, /\/logout\?reauth=1&return_to=/);
  assert.match(logoutRoute, /request\.nextUrl\.searchParams\.get\('reauth'\) === '1'/);
  assert.match(logoutRoute, /response\.cookies\.set\(SESSION_COOKIE_NAME, ''/);
  assert.match(logoutRoute, /new URL\(safeReturnTo, publicOrigin\)/);
  assert.match(logoutRoute, /sanitizeReturnTo\(requestedReturnTo, '\/'\)/);
});

test('reauth logout rejects backslash and encoded-separator open redirects', async () => {
  const { NextRequest } = await import('../../web/node_modules/next/server.js');
  const { GET } = await import('../../web/src/app/logout/route.ts');
  const host = 'techdeck.operatoros.net';

  for (const returnTo of ['/\\evil.com', '/%5cevil.com', '/%2fevil.com', '//evil.com']) {
    const request = new NextRequest(
      `https://${host}/logout?reauth=1&return_to=${encodeURIComponent(returnTo)}`,
      { headers: { host } },
    );
    const response = GET(request);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), `https://${host}/`);
  }

  const valid = new NextRequest(
    `https://${host}/logout?reauth=1&return_to=${encodeURIComponent('/modules/techdeck/tickets?mine=1')}`,
    { headers: { host } },
  );
  assert.equal(
    GET(valid).headers.get('location'),
    `https://${host}/modules/techdeck/tickets?mine=1`,
  );
});
