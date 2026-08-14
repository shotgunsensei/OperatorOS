import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiRequest, ApiError, configureApiRefresh } from './api';
import { useAuth } from './auth';
import { enqueueMutation, flushMutationQueue, loadQueue, type QueueScope, type QueuedMutation } from './offline-queue';

type QueueInput = Omit<QueuedMutation, 'id' | 'createdAt' | 'attempts'> & { id?: string };
type SyncContextValue = {
  online: boolean;
  pending: number;
  syncing: boolean;
  lastError: string | null;
  queue: (input: QueueInput) => Promise<{ queued: true; id: string }>;
  flush: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const scope: QueueScope | null = auth.session
    ? { tenantId: auth.session.tenant.id, userId: auth.session.user.id }
    : null;
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => configureApiRefresh(auth.refresh), [auth.refresh]);
  const recount = useCallback(() => {
    if (!scope) {
      setPending(0);
      return Promise.resolve();
    }
    return loadQueue(scope).then(items => setPending(items.length));
  }, [scope?.tenantId, scope?.userId]);
  useEffect(() => { void recount(); }, [recount]);

  const flush = useCallback(async () => {
    if (!online || !scope || syncing) return;
    setSyncing(true);
    try {
      const result = await flushMutationQueue(scope, async item => {
        let requestBody = item.body;
        if (item.file) {
          const contentBase64 = await FileSystem.readAsStringAsync(item.file.uri, { encoding: FileSystem.EncodingType.Base64 });
          requestBody = { ...requestBody, [item.file.bodyField]: contentBase64, originalName: item.file.name, declaredMimeType: item.file.mimeType };
        }
        await apiRequest(item.path, { method: item.method, body: requestBody, idempotencyKey: item.id });
      }, (_item, error) => setLastError(error));
      setPending(result.pending);
    } finally { setSyncing(false); }
  }, [online, scope?.tenantId, scope?.userId, syncing]);

  useEffect(() => NetInfo.addEventListener(state => {
    const connected = state.isConnected === true && state.isInternetReachable !== false;
    setOnline(connected);
  }), []);
  useEffect(() => { if (online) void flush(); }, [online, flush]);

  const queue = useCallback(async (input: QueueInput) => {
    if (!scope) throw new ApiError('Sign in through OperatorOS before changing garage data', 401, 'NATIVE_SESSION_REQUIRED');
    const id = input.id ?? `native-${Crypto.randomUUID()}`;
    if (online) {
      try {
        let requestBody = input.body;
        if (input.file) {
          const contentBase64 = await FileSystem.readAsStringAsync(input.file.uri, { encoding: FileSystem.EncodingType.Base64 });
          requestBody = { ...requestBody, [input.file.bodyField]: contentBase64, originalName: input.file.name, declaredMimeType: input.file.mimeType };
        }
        await apiRequest(input.path, { method: input.method, body: requestBody, idempotencyKey: id });
        return { queued: true as const, id };
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) {
          throw error;
        }
      }
    }
    await enqueueMutation(scope, { ...input, id });
    await recount();
    return { queued: true as const, id };
  }, [online, recount, scope?.tenantId, scope?.userId]);

  const value = useMemo(() => ({ online, pending, syncing, lastError, queue, flush }), [online, pending, syncing, lastError, queue, flush]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const value = useContext(SyncContext);
  if (!value) throw new Error('useSync must be used inside SyncProvider');
  return value;
}
