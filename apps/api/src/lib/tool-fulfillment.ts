import { isToolBridgeData, type OfficeExitPurchaseSync } from '@operatoros/sdk';
import { signToolBridgeAssertion, type ToolBridgeSigningConfig } from './tool-bridge-assertion.js';
import { exactToolHttpsOrigin } from './tool-commerce.js';
import * as productionStore from './tool-purchase-store.js';

type Store = Pick<typeof productionStore, 'claimToolFulfillment' | 'getTenantToolPurchase'
  | 'completeToolFulfillment' | 'retryToolFulfillment'>;
export type OfficeExitDeliveryConfiguration = { enabled: false } | {
  enabled: true; signing: ToolBridgeSigningConfig;
};
export interface OfficeExitDeliveryDependencies {
  store: Store;
  fetch: typeof globalThis.fetch;
  now?: () => number;
}
async function acknowledgement(response: Response): Promise<void> {
  if (response.status !== 200 || !response.body) throw new Error('TOOL_DELIVERY_REJECTED');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > 1024) throw new Error('TOOL_DELIVERY_RESPONSE_INVALID');
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('TOOL_DELIVERY_RESPONSE_INVALID');
  const value = body as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || typeof value.applied !== 'boolean'
    || !(value.applied === true && value.reason === 'updated' || value.applied === false && value.reason === 'duplicate')) {
    throw new Error('TOOL_DELIVERY_RESPONSE_INVALID');
  }
}

/** Explicitly invoked only after reviewed activation. No background registration or environment auto-enable. */
export async function deliverOfficeExitPurchases(
  configuration: OfficeExitDeliveryConfiguration = { enabled: false },
  dependencies: OfficeExitDeliveryDependencies = { store: productionStore, fetch: globalThis.fetch },
): Promise<{ enabled: boolean; claimed: number; delivered: number; deferred: number }> {
  if (!configuration.enabled) return { enabled: false, claimed: 0, delivered: 0, deferred: 0 };
  const endpoint = exactToolHttpsOrigin(configuration.signing.audience) + '/api/operatoros/fulfillment';
  exactToolHttpsOrigin(configuration.signing.issuer);
  const clock = dependencies.now ?? Date.now;
  const rows = await dependencies.store.claimToolFulfillment({ workerId: 'officeexit-fulfillment-v1', toolSlug: 'officeexit', limit: 10, leaseSeconds: 60 });
  const result = { enabled: true, claimed: rows.length, delivered: 0, deferred: 0 };
  for (const row of rows) {
    if (!row.leaseToken) throw new Error('TOOL_DELIVERY_LEASE_INVALID');
    const fence = { tenantId: row.tenantId, purchaseId: row.purchaseId, revision: row.revision, leaseToken: row.leaseToken };
    try {
      // Re-read authority immediately before signing. A revision change resets
      // the outbox lease; a stale worker can neither acknowledge nor erase it.
      const current = await dependencies.store.getTenantToolPurchase(row.tenantId, row.purchaseId);
      const expectedState = current?.status === 'paid' ? 'active' : current?.status;
      if (row.status !== 'leased' || !row.leaseExpiresAt || !Number.isFinite(Date.parse(row.leaseExpiresAt))
        || Date.parse(row.leaseExpiresAt) <= clock() || row.toolSlug !== 'officeexit'
        || !current || current.toolSlug !== 'officeexit' || current.tenantId !== row.tenantId || current.revision !== row.revision
        || expectedState !== row.payload.state || row.payload.moduleSlug !== 'officeexit'
        || row.payload.operatorosTenantId !== row.tenantId || row.payload.purchaseId !== row.purchaseId
        || row.payload.revision !== row.revision || !isToolBridgeData('officeexit.purchase.sync', row.payload)) {
        throw new Error('TOOL_DELIVERY_REVISION_CHANGED');
      }
      const expectedGrant = current.status === 'paid' && current.snapshot.officeexitGrant
        ? { ...current.snapshot.officeexitGrant, licenseTermsVersion: current.snapshot.licenseTermsVersion } : null;
      const actualGrant = row.payload.grant;
      if (expectedGrant === null ? actualGrant !== null : !actualGrant
        || actualGrant.edition !== expectedGrant.edition || actualGrant.coverage !== expectedGrant.coverage
        || actualGrant.licenseTermsVersion !== expectedGrant.licenseTermsVersion
        || actualGrant.capabilities.length !== expectedGrant.capabilities.length
        || !expectedGrant.capabilities.every(value => (actualGrant.capabilities as readonly string[]).includes(value))) {
        throw new Error('TOOL_DELIVERY_GRANT_CHANGED');
      }
      const assertion = signToolBridgeAssertion(configuration.signing, 'officeexit.purchase.sync', row.payload as OfficeExitPurchaseSync, Math.floor(clock() / 1000));
      const response = await dependencies.fetch(endpoint, {
        method: 'POST', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(10_000),
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ assertion }),
      });
      await acknowledgement(response);
      if (await dependencies.store.completeToolFulfillment(fence)) result.delivered++;
      else result.deferred++;
    } catch {
      // Never persist provider bodies, assertion tokens, URLs, keys or raw errors.
      await dependencies.store.retryToolFulfillment({ ...fence, errorCode: 'TOOL_DELIVERY_UNCONFIRMED', retryAfterSeconds: 60 });
      result.deferred++;
    }
  }
  return result;
}
