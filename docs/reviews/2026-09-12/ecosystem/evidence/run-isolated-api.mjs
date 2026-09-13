// Review-only harness. Never accepts a caller-supplied database or provider credentials.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { stripExternalProviderEnvironment } from '../../../../../scripts/parity/lib/database.mjs';

const env = {
  ...stripExternalProviderEnvironment(process.env),
  DATABASE_URL: 'postgresql://postgres:review_disposable_only@127.0.0.1:55462/operatoros_test_review_20260912',
  PARITY_DATABASE_IS_DISPOSABLE: '1',
  APP_ENV: 'test', NODE_ENV: 'test',
  SESSION_SECRET: 'operatoros-review-disposable-session-only-20260912',
  SSO_CODE_ENCRYPTION_SECRET: 'operatoros-review-disposable-sso-only-20260912',
  SHARED_SECRET_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  RUNNER_MODE: 'disabled',
};
const suite = process.argv[2] ?? 'api';
const commands = { api: ['scripts/parity/run-api-tests.mjs'], integration: ['scripts/parity/run-integration-tests.mjs'], browser: ['scripts/parity/run-browser-tests.mjs', '--suite', 'all'] };
if (!Object.hasOwn(commands, suite)) throw new Error('Only the fixed api/integration/browser review gates are allowed');
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, commands[suite], {
  cwd: 'C:/Dev/OperatorOS', env, encoding: 'utf8', maxBuffer: 100 * 1024 * 1024,
});
const log = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
writeFileSync(new URL(`./${suite}-aggregate.log`, import.meta.url), log);
writeFileSync(new URL(`./${suite}-execution.json`, import.meta.url), JSON.stringify({
  startedAt, finishedAt: new Date().toISOString(), exitCode: result.status,
  error: result.error?.message ?? null, database: 'loopback disposable PostgreSQL 16; synthetic test data only',
  command: `node ${commands[suite].join(' ')}`,
}, null, 2) + '\n');
console.log(log.slice(-12000));
process.exitCode = result.status ?? 1;
