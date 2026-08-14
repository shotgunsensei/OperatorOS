import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const compiler = resolve(root, 'scripts/faultlinelab/compile-source-cases.mjs');

function run(...args) {
  return spawnSync(process.execPath, [compiler, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('current pinned source compiles without drift', () => {
  const result = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const summary = JSON.parse(result.stdout);
  assert.ok(summary.discoveredCount > 4);
  assert.equal(summary.mode, 'check');
});

test('controlled duplicate source id fails closed', () => {
  const result = run('--negative-fixture=duplicate-id');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Duplicate source case id/);
});

test('controlled invalid evidence reference fails closed', () => {
  const result = run('--negative-fixture=invalid-evidence-reference');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unknown evidence reference evidence-does-not-exist/);
});

test('controlled source drift fails the generated-file freshness gate', () => {
  const result = run('--negative-fixture=source-drift');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Generated FaultlineLab source catalog is stale/);
});
