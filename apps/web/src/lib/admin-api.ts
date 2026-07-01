'use client';

export const ADMIN_API_PROXY_BASE = '/api';

export class AdminApiError extends Error {
  status: number;
  code?: string;
  body: unknown;
  endpoint: string;
  action: string;

  constructor(
    message: string,
    status: number,
    code: string | undefined,
    body: unknown,
    endpoint: string,
    action: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.body = body;
    this.endpoint = endpoint;
    this.action = action;
  }
}

export function normalizeAdminPath(path: string): string {
  const raw = String(path ?? '').trim();
  if (!raw) throw new Error('Admin API path is required');

  let next = raw.startsWith('/') ? raw : `/${raw}`;
  if (next === '/api') throw new Error('Admin API path must include /admin');
  if (next.startsWith('/api/')) next = next.slice('/api'.length);
  if (next.startsWith('/v1/admin')) {
    next = next.replace(/^\/v1(?=\/admin(?:$|[/?#]))/, '');
  }
  if (next === '/admin' || next.startsWith('/admin/') || next.startsWith('/admin?')) return next;

  throw new Error(`Admin API path must target /admin, got ${raw}`);
}

export function adminApiUrl(path: string): string {
  return `${ADMIN_API_PROXY_BASE}${normalizeAdminPath(path)}`;
}

function readClientStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function shouldJsonEncodeBody(body: RequestInit['body'] | Record<string, unknown>): body is Record<string, unknown> {
  if (body == null || typeof body !== 'object') return false;
  if (typeof FormData !== 'undefined' && body instanceof FormData) return false;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return false;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return false;
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) return false;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(body)) return false;
  return !(typeof ReadableStream !== 'undefined' && body instanceof ReadableStream);
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function adminApiCall<T = any>(
  path: string,
  init: Omit<RequestInit, 'body'> & {
    body?: RequestInit['body'] | Record<string, unknown>;
    action?: string;
  } = {},
): Promise<T> {
  const { action: requestedAction, ...fetchInit } = init;
  const token = readClientStorage('token');
  const tenantId = readClientStorage('activeTenantId');
  const headers = new Headers(fetchInit.headers);
  const body = shouldJsonEncodeBody(fetchInit.body) ? JSON.stringify(fetchInit.body) : fetchInit.body;
  const endpoint = adminApiUrl(path);
  const method = String(fetchInit.method || 'GET').toUpperCase();
  const action = requestedAction || `${method} ${normalizeAdminPath(path)}`;

  if (body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  if (tenantId && !headers.has('X-Tenant-Id')) headers.set('X-Tenant-Id', tenantId);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      ...fetchInit,
      body: body as RequestInit['body'],
      headers,
      credentials: 'include',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network request failed';
    throw new AdminApiError(message, 0, 'NETWORK_ERROR', null, endpoint, action);
  }

  const parsed = await parseResponseBody(res);
  if (!res.ok) {
    const bodyObj = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
    const message = typeof bodyObj.error === 'string' ? bodyObj.error : res.statusText || `HTTP ${res.status}`;
    const code = typeof bodyObj.code === 'string' ? bodyObj.code : undefined;
    throw new AdminApiError(message, res.status, code, parsed, endpoint, action);
  }

  return parsed as T;
}
