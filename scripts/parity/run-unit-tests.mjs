import { join } from 'node:path';
import { BUILD_ROOT, REPOSITORY_ROOT, writeJson } from './lib/compiler.mjs';
import { parseNodeTestSummary, requiredTestExitCode, runCaptured } from './lib/process.mjs';

const files = [
  'scripts/phase20-product-truth.test.mjs',
  'scripts/operatoros-brand-assets.test.mjs',
  'scripts/parity/parity-compiler.test.mjs',
  'scripts/parity/quality-gates.test.mjs',
  'scripts/phase22-shared-equivalent-contract.test.mjs',
];
const result = await runCaptured(process.execPath, ['--test', ...files], {
  cwd: REPOSITORY_ROOT,
  env: { ...process.env, APP_ENV: 'test', NODE_ENV: 'test' },
});
const summary = parseNodeTestSummary(`${result.stdout}\n${result.stderr}`);
const exitCode = requiredTestExitCode(result.status, summary);
writeJson(join(BUILD_ROOT, 'unit-test-summary.json'), {
  schemaVersion: 1,
  required: true,
  files,
  processExitCode: result.status,
  summary,
  releaseEligible: exitCode === 0,
});
if (!summary) process.stderr.write('Required unit test summary was not discoverable.\n');
else if (summary.skipped || summary.todo || summary.cancelled) {
  process.stderr.write(`Required unit tests cannot be skipped, todo, or cancelled: ${JSON.stringify(summary)}\n`);
}
process.exitCode = exitCode;
