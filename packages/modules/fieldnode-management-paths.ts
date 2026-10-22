/** Frozen FieldNode PR19 browser surface. This never accepts a device/agent route. */
export const FIELDNODE_MANAGED_ASSETS = ['index-B5aEKOjw.css', 'index-BWuDwhpj.js'] as const;
export const FIELDNODE_PORTAL_ROUTES = [
  ['GET', '/api/auth/operatoros/status'], ['POST', '/api/auth/operatoros/signup'],
  ['POST', '/api/auth/operatoros/setup/confirm'], ['POST', '/api/auth/operatoros/link'],
  ['POST', '/api/auth/operatoros/consume'], ['POST', '/api/auth/operatoros/mfa/verify'],
  ['GET', '/api/auth/operatoros/mfa/status'], ['POST', '/api/auth/operatoros/mfa/recovery'],
  ['GET', '/api/auth/me'], ['POST', '/api/auth/logout'],
  ['GET', '/api/nodes'], ['POST', '/api/nodes'], ['DELETE', '/api/nodes/:uuid'],
  ['POST', '/api/nodes/:uuid/enrollment'], ['POST', '/api/nodes/:uuid/revoke'],
  ['GET', '/api/nodes/:uuid/access'], ['PUT', '/api/nodes/:uuid/access'],
  ['GET', '/api/users'], ['PATCH', '/api/users/:uuid'], ['GET', '/api/audit'],
] as const;
export const FIELDNODE_UUID_PATTERN = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
export const FIELDNODE_BODYLESS_PORTAL_PATHS = [
  '/api/auth/operatoros/consume', '/api/auth/logout', '/api/nodes/:uuid/enrollment',
  '/api/nodes/:uuid/revoke', '/api/nodes/:uuid',
] as const;
const nodePattern = new RegExp(`^/manage/nodes/(${FIELDNODE_UUID_PATTERN})(/.*)$`, 'u');

/** Mirrors the frozen appliance's fieldnode.portal_link.allowed_path; no decoding. */
export function fieldNodeAllowedConsolePath(path: string): boolean {
  if (path.length > 2048 || !/^\/api\/v1\/[A-Za-z0-9_/?=&.:-]+$/u.test(path)
    || path.includes('..') || path.includes('//') || path.startsWith('/api/v1/portal/')) return false;
  const clean = path.split('?', 1)[0]!;
  return !clean.startsWith('/api/v1/auth/mfa/')
    && !['/api/v1/auth/bootstrap', '/api/v1/auth/login', '/api/v1/auth/logout'].includes(clean);
}

export interface FieldNodeManagementPath {
  readonly kind: 'html' | 'asset' | 'portal' | 'console' | 'serial';
  readonly upstreamPath: string;
  readonly bodyLimit: number;
  readonly nodeId?: string;
  readonly bodyless?: boolean;
}

/** Input is the original encoded URI, not a URL-normalized pathname. */
export function fieldNodeManagementPath(method: string, raw: string, websocket = false): FieldNodeManagementPath | null {
  if (raw.length > 2300 || /[%\\\s\u0000-\u001f\u007f#]/u.test(raw) || raw.includes('..') || raw.includes('//')) return null;
  if (raw === '/manage' || raw === '/manage/') {
    return !websocket && ['GET', 'HEAD'].includes(method) ? { kind: 'html', upstreamPath: '/manage', bodyLimit: 0 } : null;
  }
  if (FIELDNODE_MANAGED_ASSETS.some(file => raw === `/manage/assets/${file}`)) {
    return !websocket && ['GET', 'HEAD'].includes(method) ? { kind: 'asset', upstreamPath: raw.slice(7), bodyLimit: 0 } : null;
  }
  for (const [allowedMethod, path] of FIELDNODE_PORTAL_ROUTES) {
    if (websocket || method !== allowedMethod) continue;
    if (new RegExp(`^/manage${path.replace(':uuid', FIELDNODE_UUID_PATTERN)}$`, 'u').test(raw)) {
      return { kind: 'portal', upstreamPath: raw.slice(7).replace(/^\/api/u, '/portal'), bodyLimit: 65536,
        bodyless: (FIELDNODE_BODYLESS_PORTAL_PATHS as readonly string[]).includes(path) };
    }
  }
  const node = nodePattern.exec(raw);
  if (!node) return null;
  const [, nodeId, suffix] = node;
  if (suffix === '/console') return !websocket && method === 'GET'
    ? { kind: 'html', upstreamPath: `/nodes/${nodeId}/console`, bodyLimit: 0, nodeId } : null;
  if (suffix === '/api/v1/serial/connect') return websocket && method === 'GET'
    ? { kind: 'serial', upstreamPath: `/nodes/${nodeId}${suffix}`, bodyLimit: 0, nodeId } : null;
  if (websocket || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !fieldNodeAllowedConsolePath(suffix!)) return null;
  const contentUpload = method === 'PUT' && suffix!.includes('/library/') && suffix!.includes('/content?');
  return { kind: 'console', upstreamPath: `/nodes/${nodeId}${suffix}`, bodyLimit: contentUpload ? 1048576 : 65536, nodeId };
}
