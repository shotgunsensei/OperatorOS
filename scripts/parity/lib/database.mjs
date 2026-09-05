const DISPOSABLE_NAME = /(?:^|[_-])(?:test|phase21|ci|disposable)(?:[_-]|$)/iu;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const LOCAL_BROWSER_OVERRIDE_NAMES = [
  'APP_BASE_URL',
  'APP_URL',
  'BRAND_E2E_BASE_URL',
  'BRANDFORGEOS_URL',
  'CALLCOMMAND_AI_URL',
  'DEPLOY_OPS_URL',
  'E2E_APP_URL',
  'E2E_BRANDFORGEOS_URL',
  'E2E_MESSENGER_ROOT_URL',
  'E2E_SNAPPROOFOS_URL',
  'E2E_STUDYFORGE_URL',
  'E2E_TORQUESHED_URL',
  'E2E_WEB_BASE_URL',
  'FAULTLINELAB_URL',
  'HELP_CENTER_E2E_URL',
  'INVITE_ACCEPT_BASE_URL',
  'NINJA_LAUNCH_KIT_URL',
  'NINJA_POOL_HALL_URL',
  'NINJAMATION_URL',
  'OPERATOR_POOL_HALL_URL',
  'OPERATOROS_APPS_URL',
  'OPERATOROS_BASE_URL',
  'OUTCALL_URL',
  'PULSEDESK_URL',
  'SCRIPT_OPS_URL',
  'SNAPPROOFOS_URL',
  'STUDYFORGE_AI_URL',
  'TECHDECK_URL',
  'TORQUESHED_URL',
  'TRADEFLOWKIT_URL',
  'WEB_BASE_URL',
];
const EXTERNAL_PROVIDER_ENV_PREFIXES = [
  'MAILGUN_',
  'OPENAI_',
  'POSTMARK_',
  'RESEND_',
  'SENDGRID_',
  'SMTP_',
  'STRIPE_',
  'TRADEFLOWKIT_STRIPE_CONNECT_',
  'TWILIO_',
];
const EXTERNAL_PROVIDER_ENV_NAMES = new Set([
  'ALL_PROXY',
  'APP_URL',
  'BILLING_RECONCILIATION_APPLY_CONFIRM',
  'BILLING_RECONCILIATION_LIVE_APPLY',
  'CALLCOMMAND_REALTIME_MODEL',
  'CALLCOMMAND_SIP_ROUTE_SECRET',
  'EMAIL_FROM',
  'GH_TOKEN',
  'GITHUB_PERSONAL_ACCESS_TOKEN',
  'GITHUB_TOKEN',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'INVITE_FROM_EMAIL',
  'NEXT_PUBLIC_API_URL',
  'OPERATOROS_SERVICE_TOKEN',
  'OUTCALL_LIVE_PROVIDER',
  'OUTCALL_PUBLIC_URL',
  'OUTCALL_TEST_ADAPTER',
  'NO_PROXY',
  'REPLIT_CONNECTORS_HOSTNAME',
  'REPL_IDENTITY',
  'TRADEFLOWKIT_OPERATOROS_SERVICE_TOKEN',
  'TRADEFLOWKIT_PAYMENT_PROVIDER',
  'TRADEFLOWKIT_PUBLIC_BASE_URL',
  'WEB_REPL_RENEWAL',
]);

/**
 * A local production-artifact run inherits developer/CI process state for PATH
 * and tool discovery, but it must never inherit credentials or activation
 * switches for a cost-bearing/external provider. Return a copy so the caller's
 * shell is never mutated.
 */
export function stripExternalProviderEnvironment(environment = process.env) {
  const isolated = { ...environment };
  for (const name of Object.keys(isolated)) {
    const normalizedName = name.toUpperCase();
    if (
      EXTERNAL_PROVIDER_ENV_NAMES.has(normalizedName)
      || EXTERNAL_PROVIDER_ENV_PREFIXES.some((prefix) => normalizedName.startsWith(prefix))
    ) {
      delete isolated[name];
    }
  }
  return isolated;
}

export function assertDisposableDatabaseEnvironment(environment = process.env) {
  if (environment.PARITY_DATABASE_IS_DISPOSABLE !== '1') {
    throw new Error('PARITY_DATABASE_IS_DISPOSABLE=1 is required');
  }
  if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const parsed = new URL(environment.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Disposable database URL must use PostgreSQL');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('Disposable database URL must not include query or fragment overrides');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing non-loopback disposable database host: ${parsed.hostname}`);
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//u, ''));
  if (!database || !DISPOSABLE_NAME.test(database)) {
    throw new Error('Disposable database name must contain a delimited test, phase21, ci, or disposable marker');
  }
  return { url: parsed.toString(), host: parsed.hostname, database };
}

function assertLoopbackBrowserTarget(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS`);
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing non-loopback ${label}: ${parsed.hostname}`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error(`${label} must be an origin-only URL without credentials, query, or fragment`);
  }
  return parsed.origin;
}

function assertLoopbackHost(value, label) {
  const host = String(value).trim().toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(`Refusing non-loopback ${label}: ${host || '(empty)'}`);
  }
  return host;
}

function assertLocalOrMappedBrowserTarget(value, label, exactHosts) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${label} must use HTTP or HTTPS`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error(`${label} must be an origin-only URL without credentials, query, or fragment`);
  }
  const mappedOperatorHost = exactHosts
    && parsed.protocol === 'https:'
    && !parsed.port
    && (parsed.hostname === 'operatoros.net' || parsed.hostname.endsWith('.operatoros.net'));
  if (!LOOPBACK_HOSTS.has(parsed.hostname) && !mappedOperatorHost) {
    throw new Error(`Refusing unmapped ${label}: ${parsed.hostname}`);
  }
  return parsed.origin;
}

/** Validate the standalone exact-host proxy without granting database access. */
export function assertLocalProxyEnvironment(environment = process.env) {
  const targetUrl = assertLoopbackBrowserTarget(
    environment.E2E_PROXY_TARGET ?? 'http://127.0.0.1:5000',
    'E2E_PROXY_TARGET',
  );
  if (!targetUrl.startsWith('http:')) {
    throw new Error('E2E_PROXY_TARGET must use HTTP for the local runtime proxy');
  }
  const host = assertLoopbackHost(
    environment.E2E_PROXY_HOST ?? '127.0.0.1',
    'E2E_PROXY_HOST',
  );
  const rawPort = String(environment.E2E_PROXY_PORT ?? '443');
  if (!/^\d+$/u.test(rawPort)) throw new Error('E2E_PROXY_PORT must be an integer from 1 through 65535');
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('E2E_PROXY_PORT must be an integer from 1 through 65535');
  }
  return { targetUrl, host, port };
}

/**
 * Browser acceptance is permitted to use production hostnames only when
 * Playwright's exact-host mode maps them to the local TLS proxy. The API, web
 * runtime, and disposable PostgreSQL target must always remain loopback.
 */
export function assertLocalBrowserTestEnvironment(
  environment = process.env,
  { requireExactHosts = false } = {},
) {
  const database = assertDisposableDatabaseEnvironment(environment);
  const apiUrl = assertLoopbackBrowserTarget(
    environment.E2E_API_URL ?? 'http://127.0.0.1:5001',
    'E2E_API_URL',
  );
  const webUrl = assertLoopbackBrowserTarget(
    environment.E2E_WEB_URL ?? 'http://127.0.0.1:5000',
    'E2E_WEB_URL',
  );
  const internalApiUrls = {};
  for (const name of ['INTERNAL_API_URL', 'NEXT_PUBLIC_API_URL']) {
    if (!environment[name]) continue;
    internalApiUrls[name] = assertLoopbackBrowserTarget(environment[name], name);
  }
  const proxy = assertLocalProxyEnvironment({
    ...environment,
    E2E_PROXY_TARGET: environment.E2E_PROXY_TARGET ?? webUrl,
  });
  const exactHosts = environment.E2E_PRODUCTION_HOSTS === '1';
  if (requireExactHosts && !exactHosts) {
    throw new Error('E2E_PRODUCTION_HOSTS=1 is required for exact-host browser acceptance');
  }
  if (exactHosts && proxy.targetUrl !== webUrl) {
    throw new Error('Exact-host E2E_PROXY_TARGET must match E2E_WEB_URL');
  }
  const overrideUrls = {};
  for (const name of LOCAL_BROWSER_OVERRIDE_NAMES) {
    if (!environment[name]) continue;
    overrideUrls[name] = assertLocalOrMappedBrowserTarget(environment[name], name, exactHosts);
  }

  let rootUrl = webUrl;
  if (exactHosts) {
    const parsedRoot = new URL(environment.E2E_ROOT_URL ?? 'https://operatoros.net');
    if (
      parsedRoot.origin !== 'https://operatoros.net'
      || parsedRoot.pathname !== '/'
      || parsedRoot.search
      || parsedRoot.hash
      || parsedRoot.username
      || parsedRoot.password
    ) {
      throw new Error('Exact-host E2E_ROOT_URL must be the canonical https://operatoros.net origin');
    }
    rootUrl = parsedRoot.origin;
  } else if (environment.E2E_ROOT_URL) {
    rootUrl = assertLoopbackBrowserTarget(environment.E2E_ROOT_URL, 'E2E_ROOT_URL');
  }

  return {
    database,
    apiUrl,
    webUrl,
    proxyTargetUrl: proxy.targetUrl,
    proxyHost: proxy.host,
    rootUrl,
    exactHosts,
    overrideUrls,
    internalApiUrls,
  };
}

/**
 * The Phase 17 deployed gate is selected only by its dedicated Playwright
 * config and may address only the canonical production origin. It never
 * receives a disposable database connection or the local hostname resolver.
 */
export function assertDeployedBrowserTestEnvironment(environment = process.env) {
  if (environment.E2E_PRODUCTION_HOSTS === '1') {
    throw new Error('Deployed acceptance must not enable the local exact-host resolver');
  }
  const parsedRoot = new URL(environment.E2E_ROOT_URL ?? 'https://operatoros.net');
  if (
    parsedRoot.origin !== 'https://operatoros.net'
    || parsedRoot.pathname !== '/'
    || parsedRoot.search
    || parsedRoot.hash
    || parsedRoot.username
    || parsedRoot.password
  ) {
    throw new Error('Deployed E2E_ROOT_URL must be the canonical https://operatoros.net origin');
  }
  return { rootUrl: parsedRoot.origin };
}

function quotePostgresIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

/**
 * Reset a disposable public schema without asking PostgreSQL to lock the whole
 * release graph in one transaction. The release currently owns hundreds of
 * related objects, which can exceed a stock server's
 * max_locks_per_transaction during one DROP SCHEMA ... CASCADE statement.
 */
export async function resetDisposablePublicSchema(client) {
  const dropped = { foreignKeys: 0, views: 0, tables: 0, sequences: 0, foreignTables: 0 };
  const qualified = (row) => `${quotePostgresIdentifier(row.schema_name)}.${quotePostgresIdentifier(row.object_name)}`;

  const foreignKeys = await client.query(`
    SELECT namespace.nspname AS schema_name,
           relation.relname AS object_name,
           constraint_record.conname AS constraint_name
      FROM pg_constraint constraint_record
      JOIN pg_class relation ON relation.oid = constraint_record.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND constraint_record.contype = 'f'
     ORDER BY relation.relname, constraint_record.conname
  `);
  for (const row of foreignKeys.rows) {
    await client.query(`ALTER TABLE IF EXISTS ${qualified(row)} DROP CONSTRAINT IF EXISTS ${quotePostgresIdentifier(row.constraint_name)}`);
    dropped.foreignKeys += 1;
  }

  const relations = await client.query(`
    SELECT namespace.nspname AS schema_name,
           relation.relname AS object_name,
           relation.relkind AS object_kind
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
     WHERE namespace.nspname = 'public'
       AND relation.relkind IN ('m', 'v', 'p', 'r', 'S', 'f')
     ORDER BY CASE relation.relkind
       WHEN 'm' THEN 1 WHEN 'v' THEN 2 WHEN 'p' THEN 3
       WHEN 'r' THEN 4 WHEN 'S' THEN 5 ELSE 6 END,
       relation.relname
  `);
  for (const row of relations.rows) {
    const statement = row.object_kind === 'm'
      ? 'DROP MATERIALIZED VIEW IF EXISTS'
      : row.object_kind === 'v'
        ? 'DROP VIEW IF EXISTS'
        : row.object_kind === 'S'
          ? 'DROP SEQUENCE IF EXISTS'
          : row.object_kind === 'f'
            ? 'DROP FOREIGN TABLE IF EXISTS'
            : 'DROP TABLE IF EXISTS';
    await client.query(`${statement} ${qualified(row)} CASCADE`);
    if (row.object_kind === 'm' || row.object_kind === 'v') dropped.views += 1;
    else if (row.object_kind === 'S') dropped.sequences += 1;
    else if (row.object_kind === 'f') dropped.foreignTables += 1;
    else dropped.tables += 1;
  }

  // Table and view dependency locks have already been released by the bounded
  // autocommit statements above. This final step removes only residual public
  // schema objects (for example enum types or routines) and restores the schema.
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  return dropped;
}
