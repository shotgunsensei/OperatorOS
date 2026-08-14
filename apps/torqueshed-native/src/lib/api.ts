import { nativeConfig } from './config';
import { storedAccessToken } from './auth';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

let refreshAccess: (() => Promise<string | null>) | null = null;
const refreshInFlightByAccessToken = new Map<string, Promise<string | null>>();

function coalescedRefresh(
  accessToken: string | null,
  callback: () => Promise<string | null>,
): Promise<string | null> {
  const key = accessToken ?? '<anonymous>';
  const existing = refreshInFlightByAccessToken.get(key);
  if (existing) return existing;
  const pending = callback().finally(() => {
    if (refreshInFlightByAccessToken.get(key) === pending) refreshInFlightByAccessToken.delete(key);
  });
  refreshInFlightByAccessToken.set(key, pending);
  return pending;
}

export function configureApiRefresh(callback: () => Promise<string | null>): () => void {
  refreshAccess = callback;
  return () => { if (refreshAccess === callback) refreshAccess = null; };
}

async function parse(response: Response): Promise<any> {
  if (response.status === 204) return null;
  return response.json().catch(() => ({}));
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    idempotencyKey?: string;
    retryAuth?: boolean;
    accessToken?: string | null;
    refreshAccess?: () => Promise<string | null>;
    validateRefreshResult?: (accessToken: string | null) => void;
  } = {},
): Promise<T> {
  const send = async (token: string | null) => fetch(`${nativeConfig.apiBaseUrl}${path}`, {
    method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const hasBoundAccessToken = Object.prototype.hasOwnProperty.call(options, 'accessToken');
  const initialAccessToken = hasBoundAccessToken ? options.accessToken ?? null : await storedAccessToken();
  let response = await send(initialAccessToken);
  if (response.status === 401 && options.retryAuth !== false && (options.refreshAccess || refreshAccess)) {
    const token = await coalescedRefresh(initialAccessToken, options.refreshAccess ?? refreshAccess!);
    options.validateRefreshResult?.(token);
    if (token) response = await send(token);
  }
  const payload = await parse(response);
  if (!response.ok) throw new ApiError(String(payload?.error ?? `Request failed (${response.status})`), response.status, payload?.code);
  return payload as T;
}
