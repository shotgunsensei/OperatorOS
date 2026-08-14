const QUEUE_KEY = 'torqueshed.native.mutation-queue.v1';

export type QueueScope = { tenantId: string; userId: string };
export type QueuedMutation = {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  file?: { uri: string; name: string; mimeType: string; bodyField: string; durable?: boolean };
  createdAt: string;
  attempts: number;
};

export type QueueOutcome = { kind: 'success' } | { kind: 'retry' } | { kind: 'permanent'; error: string };

export function queueStorageKey(scope: QueueScope): string {
  return `${QUEUE_KEY}:${scope.tenantId}:${scope.userId}`;
}

export function parseStoredQueue(raw: string | null): QueuedMutation[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Stored offline mutation queue is invalid');
  return parsed;
}

export function applyQueueOutcome(queue: QueuedMutation[], id: string, outcome: QueueOutcome): QueuedMutation[] {
  if (outcome.kind === 'success' || outcome.kind === 'permanent') return queue.filter(item => item.id !== id);
  return queue.map(item => item.id === id ? { ...item, attempts: item.attempts + 1 } : item);
}
