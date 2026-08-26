import { Client } from 'pg';
import { join } from 'node:path';
import { BUILD_ROOT, writeJson } from './lib/compiler.mjs';
import { assertDisposableDatabaseEnvironment, resetDisposablePublicSchema } from './lib/database.mjs';
import {
  PNPM,
  parseNodeTestSummary,
  requiredTestExitCode,
  run,
  runCaptured,
} from './lib/process.mjs';

const disposable = assertDisposableDatabaseEnvironment(process.env);
const client = new Client({ connectionString: disposable.url });
await client.connect();
try {
  await resetDisposablePublicSchema(client);
} finally {
  await client.end();
}
writeJson(join(BUILD_ROOT, 'database-reset.json'), {
  schemaVersion: 1,
  database: disposable.database,
  host: disposable.host,
  reset: true,
  resetAt: new Date().toISOString(),
});
const applyEnv = {
  ...process.env,
  APP_ENV: 'test',
  NODE_ENV: 'test',
  OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
};
let code = run(PNPM, ['db:apply'], { env: applyEnv });
if (code === 0) code = run(PNPM, ['db:apply'], { env: applyEnv });
if (code === 0) {
  const result = await runCaptured(PNPM, [
    '--dir', 'apps/api', 'exec', 'tsx', '--test', '--test-concurrency=1',
    'test/database-release-contract.test.ts',
    'test/module-session-boundary.test.ts',
    'test/tenant-isolation.test.ts',
    'test/shared-platform.test.ts',
    'test/shared-platform-routes.test.ts',
    'test/shared-platform-ui-static.test.ts',
  ], { env: applyEnv });
  const summary = parseNodeTestSummary(`${result.stdout}\n${result.stderr}`);
  code = requiredTestExitCode(result.status, summary);
  writeJson(join(BUILD_ROOT, 'integration-test-summary.json'), {
    schemaVersion: 1,
    required: true,
    processExitCode: result.status,
    summary,
    releaseEligible: code === 0,
  });
  if (!summary) process.stderr.write('Required integration test summary was not discoverable.\n');
  else if (summary.skipped || summary.todo || summary.cancelled) {
    process.stderr.write(`Required integration tests cannot be skipped, todo, or cancelled: ${JSON.stringify(summary)}\n`);
  }
}
process.exitCode = code;
