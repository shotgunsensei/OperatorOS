import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { applyQueueOutcome, parseStoredQueue, queueStorageKey, type QueueOutcome, type QueueScope, type QueuedMutation } from './queue-domain';
import { ScopedQueueCoordinator } from './scoped-queue-coordinator';

export { applyQueueOutcome, queueStorageKey } from './queue-domain';
export type { QueueOutcome, QueueScope, QueuedMutation } from './queue-domain';

const queueCoordinator = new ScopedQueueCoordinator();

export async function loadQueue(scope: QueueScope): Promise<QueuedMutation[]> {
  const raw = await AsyncStorage.getItem(queueStorageKey(scope));
  return parseStoredQueue(raw);
}

async function saveQueue(scope: QueueScope, queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(queueStorageKey(scope), JSON.stringify(queue));
}

function safePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function persistQueuedFile(
  scope: QueueScope,
  mutationId: string,
  file: NonNullable<QueuedMutation['file']>,
): Promise<NonNullable<QueuedMutation['file']>> {
  if (file.durable) return file;
  if (!FileSystem.documentDirectory) throw new Error('Durable offline file storage is unavailable');
  const directory = `${FileSystem.documentDirectory}torqueshed-native-queue/`;
  const extensionMatch = /\.[a-zA-Z0-9]{1,10}$/.exec(file.name);
  const destination = `${directory}${safePathSegment(scope.tenantId)}-${safePathSegment(scope.userId)}-${safePathSegment(mutationId)}${extensionMatch?.[0] ?? ''}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const existing = await FileSystem.getInfoAsync(destination);
  if (!existing.exists) await FileSystem.copyAsync({ from: file.uri, to: destination });
  return { ...file, uri: destination, durable: true };
}

async function removeTerminalFile(file: QueuedMutation['file']): Promise<void> {
  if (!file?.durable) return;
  await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);
}

export async function enqueueMutation(scope: QueueScope, mutation: Omit<QueuedMutation, 'createdAt' | 'attempts'>): Promise<void> {
  await queueCoordinator.serialize(queueStorageKey(scope), async () => {
    const queue = await loadQueue(scope);
    if (queue.some(item => item.id === mutation.id)) return;
    const file = mutation.file ? await persistQueuedFile(scope, mutation.id, mutation.file) : undefined;
    await saveQueue(scope, [...queue, { ...mutation, file, createdAt: new Date().toISOString(), attempts: 0 }]);
  });
}

export async function flushMutationQueue(
  scope: QueueScope,
  sender: (item: QueuedMutation) => Promise<void>,
  onPermanentFailure?: (item: QueuedMutation, error: string) => void,
): Promise<{ sent: number; pending: number; failed: number }> {
  const initialQueue = await queueCoordinator.serialize(queueStorageKey(scope), () => loadQueue(scope));
  let queue = initialQueue;
  let sent = 0;
  let failed = 0;
  for (const item of initialQueue) {
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
    queue = await queueCoordinator.serialize(queueStorageKey(scope), async () => {
      const current = await loadQueue(scope);
      const next = applyQueueOutcome(current, item.id, outcome);
      await saveQueue(scope, next);
      return next;
    });
    if (outcome.kind !== 'retry') await removeTerminalFile(item.file);
    if (outcome.kind === 'retry') break;
  }
  return { sent, pending: queue.length, failed };
}
