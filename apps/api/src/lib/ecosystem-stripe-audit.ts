import { recurringCommercialPrices, TORQUESHED_CREDIT_CATALOG } from '@operatoros/sdk';
import { recurringStripePriceError } from './stripe-price-contract.js';

export const ECOSYSTEM_STRIPE_WEBHOOK_URL = 'https://api.operatoros.net/v1/billing/webhook';
export const ECOSYSTEM_STRIPE_EVENTS = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed',
  'payment_intent.payment_failed', 'charge.refunded', 'charge.dispute.created', 'charge.dispute.closed',
] as const;

type AuditClient = {
  accounts: { retrieve: () => Promise<any> };
  prices: { retrieve: (id: string) => Promise<any>; list: (args: any) => Promise<any> };
  products: { retrieve: (id: string) => Promise<any> };
  webhookEndpoints: { list: (args: any) => Promise<any> };
  billingPortal: { configurations: { retrieve: (id: string) => Promise<any> } };
};

/** Read-only provider facts. No customer, Checkout, catalog or database mutation. */
export async function auditEcosystemStripe(
  client: AuditClient,
  env: Record<string, string | undefined>,
) {
  const issues: string[] = [];
  const mode = env.STRIPE_MODE;
  if (mode !== 'test' && mode !== 'live') throw new Error('STRIPE_MODE must be test or live');
  if (!/^acct_[A-Za-z0-9]+$/.test(env.STRIPE_EXPECTED_ACCOUNT_ID ?? '')) {
    throw new Error('STRIPE_EXPECTED_ACCOUNT_ID is required before provider inspection');
  }
  const account = await client.accounts.retrieve();
  if (account.id !== env.STRIPE_EXPECTED_ACCOUNT_ID) throw new Error('STRIPE_ACCOUNT_MISMATCH');
  if (mode === 'live' && (account.charges_enabled !== true || account.payouts_enabled !== true)) {
    issues.push('STRIPE_ACCOUNT_PAYMENTS_OR_PAYOUTS_DISABLED');
  }
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) issues.push('STRIPE_WEBHOOK_SECRET_MISSING');

  async function productErrors(price: any): Promise<string[]> {
    if (!price?.product) return ['PRODUCT_MISSING'];
    try {
      const id = typeof price.product === 'string' ? price.product : price.product.id;
      const product = await client.products.retrieve(id);
      return product?.id === id && product.active === true && product.livemode === (mode === 'live')
        ? [] : ['PRODUCT_INACTIVE_OR_MODE_MISMATCH'];
    } catch { return ['PRODUCT_PROVIDER_UNAVAILABLE']; }
  }

  const recurring = recurringCommercialPrices(env);
  const ids = recurring.map(item => env[item.envKey]?.trim()).filter(Boolean);
  if (new Set(ids).size !== ids.length) issues.push('RECURRING_PRICE_IDS_REUSED');
  const prices: Array<{ key: string; cents: number; cadence: 'month' | 'one_time'; envKey: string | null; validated: boolean; errors: string[] }> = [];
  for (const item of recurring) {
    const priceId = env[item.envKey]?.trim();
    const errors: string[] = [];
    if (!priceId || !/^price_[A-Za-z0-9_]+$/.test(priceId)) errors.push('PRICE_NOT_CONFIGURED');
    else {
      try {
        const price = await client.prices.retrieve(priceId);
        const error = recurringStripePriceError(price, { priceId, unitAmountCents: item.cents, mode });
        if (error) errors.push(error);
        errors.push(...await productErrors(price));
      } catch { errors.push('PRICE_PROVIDER_UNAVAILABLE'); }
    }
    prices.push({ key: item.key, cents: item.cents, cadence: 'month', envKey: item.envKey, validated: errors.length === 0, errors });
  }
  for (const item of TORQUESHED_CREDIT_CATALOG) {
    const errors: string[] = [];
    try {
      const matches = await client.prices.list({ lookup_keys: [item.lookupKey], limit: 100 });
      if (matches.data?.length !== 1 || matches.has_more) errors.push('TOKEN_LOOKUP_MISSING_OR_AMBIGUOUS');
      else {
        const price = matches.data[0];
        if (price.active !== true || price.livemode !== (mode === 'live') || price.currency !== 'usd'
            || price.unit_amount !== item.amountMinor || price.type !== 'one_time' || price.recurring != null
            || price.billing_scheme !== 'per_unit' || price.transform_quantity != null || price.custom_unit_amount != null
            || price.lookup_key !== item.lookupKey) errors.push('TOKEN_PRICE_CONTRACT_MISMATCH');
        const metadata = price.metadata ?? {};
        if (metadata.operatoros_product !== 'torqueshed_ai_credits' || metadata.module_slug !== 'torqueshed'
            || metadata.package_key !== item.key || metadata.units !== String(item.units)
            || metadata.catalog_version !== 'torqueshed-credit-v1' || metadata.environment !== mode
            || metadata.sku !== item.sku || metadata.currency !== item.currency) errors.push('TOKEN_METADATA_MISMATCH');
        errors.push(...await productErrors(price));
      }
    } catch { errors.push('TOKEN_PRICE_PROVIDER_UNAVAILABLE'); }
    prices.push({ key: item.key, cents: item.amountMinor, cadence: 'one_time', envKey: null, validated: errors.length === 0, errors });
  }
  for (const item of prices) issues.push(...item.errors.map(code => `${item.key}:${code}`));

  let portalValidated = false;
  const portalId = env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim();
  if (!portalId) issues.push('STRIPE_PORTAL_CONFIGURATION_REQUIRED');
  else {
    try {
      const portal = await client.billingPortal.configurations.retrieve(portalId);
      portalValidated = portal.id === portalId && portal.active === true && portal.livemode === (mode === 'live')
        && portal.features?.subscription_update?.enabled === false && portal.features?.subscription_pause?.enabled !== true;
      if (!portalValidated) issues.push('STRIPE_PORTAL_CONFIGURATION_UNSAFE');
    } catch { issues.push('STRIPE_PORTAL_PROVIDER_UNAVAILABLE'); }
  }
  let webhookValidated = false;
  try {
    const endpoints: any[] = [];
    let startingAfter: string | undefined;
    do {
      const page = await client.webhookEndpoints.list({ limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
      endpoints.push(...page.data);
      startingAfter = page.has_more ? page.data.at(-1)?.id : undefined;
      if (page.has_more && !startingAfter) throw new Error('WEBHOOK_PAGINATION_INVALID');
    } while (startingAfter && endpoints.length < 1000);
    if (startingAfter) throw new Error('WEBHOOK_PAGINATION_LIMIT');
    const exact = endpoints.filter(endpoint => endpoint.url === ECOSYSTEM_STRIPE_WEBHOOK_URL
      && endpoint.status === 'enabled' && endpoint.livemode === (mode === 'live'));
    webhookValidated = exact.length === 1 && (exact[0].enabled_events?.includes('*')
      || ECOSYSTEM_STRIPE_EVENTS.every(event => exact[0].enabled_events?.includes(event)));
    if (!webhookValidated) issues.push('STRIPE_CANONICAL_WEBHOOK_MISSING_AMBIGUOUS_OR_EVENTS_INCOMPLETE');
  } catch { issues.push('STRIPE_WEBHOOK_PROVIDER_UNAVAILABLE'); }
  return {
    contractVersion: 1, mode, operation: 'read-only', accountMatched: true,
    providerConfigurationValidated: issues.length === 0, portalValidated, webhookValidated,
    prices, issues, secretValuesIncluded: false,
    outstandingAcceptance: ['hosted paid checkout and signed settlement', 'tenant entitlement and seat activation', 'refund/cancellation access reconciliation', 'TorqueShed persisted catalog mapping and purchase activation', 'live module provider workflows'],
  };
}
