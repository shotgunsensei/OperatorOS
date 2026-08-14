import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQueueOutcome, queueStorageKey, type QueuedMutation } from './offline-queue';

const item: QueuedMutation = { id: 'm1', method: 'POST', path: '/x', createdAt: '2026-08-11T00:00:00Z', attempts: 0 };
test('successful and permanent mutations leave the queue exactly once', () => {
  assert.deepEqual(applyQueueOutcome([item], 'm1', { kind: 'success' }), []);
  assert.deepEqual(applyQueueOutcome([item], 'm1', { kind: 'permanent', error: 'bad input' }), []);
});
test('retry retains the mutation and increments its attempt count', () => {
  assert.equal(applyQueueOutcome([item], 'm1', { kind: 'retry' })[0]?.attempts, 1);
});
test('queue storage is isolated by both tenant and user', () => {
  const first = queueStorageKey({ tenantId: 'tenant-a', userId: 'user-a' });
  assert.notEqual(first, queueStorageKey({ tenantId: 'tenant-b', userId: 'user-a' }));
  assert.notEqual(first, queueStorageKey({ tenantId: 'tenant-a', userId: 'user-b' }));
});
