import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'torqueshed.native.mutation-queue.v1';
export type QueueScope = { tenantId: string; userId: string };
export type QueuedMutation = {
  id: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  path: string;
  body?: Record<string, unknown>;
  file?: { uri: string; name: string; mimeType: string; bodyField: string };
  createdAt: string;
  attempts: number;
};

export type QueueOutcome = { kind: 'success' } | { kind: 'retry' } | { kind: 'permanent'; error: string };

export function queueStorageKey(scope: QueueScope): string {
  return `${QUEUE_KEY}:${scope.tenantId}:${scope.userId}`;
}

export function applyQueueOutcome(queue: QueuedMutation[], id: string, outcome: QueueOutcome): QueuedMutation[] {
  if (outcome.kind === 'success' || outcome.kind === 'permanent') return queue.filter(item => item.id !== id);
  return queue.map(item => item.id === id ? { ...item, attempts: item.attempts + 1 } : item);
}

export async function loadQueue(scope: QueueScope): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(queueStorageKey(scope));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

async function saveQueue(scope: QueueScope, queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(queueStorageKey(scope), JSON.stringify(queue));
}

export async function enqueueMutation(scope: QueueScope, mutation: Omit<QueuedMutation, 'createdAt' | 'attempts'>): Promise<void> {
  const queue = await loadQueue(scope);
  if (queue.some(item => item.id === mutation.id)) return;
  await saveQueue(scope, [...queue, { ...mutation, createdAt: new Date().toISOString(), attempts: 0 }]);
}

export async function flushMutationQueue(
  scope: QueueScope,
  sender: (item: QueuedMutation) => Promise<void>,
  onPermanentFailure?: (item: QueuedMutation, error: string) => void,
): Promise<{ sent: number; pending: number; failed: number }> {
  let queue = await loadQueue(scope);
  let sent = 0;
  let failed = 0;
  for (const item of [...queue]) {
    let outcome: QueueOutcome;
    try {
      await sender(item);
      outcome = { kind: 'success' };
      sent += 1;
    } catch (error) {
      const status = Number((error as any)?.status ?? 0);
      const code = String((error as any)?.code ?? '');
      if (status === 409 && /DUPLICATE|REPLAY|IDEMPOTENT/.test(code)) {
        outcome = { kind: 'success' };
        sent += 1;
      } else if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
        outcome = { kind: 'permanent', error: String((error as Error).message) };
        failed += 1;
        onPermanentFailure?.(item, outcome.error);
      } else {
        outcome = { kind: 'retry' };
      }
    }
    queue = applyQueueOutcome(queue, item.id, outcome);
    await saveQueue(scope, queue);
    if (outcome.kind === 'retry') break;
  }
  return { sent, pending: queue.length, failed };
}
