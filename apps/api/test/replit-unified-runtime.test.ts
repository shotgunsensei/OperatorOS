import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const launcherPath = resolve(repoRoot, 'scripts/start-unified-runtime.mjs');
const launcher = await import(pathToFileURL(launcherPath).href);
const preflight = await import(pathToFileURL(resolve(repoRoot, 'scripts/production-env-preflight.mjs')).href);
const apiSource = readFileSync(resolve(repoRoot, 'apps/api/src/index.ts'), 'utf8');
const runnerSource = readFileSync(resolve(repoRoot, 'apps/runner-gateway/src/index.ts'), 'utf8');

test('unified Replit launcher validates production authority and port separation', () => {
  const valid = {
    ...preflight.CANONICAL_MODULE_URLS,
    DATABASE_URL: 'postgresql://example.invalid/operatoros',
    SESSION_SECRET: 'test-only-session-secret-long-enough',
    SSO_CODE_ENCRYPTION_SECRET: 'test-only-code-secret-long-enough-v1',
    APP_ENV: 'production', NODE_ENV: 'production',
    OPERATOROS_BASE_URL: 'https://operatoros.net',
    OPERATOROS_APPS_URL: 'https://app.operatoros.net/',
    INTERNAL_API_URL: 'http://localhost:5001',
    TRUST_PROXY: 'true',
    RUNNER_MODE: 'disabled',
    SHARED_SECRET_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  };
  assert.doesNotThrow(() => launcher.validateDeploymentEnvironment(valid));
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, DATABASE_URL: '' }), /DATABASE_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, SESSION_SECRET: 'short' }), /SESSION_SECRET/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, APP_ENV: 'dev' }), /production/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, APP_URL: 'https://legacy.invalid' }), /APP_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, TECHDECK_URL: '' }), /TECHDECK_URL/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, RUNNER_MODE: 'local' }), /RUNNER_MODE/);
  assert.throws(() => launcher.validateDeploymentEnvironment({ ...valid, INTERNAL_API_URL: 'https://api.operatoros.net' }), /INTERNAL_API_URL/);
  assert.throws(() => launcher.resolveRuntimeConfig({ PORT: '5001', API_PORT: '5001' }), /different/);
  assert.deepEqual(launcher.resolveRuntimeConfig({ PORT: '5000', API_PORT: '5001' }), {
    apiPort: 5001,
    publicPort: 5000,
    nextPort: 5002,
    startupTimeoutMs: 120000,
    apiReadyUrl: 'http://127.0.0.1:5001/readyz',
    nextReadyUrl: 'http://localhost:5002/',
    internalApiUrl: 'http://localhost:5001',
  });
  assert.deepEqual(launcher.resolveRuntimeEntrypoints('C:\\workspace'), {
    databaseReleaseEntry: resolve('C:\\workspace', 'apps/api/dist/apps/api/src/scripts/database-release.js'),
    apiEntry: resolve('C:\\workspace', 'apps/api/dist/apps/api/src/index.js'),
    nextCli: resolve('C:\\workspace', 'apps/web/node_modules/next/dist/bin/next'),
  });
  assert.equal(launcher.INTERNAL_SERVICE_HOST, '127.0.0.1');
  assert.equal(launcher.NEXT_INTERNAL_HOST, 'localhost');
});

test('Replit deployment uses the supervised readiness-gated runtime', () => {
  const replit = readFileSync(resolve(repoRoot, '.replit'), 'utf8');
  const deployment = replit.slice(replit.indexOf('[deployment]'), replit.indexOf('[workflows]'));
  const productionEnvironment = replit.slice(
    replit.indexOf('[userenv.production]'),
    replit.indexOf('[userenv.development]'),
  );
  const source = readFileSync(launcherPath, 'utf8');
  const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
  const pnpmWorkspace = readFileSync(resolve(repoRoot, 'pnpm-workspace.yaml'), 'utf8');
  assert.match(deployment, /run = \["node", "scripts\/start-unified-runtime\.mjs"\]/);
  assert.match(deployment, /export CI=true/);
  assert.match(deployment, /npm exec --yes --package=pnpm@10\.34\.5 -- pnpm install --frozen-lockfile/);
  assert.match(deployment, /pnpm build:production/);
  assert.doesNotMatch(deployment, /cd apps\/web && node node_modules\/next\/dist\/bin\/next build/);
  assert.doesNotMatch(deployment, /corepack|\bnpx\b|node node_modules\/pnpm/);
  assert.doesNotMatch(deployment, /sleep 2 && cd apps\/web/);
  assert.match(source, /\/readyz/);
  assert.match(source, /evaluateProductionEnvironment/);
  assert.match(source, /Fastify exited/);
  assert.match(source, /Next exited/);
  assert.match(source, /server\.on\('upgrade'/);
  assert.match(source, /request\.url\.slice\(3\)/);
  assert.match(source, /SIGTERM/);
  assert.match(source, /shell: false/);
  assert.match(source, /database-release\.js/);
  assert.match(source, /--verify-current/);
  assert.doesNotMatch(source, /\['--apply'\]/);
  assert.match(source, /OPERATOROS_DATABASE_RELEASE_VERIFIED: '1'/);
  assert.match(apiSource, /databaseReleaseVerifiedBySupervisor/);
  assert.match(apiSource, /OPERATOROS_DATABASE_RELEASE_APPLIED === '1' \|\| isProductionEnv\(\)/);
  assert.match(source, /--conditions=production/);
  assert.match(source, /apps\/api\/dist\/apps\/api\/src\/index\.js/);
  assert.match(source, /apps\/web\/node_modules\/next\/dist\/bin\/next/);
  assert.match(source, /resolve\(process\.cwd\(\), 'apps\/web'\)/);
  assert.match(source, /\['start', '-p', String\(config\.nextPort\), '-H', NEXT_INTERNAL_HOST\]/);
  assert.match(apiSource, /process\.env\.INTERNAL_SERVICE_HOST\?\.trim\(\) \|\| '0\.0\.0\.0'/);
  assert.match(runnerSource, /process\.env\.INTERNAL_SERVICE_HOST\?\.trim\(\) \|\| '0\.0\.0\.0'/);
  assert.doesNotMatch(source, /corepack|spawnPnpm/);
  assert.equal(packageJson.packageManager, 'pnpm@10.34.5');
  assert.equal(
    packageJson.scripts['build:production'],
    'pnpm verify:deployment-scope && pnpm verify:faultlinelab:catalog && node scripts/generate-release-metadata.mjs && pnpm typecheck && pnpm build',
  );
  assert.equal(packageJson.dependencies.pnpm, undefined);
  assert.equal(packageJson.pnpm, undefined);
  assert.match(pnpmWorkspace, /^allowBuilds:\r?\n\s+bufferutil: true\r?\n\s+esbuild: true$/m);
  for (const [name, url] of Object.entries(preflight.CANONICAL_MODULE_URLS)) {
    assert.match(replit, new RegExp(`^${name} = "${String(url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"$`, 'm'));
  }
  assert.match(replit, /TWILIO_PUBLIC_BASE_URL = "https:\/\/callcommand-ai\.operatoros\.net"/);
  assert.match(replit, /OPERATOROS_APPS_URL = "https:\/\/app\.operatoros\.net\/"/);
  assert.match(replit, /INTERNAL_API_URL = "http:\/\/localhost:5001"/);
  assert.doesNotMatch(replit, /^OPERATOROS_DATABASE_RELEASE_MODE\s*=/m);
  for (const [name, expected] of Object.entries(preflight.PRODUCTION_ENVIRONMENT_CONTRACT.core.exact)) {
    const escaped = String(expected).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(productionEnvironment, new RegExp(`^${name} = "${escaped}"$`, 'm'));
  }
  const exposedPorts = [...replit.matchAll(/^externalPort\s*=\s*(\d+)$/gm)].map((match) => Number(match[1]));
  assert.deepEqual(exposedPorts, [80]);
  assert.match(replit, /\[\[ports\]\]\r?\nlocalPort = 5000\r?\nexternalPort = 80/);
  assert.match(source, /bootstrap gateway listening on public port/);
  assert.match(source, /runtimeReady = true/);
});

test('public gateway responds during bootstrap and proxies only after readiness', async () => {
  const upstream = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`proxied ${request.url}`);
  });
  await new Promise<void>((resolvePromise, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolvePromise);
  });
  const upstreamAddress = upstream.address();
  assert.ok(upstreamAddress && typeof upstreamAddress === 'object');

  let ready = false;
  const gateway = launcher.createPublicGateway(
    { apiPort: upstreamAddress.port, nextPort: upstreamAddress.port },
    { isReady: () => ready, nextHost: '127.0.0.1' },
  );
  await new Promise<void>((resolvePromise, reject) => {
    gateway.once('error', reject);
    gateway.listen(0, '127.0.0.1', resolvePromise);
  });
  const gatewayAddress = gateway.address();
  assert.ok(gatewayAddress && typeof gatewayAddress === 'object');
  const baseUrl = `http://127.0.0.1:${gatewayAddress.port}`;

  try {
    const homepage = await fetch(`${baseUrl}/`, { headers: { accept: 'text/html' } });
    assert.equal(homepage.status, 503);
    assert.equal(homepage.headers.get('cache-control'), 'no-store, max-age=0');
    assert.equal(homepage.headers.get('retry-after'), '2');
    assert.equal(homepage.headers.get('x-operatoros-runtime-state'), 'starting');
    const contentSecurityPolicy = homepage.headers.get('content-security-policy') ?? '';
    const nonce = /script-src 'nonce-([^']+)'/.exec(contentSecurityPolicy)?.[1];
    assert.ok(nonce);
    assert.ok(contentSecurityPolicy.includes(`style-src 'nonce-${nonce}'`));
    const homepageBody = await homepage.text();
    assert.match(homepageBody, /OperatorOS is starting/);
    assert.match(homepageBody, /const originalUrl=window\.location\.href/);
    assert.match(homepageBody, /fetch\('\/readyz'/);
    assert.match(homepageBody, /window\.location\.replace\(originalUrl\)/);
    assert.ok(homepageBody.includes(`script nonce="${nonce}"`));

    const retryScript = /<script nonce="[^"]+">([^<]+)<\/script>/.exec(homepageBody)?.[1];
    assert.ok(retryScript);
    const scheduled: Array<() => Promise<void>> = [];
    const exactBrowserUrl = `${baseUrl}/modules/tradeflowkit/invoices?view=open#overdue`;
    let readinessAttempts = 0;
    let restoredUrl: string | undefined;
    runInNewContext(retryScript, {
      document: { getElementById: () => ({ textContent: '' }) },
      fetch: async () => ({ ok: ++readinessAttempts === 2 }),
      window: {
        location: {
          href: exactBrowserUrl,
          replace: (url: string) => { restoredUrl = url; },
        },
        setTimeout: (callback: () => Promise<void>) => { scheduled.push(callback); },
      },
    });
    assert.equal(scheduled.length, 1);
    await scheduled.shift()?.();
    assert.equal(readinessAttempts, 1);
    assert.equal(scheduled.length, 1);
    await scheduled.shift()?.();
    assert.equal(readinessAttempts, 2);
    assert.equal(restoredUrl, exactBrowserUrl);

    const deepLink = await fetch(`${baseUrl}/invoices/abc?view=open`, {
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    assert.equal(deepLink.status, 503);
    assert.match(await deepLink.text(), /return to this exact page automatically/);

    const readiness = await fetch(`${baseUrl}/readyz`, { headers: { accept: 'application/json' } });
    assert.equal(readiness.status, 503);
    assert.deepEqual(await readiness.json(), {
      status: 'starting',
      ready: false,
      code: 'RUNTIME_STARTING',
    });

    const mutation = await fetch(`${baseUrl}/`, { method: 'POST' });
    assert.equal(mutation.status, 503);

    ready = true;
    const proxied = await fetch(`${baseUrl}/workspace`);
    assert.equal(proxied.status, 200);
    assert.equal(await proxied.text(), 'proxied /workspace');
  } finally {
    await Promise.all([
      new Promise<void>((resolvePromise) => gateway.close(() => resolvePromise())),
      new Promise<void>((resolvePromise) => upstream.close(() => resolvePromise())),
    ]);
  }
});
