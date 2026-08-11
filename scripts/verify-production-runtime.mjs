import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = resolve(SCRIPT_DIR, '../config/operatoros-module-registry.json');
const AUTH_ORIGIN = 'https://auth.operatoros.net';
const TRANSACTION_COOKIE_NAMES = [
  'operatoros_sso_state',
  'operatoros_sso_nonce',
  'operatoros_sso_verifier',
];
const FORBIDDEN_QUERY_KEYS = new Set([
  'token',
  'jwt',
  'access_token',
  'id_token',
  'refresh_token',
  'session',
  'session_token',
]);
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const BUILD_ID_PATTERN = /^[0-9a-f]{24}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

function failure(name, message) {
  return { name, ok: false, message };
}

function success(name, message = 'ok') {
  return { name, ok: true, message };
}

function forbiddenQueryKeys(url) {
  return [...url.searchParams.keys()].filter((key) => FORBIDDEN_QUERY_KEYS.has(key.toLowerCase()));
}

function isNoStore(headers) {
  return /(?:^|,)\s*no-store(?:\s|,|$)/i.test(headers.get('cache-control') || '');
}

function hasNoReferrer(headers) {
  return (headers.get('referrer-policy') || '').toLowerCase() === 'no-referrer';
}

function getSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const combined = headers.get('set-cookie');
  return combined ? [combined] : [];
}

export function validateAuthorizationRedirect(location, registration, headers = new Headers()) {
  const issues = [];
  let target;
  try {
    target = new URL(location);
  } catch {
    return ['Location is not an absolute URL'];
  }

  if (target.origin !== AUTH_ORIGIN || target.pathname !== '/login') {
    issues.push('redirect must target the canonical auth /login endpoint');
  }
  const expected = {
    client_id: registration.clientId,
    redirect_uri: registration.exactRedirectUris[0],
    code_challenge_method: 'S256',
  };
  for (const [name, value] of Object.entries(expected)) {
    if (target.searchParams.get(name) !== value) issues.push(`${name} does not match the registry`);
  }
  if (!/^[A-Za-z0-9_-]{40,}$/.test(target.searchParams.get('state') || '')) {
    issues.push('state is missing or too short');
  }
  if (!/^[A-Za-z0-9_-]{40,}$/.test(target.searchParams.get('nonce') || '')) {
    issues.push('nonce is missing or too short');
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(target.searchParams.get('code_challenge') || '')) {
    issues.push('PKCE S256 challenge is missing or malformed');
  }
  const forbidden = forbiddenQueryKeys(target);
  if (forbidden.length) issues.push(`credential query keys are forbidden: ${forbidden.join(', ')}`);

  const next = target.searchParams.get('next');
  try {
    if (!next || new URL(next).origin !== new URL(registration.productionBaseUrl).origin) {
      issues.push('next must remain on the originating registered host');
    }
  } catch {
    issues.push('next is missing or malformed');
  }

  if (!isNoStore(headers)) issues.push('Cache-Control must include no-store');
  if (!hasNoReferrer(headers)) issues.push('Referrer-Policy must equal no-referrer');
  const cookies = getSetCookieHeaders(headers);
  if (cookies.some((cookie) => /(?:^|;)\s*Domain=/i.test(cookie))) {
    issues.push('transaction cookies must not set Domain');
  }
  for (const cookieName of TRANSACTION_COOKIE_NAMES) {
    const cookie = cookies.find((candidate) => candidate.startsWith(`${cookieName}=`));
    if (!cookie) {
      issues.push(`${cookieName} cookie is missing`);
      continue;
    }
    if (!/;\s*HttpOnly/i.test(cookie)) issues.push(`${cookieName} must be HttpOnly`);
    if (!/;\s*Secure/i.test(cookie)) issues.push(`${cookieName} must be Secure`);
    if (!/;\s*SameSite=Lax/i.test(cookie)) issues.push(`${cookieName} must use SameSite=Lax`);
    if (!/;\s*Path=\//i.test(cookie)) issues.push(`${cookieName} must use Path=/`);
  }
  return issues;
}

export function validateDiagnostics(payload, expectedHost, expectedRole) {
  const issues = [];
  if (payload?.ok !== true) issues.push('diagnostics ok must be true');
  if (payload?.environment !== 'production') issues.push('environment must be production');
  if (payload?.host?.normalized !== expectedHost) issues.push('normalized host does not match');
  if (payload?.hostRole !== expectedRole) issues.push('host role does not match');
  if (payload?.publicOrigin !== `https://${expectedHost}`) issues.push('public origin does not match');
  if (payload?.cookieDomainMode !== 'host-only' || payload?.cookieDomain !== null) {
    issues.push('cookie domain mode must be host-only');
  }
  return issues;
}

export function validateReleaseIdentity(payload, expectedCommit) {
  const issues = [];
  if (payload?.status !== 'identified') issues.push('release status must be identified');
  if (!COMMIT_PATTERN.test(payload?.commit || '')) issues.push('release commit is invalid');
  if (!BUILD_ID_PATTERN.test(payload?.buildId || '')) issues.push('release build ID is invalid');
  if (!SHA256_PATTERN.test(payload?.lockfileSha256 || '')) issues.push('release lockfile hash is invalid');
  if (!Number.isFinite(Date.parse(payload?.builtAt || ''))) issues.push('release build timestamp is invalid');
  if (!Number.isFinite(Date.parse(payload?.deployedAt || ''))) issues.push('release deployment timestamp is invalid');
  if (expectedCommit && payload?.commit !== expectedCommit) {
    issues.push(`release commit ${payload?.commit ?? '<missing>'} does not match expected ${expectedCommit}`);
  }
  if (
    payload?.databaseRelease?.contractVersion !== 1
    || payload?.databaseRelease?.releaseVersion !== 39
    || payload?.databaseRelease?.stepCount !== 39
    || payload?.databaseRelease?.lastStep !== 'torqueshed_native_tables'
  ) {
    issues.push('database release identity does not match version 39');
  }
  return issues;
}

async function request(fetchImpl, url, options = {}) {
  return fetchImpl(url, {
    redirect: 'manual',
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
    ...options,
  });
}

async function jsonOrNull(response) {
  try { return await response.json(); } catch { return null; }
}

async function runCheck(results, name, operation) {
  try {
    const message = await operation();
    results.push(success(name, message));
  } catch (error) {
    results.push(failure(name, error instanceof Error ? error.message : String(error)));
  }
}

function requireStatus(response, expected, label) {
  if (!expected.includes(response.status)) {
    throw new Error(`${label} returned HTTP ${response.status}; expected ${expected.join('/')}`);
  }
}

function requireSecurityHeaders(response, label) {
  if (!isNoStore(response.headers)) throw new Error(`${label} is missing Cache-Control: no-store`);
  if (!hasNoReferrer(response.headers)) throw new Error(`${label} is missing Referrer-Policy: no-referrer`);
}

export async function loadRegistry(path = DEFAULT_REGISTRY_PATH) {
  const parsed = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('module registry must be an array');
  return parsed;
}

export async function verifyProductionRuntime({ fetchImpl = fetch, registry, expectedCommit } = {}) {
  const registrations = registry ?? await loadRegistry();
  if (expectedCommit && !COMMIT_PATTERN.test(expectedCommit)) {
    throw new Error('expected release commit must be a full lowercase Git SHA');
  }
  const platform = registrations.find((entry) => entry.moduleId === 'operatoros');
  const modules = registrations.filter((entry) => entry.moduleId !== 'operatoros');
  if (!platform || modules.length !== 13) {
    throw new Error('canonical registry must contain OperatorOS plus exactly 13 modules');
  }

  const results = [];
  let healthRelease = null;
  await runCheck(results, 'platform root health', async () => {
    // Replit's Google front end reserves `/healthz` and returns its own 404
    // before the application. `/api/health` traverses the public root-host
    // proxy to the same Fastify health snapshot without bypassing the deployed
    // topology.
    const response = await request(fetchImpl, 'https://operatoros.net/api/health');
    requireStatus(response, [200], 'root health');
    const body = await jsonOrNull(response);
    if (body?.status !== 'healthy' || body?.service !== 'operatoros-api') {
      throw new Error('root health did not return the OperatorOS API snapshot');
    }
    const issues = validateReleaseIdentity(body.release, expectedCommit);
    if (issues.length) throw new Error(issues.join('; '));
    healthRelease = body.release;
    return `healthy ${body.release.commit.slice(0, 12)} build ${body.release.buildId}`;
  });
  await runCheck(results, 'platform API readiness', async () => {
    const response = await request(fetchImpl, 'https://api.operatoros.net/readyz');
    requireStatus(response, [200], 'API readiness');
    const body = await jsonOrNull(response);
    if (
      body?.ready !== true ||
      body?.checks?.ssoCodeEncryption !== 'configured' ||
      body?.checks?.releaseIdentity !== 'configured'
    ) {
      throw new Error('API readiness did not confirm SSO encryption and release identity');
    }
    const issues = validateReleaseIdentity(body?.release, expectedCommit);
    if (issues.length) throw new Error(issues.join('; '));
    if (!healthRelease || JSON.stringify(body.release) !== JSON.stringify(healthRelease)) {
      throw new Error('health and readiness did not expose one authoritative release identity');
    }
    return `ready ${body.release.commit.slice(0, 12)} build ${body.release.buildId} db v${body.release.databaseRelease.releaseVersion}`;
  });
  await runCheck(results, 'auth response headers', async () => {
    const response = await request(fetchImpl, 'https://auth.operatoros.net/login');
    requireStatus(response, [200], 'auth login');
    requireSecurityHeaders(response, 'auth login');
    return 'no-store/no-referrer';
  });

  const diagnosticHosts = [
    { name: 'operatoros-root', origin: 'https://operatoros.net', role: 'root' },
    { name: 'operatoros-app', origin: 'https://app.operatoros.net', role: 'app' },
    { name: 'operatoros-auth', origin: 'https://auth.operatoros.net', role: 'auth' },
    { name: 'operatoros-api', origin: 'https://api.operatoros.net', role: 'api' },
    ...modules.map((entry) => ({ name: entry.slug, origin: entry.productionBaseUrl, role: 'module' })),
  ];
  for (const entry of diagnosticHosts) {
    const host = new URL(entry.origin).hostname;
    await runCheck(results, `${entry.name} diagnostics`, async () => {
      const response = await request(fetchImpl, `${entry.origin}/api/diagnostics/public-url`);
      requireStatus(response, [200], `${entry.name} diagnostics`);
      const issues = validateDiagnostics(await jsonOrNull(response), host, entry.role);
      if (issues.length) throw new Error(issues.join('; '));
      return `${host} ${entry.role}`;
    });
  }

  const launchRegistrations = [
    { ...platform, productionBaseUrl: 'https://operatoros.net', exactRedirectUris: ['https://operatoros.net/sso'] },
    { ...platform, slug: 'operatoros-app', productionBaseUrl: 'https://app.operatoros.net', exactRedirectUris: ['https://app.operatoros.net/sso'] },
    ...modules.filter((entry) => entry.enabled),
  ];
  for (const entry of launchRegistrations) {
    const launchUrl = entry.slug === 'operatoros'
      ? 'https://operatoros.net/login'
      : entry.productionBaseUrl;
    await runCheck(results, `${entry.slug} anonymous authorization`, async () => {
      const response = await request(fetchImpl, launchUrl);
      requireStatus(response, [302, 303, 307, 308], `${entry.slug} anonymous authorization`);
      const issues = validateAuthorizationRedirect(response.headers.get('location') || '', entry, response.headers);
      if (issues.length) throw new Error(issues.join('; '));
      return 'PKCE redirect valid';
    });
  }

  for (const entry of modules.filter((candidate) => candidate.enabled)) {
    await runCheck(results, `${entry.slug} callback route`, async () => {
      const response = await request(fetchImpl, `${entry.exactRedirectUris[0]}?code=probe&state=probe`);
      if (response.status === 404) throw new Error('registered callback returned HTTP 404');
      requireSecurityHeaders(response, `${entry.slug} callback`);
      return `reachable (HTTP ${response.status})`;
    });
  }

  const outcall = modules.find((entry) => entry.slug === 'outcall');
  await runCheck(results, 'outcall active registry', async () => {
    if (!outcall || outcall.enabled !== true || outcall.status !== 'active') {
      throw new Error('OutCall must be active in the production registry');
    }
    return 'active';
  });

  const passed = results.filter((result) => result.ok).length;
  return { ok: passed === results.length, passed, failed: results.length - passed, total: results.length, results };
}

export function formatVerificationReport(report) {
  const lines = ['OperatorOS production runtime verification'];
  for (const result of report.results) {
    lines.push(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}: ${result.message}`);
  }
  lines.push(`${report.ok ? 'PASS' : 'FAIL'} total: ${report.passed}/${report.total} passed`);
  return lines.join('\n');
}

async function main() {
  const expectedCommit = process.env.OPERATOROS_EXPECTED_RELEASE_COMMIT?.trim().toLowerCase();
  const report = await verifyProductionRuntime({ expectedCommit });
  console.log(formatVerificationReport(report));
  process.exitCode = report.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(`Production verification failed to run: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 2;
  });
}
