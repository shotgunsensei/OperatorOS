import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const scopeKey = scope ? `${scope.tenantId}:${scope.userId}` : null;
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [flushRequestVersion, setFlushRequestVersion] = useState(0);
  const syncingRef = useRef(false);
  const activeScopeKeyRef = useRef<string | null>(null);
  const queuedScopeKeyRef = useRef<string | null>(null);
  const latestScopeKeyRef = useRef(scopeKey);
  latestScopeKeyRef.current = scopeKey;
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
    if (!online || !scope || !scopeKey || !auth.session) return;
    if (syncingRef.current) {
      if (activeScopeKeyRef.current !== scopeKey) queuedScopeKeyRef.current = scopeKey;
      return;
    }
    const executingScope = scope;
    const executingScopeKey = scopeKey;
    let executingAccessToken = auth.session.accessToken;
    syncingRef.current = true;
    activeScopeKeyRef.current = executingScopeKey;
    setSyncing(true);
    try {
      const result = await flushMutationQueue(executingScope, async item => {
        if (latestScopeKeyRef.current !== executingScopeKey) {
          throw new ApiError('Account changed while synchronizing', 0, 'NATIVE_SYNC_SCOPE_CHANGED');
        }
        let requestBody = item.body;
        if (item.file) {
          const contentBase64 = await FileSystem.readAsStringAsync(item.file.uri, { encoding: FileSystem.EncodingType.Base64 });
          requestBody = { ...requestBody, [item.file.bodyField]: contentBase64, originalName: item.file.name, declaredMimeType: item.file.mimeType };
        }
        if (latestScopeKeyRef.current !== executingScopeKey) {
          throw new ApiError('Account changed while synchronizing', 0, 'NATIVE_SYNC_SCOPE_CHANGED');
        }
        await apiRequest(item.path, {
          method: item.method,
          body: requestBody,
          idempotencyKey: item.id,
          accessToken: executingAccessToken,
          refreshAccess: async () => {
            if (latestScopeKeyRef.current !== executingScopeKey) return null;
            const refreshed = await auth.refresh();
            if (latestScopeKeyRef.current !== executingScopeKey) return null;
            if (refreshed) executingAccessToken = refreshed;
            return refreshed;
          },
        });
      }, (_item, error) => {
        if (latestScopeKeyRef.current === executingScopeKey) setLastError(error);
      });
      if (latestScopeKeyRef.current === executingScopeKey) setPending(result.pending);
    } finally {
      syncingRef.current = false;
      activeScopeKeyRef.current = null;
      setSyncing(false);
      const queuedScopeKey = queuedScopeKeyRef.current;
      queuedScopeKeyRef.current = null;
      if (queuedScopeKey && latestScopeKeyRef.current === queuedScopeKey) {
        setFlushRequestVersion(version => version + 1);
      }
    }
  }, [auth.refresh, auth.session?.accessToken, online, scope?.tenantId, scope?.userId]);

  useEffect(() => NetInfo.addEventListener(state => {
    const connected = state.isConnected === true && state.isInternetReachable !== false;
    setOnline(connected);
  }), []);
  useEffect(() => { if (online) void flush(); }, [online, flush, flushRequestVersion]);

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
