import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { nativeConfig } from './config';
import { SessionTransitionCoordinator } from './session-transition';

const ACCESS_KEY = 'torqueshed.native.access';
const REFRESH_KEY = 'torqueshed.native.refresh';
const DEVICE_KEY = 'torqueshed.native.device';
const META_KEY = 'torqueshed.native.meta';
const PENDING_REVOCATIONS_KEY = 'torqueshed.native.pending-revocations';
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type NativeSession = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; name: string };
  module: 'torqueshed';
};

type SessionMeta = Omit<NativeSession, 'accessToken' | 'refreshToken'>;
type PendingRevocation = { refreshToken: string; deviceId: string };
let revocationFlushInFlight: Promise<void> | null = null;
let revocationOperationTail: Promise<void> = Promise.resolve();
const sessionTransitions = new SessionTransitionCoordinator();
type AuthContextValue = {
  session: NativeSession | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function randomUrlSafe(bytes = 32): Promise<string> {
  return bytesToBase64Url(await Crypto.getRandomBytesAsync(bytes));
}

async function deviceId(): Promise<string> {
  const current = await SecureStore.getItemAsync(DEVICE_KEY);
  if (current) return current;
  const created = await randomUrlSafe(32);
  await SecureStore.setItemAsync(DEVICE_KEY, created, secureOptions);
  return created;
}

async function writeSession(session: NativeSession): Promise<void> {
  const { accessToken, refreshToken, ...meta } = session;
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken, secureOptions),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken, secureOptions),
    AsyncStorage.setItem(META_KEY, JSON.stringify(meta)),
  ]);
}

async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    AsyncStorage.removeItem(META_KEY),
  ]);
}

async function readPendingRevocations(): Promise<PendingRevocation[]> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_REVOCATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is PendingRevocation => Boolean(
        item && typeof item.refreshToken === 'string' && typeof item.deviceId === 'string',
      ))
      : [];
  } catch {
    return [];
  }
}

async function writePendingRevocations(items: PendingRevocation[]): Promise<void> {
  if (items.length === 0) {
    await SecureStore.deleteItemAsync(PENDING_REVOCATIONS_KEY);
    return;
  }
  await SecureStore.setItemAsync(PENDING_REVOCATIONS_KEY, JSON.stringify(items.slice(-8)), secureOptions);
}

function serializeRevocationOperation(operation: () => Promise<void>): Promise<void> {
  const next = revocationOperationTail.then(operation, operation);
  revocationOperationTail = next.catch(() => undefined);
  return next;
}

function queuePendingRevocation(entry: PendingRevocation): Promise<void> {
  return serializeRevocationOperation(async () => {
    const current = await readPendingRevocations();
    if (current.some(item => item.refreshToken === entry.refreshToken)) return;
    await writePendingRevocations([...current, entry]);
  });
}

async function sendRevocation(entry: PendingRevocation): Promise<'complete' | 'retry'> {
  try {
    const response = await fetch(`${nativeConfig.apiBaseUrl}/public/torqueshed/native/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return response.ok || response.status === 400 || response.status === 401 || response.status === 404
      ? 'complete'
      : 'retry';
  } catch {
    return 'retry';
  }
}

async function performPendingRevocationFlush(): Promise<void> {
  const pending = await readPendingRevocations();
  if (pending.length === 0) return;
  const remaining: PendingRevocation[] = [];
  for (const entry of pending) {
    if (await sendRevocation(entry) === 'retry') remaining.push(entry);
  }
  await writePendingRevocations(remaining);
}

function flushPendingRevocations(): Promise<void> {
  revocationFlushInFlight ??= serializeRevocationOperation(performPendingRevocationFlush).finally(() => {
    revocationFlushInFlight = null;
  });
  return revocationFlushInFlight;
}

async function readSession(): Promise<NativeSession | null> {
  const [accessToken, refreshToken, metaRaw] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
    AsyncStorage.getItem(META_KEY),
  ]);
  if (!accessToken || !refreshToken || !metaRaw) return null;
  try {
    return { ...(JSON.parse(metaRaw) as SessionMeta), accessToken, refreshToken };
  } catch {
    sessionTransitions.advance();
    await clearSession();
    return null;
  }
}

async function postPublic<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${nativeConfig.apiBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(json.error ?? 'OperatorOS native authentication failed'));
  return json as T;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<NativeSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    flushPendingRevocations()
      .then(readSession)
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => NetInfo.addEventListener(state => {
    if (state.isConnected === true && state.isInternetReachable !== false) void flushPendingRevocations();
  }), []);

  const refresh = useCallback(async (): Promise<string | null> => {
    const snapshot = await sessionTransitions.serialize(async () => ({
      current: await readSession(),
      generation: sessionTransitions.generation,
    }));
    const { current } = snapshot;
    if (!current) return null;
    const id = await deviceId();
    try {
      const next = await postPublic<NativeSession>('/public/torqueshed/native/refresh', {
        refreshToken: current.refreshToken,
        deviceId: id,
      });
      const installed = await sessionTransitions.serialize(async () => {
        if (!sessionTransitions.isCurrent(snapshot.generation)) return false;
        if (await SecureStore.getItemAsync(REFRESH_KEY) !== current.refreshToken) return false;
        await writeSession(next);
        setSession(next);
        return true;
      });
      if (!installed) {
        const superseded = { refreshToken: next.refreshToken, deviceId: id };
        if (await sendRevocation(superseded) === 'retry') await queuePendingRevocation(superseded);
        return null;
      }
      return next.accessToken;
    } catch {
      await sessionTransitions.serialize(async () => {
        const activeRefreshToken = await SecureStore.getItemAsync(REFRESH_KEY).catch(() => null);
        if (!sessionTransitions.isCurrent(snapshot.generation) || activeRefreshToken !== current.refreshToken) return;
        sessionTransitions.advance();
        await clearSession();
        setSession(null);
      });
      return null;
    }
  }, []);

  const login = useCallback(async () => {
    await flushPendingRevocations();
    const verifier = await randomUrlSafe(48);
    const state = await randomUrlSafe(32);
    const nonce = await randomUrlSafe(32);
    const id = await deviceId();
    const codeChallenge = (await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      verifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    )).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const authorize = new URL(nativeConfig.authorizationUrl);
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('nonce', nonce);
    authorize.searchParams.set('code_challenge', codeChallenge);
    authorize.searchParams.set('code_challenge_method', 'S256');
    authorize.searchParams.set('device_id', id);
    authorize.searchParams.set('device_name', `${Platform.OS} ${Platform.Version}`.slice(0, 120));
    authorize.searchParams.set('redirect_uri', nativeConfig.redirectUri);

    const result = await WebBrowser.openAuthSessionAsync(authorize.toString(), nativeConfig.redirectUri);
    if (result.type !== 'success') return;
    const callback = new URL(result.url);
    const returnedState = callback.searchParams.get('state') ?? '';
    const code = callback.searchParams.get('code') ?? '';
    if (returnedState !== state || !code) throw new Error('OperatorOS returned an invalid native authorization response');
    const next = await postPublic<NativeSession>('/public/torqueshed/native/exchange', {
      code,
      state,
      nonce,
      codeVerifier: verifier,
      deviceId: id,
    });
    await sessionTransitions.serialize(async () => {
      sessionTransitions.advance();
      await writeSession(next);
      setSession(next);
    });
  }, []);

  const logout = useCallback(async () => {
    const revocation = await sessionTransitions.serialize(async () => {
      sessionTransitions.advance();
      const current = await readSession();
      const entry = current ? { refreshToken: current.refreshToken, deviceId: await deviceId() } : null;
      await clearSession();
      setSession(null);
      return entry;
    });
    if (revocation && await sendRevocation(revocation) === 'retry') await queuePendingRevocation(revocation);
  }, []);

  const value = useMemo(() => ({ session, loading, login, logout, refresh }), [session, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}

export async function storedAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_KEY);
}
