import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUILD_ROOT,
  REPOSITORY_ROOT,
  writeJson,
} from './lib/compiler.mjs';
import { PNPM, run } from './lib/process.mjs';

const planOnly = process.argv.includes('--plan');
const testEnv = { ...process.env, APP_ENV: 'test', NODE_ENV: 'test' };
const productionEnv = {
  ...process.env,
  APP_ENV: 'production',
  NODE_ENV: 'production',
  INTERNAL_API_URL: 'http://localhost:5001',
  OPERATOROS_DATABASE_RELEASE_MODE: 'apply',
};
const steps = [
  { id: 'faultlinelab-source-catalog', command: PNPM, args: ['verify:faultlinelab:catalog'], env: process.env },
  { id: 'phase39-production-hardening', command: PNPM, args: ['verify:hardening:phase39'], env: testEnv },
  { id: 'parity-report', command: process.execPath, args: ['scripts/parity/report-parity.mjs'], env: process.env },
  { id: 'parity', command: PNPM, args: ['verify:parity'], env: process.env },
  { id: 'typecheck', command: PNPM, args: ['typecheck'], env: process.env },
  { id: 'lint', command: PNPM, args: ['lint'], env: process.env },
  { id: 'unit', command: PNPM, args: ['test:unit'], env: testEnv },
  { id: 'api', command: PNPM, args: ['test:api'], env: testEnv },
  { id: 'integration-apply-reapply', command: PNPM, args: ['test:integration'], env: testEnv },
  { id: 'production-build', command: PNPM, args: ['build:production'], env: productionEnv },
  { id: 'route-control-static', command: PNPM, args: ['test:route-integrity'], env: testEnv },
  { id: 'visual-contract-static', command: process.execPath, args: ['scripts/parity/verify-visual-contracts.mjs'], env: testEnv },
  { id: 'exact-host-visual-accessibility', command: process.execPath, args: ['scripts/parity/run-browser-tests.mjs', '--suite', 'all'], env: productionEnv },
  { id: 'production-preflight', command: process.execPath, args: ['scripts/production-env-preflight.mjs', '--core'], env: productionEnv },
];

if (planOnly) {
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, steps: steps.map(({ id, command, args }) => ({ id, command, args })) }, null, 2)}\n`);
  process.exit(0);
}

mkdirSync(BUILD_ROOT, { recursive: true });
const results = [];
for (const step of steps) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  process.stdout.write(`\n[verify:release] START ${step.id}\n`);
  const status = run(step.command, step.args, { cwd: REPOSITORY_ROOT, env: step.env });
  const result = {
    id: step.id,
    status: status === 0 ? 'PASS' : 'FAIL',
    exitCode: status,
    startedAt,
    durationMs: Date.now() - started,
  };
  results.push(result);
  writeJson(join(BUILD_ROOT, 'release-gate-results.json'), {
    schemaVersion: 1,
    complete: results.length === steps.length,
    passed: results.filter((entry) => entry.status === 'PASS').length,
    failed: results.filter((entry) => entry.status === 'FAIL').length,
    results,
  });
  process.stdout.write(`[verify:release] ${result.status} ${step.id} (${result.durationMs}ms)\n`);
}
const failed = results.filter((result) => result.status === 'FAIL');
process.stdout.write(`${JSON.stringify({ steps: results.length, passed: results.length - failed.length, failed: failed.length, failedSteps: failed.map((result) => result.id), artifact: 'build/parity/release-gate-results.json' }, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
