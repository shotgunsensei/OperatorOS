import https, { type RequestOptions } from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { FIELDNODE_IDENTITY_ISSUER, type FieldNodeIdentityResponse } from '../../../../packages/sdk/src/fieldnode-identity.js';

export const FIELDNODE_GATEWAY_ROUTES = Object.freeze({
  '/api/auth/operatoros/consume': '/portal/auth/operatoros/consume',
  '/api/auth/operatoros/mfa/verify': '/portal/auth/operatoros/mfa/verify',
} as const);
const FIELDNODE_LOCAL_COOKIES = new Set([
  'portal_session', 'portal_csrf', 'portal_mfa', 'portal_operatoros_mfa', 'portal_operatoros_setup',
]);
export const FIELDNODE_GATEWAY_BODY_LIMIT = 64 * 1024;
const cookieValue = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/u;

export class FieldNodeGatewayError extends Error {
  constructor(readonly statusCode: number, readonly code: string, readonly signInRequired = false) {
    super('FieldNode management request could not be completed');
  }
}

export interface FieldNodeGatewayConfig {
  readonly authorityOrigin: string;
  readonly upstreamOrigin: string;
  readonly publicOrigin: 'https://fieldnode.operatoros.net';
}

function tlsOrigin(value: string | undefined): string | null {
  if (!value || !/^https:\/\/[^/?#%\\\s]+\/?$/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || !url.hostname || url.port === '0') return null;
    return url.origin;
  } catch { return null; }
}

/** Snapshot trusted, explicit server configuration. No production fallback. */
export function fieldNodeGatewayConfig(env: NodeJS.ProcessEnv = process.env): FieldNodeGatewayConfig | null {
  const authorityOrigin = tlsOrigin(env.FIELDNODE_OPERATOROS_AUTHORITY_ORIGIN);
  const upstreamOrigin = tlsOrigin(env.FIELDNODE_MANAGEMENT_UPSTREAM_ORIGIN);
  if (!authorityOrigin || !upstreamOrigin || authorityOrigin === upstreamOrigin) return null;
  return Object.freeze({ authorityOrigin, upstreamOrigin, publicOrigin: 'https://fieldnode.operatoros.net' });
}

export function fieldNodeGatewayCookies(raw: string | undefined): { central: string; upstream: string; csrf: string | null } {
  if (!raw || Buffer.byteLength(raw) > 32 * 1024) throw new FieldNodeGatewayError(401, 'FIELDNODE_SESSION_REQUIRED');
  const accepted = new Map<string, string>();
  for (const part of raw.split(';')) {
    const item = part.trim();
    const separator = item.indexOf('=');
    if (separator <= 0) throw new FieldNodeGatewayError(400, 'FIELDNODE_COOKIE_INVALID');
    const name = item.slice(0, separator);
    if (name !== 'operatoros_session' && !FIELDNODE_LOCAL_COOKIES.has(name)) continue;
    const value = item.slice(separator + 1);
    if (accepted.has(name) || !value || value.length > 8192 || !cookieValue.test(value)) {
      throw new FieldNodeGatewayError(400, 'FIELDNODE_COOKIE_INVALID');
    }
    accepted.set(name, value);
  }
  const session = accepted.get('operatoros_session');
  if (!session) throw new FieldNodeGatewayError(401, 'FIELDNODE_SESSION_REQUIRED');
  return {
    central: `operatoros_session=${session}`,
    upstream: [...accepted].map(([name, value]) => `${name}=${value}`).join('; '),
    csrf: accepted.get('portal_csrf') ?? null,
  };
}

/** This is validation of an authenticated server read, never browser JSON. */
export function isCurrentFieldNodeIdentity(value: unknown, now = Date.now()): value is FieldNodeIdentityResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const identity = value as Record<string, unknown>;
  const id = (field: unknown) => typeof field === 'string' && field.length > 0 && field.length <= 128 && !/[\s\u0000-\u001f\u007f]/u.test(field);
  return Object.keys(identity).length === 9 && identity.contractVersion === 1
    && identity.issuer === FIELDNODE_IDENTITY_ISSUER && identity.module === 'fieldnode'
    && id(identity.subject) && id(identity.tenantId)
    && typeof identity.membershipRole === 'string'
    && ['owner', 'admin', 'member', 'viewer'].includes(identity.membershipRole)
    && typeof identity.moduleAccessLevel === 'string'
    && ['viewer', 'user', 'manager'].includes(identity.moduleAccessLevel)
    && identity.authenticationAssurance === 'not_attested'
    && typeof identity.sessionExpiresAt === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(identity.sessionExpiresAt)
    && Number.isFinite(Date.parse(identity.sessionExpiresAt))
    && new Date(identity.sessionExpiresAt).toISOString() === identity.sessionExpiresAt
    && Date.parse(identity.sessionExpiresAt) > now;
}

export function fieldNodeResponseCookies(headers: readonly string[], now = Date.now()): string[] {
  if (headers.length > FIELDNODE_LOCAL_COOKIES.size * 2) throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
  const seen = new Map<string, { deletion: boolean; index: number }>();
  const output: string[] = [];
  for (const header of headers) {
    if (header.length > 8192 || /[\u0000-\u001f\u007f]/u.test(header)) throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
    const [pair, ...attributes] = header.split(';').map(part => part.trim());
    const separator = pair!.indexOf('=');
    const name = pair!.slice(0, separator);
    const value = pair!.slice(separator + 1);
    if (separator <= 0 || !FIELDNODE_LOCAL_COOKIES.has(name) || value !== '""' && !cookieValue.test(value)) {
      throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
    }
    const parsed = new Map<string, string>();
    for (const attribute of attributes) {
      const split = attribute.indexOf('=');
      const key = (split < 0 ? attribute : attribute.slice(0, split)).toLowerCase();
      const attributeValue = split < 0 ? '' : attribute.slice(split + 1);
      if (parsed.has(key) || !['path', 'secure', 'httponly', 'samesite', 'max-age', 'expires'].includes(key)) {
        throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
      }
      parsed.set(key, attributeValue);
    }
    const validMaxAge = !parsed.has('max-age') || /^-?\d{1,10}$/u.test(parsed.get('max-age')!);
    const expires = parsed.get('expires');
    const validExpires = !parsed.has('expires') || Boolean(expires && Number.isFinite(Date.parse(expires)) && new Date(expires).toUTCString() === expires);
    const deletion = (value === '' || value === '""') && validMaxAge && validExpires
      && (parsed.has('max-age') && Number(parsed.get('max-age')) <= 0 || parsed.has('expires') && Date.parse(parsed.get('expires')!) <= now);
    if (parsed.get('path') !== '/manage' || !validMaxAge || !validExpires
      || parsed.has('secure') && parsed.get('secure') !== ''
      || (parsed.has('httponly') && parsed.get('httponly') !== '')
      || parsed.has('samesite') && !['lax', 'strict'].includes((parsed.get('samesite') ?? '').toLowerCase())) {
      throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
    }
    if (!deletion && (!value || !cookieValue.test(value) || parsed.get('secure') !== ''
      || (name !== 'portal_csrf' && parsed.get('httponly') !== '')
      || (parsed.get('samesite') ?? '').toLowerCase() !== 'strict'
      || parsed.has('max-age') && Number(parsed.get('max-age')) <= 0
      || expires && Date.parse(expires) <= now)) {
      throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
    }
    const previous = seen.get(name);
    if (previous && (!previous.deletion || deletion)) throw new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID');
    const result = deletion ? `${name}=; Max-Age=0; Path=/manage; Secure; SameSite=Strict${name === 'portal_csrf' ? '' : '; HttpOnly'}` : header;
    if (previous) output[previous.index] = result;
    else output.push(result);
    seen.set(name, { deletion, index: previous?.index ?? output.length - 1 });
  }
  return output;
}

export interface FieldNodeTransportRequest {
  readonly url: URL;
  readonly method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string | Buffer;
  readonly timeoutMs: number;
  readonly maxBytes: number;
  readonly signal?: AbortSignal;
}
export interface FieldNodeTransportResponse {
  readonly statusCode: number;
  readonly contentType: string;
  readonly body: string;
  readonly setCookies: readonly string[];
}
export type FieldNodeTransport = (request: FieldNodeTransportRequest) => Promise<FieldNodeTransportResponse>;
type HttpsFactory = (url: URL, options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest;

/** Native HTTPS makes one attempt, verifies TLS and never follows redirects.
 * The completion timer covers DNS/connect/headers/body, not just socket idle. */
export function fieldNodeBoundedHttps(input: FieldNodeTransportRequest, factory: HttpsFactory = https.request): Promise<FieldNodeTransportResponse> {
  return new Promise((resolve, reject) => {
    if (input.signal?.aborted) { reject(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE')); return; }
    let done = false;
    let request: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    const finish = (error?: FieldNodeGatewayError, result?: FieldNodeTransportResponse) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
      if (error) {
        response?.destroy();
        request?.destroy();
        reject(error);
      } else resolve(result!);
    };
    const abort = () => finish(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE'));
    const timer = setTimeout(() => finish(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE')), input.timeoutMs);
    input.signal?.addEventListener('abort', abort, { once: true });
    try {
      request = factory(input.url, {
        method: input.method, headers: input.headers, rejectUnauthorized: true, maxHeaderSize: 16 * 1024,
      }, received => {
        response = received;
        if (done) { received.destroy(); return; }
        const chunks: Buffer[] = [];
        let bytes = 0;
        received.on('error', () => finish(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE')));
        received.on('aborted', () => finish(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE')));
        received.on('data', (chunk: Buffer) => {
          if (done) return;
          bytes += chunk.length;
          if (bytes > input.maxBytes) { finish(new FieldNodeGatewayError(502, 'FIELDNODE_UPSTREAM_INVALID')); return; }
          chunks.push(chunk);
        });
        received.on('end', () => finish(undefined, {
          statusCode: received.statusCode ?? 502,
          contentType: received.headers['content-type'] ?? '',
          setCookies: received.headers['set-cookie'] ?? [],
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      request.on('error', () => finish(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE')));
      request.end(input.body);
    } catch { finish(new FieldNodeGatewayError(503, 'FIELDNODE_UPSTREAM_UNAVAILABLE')); }
  });
}
