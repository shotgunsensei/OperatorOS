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
  for (const name of ['operatoros_sso_state', 'operatoros_sso_nonce', 'operatoros_sso_verifier']) {
    headers.append('set-cookie', `${name}=opaque; Path=/; HttpOnly; Secure; SameSite=Lax`);
  }
  return headers;
}

test('production verifier loads OperatorOS plus exactly 13 canonical module registrations', async () => {
  const registry = await verifier.loadRegistry();
  assert.equal(registry.filter((entry: { moduleId: string }) => entry.moduleId === 'operatoros').length, 1);
  assert.equal(registry.filter((entry: { moduleId: string }) => entry.moduleId !== 'operatoros').length, 13);
  assert.equal(registry.filter((entry: { enabled: boolean }) => entry.enabled).length, 14);
  assert.equal(registry.find((entry: { slug: string }) => entry.slug === 'outcall')?.enabled, true);
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

test('release identity validator requires the intended commit, database release, and deployment time', () => {
  const commit = 'a'.repeat(40);
  const valid = {
    status: 'identified',
    contractVersion: 1,
    commit,
    buildId: 'b'.repeat(24),
    builtAt: '2026-07-29T20:00:00.000Z',
    deployedAt: '2026-07-29T20:05:00.000Z',
    lockfileSha256: 'c'.repeat(64),
    databaseRelease: {
      contractVersion: 1,
      releaseVersion: 39,
      stepCount: 39,
      lastStep: 'torqueshed_native_tables',
    },
  };
  assert.deepEqual(verifier.validateReleaseIdentity(valid, commit), []);
  assert.ok(verifier.validateReleaseIdentity({ ...valid, deployedAt: 'invalid' }, commit).length > 0);
  assert.ok(verifier.validateReleaseIdentity({
    ...valid,
    databaseRelease: { ...valid.databaseRelease, releaseVersion: 37 },
  }, commit).length > 0);
  assert.ok(verifier.validateReleaseIdentity(valid, 'd'.repeat(40)).length > 0);
});

test('public verifier follows canonical root health and authorization entries', async () => {
  const requested: string[] = [];
  const registry = await verifier.loadRegistry();
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(url);
    if (url.endsWith('/api/health')) {
      return Response.json({ status: 'healthy', service: 'operatoros-api' });
    }
    throw new Error(`stop after root health: ${url}`);
  };

  await verifier.verifyProductionRuntime({ fetchImpl, registry });
  assert.equal(requested[0], 'https://operatoros.net/api/health');

  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(resolve(__dirname, '../../../scripts/verify-production-runtime.mjs'), 'utf8'));
  assert.match(source, /entry\.slug === 'operatoros'[\s\S]*https:\/\/operatoros\.net\/login/);
  assert.doesNotMatch(source, /\['os_sso_state', 'os_sso_nonce', 'os_sso_verifier'\]/);
});
