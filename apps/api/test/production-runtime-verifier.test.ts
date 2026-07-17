import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const verifier = await import(pathToFileURL(resolve(__dirname, '../../../scripts/verify-production-runtime.mjs')).href);

const registration = {
  clientId: 'operatoros:techdeck',
  productionBaseUrl: 'https://techdeck.operatoros.net',
  exactRedirectUris: ['https://techdeck.operatoros.net/sso'],
};

function secureHeaders() {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'referrer-policy': 'no-referrer',
  });
  for (const name of ['os_sso_state', 'os_sso_nonce', 'os_sso_verifier']) {
    headers.append('set-cookie', `${name}=opaque; Path=/; HttpOnly; Secure; SameSite=Lax`);
  }
  return headers;
}

test('production verifier loads OperatorOS plus exactly 13 canonical module registrations', async () => {
  const registry = await verifier.loadRegistry();
  assert.equal(registry.filter((entry: { moduleId: string }) => entry.moduleId === 'operatoros').length, 1);
  assert.equal(registry.filter((entry: { moduleId: string }) => entry.moduleId !== 'operatoros').length, 13);
  assert.equal(registry.filter((entry: { enabled: boolean }) => entry.enabled).length, 13);
  assert.equal(registry.find((entry: { slug: string }) => entry.slug === 'outcall')?.enabled, false);
});

test('authorization redirect validator enforces exact PKCE request, safe next, headers, and host-only cookies', () => {
  const location = new URL('https://auth.operatoros.net/login');
  location.searchParams.set('next', 'https://techdeck.operatoros.net/assets');
  location.searchParams.set('client_id', registration.clientId);
  location.searchParams.set('redirect_uri', registration.exactRedirectUris[0]);
  location.searchParams.set('state', 's'.repeat(43));
  location.searchParams.set('nonce', 'n'.repeat(43));
  location.searchParams.set('code_challenge', 'c'.repeat(43));
  location.searchParams.set('code_challenge_method', 'S256');
  assert.deepEqual(verifier.validateAuthorizationRedirect(location.href, registration, secureHeaders()), []);

  location.searchParams.set('token', 'must-not-appear');
  location.searchParams.set('next', 'https://evil.example/');
  const issues = verifier.validateAuthorizationRedirect(location.href, registration, new Headers());
  assert.ok(issues.some((issue: string) => issue.includes('credential query')));
  assert.ok(issues.some((issue: string) => issue.includes('originating registered host')));
  assert.ok(issues.some((issue: string) => issue.includes('no-store')));
  assert.ok(issues.some((issue: string) => issue.includes('cookie is missing')));
});

test('diagnostic validator requires production exact host/origin and host-only cookie mode', () => {
  const valid = {
    ok: true,
    environment: 'production',
    host: { normalized: 'techdeck.operatoros.net' },
    hostRole: 'module',
    publicOrigin: 'https://techdeck.operatoros.net',
    cookieDomainMode: 'host-only',
    cookieDomain: null,
  };
  assert.deepEqual(verifier.validateDiagnostics(valid, 'techdeck.operatoros.net', 'module'), []);
  assert.ok(verifier.validateDiagnostics({ ...valid, publicOrigin: 'http://localhost:5000' }, 'techdeck.operatoros.net', 'module').length > 0);
  assert.deepEqual(verifier.validateDiagnostics({
    ...valid,
    host: { normalized: 'operatoros.net' },
    hostRole: 'root',
    publicOrigin: 'https://operatoros.net',
  }, 'operatoros.net', 'root'), []);
});
