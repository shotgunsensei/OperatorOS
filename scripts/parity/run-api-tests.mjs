import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT, writeJson } from './lib/compiler.mjs';
import {
  PNPM,
  parseNodeTestSummary,
  requiredTestExitCode,
  runCaptured,
  spawnLogged,
  stopChild,
  waitForHttp,
} from './lib/process.mjs';
import { assertDisposableDatabaseEnvironment } from './lib/database.mjs';

assertDisposableDatabaseEnvironment(process.env);
mkdirSync(BUILD_ROOT, { recursive: true });

async function reserveLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (!port) throw new Error('Could not reserve a loopback port for required web HTTP tests');
  return port;
}

const webPort = await reserveLoopbackPort();
const webBaseUrl = `http://127.0.0.1:${webPort}`;
const next = join(
  REPOSITORY_ROOT,
  'apps',
  'web',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'next.cmd' : 'next',
);
const env = {
  ...process.env,
  APP_ENV: 'test',
  NODE_ENV: 'test',
  WEB_BASE_URL: webBaseUrl,
};
let web;
let result;
try {
  web = spawnLogged(
    next,
    ['dev', '-H', '127.0.0.1', '-p', String(webPort)],
    {
      cwd: join(REPOSITORY_ROOT, 'apps', 'web'),
      env: { ...process.env, APP_ENV: 'test', NODE_ENV: 'development' },
      logPath: join(BUILD_ROOT, 'api-test-web.log'),
      mirrorToParent: false,
    },
  );
  await waitForHttp(webBaseUrl, web, 180_000);
  const inviteWarmup = await fetch(`${webBaseUrl}/app/invites/phase39-warmup`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
  });
  if (inviteWarmup.status !== 200) {
    throw new Error(`Required invite handoff warmup returned HTTP ${inviteWarmup.status}`);
  }
  result = await runCaptured(PNPM, ['--dir', 'apps/api', 'test'], { env });
} finally {
  await stopChild(web);
}
const summary = parseNodeTestSummary(`${result.stdout}\n${result.stderr}`);
const exitCode = requiredTestExitCode(result.status, summary);
writeJson(join(BUILD_ROOT, 'api-test-summary.json'), {
  schemaVersion: 1,
  required: true,
  processExitCode: result.status,
  summary,
  releaseEligible: exitCode === 0,
});
if (!summary) process.stderr.write('Required API test summary was not discoverable.\n');
else if (summary.skipped || summary.todo || summary.cancelled) {
  process.stderr.write(`Required API tests cannot be skipped, todo, or cancelled: ${JSON.stringify(summary)}\n`);
}
process.exitCode = exitCode;
