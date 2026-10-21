import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  lunchBreakGames,
  lunchBreakHostPathAllowed,
  safeGameUrl,
} from '../../../packages/modules/lunch-break.js';
import { getModuleByHost, getModuleById } from '../../../packages/modules/registry.js';
import { buildNavSections } from '../../web/src/lib/sidebar-nav.js';
import { middleware } from '../../web/src/middleware.js';

const webRequire = createRequire(new URL('../../web/package.json', import.meta.url));
const { NextRequest } = webRequire('next/server') as { NextRequest: new (...args: any[]) => any };
const repo = fileURLToPath(new URL('../../../', import.meta.url));

test('five-game hub preserves Pool Hall and exposes only the observed default websites', () => {
  const games = lunchBreakGames();
  assert.deepEqual(
    games.map((g) => g.name),
    ['Pool Hall', 'Scrapshift', 'Roaming Garden', 'Neon Racer', 'Kage'],
  );
  assert.equal(games[0].url, getModuleById('ninja-pool-hall')!.productionBaseUrl + '/');
  assert.equal(games[0].status, 'module');
  assert.deepEqual(
    games.slice(1).map((g) => g.status),
    ['site', 'site', 'site', 'site'],
  );
  assert.deepEqual(
    games.slice(1).map((g) => new URL(g.url!).hostname),
    [
      'scrapshift.operatoros.net',
      'roaminggarden.operatoros.net',
      'neonracer.operatoros.net',
      'kage.operatoros.net',
    ],
  );
  assert.equal(
    getModuleByHost('lunchbreak.operatoros.net'),
    undefined,
    'public hub must not gain an SSO registration',
  );
});

test('readiness can remove any launch and replacement destinations require explicit verification', () => {
  assert.equal(lunchBreakGames({ LUNCH_BREAK_SCRAPSHIFT_READY: '1' })[1].status, 'planned');
  const games = lunchBreakGames({
    LUNCH_BREAK_SCRAPSHIFT_READY: 'true',
    LUNCH_BREAK_NEON_RACER_READY: 'true',
    LUNCH_BREAK_KAGE_READY: 'true',
    LUNCH_BREAK_NEON_RACER_URL: 'https://neonracer.net/',
  });
  assert.equal(games[1].status, 'site');
  assert.equal(games[3].url, 'https://neonracer.net/');
  assert.equal(games[3].status, 'site');
  assert.equal(games[4].status, 'site');
  assert.equal(lunchBreakGames({ LUNCH_BREAK_KAGE_URL: '' })[4].url, null);
  assert.equal(lunchBreakGames({ LUNCH_BREAK_KAGE_READY: 'false' })[4].status, 'planned');
  assert.equal(
    lunchBreakGames({ LUNCH_BREAK_NEON_RACER_URL: 'https://neonracer.net/' })[3].status,
    'planned',
  );
});

test('destination configuration rejects credential/token and unsafe navigation URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    '//example.com',
    'http://example.com',
    'https://u:p@example.com',
    'https://example.com/?token=secret',
    'https://example.com/#secret',
    'https://example.com:444/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://[::1]/',
    'https://example.local/',
    ' https://example.com/',
    'https://example.com.evil.test/',
    '',
  ])
    assert.equal(safeGameUrl(url), null, url);
  assert.equal(safeGameUrl('https://games.example.com/play'), 'https://games.example.com/play');
});

test('Lunch Break is discoverable to ordinary, admin and platform users without a paid gate', () => {
  for (const flags of [
    { isSuperAdmin: false, isTenantAdmin: false },
    { isSuperAdmin: false, isTenantAdmin: true },
    { isSuperAdmin: true, isTenantAdmin: true },
  ]) {
    const items = buildNavSections(flags)
      .flatMap((s) => s.items)
      .filter((i) => i.id === 'lunch-break');
    assert.equal(items.length, 1);
    assert.equal(items[0].href, '/lunch-break');
  }
});

test('public hub host permits only read-only hub pages and its bundled assets', () => {
  for (const path of [
    '/',
    '/lunch-break',
    '/_next/static/chunks/app.js',
    '/brand/operatoros-mark.png',
    '/lunch-break/pool-hall.webp',
    '/lunch-break/kage.webp',
    '/lunch-break/scrapshift.jpg',
    '/lunch-break/roaming-garden.jpg',
    '/lunch-break/neon-racer.jpg',
  ])
    assert.equal(lunchBreakHostPathAllowed('GET', path), true);
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS'])
    assert.equal(lunchBreakHostPathAllowed(method, '/'), false);
  for (const path of [
    '/api/auth/me',
    '/api/modules',
    '/v1/auth/login',
    '/sso',
    '/logout',
    '/app',
    '/manage',
    '/_next/image',
    '/.env',
    '/lunch-break/secret.txt',
    '/lunch-break/../../api/auth/me',
  ])
    assert.equal(lunchBreakHostPathAllowed('GET', path), false);
});

test('actual middleware denies private paths without cookies, redirects or forwarded-host bypass', async () => {
  for (const host of [
    'lunchbreak.operatoros.net',
    'LUNCHBREAK.OPERATOROS.NET',
    'lunchbreak.operatoros.net.:443',
  ]) {
    for (const path of ['/api/auth/me', '/sso?code=opaque', '/app', '/logout', '/.env']) {
      const req = new NextRequest(`https://lunchbreak.operatoros.net${path}`, {
        headers: {
          host,
          'x-forwarded-host': 'app.operatoros.net',
          cookie: 'operatoros_session=synthetic-never-verified',
        },
      });
      const response = await middleware(req);
      assert.equal(response.status, 404, host + path);
      assert.equal(response.headers.has('set-cookie'), false);
      assert.equal(response.headers.has('location'), false);
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    }
  }
  const root = await middleware(
    new NextRequest('https://lunchbreak.operatoros.net/', {
      headers: { host: 'lunchbreak.operatoros.net' },
    }),
  );
  assert.equal(root.headers.get('x-middleware-next'), '1');
  assert.equal(root.headers.has('set-cookie'), false);
});

test('Next host matcher covers private and dotted paths; rewrite stays relative and exact-host', async () => {
  const source = readFileSync(resolve(repo, 'apps/web/src/middleware.ts'), 'utf8');
  assert.match(source, /source: '\/:path\*', has:.*lL.*nN/);
  // Load configuration with an explicit inert loopback API endpoint, no server.
  const previous = process.env.INTERNAL_API_URL;
  process.env.INTERNAL_API_URL = 'http://127.0.0.1:59999';
  try {
    const config = (await import('../../web/next.config.js')).default;
    const rules = (await config.rewrites()).beforeFiles;
    const rule = rules.find((r: any) => r.destination === '/lunch-break');
    assert.equal(rule.source, '/');
    const regex = new RegExp(`^(?:${rule.has[0].value})$`);
    for (const host of [
      'lunchbreak.operatoros.net',
      'LUNCHBREAK.OPERATOROS.NET:443',
      'lunchbreak.operatoros.net.',
    ])
      assert.equal(regex.test(host), true);
    for (const host of [
      'evil.example',
      'lunchbreak.operatoros.net.evil.example',
      'app.operatoros.net',
    ])
      assert.equal(regex.test(host), false);
  } finally {
    if (previous === undefined) delete process.env.INTERNAL_API_URL;
    else process.env.INTERNAL_API_URL = previous;
  }
});
