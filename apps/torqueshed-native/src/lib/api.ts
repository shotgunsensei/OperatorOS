import { nativeConfig } from './config';
import { storedAccessToken } from './auth';

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); }
}

let refreshAccess: (() => Promise<string | null>) | null = null;
let refreshInFlight: Promise<string | null> | null = null;

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
  let response = await send(hasBoundAccessToken ? options.accessToken ?? null : await storedAccessToken());
  if (response.status === 401 && options.retryAuth !== false && (options.refreshAccess || refreshAccess)) {
    const token = options.refreshAccess
      ? await options.refreshAccess()
      : await (refreshInFlight ??= refreshAccess!().finally(() => { refreshInFlight = null; }));
    if (token) response = await send(token);
  }
  const payload = await parse(response);
  if (!response.ok) throw new ApiError(String(payload?.error ?? `Request failed (${response.status})`), response.status, payload?.code);
  return payload as T;
}
