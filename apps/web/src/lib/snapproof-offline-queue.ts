'use client';

// Local ownership only, never server authorization. Legacy rows stay unbound.
export type SnapProofCaptureScope = Readonly<{ tenantId: string; userId: string }>;
export type SnapProofQueuedCapture = {
  id: string;
  jobId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  scope?: SnapProofCaptureScope;
};
export type SnapProofCaptureQueue = { items: SnapProofQueuedCapture[]; held: boolean };
type ReconcileResult = { completed: number; remaining: number; held: boolean };

const DB_NAME = 'operatoros-snapproofos';
const STORE = 'capture-queue';
const activeFlushes = new Map<string, Promise<ReconcileResult>>();

export function sameSnapProofCaptureScope(left: SnapProofCaptureScope | null | undefined, right: SnapProofCaptureScope | null | undefined): boolean {
  return Boolean(left?.tenantId && left.userId && right?.tenantId && right.userId
    && left.tenantId === right.tenantId && left.userId === right.userId);
}

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

export async function queueSnapProofCapture(item: Omit<SnapProofQueuedCapture, 'attempts' | 'scope'>, scope: SnapProofCaptureScope): Promise<void> {
  if (!sameSnapProofCaptureScope(scope, scope)) throw new Error('Sign in and select a workspace before saving a capture.');
  const capturedScope = { tenantId: scope.tenantId, userId: scope.userId };
  const database = await openQueue();
  if (!database) throw new Error('Offline capture storage is unavailable in this browser. Keep the original file and retry.');
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      // Never overwrite existing bytes or reassign a capture to another owner.
      transaction.objectStore(STORE).add({ ...item, scope: capturedScope, attempts: 0 });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}

function readCaptures(database: IDBDatabase): Promise<SnapProofQueuedCapture[]> {
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as SnapProofQueuedCapture[]);
    request.onerror = () => reject(request.error);
  });
}

export async function listSnapProofCaptures(scope: SnapProofCaptureScope | null): Promise<SnapProofCaptureQueue> {
  const database = await openQueue();
  if (!database) return { items: [], held: false };
  try {
    const rows = await readCaptures(database);
    return {
      items: rows.filter(item => sameSnapProofCaptureScope(item.scope, scope))
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      // No IDs, contents, owner information or counts from another scope.
      held: rows.some(item => !sameSnapProofCaptureScope(item.scope, scope)),
    };
  } finally { database.close(); }
}

async function removeCapture(database: IDBDatabase, id: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    transaction.objectStore(STORE).delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function reconcileSnapProofCaptures(
  scope: SnapProofCaptureScope,
  isCurrent: () => boolean | Promise<boolean>,
  uploader: (item: SnapProofQueuedCapture) => Promise<unknown>,
): Promise<ReconcileResult> {
  const key = JSON.stringify([scope.tenantId, scope.userId]);
  const existing = activeFlushes.get(key);
  if (existing) return existing;
  const flush = reconcileOwnedCaptures(scope, isCurrent, uploader);
  activeFlushes.set(key, flush);
  try { return await flush; }
  finally { if (activeFlushes.get(key) === flush) activeFlushes.delete(key); }
}

async function reconcileOwnedCaptures(
  scope: SnapProofCaptureScope,
  isCurrent: () => boolean | Promise<boolean>,
  uploader: (item: SnapProofQueuedCapture) => Promise<unknown>,
): Promise<ReconcileResult> {
  const database = await openQueue();
  if (!database) return { completed: 0, remaining: 0, held: false };
  try {
    const rows = await readCaptures(database);
    const items = rows.filter(item => sameSnapProofCaptureScope(item.scope, scope))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    let completed = 0;
    for (const item of items) {
      try {
        if (!await isCurrent()) break;
        await uploader(item);
        // Keep uncertain captures after an identity change. Same-owner retries
        // retain the original clientMutationId and therefore remain replay-safe.
        if (!await isCurrent()) break;
        await removeCapture(database, item.id);
        completed += 1;
      } catch {
        // Keep the original immutable bytes, scope and replay key on failure.
      }
    }
    // Capture may enqueue more work while this snapshot is uploading. Report
    // the current queue without silently draining a newer capture in this run.
    const remainingRows = await readCaptures(database);
    return {
      completed,
      remaining: remainingRows.filter(item => sameSnapProofCaptureScope(item.scope, scope)).length,
      held: remainingRows.some(item => !sameSnapProofCaptureScope(item.scope, scope)),
    };
  } finally { database.close(); }
}
