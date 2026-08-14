import test from 'node:test';
import assert from 'node:assert/strict';
import { applyQueueOutcome, parseStoredQueue, queueStorageKey, type QueuedMutation } from './queue-domain';
import { ScopedQueueCoordinator } from './scoped-queue-coordinator';

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

test('queue decoding propagates corrupt storage instead of replacing it with an empty queue', () => {
  assert.deepEqual(parseStoredQueue(null), []);
  assert.throws(() => parseStoredQueue('{not-json'));
  assert.throws(() => parseStoredQueue('{"items":[]}'), /invalid/);
});

test('serialized read-modify-write operations preserve mutations queued during a flush', async () => {
  const coordinator = new ScopedQueueCoordinator();
  const nextItem: QueuedMutation = { ...item, id: 'm2' };
  let queue = [item];
  let releaseFlush!: () => void;
  const flushPaused = new Promise<void>(resolve => { releaseFlush = resolve; });

  const flushWrite = coordinator.serialize('tenant-a:user-a', async () => {
    const snapshot = queue;
    await flushPaused;
    queue = applyQueueOutcome(snapshot, item.id, { kind: 'success' });
  });
  const enqueueWrite = coordinator.serialize('tenant-a:user-a', () => {
    queue = [...queue, nextItem];
  });

  await Promise.resolve();
  assert.deepEqual(queue.map(entry => entry.id), ['m1']);
  releaseFlush();
  await Promise.all([flushWrite, enqueueWrite]);
  assert.deepEqual(queue.map(entry => entry.id), ['m2']);
});
