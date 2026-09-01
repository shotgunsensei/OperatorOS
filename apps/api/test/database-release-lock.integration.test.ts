import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { withDatabaseReleaseLock } from '../src/lib/database-release-lock.js';

test('database releases serialize across processes instead of overlapping', async () => {
  const order: string[] = [];
  let markFirstEntered: (() => void) | undefined;
  const firstEntered = new Promise<void>((resolve) => {
    markFirstEntered = resolve;
  });

  const first = withDatabaseReleaseLock(async () => {
    order.push('first-enter');
    markFirstEntered?.();
    await delay(150);
    order.push('first-exit');
  });

  await firstEntered;
  const second = withDatabaseReleaseLock(async () => {
    order.push('second-enter');
    order.push('second-exit');
  });

  await Promise.all([first, second]);
  assert.deepEqual(order, [
    'first-enter',
    'first-exit',
    'second-enter',
    'second-exit',
  ]);
});
