import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getModuleByHost } from '../../../packages/modules/registry.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

const REPLIT_MODULE_HOSTS = {
  'tradeflowkit.operatoros.net': 'tradeflowkit',
  'torqueshed.operatoros.net': 'torqueshed',
  'techdeck.operatoros.net': 'techdeck',
  'pulsedesk.operatoros.net': 'pulsedesk',
  'faultlinelab.operatoros.net': 'faultlinelab',
  'operatorpoolhall.operatoros.net': 'ninja-pool-hall',
  'brandforgeos.operatoros.net': 'brandforgeos',
  'snapproofos.operatoros.net': 'snapproofos',
  'studyforge-ai.operatoros.net': 'studyforge-ai',
  'deployops.operatoros.net': 'ninja-launch-kit',
  'callcommand-ai.operatoros.net': 'callcommand-ai',
  'scriptops.operatoros.net': 'ninjamation',
  'outcall.operatoros.net': 'outcall',
} as const;

test('runtime resolves every Replit module host to its canonical slug', () => {
  for (const [host, slug] of Object.entries(REPLIT_MODULE_HOSTS)) {
    assert.equal(getModuleByHost(host)?.slug, slug, `${host} maps to ${slug}`);
  }
});

test('production module paths redirect to canonical subdomains while local paths stay development-only', () => {
  const middleware = read('apps/web/src/middleware.ts');
  const registry = read('packages/modules/registry.ts');

  assert.match(middleware, /function canonicalizeProductionModulePath/);
  assert.match(middleware, /function canonicalizeLegacyModuleHost/);
  assert.match(middleware, /module\.legacyHostnames\.includes\(context\.host\)/);
  assert.match(middleware, /context\.surface !== 'root' && context\.surface !== 'app'/);
  assert.match(middleware, /new URL\(module\.productionBaseUrl\)/);
  assert.match(middleware, /NextResponse\.redirect\(destination, 308\)/);
  assert.match(middleware, /canonicalizeProductionModulePath\(req, context\)/);
  assert.match(middleware, /function canonicalizePrefixedModuleHostPath/);
  assert.match(middleware, /pathname\.slice\(localPrefix\.length\)/);
  assert.ok(
    middleware.indexOf('canonicalizePrefixedModuleHostPath(req, context)') <
      middleware.indexOf('!req.cookies.has(AUTH_COOKIE)'),
    'module-host prefix canonicalization must happen before the auth/SSO gate',
  );
  assert.match(registry, /function supportsLocalModuleFallback/);
  assert.match(registry, /host\.endsWith\('\.replit\.dev'\)/);
  assert.match(registry, /requestedLocalSlug && supportsLocalModuleFallback\(host\)/);
});

test('shared Next deployment proxies the API host and public readiness paths to Fastify', () => {
  const nextConfig = read('apps/web/next.config.js');
  const middleware = read('apps/web/src/middleware.ts');
  const api = read('apps/api/src/index.ts');
  const beforeFiles = nextConfig.slice(
    nextConfig.indexOf('beforeFiles:'),
    nextConfig.indexOf('afterFiles:'),
  );

  assert.match(nextConfig, /beforeFiles:\s*\[/);
  assert.match(nextConfig, /type:\s*'host',\s*value:\s*'api\.operatoros\.net'/);
  assert.match(
    nextConfig,
    /beforeFiles:\s*\[[\s\S]*source:\s*'\/:path\*'[\s\S]*destination:\s*`\$\{apiUrl\}\/\:path\*`/,
  );
  assert.match(beforeFiles, /source:\s*'\/healthz'[\s\S]*destination:\s*`\$\{apiUrl\}\/healthz`/);
  assert.match(beforeFiles, /source:\s*'\/readyz'[\s\S]*destination:\s*`\$\{apiUrl\}\/readyz`/);
  assert.match(middleware, /pathname === '\/healthz'/);
  assert.match(middleware, /pathname === '\/readyz'/);
  assert.match(middleware, /context\.host === API_HOST\) return NextResponse\.next\(\)/);
  assert.match(api, /ssoCodeEncryption: ssoCodeEncryptionConfigured \? 'configured' : 'missing'/);
  assert.match(api, /database === 'healthy'/);
  assert.match(api, /reply\.code\(ready \? 200 : 503\)/);
});

test('every host has an idempotent local logout route that clears only its host session', () => {
  const middleware = read('apps/web/src/middleware.ts');
  const logout = read('apps/web/src/app/logout/route.ts');
  const signedOut = read('apps/web/src/app/signed-out/page.tsx');

  assert.match(middleware, /pathname === '\/logout'/);
  assert.match(logout, /SESSION_COOKIE_NAME/);
  assert.match(logout, /getPublicOrigin/);
  assert.match(logout, /getSessionClearCookieOptions/);
  assert.match(logout, /maxAge:\s*0/);
  assert.doesNotMatch(logout, /domain:\s*['"]\.operatoros\.net/);
  assert.doesNotMatch(logout, /new URL\('\/',\s*request\.url\)/);
  assert.match(logout, /\/signed-out\?signed_out=local/);
  assert.match(logout, /Cache-Control',\s*'no-store'/);
  assert.match(signedOut, /searchParams\?\.signed_out === 'local'/);
  assert.match(signedOut, /Sessions on other OperatorOS subdomains remain active/);
});

test('module host rewrites preserve deep paths and reserve auth/ops endpoints', () => {
  const middleware = read('apps/web/src/middleware.ts');
  const catchAll = read('apps/web/src/app/modules/[slug]/[...path]/page.tsx');

  assert.match(middleware, /context\.surface !== 'module' \|\| !context\.module/);
  assert.match(middleware, /const localPrefix = `\/modules\/\$\{context\.module\.slug\}`/);
  assert.match(middleware, /hostRelativePath \|\| context\.module\.launchPath \|\| '\/'/);
  assert.match(middleware, /context\.surface === 'module' && pathname !== '\/'/);
  assert.match(middleware, /`\/modules\/\$\{context\.module\.slug\}\$\{modulePath\}`/);
  for (const reserved of ['/sso', '/logout', '/healthz', '/readyz']) {
    assert.match(middleware, new RegExp(`pathname === '${reserved.replace('/', '\\/')}'`));
  }
  assert.match(catchAll, /resolveCoreModuleDeepLink/);
  assert.match(catchAll, /initialSectionId=\{target\.sectionId\}/);
  assert.match(catchAll, /module-deep-link-not-found/);
});

test('module SSO preserves the exact clean deep link and query through code exchange', () => {
  const middleware = read('apps/web/src/middleware.ts');
  const login = read('apps/web/src/app/login/page.tsx');

  assert.match(middleware, /`\$\{origin\}\$\{req\.nextUrl\.pathname\}\$\{req\.nextUrl\.search \|\| ''\}`/);
  assert.match(middleware, /url\.searchParams\.set\('next', target\)/);
  assert.match(login, /returnTo: next/);
  assert.match(login, /window\.location\.replace\(safeDestination\)/);
});

test('TradeFlowKit legacy public routes resolve before the module authentication gate', () => {
  const middleware = read('apps/web/src/middleware.ts');

  assert.match(middleware, /function tradeFlowKitPublicDestination/);
  assert.match(middleware, /const legacyPortal =/);
  assert.match(middleware, /\[A-Za-z0-9_-\]\{32,64\}/);
  assert.match(middleware, /`\/public\/tradeflowkit\/customers\/\$\{legacyPortal\[1\]\}`/);
  assert.match(middleware, /function tradeFlowKitPlatformDestination/);
  for (const path of ['/privacy', '/terms', '/sms-consent', '/guide', '/delete-account']) {
    assert.match(middleware, new RegExp(`'${path.replace('/', '\\/')}'`));
  }
  assert.ok(
    middleware.indexOf("context.module?.slug === 'tradeflowkit'") < middleware.indexOf("!req.cookies.has(AUTH_COOKIE)"),
    'public TradeFlowKit compatibility routes must run before the module auth gate',
  );
});

test('production CORS is registered and browser requests must also match the target host', () => {
  const api = read('apps/api/src/index.ts');
  const originPolicy = read('apps/api/src/lib/request-origin.ts');

  assert.match(api, /REGISTERED_PRODUCTION_ORIGINS/);
  assert.match(api, /filter\(module => module\.status === 'active'\)/);
  assert.match(api, /flatMap\(module => module\.exactAllowedOrigins\)/);
  assert.match(api, /parsed\.protocol !== 'https:'/);
  assert.match(api, /configuredCorsOrigins\(\)\.has\(url\.origin\)/);
  assert.doesNotMatch(api, /isProductionEnv\(\)\s*\?\s*isProductionHost/);
  assert.doesNotMatch(api, /Object\.values\(PLATFORM_DOMAINS\)/);
  assert.match(api, /isBrowserRequestOriginAllowed/);
  assert.match(api, /ORIGIN_HOST_MISMATCH/);
  assert.match(originPolicy, /const publicHost = forwardedHost \|\| directHost/);
  assert.match(originPolicy, /publicHost === origin\.hostname\.toLowerCase\(\)/);
  assert.doesNotMatch(originPolicy, /candidates\.has/);
  assert.doesNotMatch(originPolicy, /endsWith\(['"]\.operatoros\.net/);
});

test('auth host serves only its dedicated authentication surface', () => {
  const middleware = read('apps/web/src/middleware.ts');

  assert.match(middleware, /context\.surface === 'auth' && pathname === '\/'/);
  assert.match(middleware, /isRegisteredSsoCallback/);
  assert.match(middleware, /callback_host_not_registered/);
  assert.match(middleware, /context\.surface === 'auth'[\s\S]*isInvitePath\(pathname\)[\s\S]*buildPublicUrl/);
  assert.match(middleware, /context\.surface === 'auth'[\s\S]*pathname !== '\/login'/);
  assert.match(middleware, /NextResponse\.redirect\(CANONICAL_APP_URL, 307\)/);
});

test('production marketing login starts a complete auth-host SSO transaction', () => {
  const middleware = read('apps/web/src/middleware.ts');

  assert.match(middleware, /pathname === '\/login'[\s\S]*context\.isOperatorOSHost/);
  assert.match(middleware, /context\.surface === 'root' \|\| context\.surface === 'app'/);
  assert.match(middleware, /return await redirectToLogin\(req, context\)/);
  assert.match(middleware, /isCanonicalLoginEntry/);
  assert.match(middleware, /req\.nextUrl\.searchParams\.get\('next'\)/);
  assert.match(middleware, /targetUrl\.origin !== origin/);
  assert.match(middleware, /targetUrl\.pathname === '\/login'/);
  assert.match(middleware, /context\.surface === 'app'[\s\S]*CANONICAL_APP_URL[\s\S]*buildPublicUrl\('\/app', 'root'\)/);
  assert.match(middleware, /target = loginEntryFallback/);
  assert.match(middleware, /AUTH_ENTRY_MODES/);
  assert.match(middleware, /url\.searchParams\.set\('mode', requestedMode\)/);
  assert.match(middleware, /url\.searchParams\.set\('client_id'/);
  assert.match(middleware, /url\.searchParams\.set\('redirect_uri'/);
  assert.match(middleware, /url\.searchParams\.set\('code_challenge'/);
  assert.match(middleware, /setTransactionCookie\(res, SSO_STATE_COOKIE_NAME/);
  assert.doesNotMatch(middleware, /domain:\s*['"]\.operatoros\.net/);
});

test('noncanonical production aliases cannot create unregistered SSO callbacks', () => {
  const middleware = read('apps/web/src/middleware.ts');

  assert.match(middleware, /DEFAULT_REPLIT_HOST = 'operator-os\.replit\.app'/);
  assert.match(middleware, /WWW_HOST = 'www\.operatoros\.net'/);
  assert.match(middleware, /canonicalizeNoncanonicalHost/);
  assert.match(middleware, /isCallback \? '\/app' : req\.nextUrl\.pathname/);
  assert.match(middleware, /NextResponse\.redirect\(destination, 308\)/);
});

test('SSO callback exemption is exact-host bound before general operational exemptions', () => {
  const middleware = read('apps/web/src/middleware.ts');
  const callbackGate = middleware.indexOf('if (isSsoCallbackPath(pathname))');
  const operationsGate = middleware.indexOf('if (isOperationalExempt(pathname))');

  assert.ok(callbackGate >= 0, 'callback gate exists');
  assert.ok(operationsGate > callbackGate, 'exact callback gate runs before operational exemptions');
  assert.match(middleware, /module\.status !== 'active'/);
  assert.match(middleware, /module\.exactRedirectUris\.some/);
  assert.match(middleware, /callback\.hostname\.toLowerCase\(\) === context\.host/);
});

test('signed-out landing distinguishes local clearing from global revocation', () => {
  const signedOut = read('apps/web/src/app/signed-out/page.tsx');

  assert.match(signedOut, /searchParams\?\.signed_out === 'local'/);
  assert.match(signedOut, /searchParams\?\.signed_out === 'global'/);
  assert.match(signedOut, /All OperatorOS sessions were revoked/);
});
