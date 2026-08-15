import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const budgets = JSON.parse(readFileSync(resolve('config/production-budgets.json'), 'utf8'));

test('Phase 39 budgets are versioned, bounded, and internally consistent', () => {
  assert.equal(budgets.schemaVersion, 1);
  assert.ok(budgets.api.readP95Ms <= budgets.api.writeP95Ms);
  assert.ok(budgets.api.writeP95Ms <= budgets.api.p99Ms);
  assert.ok(budgets.workers.heartbeatStaleSeconds < budgets.workers.oldestReadySeconds);
  assert.ok(budgets.uploads.defaultRawBytes < budgets.uploads.absoluteRawBytes);
  assert.ok(budgets.uploads.base64EnvelopeBytes >= Math.ceil(budgets.uploads.absoluteRawBytes * 4 / 3));
  assert.equal(budgets.browser.minimumTouchTargetPixels, 24);
  assert.ok(budgets.realtime.gameTargetFrameMs < budgets.realtime.gameMaxFrameMs);
});

test('production code enforces the declared queue, heartbeat, shutdown, and upload budgets', () => {
  const worker = readFileSync(resolve('apps/api/src/lib/shared-service-worker.ts'), 'utf8');
  const api = readFileSync(resolve('apps/api/src/index.ts'), 'utf8');
  const callCommand = readFileSync(resolve('apps/api/src/routes/callcommand-phase35-routes.ts'), 'utf8').replaceAll('_', '');
  assert.match(worker, new RegExp(`heartbeatAgeMs > ${budgets.workers.heartbeatStaleSeconds}_000`));
  assert.match(worker, new RegExp(`Date\\.now\\(\\) \\+ ${budgets.workers.gracefulShutdownSeconds}_000`));
  assert.match(api, new RegExp(`oldestReadySeconds <= ${budgets.workers.oldestReadySeconds}`));
  assert.equal((callCommand.match(new RegExp(`bodyLimit: ${budgets.uploads.base64EnvelopeBytes}`, 'g')) ?? []).length, 2);
});
