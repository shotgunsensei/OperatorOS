import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripExternalProviderEnvironment } from '../../../scripts/parity/lib/database.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function reserveLoopbackPort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return address.port;
}

for (const configuredHost of [undefined, 'localhost']) {
  test(`standalone runner serves loopback with execution disabled (${configuredHost ?? 'default'})`, { timeout: 20_000 }, async () => {
    const port = await reserveLoopbackPort();
    const environment: NodeJS.ProcessEnv = {
      ...stripExternalProviderEnvironment(process.env),
      NODE_ENV: 'test', APP_ENV: 'test', PORT: String(port), RUNNER_MODE: 'disabled',
    };
    delete environment.INTERNAL_SERVICE_HOST;
    if (configuredHost) environment.INTERNAL_SERVICE_HOST = configuredHost;
    const entryArguments = process.env.RUNNER_GATEWAY_TEST_COMPILED === '1'
      ? ['--conditions=production', 'apps/runner-gateway/dist/apps/runner-gateway/src/index.js']
      : ['--import', 'tsx', 'apps/runner-gateway/src/index.ts'];
    const child = spawn(process.execPath, entryArguments, {
      cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => { output = `${output}${chunk}`.slice(-16_000); });
    child.stderr.on('data', chunk => { output = `${output}${chunk}`.slice(-16_000); });
    const host = configuredHost ?? '127.0.0.1';
    const base = `http://${host}:${port}`;
    try {
      const deadline = Date.now() + 10_000;
      let healthy = false;
      while (Date.now() < deadline) {
        assert.equal(child.exitCode, null, output);
        try {
          const response = await fetch(`${base}/healthz`, { signal: AbortSignal.timeout(500) });
          if (response.ok) { healthy = true; break; }
        } catch { /* process startup is bounded by the deadline */ }
        await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
      }
      assert.equal(healthy, true, output);
      // Fastify's listener diagnostic is produced by the actual bound socket.
      assert.match(output, /Server listening at http:\/\/(?:127\.0\.0\.1|\[::1\]):/);
      assert.match(output, new RegExp(`Runner Gateway listening on http://${host.replaceAll('.', '\\.')}:${port}`));
      if (!configuredHost) {
        // A wildcard IPv4 listener would also accept this other address in
        // the loopback range. Probe only this fixture's reserved local port.
        await assert.rejects(fetch(`http://127.0.0.2:${port}/healthz`, {
          signal: AbortSignal.timeout(1_000),
        }));
      }
      const snapshot = await (await fetch(base)).json() as { runnerMode: string };
      assert.equal(snapshot.runnerMode, 'disabled');
      const response = await fetch(`${base}/v1/runner/exec`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: 'loopback-synthetic-absent', cmd: 'echo fixture-control' }),
      });
      const result = await response.json() as { exitCode: number; stderr: string };
      assert.equal(result.exitCode, 126);
      assert.equal(result.stderr, 'Runner execution is disabled in this runtime');
    } finally {
      if (child.exitCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
    }
  });
}
