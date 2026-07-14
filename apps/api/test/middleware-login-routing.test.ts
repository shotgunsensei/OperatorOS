import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { middleware } from '../../web/src/middleware.js';

// The API package intentionally does not depend on Next. Resolve NextRequest
// from the web workspace so this executable contract test respects pnpm's
// strict package boundaries without widening the production API dependency.
const requireFromWeb = createRequire(resolve(process.cwd(), 'apps/web/package.json'));
const { NextRequest } = requireFromWeb('next/server') as { NextRequest: new (...args: any[]) => any };

function loginRequest(host: 'operatoros.net' | 'app.operatoros.net', query = ''): any {
  return new NextRequest(`https://${host}/login${query}`, {
    headers: {
      host,
      'x-forwarded-host': host,
      'x-forwarded-proto': 'https',
    },
  });
}

function assertAuthorizationRedirect(
  response: Awaited<ReturnType<typeof middleware>>,
  expectedCallbackHost: 'operatoros.net' | 'app.operatoros.net',
  expectedReturnTo: string,
) {
  assert.equal(response.status, 307);
  const location = response.headers.get('location');
  assert.ok(location, 'authorization redirect must include Location');
  const destination = new URL(location);

  assert.equal(destination.origin, 'https://auth.operatoros.net');
  assert.equal(destination.pathname, '/login');
  assert.equal(destination.searchParams.get('client_id'), 'operatoros:web');
  assert.equal(
    destination.searchParams.get('redirect_uri'),
    `https://${expectedCallbackHost}/sso`,
  );
  assert.equal(destination.searchParams.get('next'), expectedReturnTo);
  assert.equal(destination.searchParams.get('code_challenge_method'), 'S256');
  assert.match(destination.searchParams.get('state') ?? '', /^[A-Za-z0-9_-]{40,}$/);
  assert.match(destination.searchParams.get('nonce') ?? '', /^[A-Za-z0-9_-]{40,}$/);
  assert.match(destination.searchParams.get('code_challenge') ?? '', /^[A-Za-z0-9_-]{43}$/);

  const cookies = response.headers.getSetCookie();
  for (const name of ['operatoros_sso_state', 'operatoros_sso_nonce', 'operatoros_sso_verifier']) {
    const cookie = cookies.find(value => value.startsWith(`${name}=`));
    assert.ok(cookie, `${name} transaction cookie must be set`);
    assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
    assert.match(cookie, /;\s*Secure(?:;|$)/i);
    assert.doesNotMatch(cookie, /;\s*Domain=/i);
  }
}

test('root /login begins the full auth-host PKCE transaction', async () => {
  const response = await middleware(loginRequest('operatoros.net'));
  assertAuthorizationRedirect(response, 'operatoros.net', 'https://operatoros.net/app');
});

test('app /login uses its own registered callback and same-origin fallback', async () => {
  const response = await middleware(loginRequest('app.operatoros.net'));
  assertAuthorizationRedirect(response, 'app.operatoros.net', 'https://app.operatoros.net/app');
});

test('root registration mode and safe same-host next survive canonicalization', async () => {
  const response = await middleware(loginRequest(
    'operatoros.net',
    '?mode=register&next=%2Fpricing%23build-stack',
  ));
  assertAuthorizationRedirect(response, 'operatoros.net', '/pricing#build-stack');
  const destination = new URL(response.headers.get('location')!);
  assert.equal(destination.searchParams.get('mode'), 'register');
});

test('cross-host and recursive login destinations collapse to the host fallback', async () => {
  const crossHost = await middleware(loginRequest(
    'app.operatoros.net',
    '?next=https%3A%2F%2Ftechdeck.operatoros.net%2F',
  ));
  assertAuthorizationRedirect(crossHost, 'app.operatoros.net', 'https://app.operatoros.net/app');

  const recursive = await middleware(loginRequest('operatoros.net', '?next=%2Flogin'));
  assertAuthorizationRedirect(recursive, 'operatoros.net', 'https://operatoros.net/app');
});
