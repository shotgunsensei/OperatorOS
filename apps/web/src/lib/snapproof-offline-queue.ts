'use client';

export type SnapProofQueuedCapture = {
  id: string;
  jobId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
};

const DB_NAME = 'operatoros-snapproofos';
const STORE = 'capture-queue';

function openQueue(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function queueSnapProofCapture(item: Omit<SnapProofQueuedCapture, 'attempts'>): Promise<void> {
  const database = await openQueue();
  if (!database) throw new Error('Offline capture storage is unavailable in this browser.');
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).put({ ...item, attempts: 0 });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function listSnapProofCaptures(): Promise<SnapProofQueuedCapture[]> {
  const database = await openQueue();
  if (!database) return [];
  const rows = await new Promise<SnapProofQueuedCapture[]>((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as SnapProofQueuedCapture[]);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

async function removeCapture(database: IDBDatabase, id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function reconcileSnapProofCaptures(
  uploader: (item: SnapProofQueuedCapture) => Promise<unknown>,
): Promise<{ completed: number; remaining: number }> {
  const database = await openQueue();
  if (!database) return { completed: 0, remaining: 0 };
  const items = await new Promise<SnapProofQueuedCapture[]>((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as SnapProofQueuedCapture[]);
    request.onerror = () => reject(request.error);
  });
  let completed = 0;
  for (const item of items.sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    try {
      await uploader(item);
      await removeCapture(database, item.id);
      completed += 1;
    } catch {
      // Keep the original immutable payload. Its clientMutationId makes a retry replay-safe.
    }
  }
  database.close();
  return { completed, remaining: items.length - completed };
}
