import { join } from 'node:path';
import { BUILD_ROOT, writeJson } from './lib/compiler.mjs';
import {
  PNPM,
  parseNodeTestSummary,
  requiredTestExitCode,
  runCaptured,
} from './lib/process.mjs';
import { assertDisposableDatabaseEnvironment } from './lib/database.mjs';

assertDisposableDatabaseEnvironment(process.env);
const env = { ...process.env, APP_ENV: 'test', NODE_ENV: 'test' };
const result = await runCaptured(PNPM, ['--dir', 'apps/api', 'test'], { env });
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
