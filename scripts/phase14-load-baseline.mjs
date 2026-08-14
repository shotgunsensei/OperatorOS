import { performance } from 'node:perf_hooks';

const baseUrl = new URL(process.env.PHASE14_LOAD_BASE_URL || 'http://127.0.0.1:5001');
const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!allowedHosts.has(baseUrl.hostname)) {
  throw new Error('Phase 14 load testing is loopback-only; remote and production hosts are refused');
}

const requestCount = boundedInteger('PHASE14_LOAD_REQUESTS', 100, 10, 2_000);
const concurrency = boundedInteger('PHASE14_LOAD_CONCURRENCY', 10, 1, 50);
const p95LimitMs = boundedInteger('PHASE14_LOAD_P95_LIMIT_MS', 750, 50, 30_000);
const bootstrap = process.env.PHASE14_LOAD_BOOTSTRAP_TEST_USER === '1';
const authHost = process.env.PHASE14_LOAD_AUTH_HOST?.trim() || 'auth.operatoros.net';
if (!/^[a-z0-9.-]+$/i.test(authHost)) {
  throw new Error('PHASE14_LOAD_AUTH_HOST must be a hostname without a scheme, port, or path');
}
const authHeaders = {
  host: authHost,
  'x-forwarded-host': authHost,
  'x-forwarded-proto': 'https',
};

function boundedInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer`);
  const value = Number(raw);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

async function request(path, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(new URL(path, baseUrl), {
      ...init,
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function sessionCookie() {
  let email = process.env.PHASE14_LOAD_EMAIL?.trim();
  let password = process.env.PHASE14_LOAD_PASSWORD;
  if (bootstrap) {
    email = `phase14-load-${Date.now()}@operatoros.test`;
    password = `Phase14!${crypto.randomUUID()}Aa1`;
    const register = await request('/v1/auth/register', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email, password, name: 'Phase 14 Load User' }),
    });
    if (register.status !== 202) {
      throw new Error(`Test-user bootstrap failed with HTTP ${register.status}`);
    }
  }
  if (!email || !password) return null;

  const login = await request('/v1/auth/login', {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email, password }),
  });
  if (login.status !== 200) throw new Error(`Load-test login failed with HTTP ${login.status}`);
  const setCookie = login.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';', 1)[0];
  if (!/^operatoros_session=/.test(cookie)) {
    throw new Error('Load-test login did not issue the OperatorOS host session');
  }
  return cookie;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] || 0;
}

async function runScenario(scenario) {
  const durations = [];
  const statuses = new Map();
  let failures = 0;
  let cursor = 0;
  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= requestCount) return;
      const started = performance.now();
      try {
        const response = await request(scenario.path, scenario.init(index));
        durations.push(performance.now() - started);
        statuses.set(response.status, (statuses.get(response.status) || 0) + 1);
        if (!scenario.expectedStatuses.has(response.status)) failures += 1;
        await response.arrayBuffer();
      } catch {
        durations.push(performance.now() - started);
        failures += 1;
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  const result = {
    scenario: scenario.name,
    requests: requestCount,
    concurrency,
    failures,
    statuses: Object.fromEntries([...statuses].sort(([a], [b]) => a - b)),
    p50Ms: Number(percentile(durations, 0.5).toFixed(2)),
    p95Ms: Number(percentile(durations, 0.95).toFixed(2)),
    p99Ms: Number(percentile(durations, 0.99).toFixed(2)),
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (failures || result.p95Ms > p95LimitMs) process.exitCode = 1;
}

const cookie = await sessionCookie();
const scenarios = [
  {
    name: 'liveness',
    path: '/healthz',
    expectedStatuses: new Set([200]),
    init: () => ({}),
  },
  {
    name: 'readiness',
    path: '/readyz',
    expectedStatuses: new Set([200]),
    init: () => ({}),
  },
  {
    name: 'stripe-webhook-signature-boundary',
    path: '/v1/billing/webhook',
    expectedStatuses: new Set([400, 503]),
    init: () => ({
      method: 'POST',
      headers: { 'stripe-signature': 'phase14-invalid-signature' },
      body: '{}',
    }),
  },
];

if (cookie) {
  scenarios.push(
    {
      name: 'authenticated-session',
      path: '/v1/auth/me',
      expectedStatuses: new Set([200]),
      init: () => ({ headers: { cookie } }),
    },
    {
      name: 'entitled-launcher',
      path: '/v1/me/modules',
      expectedStatuses: new Set([200]),
      init: () => ({ headers: { cookie } }),
    },
    {
      name: 'upload-authorization-and-validation-boundary',
      path: '/v1/modules/tradeflowkit/jobs/00000000-0000-0000-0000-000000000000/attachments',
      expectedStatuses: new Set([403, 404]),
      init: (index) => ({
        method: 'POST',
        headers: { cookie, 'idempotency-key': `phase14-load-${index}-${crypto.randomUUID()}` },
        body: JSON.stringify({
          originalName: 'phase14.txt',
          mimeType: 'text/plain',
          contentBase64: 'cGhhc2UxNA==',
        }),
      }),
    },
  );
}

for (const scenario of scenarios) await runScenario(scenario);

if (!cookie) {
  process.stderr.write(
    'Authenticated and upload scenarios were not run; set test credentials or PHASE14_LOAD_BOOTSTRAP_TEST_USER=1 on an isolated database.\n',
  );
}
