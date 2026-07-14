import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { evaluateProductionEnvironment } from './production-env-preflight.mjs';

const DEFAULT_API_PORT = 5001;
const DEFAULT_PUBLIC_PORT = 5000;
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
  const startupTimeoutMs = parseInteger(
    env.STARTUP_TIMEOUT_MS,
    DEFAULT_STARTUP_TIMEOUT_MS,
    'STARTUP_TIMEOUT_MS',
    { min: 5_000, max: 600_000 },
  );
  if (apiPort === publicPort) throw new Error('API_PORT and PORT must be different');
  return {
    apiPort,
    publicPort,
    startupTimeoutMs,
    apiReadyUrl: `http://127.0.0.1:${apiPort}/readyz`,
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

function spawnPnpm(args, env) {
  const windowsCorepack = join(dirname(process.execPath), 'node_modules', 'corepack', 'dist', 'corepack.js');
  const command = process.platform === 'win32' ? process.execPath : 'corepack';
  const commandArgs = process.platform === 'win32'
    ? [windowsCorepack, 'pnpm', ...args]
    : ['pnpm', ...args];
  return spawn(command, commandArgs, {
    cwd: process.cwd(),
    env,
    shell: false,
    stdio: 'inherit',
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

export async function startUnifiedRuntime(env = process.env) {
  validateDeploymentEnvironment(env);
  const config = resolveRuntimeConfig(env);
  const children = new Set();
  let shuttingDown = false;

  const stopChildren = (signal = 'SIGTERM') => {
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

  const api = spawnPnpm(
    ['--dir', 'apps/api', 'exec', 'tsx', 'src/index.ts'],
    { ...env, PORT: String(config.apiPort) },
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
  console.info(`[runtime] Fastify ready; starting Next on public port ${config.publicPort}`);
  const web = spawnPnpm(
    ['--dir', 'apps/web', 'exec', 'next', 'start', '-p', String(config.publicPort)],
    { ...env, PORT: String(config.publicPort), INTERNAL_API_URL: config.internalApiUrl },
  );
  children.add(web);
  web.once('error', (error) => shutdown(1, `Next spawn failed: ${error.message}`));
  web.once('exit', (code, signal) => {
    children.delete(web);
    if (!shuttingDown) shutdown(code ?? 1, `Next exited (${signal ?? code ?? 'unknown'})`);
  });
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('start-unified-runtime.mjs')) {
  startUnifiedRuntime().catch((error) => {
    console.error('[runtime] fatal startup error:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
