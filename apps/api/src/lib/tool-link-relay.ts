import { isToolBridgeUuid, type OfficeExitMappingLink } from '@operatoros/sdk';
import { exactToolHttpsOrigin } from './tool-commerce.js';
import { signToolBridgeAssertion, type ToolBridgeSigningConfig } from './tool-bridge-assertion.js';

export interface OfficeExitLinkRequest {
  requestId: string; officeexitOrganizationId: string; officeexitUserId: string;
  officeexitOrganizationName: string; expiresAt: string;
}
export class ToolLinkRelayError extends Error {
  constructor(readonly code = 'TOOL_LINK_REQUEST_UNCONFIRMED', readonly statusCode = 409) { super(code); }
}
export interface ToolLinkRelayDependencies { fetch: typeof globalThis.fetch; now?: () => number }
async function post(signing: ToolBridgeSigningConfig, path: string, body: unknown, deps: ToolLinkRelayDependencies): Promise<Record<string, unknown>> {
  const response = await deps.fetch(exactToolHttpsOrigin(signing.audience) + path, {
    method: 'POST', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
  });
  if (response.status !== 200 || !response.body) throw new ToolLinkRelayError();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength; if (bytes > 2048) throw new ToolLinkRelayError(); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ToolLinkRelayError();
  return value as Record<string, unknown>;
}
/** A request UUID is a reference only. Both read/proposal transports require short-lived dedicated signatures. */
export async function inspectOfficeExitLinkRequest(signing: ToolBridgeSigningConfig,
  identity: { tenantId: string; userId: string }, requestId: string,
  deps: ToolLinkRelayDependencies = { fetch: globalThis.fetch }): Promise<OfficeExitLinkRequest> {
  if (!isToolBridgeUuid(requestId)) throw new ToolLinkRelayError('TOOL_LINK_REQUEST_INVALID', 422);
  const clock = deps.now ?? Date.now;
  const assertion = signToolBridgeAssertion(signing, 'officeexit.mapping.inspect', {
    contractVersion: 1, moduleSlug: 'officeexit', operatorosTenantId: identity.tenantId,
    operatorosUserId: identity.userId, requestId,
  }, Math.floor(clock() / 1000));
  const response = await post(signing, '/api/operatoros/link-requests/inspect', { assertion }, deps);
  if (Object.keys(response).length !== 5 || response.requestId !== requestId
    || !isToolBridgeUuid(response.officeexitOrganizationId) || !isToolBridgeUuid(response.officeexitUserId)
    || typeof response.officeexitOrganizationName !== 'string' || response.officeexitOrganizationName.length > 200
    || typeof response.expiresAt !== 'string' || !Number.isFinite(Date.parse(response.expiresAt))
    || Date.parse(response.expiresAt) <= clock() || Date.parse(response.expiresAt) > clock() + 305_000) {
    throw new ToolLinkRelayError();
  }
  return response as unknown as OfficeExitLinkRequest;
}
export async function proposeOfficeExitLink(signing: ToolBridgeSigningConfig,
  identity: { tenantId: string; userId: string }, request: OfficeExitLinkRequest,
  deps: ToolLinkRelayDependencies = { fetch: globalThis.fetch }): Promise<{ redirectUrl: string }> {
  const now = (deps.now ?? Date.now)();
  if (Date.parse(request.expiresAt) <= now) throw new ToolLinkRelayError('TOOL_LINK_REQUEST_EXPIRED');
  const data: OfficeExitMappingLink = { contractVersion: 1, moduleSlug: 'officeexit', operatorosTenantId: identity.tenantId,
    operatorosUserId: identity.userId, officeexitOrganizationId: request.officeexitOrganizationId, officeexitUserId: request.officeexitUserId };
  const assertion = signToolBridgeAssertion(signing, 'officeexit.mapping.link', data, Math.floor(now / 1000));
  const result = await post(signing, '/api/operatoros/link-requests/propose', { requestId: request.requestId, assertion }, deps);
  if (Object.keys(result).length !== 1 || result.pendingConfirmation !== true) throw new ToolLinkRelayError();
  return { redirectUrl: exactToolHttpsOrigin(signing.audience) + '/operatoros/link?request=' + encodeURIComponent(request.requestId) };
}
