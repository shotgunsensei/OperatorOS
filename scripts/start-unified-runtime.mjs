import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { resolve } from 'node:path';
import { evaluateProductionEnvironment } from './production-env-preflight.mjs';

const DEFAULT_API_PORT = 5001;
const DEFAULT_PUBLIC_PORT = 5000;
const DEFAULT_NEXT_PORT = 5002;
const DEFAULT_STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const SHUTDOWN_GRACE_MS = 10_000;
export const INTERNAL_SERVICE_HOST = '127.0.0.1';
export const NEXT_INTERNAL_HOST = 'localhost';
const LOOPBACK_SERVICE_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function parseInteger(raw, fallback, name, { min, max }) {
  const value = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

export function resolveRuntimeConfig(env = process.env) {
  const apiPort = parseInteger(env.API_PORT, DEFAULT_API_PORT, 'API_PORT', { min: 1, max: 65_535 });
  const publicPort = parseInteger(env.PORT, DEFAULT_PUBLIC_PORT, 'PORT', { min: 1, max: 65_535 });
  const nextPort = parseInteger(env.NEXT_INTERNAL_PORT, DEFAULT_NEXT_PORT, 'NEXT_INTERNAL_PORT', { min: 1, max: 65_535 });
  const startupTimeoutMs = parseInteger(
    env.STARTUP_TIMEOUT_MS,
    DEFAULT_STARTUP_TIMEOUT_MS,
    'STARTUP_TIMEOUT_MS',
    { min: 5_000, max: 600_000 },
  );
  if (new Set([apiPort, publicPort, nextPort]).size !== 3) {
    throw new Error('API_PORT, PORT, and NEXT_INTERNAL_PORT must be different');
  }
  return {
    apiPort,
    publicPort,
    nextPort,
    startupTimeoutMs,
    apiReadyUrl: `http://127.0.0.1:${apiPort}/readyz`,
    nextReadyUrl: `http://${NEXT_INTERNAL_HOST}:${nextPort}/`,
    internalApiUrl: `http://localhost:${apiPort}`,
  };
}

export function validateDeploymentEnvironment(env = process.env) {
  const report = evaluateProductionEnvironment(env, ['core']);
  if (!report.ok) {
    const details = report.issues.map((issue) => `${issue.name} ${issue.message}`).join('; ');
    throw new Error(`Invalid production deployment environment: ${details}`);
  }
}

export function resolveRuntimeEntrypoints(cwd = process.cwd()) {
  return {
    databaseReleaseEntry: resolve(cwd, 'apps/api/dist/apps/api/src/scripts/database-release.js'),
    apiEntry: resolve(cwd, 'apps/api/dist/apps/api/src/index.js'),
    nextCli: resolve(cwd, 'apps/web/node_modules/next/dist/bin/next'),
  };
}

function spawnNode(entrypoint, args, env, cwd = process.cwd(), nodeArgs = []) {
  return spawn(process.execPath, [...nodeArgs, entrypoint, ...args], {
    cwd,
    env,
    shell: false,
    stdio: 'inherit',
  });
}

function waitForSuccessfulExit(child, label) {
  return new Promise((resolvePromise, reject) => {
    child.once('error', error => reject(new Error(`${label} spawn failed: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} exited (${signal ?? code ?? 'unknown'})`));
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForApiReady(child, readyUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'not reachable';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Fastify exited before readiness with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(readyUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(2_000),
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ready === true) return;
      lastStatus = `HTTP ${response.status}`;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : 'not reachable';
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Fastify did not become ready within ${timeoutMs}ms (${lastStatus})`);
}

async function waitForHttpReady(child, readyUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'not reachable';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next exited before readiness with code ${child.exitCode}`);
    try {
      const response = await fetch(readyUrl, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastStatus = `HTTP ${response.status}`;
    } catch (error) {
      lastStatus = error instanceof Error ? error.message : 'not reachable';
    }
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Next did not become ready within ${timeoutMs}ms (${lastStatus})`);
}

function upgradeResponse(socket, response, upstreamSocket, clientHead, upstreamHead) {
  const headers = Object.entries(response.headers).flatMap(([name, value]) => {
    if (value == null) return [];
    return Array.isArray(value) ? value.map((item) => `${name}: ${item}`) : [`${name}: ${value}`];
  });
  socket.write(
    `HTTP/1.1 ${response.statusCode || 101} ${response.statusMessage || 'Switching Protocols'}\r\n`
    + `${headers.join('\r\n')}\r\n\r\n`,
  );
  if (clientHead.length) upstreamSocket.write(clientHead);
  if (upstreamHead.length) socket.write(upstreamHead);
  socket.pipe(upstreamSocket).pipe(socket);
}

function writeBootstrapResponse(request, response) {
  const method = request.method?.toUpperCase() || 'GET';
  const acceptsHtml = String(request.headers.accept ?? '').toLowerCase().includes('text/html');
  const browserNavigation = (method === 'GET' || method === 'HEAD') && acceptsHtml;
  const nonce = randomBytes(18).toString('base64');
  const body = browserNavigation
    ? `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OperatorOS is starting</title><style nonce="${nonce}">:root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#05070b;color:#f6f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 25%,#32121a 0,#0c111a 42%,#05070b 76%)}main{width:min(92vw,620px);padding:42px;border:1px solid #51212d;border-radius:24px;background:rgba(10,14,22,.94);box-shadow:0 24px 80px rgba(0,0,0,.55)}.eyebrow{margin:0 0 12px;color:#ff657d;font-size:.76rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase}h1{margin:0;font-size:clamp(2rem,7vw,3.6rem);line-height:1.02}p{max-width:50ch;color:#b8c0cf;line-height:1.65}.status{display:flex;align-items:center;gap:12px;margin-top:28px;color:#eef2f8;font-weight:700}.pulse{width:12px;height:12px;border-radius:50%;background:#ff3858;box-shadow:0 0 0 0 rgba(255,56,88,.7);animation:pulse 1.5s infinite}@keyframes pulse{70%{box-shadow:0 0 0 13px rgba(255,56,88,0)}100%{box-shadow:0 0 0 0 rgba(255,56,88,0)}}small{display:block;margin-top:26px;color:#7f899a}</style><script nonce="${nonce}">(()=>{const originalUrl=window.location.href;let delay=1000;const retry=async()=>{const status=document.getElementById('startup-status');if(status)status.textContent='Checking secure services…';try{const response=await fetch('/readyz',{cache:'no-store',credentials:'same-origin',headers:{accept:'application/json'}});if(response.ok){window.location.replace(originalUrl);return}}catch{}delay=Math.min(Math.round(delay*1.6),5000);if(status)status.textContent='Still starting. Retrying automatically…';window.setTimeout(retry,delay)};window.setTimeout(retry,delay)})();</script><noscript><meta http-equiv="refresh" content="3"></noscript></head><body><main><p class="eyebrow">Shotgun Ninjas Productions</p><h1>OperatorOS is starting</h1><p>The secure workspace is completing its database and service-readiness checks. Keep this tab open—you will return to this exact page automatically.</p><div class="status" aria-live="polite"><span class="pulse" aria-hidden="true"></span><span id="startup-status">Checking secure services…</span></div><small>No action is required. Your path and query string are preserved.</small></main></body></html>`
    : JSON.stringify({ status: 'starting', ready: false, code: 'RUNTIME_STARTING' });
  response.writeHead(503, {
    'cache-control': 'no-store, max-age=0',
    'content-length': Buffer.byteLength(body),
    'content-security-policy': browserNavigation
      ? `default-src 'none'; connect-src 'self'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`
      : "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'content-type': browserNavigation ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'retry-after': '2',
    'x-content-type-options': 'nosniff',
    'x-operatoros-runtime-state': 'starting',
    'x-robots-tag': 'noindex, nofollow',
  });
  response.end(method === 'HEAD' ? undefined : body);
}

export function createPublicGateway(
  { apiPort, nextPort },
  { isReady = () => true, nextHost = INTERNAL_SERVICE_HOST } = {},
) {
  if (!LOOPBACK_SERVICE_HOSTS.has(nextHost)) {
    throw new Error('The internal Next host must remain loopback-only');
  }
  const server = http.createServer((request, response) => {
    if (!isReady()) {
      writeBootstrapResponse(request, response);
      return;
    }
    const upstream = http.request({
      hostname: nextHost,
      port: nextPort,
      method: request.method,
      path: request.url,
      headers: request.headers,
    }, (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    });
    upstream.on('error', (error) => {
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
      response.end(`OperatorOS web gateway could not reach Next: ${error.message}`);
    });
    request.pipe(upstream);
  });

  server.on('upgrade', (request, socket, head) => {
    if (!isReady()) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nRetry-After: 3\r\n\r\n');
      return;
    }
    const websocketPath = request.url?.startsWith('/ws/') === true;
    const upstream = http.request({
      hostname: websocketPath ? INTERNAL_SERVICE_HOST : nextHost,
      port: websocketPath ? apiPort : nextPort,
      method: request.method,
      path: websocketPath ? request.url.slice(3) : request.url,
      headers: request.headers,
    });
    upstream.on('upgrade', (response, upstreamSocket, upstreamHead) => {
      upgradeResponse(socket, response, upstreamSocket, head, upstreamHead);
    });
    upstream.on('response', (response) => {
      socket.end(`HTTP/1.1 ${response.statusCode || 502} ${response.statusMessage || 'Upgrade failed'}\r\nConnection: close\r\n\r\n`);
    });
    upstream.on('error', (error) => {
      socket.end(`HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${error.message}`);
    });
    upstream.end();
  });
  return server;
}

export async function startUnifiedRuntime(env = process.env) {
  const config = resolveRuntimeConfig(env);
  const runtimeEnv = {
    ...env,
    INTERNAL_API_URL: env.INTERNAL_API_URL ?? config.internalApiUrl,
    INTERNAL_SERVICE_HOST,
  };
  validateDeploymentEnvironment(runtimeEnv);
  const entrypoints = resolveRuntimeEntrypoints();
  for (const [name, path] of Object.entries(entrypoints)) {
    if (!existsSync(path)) throw new Error(`Missing production artifact ${name}: run the deployment build first`);
  }
  const children = new Set();
  let shuttingDown = false;
  let runtimeReady = false;
  let publicGateway;

  const stopChildren = (signal = 'SIGTERM') => {
    publicGateway?.close();
    for (const child of children) {
      if (child.exitCode === null && !child.killed) child.kill(signal);
    }
  };

  const shutdown = (code, reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[runtime] stopping unified deployment: ${reason}`);
    process.exitCode = code;
    stopChildren('SIGTERM');
    const force = setTimeout(() => stopChildren('SIGKILL'), SHUTDOWN_GRACE_MS);
    force.unref();
  };

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => shutdown(0, `received ${signal}`));
  }

  publicGateway = createPublicGateway(config, {
    isReady: () => runtimeReady,
    nextHost: NEXT_INTERNAL_HOST,
  });
  try {
    await new Promise((resolvePromise, reject) => {
      const handleListenError = (error) => reject(error);
      publicGateway.once('error', handleListenError);
      publicGateway.listen(config.publicPort, '0.0.0.0', () => {
        publicGateway.off('error', handleListenError);
        resolvePromise();
      });
    });
    publicGateway.on('error', (error) => shutdown(1, `Public gateway failed: ${error.message}`));
    console.info(`[runtime] bootstrap gateway listening on public port ${config.publicPort}; readiness remains closed`);
  } catch (error) {
    shutdown(1, error instanceof Error ? `Public gateway failed: ${error.message}` : 'Public gateway startup failed');
    return;
  }

  const databaseVerification = spawnNode(
    entrypoints.databaseReleaseEntry,
    ['--verify-current'],
    runtimeEnv,
    process.cwd(),
    ['--conditions=production'],
  );
  children.add(databaseVerification);

  console.info(`[runtime] starting Next on private port ${config.nextPort} while database readiness is verified`);
  const web = spawnNode(
    entrypoints.nextCli,
    ['start', '-p', String(config.nextPort), '-H', NEXT_INTERNAL_HOST],
    { ...runtimeEnv, PORT: String(config.nextPort), INTERNAL_API_URL: config.internalApiUrl },
    resolve(process.cwd(), 'apps/web'),
  );
  children.add(web);
  web.once('error', (error) => shutdown(1, `Next spawn failed: ${error.message}`));
  web.once('exit', (code, signal) => {
    children.delete(web);
    if (!shuttingDown) shutdown(code ?? 1, `Next exited (${signal ?? code ?? 'unknown'})`);
  });

  try {
    console.info('[runtime] verifying the approved database release and Next readiness in parallel');
    await Promise.all([
      waitForSuccessfulExit(databaseVerification, 'Database release verification'),
      waitForHttpReady(web, config.nextReadyUrl, config.startupTimeoutMs),
    ]);
    children.delete(databaseVerification);
  } catch (error) {
    if (databaseVerification.exitCode !== null) children.delete(databaseVerification);
    shutdown(1, error instanceof Error ? error.message : 'Database release verification failed');
    return;
  }
  if (shuttingDown) return;

  const api = spawnNode(
    entrypoints.apiEntry,
    [],
    {
      ...runtimeEnv,
      PORT: String(config.apiPort),
      OPERATOROS_DATABASE_RELEASE_VERIFIED: '1',
    },
    process.cwd(),
    ['--conditions=production'],
  );
  children.add(api);
  api.once('error', (error) => shutdown(1, `Fastify spawn failed: ${error.message}`));
  api.once('exit', (code, signal) => {
    children.delete(api);
    if (!shuttingDown) shutdown(code ?? 1, `Fastify exited (${signal ?? code ?? 'unknown'})`);
  });

  try {
    console.info('[runtime] waiting for Fastify readiness before accepting public traffic');
    await waitForApiReady(api, config.apiReadyUrl, config.startupTimeoutMs);
    if (shuttingDown) return;
    runtimeReady = true;
    console.info(`[runtime] Fastify and Next ready; public HTTP/WebSocket gateway on port ${config.publicPort} is accepting application traffic`);
  } catch (error) {
    shutdown(1, error instanceof Error ? error.message : 'Private service readiness failed');
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('start-unified-runtime.mjs')) {
  startUnifiedRuntime().catch((error) => {
    console.error('[runtime] fatal startup error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
