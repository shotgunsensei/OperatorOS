import { spawn } from 'node:child_process';
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
    nextReadyUrl: `http://127.0.0.1:${nextPort}/healthz`,
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
  const pathname = new URL(request.url || '/', 'http://operatoros.invalid').pathname;
  const homepageProbe = (method === 'GET' || method === 'HEAD') && pathname === '/';
  const statusCode = homepageProbe ? 200 : 503;
  const body = homepageProbe
    ? '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OperatorOS is starting</title></head><body><main><h1>OperatorOS is starting</h1><p>The secure workspace is completing its readiness checks. Retry in a few seconds.</p></main></body></html>'
    : JSON.stringify({ status: 'starting', ready: false, code: 'RUNTIME_STARTING' });
  response.writeHead(statusCode, {
    'cache-control': 'no-store, max-age=0',
    'content-length': Buffer.byteLength(body),
    'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    'content-type': homepageProbe ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'retry-after': '3',
    'x-content-type-options': 'nosniff',
    'x-operatoros-runtime-state': 'starting',
    'x-robots-tag': 'noindex, nofollow',
  });
  response.end(method === 'HEAD' ? undefined : body);
}

export function createPublicGateway({ apiPort, nextPort }, { isReady = () => true } = {}) {
  const server = http.createServer((request, response) => {
    if (!isReady()) {
      writeBootstrapResponse(request, response);
      return;
    }
    const upstream = http.request({
      hostname: '127.0.0.1',
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
      hostname: '127.0.0.1',
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
  const runtimeEnv = { ...env, INTERNAL_API_URL: env.INTERNAL_API_URL ?? config.internalApiUrl };
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

  publicGateway = createPublicGateway(config, { isReady: () => runtimeReady });
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

  const databaseRelease = spawnNode(
    entrypoints.databaseReleaseEntry,
    ['--apply'],
    runtimeEnv,
    process.cwd(),
    ['--conditions=production'],
  );
  children.add(databaseRelease);
  try {
    console.info('[runtime] applying the idempotent OperatorOS database release');
    await waitForSuccessfulExit(databaseRelease, 'Database release');
    children.delete(databaseRelease);
  } catch (error) {
    children.delete(databaseRelease);
    shutdown(1, error instanceof Error ? error.message : 'Database release failed');
    return;
  }

  const api = spawnNode(
    entrypoints.apiEntry,
    [],
    {
      ...runtimeEnv,
      PORT: String(config.apiPort),
      OPERATOROS_DATABASE_RELEASE_APPLIED: '1',
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
    console.info(`[runtime] waiting for Fastify readiness on ${config.apiReadyUrl}`);
    await waitForApiReady(api, config.apiReadyUrl, config.startupTimeoutMs);
  } catch (error) {
    shutdown(1, error instanceof Error ? error.message : 'Fastify readiness failed');
    return;
  }

  if (shuttingDown) return;
  console.info(`[runtime] Fastify ready; starting Next on private port ${config.nextPort}`);
  const web = spawnNode(
    entrypoints.nextCli,
    ['start', '-p', String(config.nextPort)],
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
    await waitForHttpReady(web, config.nextReadyUrl, config.startupTimeoutMs);
    runtimeReady = true;
    console.info(`[runtime] Next ready; public HTTP/WebSocket gateway on port ${config.publicPort} is accepting application traffic`);
  } catch (error) {
    shutdown(1, error instanceof Error ? error.message : 'Public gateway startup failed');
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('start-unified-runtime.mjs')) {
  startUnifiedRuntime().catch((error) => {
    console.error('[runtime] fatal startup error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
