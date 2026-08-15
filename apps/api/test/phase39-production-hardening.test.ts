import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectRunnerMode } from '../../runner-gateway/src/provisioner.js';
import { evaluateSharedServiceWorkerReadiness } from '../src/lib/shared-service-worker.js';
import { isOperatorOSDeterministicProviderTestEnvironment } from '../src/lib/shared-service-safety.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function workerStatus(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    started: true,
    running: false,
    stopping: false,
    workerId: 'phase39-test-worker',
    lastStartedAt: new Date('2026-08-14T12:00:00.000Z'),
    lastCompletedAt: new Date('2026-08-14T12:00:01.000Z'),
    lastErrorCode: null,
    completedCycles: 1,
    consecutiveFailures: 0,
    lastCycleCounts: { jobs: 0 },
    ...overrides,
  };
}

test('Phase 39 runner mode fails closed in production and stays local in development', () => {
  assert.equal(detectRunnerMode({ APP_ENV: 'production' }), 'disabled');
  assert.equal(detectRunnerMode({ NODE_ENV: 'production' }), 'disabled');
  assert.equal(detectRunnerMode({ APP_ENV: 'development' }), 'local');
  assert.equal(detectRunnerMode({ APP_ENV: 'production', RUNNER_MODE: 'k8s' }), 'k8s');
  assert.equal(detectRunnerMode({ APP_ENV: 'production', RUNNER_MODE: 'disabled' }), 'disabled');
});

test('Phase 39 deterministic providers require CI plus an explicitly disposable database', () => {
  assert.equal(isOperatorOSDeterministicProviderTestEnvironment({ NODE_ENV: 'test' }), true);
  assert.equal(isOperatorOSDeterministicProviderTestEnvironment({
    APP_ENV: 'production', OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1',
  }), false);
  assert.equal(isOperatorOSDeterministicProviderTestEnvironment({
    APP_ENV: 'production', OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1',
    PARITY_DATABASE_IS_DISPOSABLE: '1',
  }), false);
  assert.equal(isOperatorOSDeterministicProviderTestEnvironment({
    APP_ENV: 'production', OPERATOROS_DETERMINISTIC_PROVIDER_MODE: '1',
    PARITY_DATABASE_IS_DISPOSABLE: '1', CI: 'true',
  }), true);
});

test('Phase 39 worker readiness rejects stale, failed, disabled, and missing heartbeats', () => {
  const now = Date.parse('2026-08-14T12:01:00.000Z');
  assert.deepEqual(evaluateSharedServiceWorkerReadiness(workerStatus(), now), {
    ready: true,
    reasonCode: 'READY',
    heartbeatAgeMs: 59_000,
  });
  assert.equal(evaluateSharedServiceWorkerReadiness(workerStatus({ enabled: false }), now).reasonCode, 'WORKER_DISABLED');
  assert.equal(evaluateSharedServiceWorkerReadiness(workerStatus({ started: false }), now).reasonCode, 'WORKER_NOT_STARTED');
  assert.equal(evaluateSharedServiceWorkerReadiness(workerStatus({ lastErrorCode: 'FAILED' }), now).reasonCode, 'WORKER_CYCLE_FAILED');
  assert.equal(evaluateSharedServiceWorkerReadiness(workerStatus({ lastCompletedAt: null, lastStartedAt: null }), now).reasonCode, 'WORKER_HEARTBEAT_MISSING');
  assert.equal(evaluateSharedServiceWorkerReadiness(workerStatus({ lastCompletedAt: new Date(now - 120_001) }), now).reasonCode, 'WORKER_HEARTBEAT_STALE');
});

test('Phase 39 production surface has runner denial, bounded upload, and comprehensive CSP controls', () => {
  const api = readFileSync(resolve(repositoryRoot, 'apps/api/src/index.ts'), 'utf8');
  const callCommand = readFileSync(resolve(repositoryRoot, 'apps/api/src/routes/callcommand-phase35-routes.ts'), 'utf8');
  const web = readFileSync(resolve(repositoryRoot, 'apps/web/next.config.js'), 'utf8');
  assert.match(api, /RUNNER_GATEWAY_DISABLED/);
  assert.match(api, /getRunnerMode\(\) !== 'disabled'/);
  assert.doesNotMatch(callCommand, /bodyLimit:\s*70_000_000/);
  assert.equal((callCommand.match(/bodyLimit:\s*35_000_000/g) ?? []).length, 2);
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ]) assert.match(web, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
