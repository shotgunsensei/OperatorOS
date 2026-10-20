import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { fieldNodeIntroductionPath, fieldNodeLinks, fieldNodePurchaseUrl } from '../../../packages/modules/fieldnode.js';
import {
  getModuleById,
  resolveModuleContext,
  resolveModuleRouteAccess,
} from '../../../packages/modules/registry.js';
import { MODULE_CATALOG, isAddonModuleSlug } from '../../../packages/sdk/src/catalog.js';
import {
  COMPANION_MODULES,
  CORE_PRODUCTS,
  FREE_WITH_ANY_ACCOUNT,
  isEligibleCompanionModuleKey,
} from '../../../packages/sdk/src/products.js';
import {
  FREE_ACCOUNT_APP_SLUGS,
  NEW_FREE_ACCOUNT_GRANT_METADATA,
  isFreeWithAnyAccountTenantModule,
  selectPlanModuleReconciliation,
} from '../src/lib/free-account-apps.js';
import {
  DATABASE_RELEASE_CONTRACT,
  DATABASE_RELEASE_STEPS,
} from '../src/lib/database-release-contract.js';
import { middleware } from '../../web/src/middleware.js';

// Execute the real Next middleware and shell without adding Next/React to the
// API package or starting an HTTP server. No request reaches an API or database.
const requireFromWeb = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'));
const { NextRequest } = requireFromWeb('next/server') as { NextRequest: new (...args: any[]) => any };
const { createElement } = requireFromWeb('react') as typeof import('react');
const { renderToStaticMarkup } = requireFromWeb('react-dom/server') as typeof import('react-dom/server');

const canonicalLinks = {
  introduction: 'https://fieldnode.operatoros.net/',
  purchase: 'https://operatoros.net/fieldnode#purchase',
  manage: 'https://fieldnode.operatoros.net/manage',
};

function request(url: string, authenticated = false): any {
  const parsed = new URL(url);
  return new NextRequest(url, {
    headers: {
      host: parsed.host,
      'x-forwarded-host': parsed.host,
      'x-forwarded-proto': parsed.protocol.replace(':', ''),
      ...(authenticated ? { cookie: 'operatoros_session=synthetic-middleware-presence-only' } : {}),
    },
  });
}

function loadWebComponent<Props>(relativePath: string): (props: Props) => import('react').ReactElement {
  // Native tsx follows the web's preserve-JSX setting, whereas Next supplies
  // the automatic JSX runtime. Compile each complete real component with that
  // runtime and bind its actual helper; no component behavior is reimplemented.
  const sourcePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../web', relativePath);
  const compiled = ts.transpileModule(readFileSync(sourcePath, 'utf8'), {
    fileName: sourcePath,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} as { default?: (props: Props) => import('react').ReactElement } };
  runInNewContext(compiled, {
    module: loaded,
    exports: loaded.exports,
    URL,
    require: (specifier: string) => specifier === '../../../../../packages/modules/fieldnode.js'
      ? { fieldNodeIntroductionPath, fieldNodeLinks }
      : requireFromWeb(specifier),
    process: { env: { NODE_ENV: 'test' } },
  }, { filename: sourcePath });
  assert.ok(loaded.exports.default);
  return loaded.exports.default;
}

test('FieldNode is the fourteenth canonical module and fourth free account app', () => {
  assert.equal(MODULE_CATALOG.length, 14);
  assert.equal(MODULE_CATALOG[13]?.slug, 'fieldnode');
  assert.deepEqual(FREE_WITH_ANY_ACCOUNT.map(module => module.key), [
    'torqueshed', 'faultlinelab', 'ninja-pool-hall', 'fieldnode',
  ]);
  assert.deepEqual([...FREE_ACCOUNT_APP_SLUGS], FREE_WITH_ANY_ACCOUNT.map(module => module.key));
  const module = MODULE_CATALOG.find(entry => entry.slug === 'fieldnode');
  assert.ok(module);
  assert.equal(module.name, 'FieldNode');
  assert.equal(module.commercialType, 'free');
  assert.equal(module.defaultStatus, 'live');
  assert.equal(module.canonicalBaseUrl, 'https://fieldnode.operatoros.net');
  assert.deepEqual(module.stripeAddonEnvKeys, []);
});

test('FieldNode cannot become a paid core, companion, or individual add-on', () => {
  assert.deepEqual(CORE_PRODUCTS.map(product => product.key), ['tradeflowkit', 'pulsedesk', 'techdeck']);
  assert.equal(COMPANION_MODULES.length, 6);
  assert.equal(CORE_PRODUCTS.some(product => String(product.key) === 'fieldnode'), false);
  assert.equal(COMPANION_MODULES.some(module => String(module.key) === 'fieldnode'), false);
  assert.equal(isEligibleCompanionModuleKey('fieldnode'), false);
  assert.equal(isAddonModuleSlug('fieldnode'), false);
  const freeApp = FREE_WITH_ANY_ACCOUNT.find(module => module.key === 'fieldnode');
  assert.ok(freeApp);
  for (const key of ['stripePriceEnvKey', 'stripePriceId', 'monthlyPriceCents', 'licenseKey']) {
    assert.equal(Object.hasOwn(freeApp, key), false, `${key} is not an application purchase requirement`);
  }
});

test('FieldNode uses the existing free tenant grant and does not create a database release', () => {
  assert.equal(isFreeWithAnyAccountTenantModule({ metadata: NEW_FREE_ACCOUNT_GRANT_METADATA }), true);
  const freeRow = { moduleId: 'fieldnode-id', source: 'included', status: 'enabled', metadata: NEW_FREE_ACCOUNT_GRANT_METADATA };
  assert.deepEqual(selectPlanModuleReconciliation([freeRow], new Set()), { dropped: [], reEnabled: [] });
  assert.deepEqual(selectPlanModuleReconciliation([{ ...freeRow, status: 'disabled' }], new Set(['fieldnode-id'])), { dropped: [], reEnabled: [] });
  assert.equal(DATABASE_RELEASE_CONTRACT.releaseVersion, 67);
  assert.equal(DATABASE_RELEASE_STEPS.length, 67);
  assert.equal(DATABASE_RELEASE_STEPS.at(-1)?.id, 'outcall_resource_tables');
});

test('FieldNode default and production navigation use exact canonical hosts without internal ports', () => {
  assert.deepEqual(fieldNodeLinks(), canonicalLinks);
  for (const host of ['operatoros.net:5000', 'fieldnode.operatoros.net:5000', 'localhost:5000', 'preview.replit.dev']) {
    assert.deepEqual(fieldNodeLinks({ host, forwardedProto: 'http' }), canonicalLinks, host);
  }
  assert.deepEqual(fieldNodeLinks({ host: 'fieldnode.operatoros.net:5000', forwardedProto: 'http' }, 'development'), canonicalLinks);
});

test('FieldNode development and preview links keep the current local origin', () => {
  for (const [input, environment, origin] of [
    [{ host: 'localhost:5000', forwardedProto: 'http' }, 'development', 'http://localhost:5000'],
    [{ host: '127.0.0.1:54123', forwardedProto: 'http' }, 'test', 'http://127.0.0.1:54123'],
    [{ host: 'internal:5000', forwardedHost: 'fieldnode-preview.replit.dev', forwardedProto: 'https' }, 'development', 'https://fieldnode-preview.replit.dev'],
  ] as const) {
    assert.deepEqual(fieldNodeLinks(input, environment), {
      introduction: `${origin}/fieldnode`,
      purchase: `${origin}/fieldnode#purchase`,
      manage: `${origin}/modules/fieldnode/manage`,
    });
  }
});

test('FieldNode navigation rejects external, credential-bearing, and unsafe-protocol preview origins', () => {
  for (const input of [
    { host: 'attacker.example', forwardedProto: 'https' },
    { host: 'preview.replit.dev.attacker.example', forwardedProto: 'https' },
    { host: 'user:password@preview.replit.dev', forwardedProto: 'https' },
    { host: 'localhost:5000', forwardedProto: 'javascript' },
    { host: 'localhost:5000', forwardedProto: 'ftp' },
    { host: '[malformed', forwardedProto: 'https' },
  ]) assert.deepEqual(fieldNodeLinks(input, 'development'), canonicalLinks, JSON.stringify(input));
});

test('management return paths stay on the current deployment in production-built previews', () => {
  assert.equal(fieldNodeIntroductionPath('fieldnode.operatoros.net', '/manage'), '/');
  assert.equal(fieldNodeIntroductionPath('preview.replit.dev', '/modules/fieldnode/manage'), '/modules/fieldnode');
  assert.equal(fieldNodeIntroductionPath('127.0.0.1', '/modules/fieldnode/manage'), '/modules/fieldnode');
  assert.equal(fieldNodeIntroductionPath('operatoros.net', '/apps/fieldnode'), '/fieldnode');
  assert.equal(fieldNodeIntroductionPath('localhost', '/modules/fieldnode-other/manage'), '/fieldnode');
});

test('hardware purchasing has no invented checkout or price when configuration is absent', () => {
  assert.equal(fieldNodePurchaseUrl(undefined), null);
  assert.equal(fieldNodePurchaseUrl(''), null);
});

test('hardware purchasing accepts only an explicitly configured OperatorOS HTTPS destination', () => {
  assert.equal(fieldNodePurchaseUrl('https://operatoros.net/hardware/fieldnode'), 'https://operatoros.net/hardware/fieldnode');
  assert.equal(fieldNodePurchaseUrl('https://operatoros.net/fieldnode/order'), 'https://operatoros.net/fieldnode/order');
});

test('hardware purchasing rejects foreign hosts, insecure origins, credentials, and URL state', () => {
  for (const invalid of [
    '/hardware/fieldnode', '//operatoros.net/hardware/fieldnode',
    'http://operatoros.net/hardware/fieldnode',
    'https://www.operatoros.net/hardware/fieldnode',
    'https://fieldnode.operatoros.net/order',
    'https://operatoros.net.attacker.example/order',
    'https://operatoros.net:5000/order',
    'https://user:password@operatoros.net/order',
    'https://operatoros.net/hardware/fieldnode?price=1',
    'https://operatoros.net/hardware/fieldnode#buy',
    'https://operatoros.net/hardware\\fieldnode',
    ' https://operatoros.net/hardware/fieldnode',
    'https://operatoros.net/hard ware',
    'https://operatoros.net/hardware\n/fieldnode',
    'https://operatoros.net/hardware\u007f/fieldnode',
  ]) assert.equal(fieldNodePurchaseUrl(invalid), null, JSON.stringify(invalid));
});

test('hardware purchasing cannot recurse into the introduction or use authentication/API/application routes', () => {
  for (const path of ['/', '/fieldnode', '/fieldnode/', '/app', '/app/billing', '/api/checkout', '/auth', '/auth/login', '/login', '/login/reset', '/logout', '/signup', '/register', '/forgot-password', '/reset-password', '/sso', '/sso/callback']) {
    assert.equal(fieldNodePurchaseUrl(`https://operatoros.net${path}`), null, path);
  }
});

test('hardware purchasing rejects encoded path ambiguity across routers and proxies', () => {
  for (const path of ['/%6cogin', '/%66ieldnode', '/%2fapi/checkout', '/%5cattacker.example', '/hardware/%0a', '/hardware/%20fieldnode', '/hardware/%252fapi']) {
    assert.equal(fieldNodePurchaseUrl(`https://operatoros.net${path}`), null, path);
  }
});

test('anonymous canonical FieldNode root is public and does not create an SSO transaction', async () => {
  const response = await middleware(request('https://fieldnode.operatoros.net/'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('x-middleware-rewrite'), null);
  assert.equal(response.headers.get('x-middleware-next'), '1');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.getSetCookie().length, 0);
});

test('the actual Next configuration serves only the exact FieldNode root through a relative internal rewrite', async () => {
  const filename = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/next.config.js');
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const loaded = { exports: {} as { default?: { rewrites: () => Promise<{ beforeFiles: Array<{ source: string; destination: string; has?: Array<{ type: string; value: string }> }> }> } } };
  runInNewContext(compiled, { module: loaded, exports: loaded.exports, process: { env: { NODE_ENV: 'test', INTERNAL_API_URL: 'http://127.0.0.1:5001' } } }, { filename });
  assert.ok(loaded.exports.default);
  const rules = (await loaded.exports.default.rewrites()).beforeFiles;
  const fieldNodeRules = rules.filter(rule => rule.destination === '/fieldnode');
  assert.equal(fieldNodeRules.length, 1);
  assert.equal(fieldNodeRules[0]?.source, '/');
  assert.equal(fieldNodeRules[0]?.destination, '/fieldnode');
  assert.equal(fieldNodeRules[0]?.has?.length, 1);
  assert.equal(fieldNodeRules[0]?.has?.[0]?.type, 'host');
  const hostPattern = new RegExp(`^${fieldNodeRules[0]?.has?.[0]?.value}$`);
  assert.equal(hostPattern.test('fieldnode.operatoros.net'), true);
  for (const invalid of ['fieldnodeXoperatorosYnet', 'fieldnode.operatoros.net.attacker.example', 'other.operatoros.net']) assert.equal(hostPattern.test(invalid), false);
});

test('anonymous local FieldNode root is public with and without a trailing slash', async () => {
  for (const path of ['/modules/fieldnode', '/modules/fieldnode/']) {
    const response = await middleware(request(`http://localhost:5000${path}`));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.equal(response.headers.get('x-middleware-rewrite'), `http://localhost:5000/fieldnode${path.endsWith('/') ? '/' : ''}`);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
});

test('anonymous FieldNode management starts the existing exact-host PKCE transaction', async () => {
  const response = await middleware(request('https://fieldnode.operatoros.net/manage'));
  assert.equal(response.status, 307);
  const target = new URL(response.headers.get('location')!);
  assert.equal(target.origin, 'https://auth.operatoros.net');
  assert.equal(target.pathname, '/login');
  assert.equal(target.searchParams.get('client_id'), 'operatoros:fieldnode');
  assert.equal(target.searchParams.get('redirect_uri'), 'https://fieldnode.operatoros.net/sso');
  assert.equal(target.searchParams.get('next'), 'https://fieldnode.operatoros.net/manage');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  for (const name of ['operatoros_sso_state', 'operatoros_sso_nonce', 'operatoros_sso_verifier']) {
    const cookie = response.headers.getSetCookie().find(value => value.startsWith(`${name}=`));
    assert.ok(cookie, name);
    assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
    assert.match(cookie, /;\s*Secure(?:;|$)/i);
    assert.doesNotMatch(cookie, /;\s*Domain=/i);
  }
});

test('anonymous local management remains protected rather than becoming a public introduction', async () => {
  const response = await middleware(request('http://localhost:5000/modules/fieldnode/manage'));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get('x-middleware-rewrite'), null);
  assert.equal(new URL(response.headers.get('location')!).pathname, '/login');
});

test('session-cookie routing preserves the FieldNode manage path without claiming authenticated device access', async () => {
  const response = await middleware(request('https://fieldnode.operatoros.net/manage', true));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
  assert.equal(response.headers.get('x-middleware-rewrite'), 'https://fieldnode.operatoros.net/modules/fieldnode/manage');
});

test('FieldNode management retains the existing required tenant-module grant decision', () => {
  const module = getModuleById('fieldnode');
  assert.ok(module);
  assert.equal(module.requiresTenant, true);
  // This existing flag requires a server-provided module grant, including a
  // free-account grant. It does not make FieldNode a Stripe subscription.
  assert.equal(module.requiresSubscription, true);
  assert.equal(resolveModuleRouteAccess(module).status, 'unauthenticated');
  const user = { id: 'synthetic-member', email: 'member@example.invalid', platformRole: 'user' as const };
  assert.equal(resolveModuleRouteAccess(module, { user, entitlements: {} }).status, 'access_denied');
  assert.equal(resolveModuleRouteAccess(module, { user, entitlements: { fieldnode: false } }).status, 'access_denied');
  assert.equal(resolveModuleRouteAccess(module, { user, entitlements: { fieldnode: true } }).status, 'allowed');
  assert.equal(resolveModuleRouteAccess(module, { user, entitlements: { techdeck: true } }).status, 'access_denied');
  assert.equal(resolveModuleContext({ host: 'fieldnode.operatoros.net', pathname: '/manage', user, entitlements: { fieldnode: true } }).module?.slug, 'fieldnode');
});

test('the real management shell reports unavailable pairing rather than inventing device controls', () => {
  const Shell = loadWebComponent<Record<string, never>>('src/components/module-shells/FieldNodeShell.tsx');
  const html = renderToStaticMarkup(createElement(Shell, {}));
  assert.match(html, /Manage my FieldNodes/);
  assert.match(html, /Remote management is not connected yet/);
  assert.match(html, /approved pairing service must verify device ownership for your organization/);
  assert.match(html, /application is free with your OperatorOS account/);
  assert.match(html, /paid plan or software license does not verify hardware ownership/);
  assert.match(html, /data-testid="fieldnode-management-unavailable"/);
  assert.doesNotMatch(html, /<(?:form|input|button)\b/i);
});

test('the real landing keeps introduction and owner entry public without inventing hardware ordering', () => {
  const props = { purchaseHref: canonicalLinks.purchase, manageHref: canonicalLinks.manage, checkoutHref: fieldNodePurchaseUrl(undefined) };
  const Landing = loadWebComponent<typeof props>('src/components/marketing/FieldNodeLanding.tsx');
  const html = renderToStaticMarkup(createElement(Landing, props));
  assert.match(html, /included with every free and paid OperatorOS account/);
  assert.match(html, /application does not require a license purchase or subscription/);
  assert.ok(html.includes(`href="${canonicalLinks.purchase}"`));
  assert.equal(html.split(`href="${canonicalLinks.manage}"`).length - 1, 2);
  assert.match(html, /Online hardware ordering is not available yet/);
  assert.match(html, /Device access requires verified ownership and pairing with your organization/);
  assert.doesNotMatch(html, /Continue to FieldNode hardware purchasing/);
  assert.doesNotMatch(html, /<(?:form|input|button)\b|\$\d/i);
});

test('the real landing exposes hardware ordering only from an accepted explicit configuration', () => {
  const props = {
    purchaseHref: canonicalLinks.purchase,
    manageHref: canonicalLinks.manage,
    checkoutHref: fieldNodePurchaseUrl('https://operatoros.net/hardware/fieldnode'),
  };
  const Landing = loadWebComponent<typeof props>('src/components/marketing/FieldNodeLanding.tsx');
  const html = renderToStaticMarkup(createElement(Landing, props));
  assert.ok(html.includes('href="https://operatoros.net/hardware/fieldnode"'));
  assert.match(html, /Continue to FieldNode hardware purchasing on OperatorOS/);
  assert.doesNotMatch(html, /Online hardware ordering is not available yet/);
  assert.match(html, /application does not require a license purchase or subscription/);
});
