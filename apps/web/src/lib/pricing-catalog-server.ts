import { resolveServerApiOrigin } from './api-config';
import { readBillingCatalog } from './pricing-catalog';

/** Fetch the same anonymous catalog as the configurator; never substitute old prices. */
export async function getPublicBillingCatalog() {
  try {
    const response = await fetch(`${resolveServerApiOrigin()}/v1/billing/catalog`, {
      cache: 'no-store', signal: AbortSignal.timeout(4000),
    });
    return response.ok ? readBillingCatalog(await response.json()) : null;
  } catch {
    return null;
  }
}
