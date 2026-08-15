import {
  TORQUESHED_CREDIT_CATALOG,
  TORQUESHED_CREDIT_CATALOG_VERSION,
  persistTorqueShedCatalogMapping,
  torqueShedStripeMetadata,
  type TorqueShedCatalogMapping,
  type TorqueShedCreditPackage,
  type TorqueShedStripeMode,
} from './torqueshed-credit-catalog.js';

type StripeObject = {
  id: string;
  active?: boolean;
  livemode?: boolean;
  metadata?: Record<string, string>;
};
type StripeProduct = StripeObject & { name?: string };
type StripePrice = StripeObject & {
  lookup_key?: string | null;
  currency?: string;
  unit_amount?: number | null;
  recurring?: unknown;
  product?: string | StripeProduct;
};

export type TorqueShedCatalogStripeClient = {
  accounts: { retrieve: () => Promise<{ id: string }> };
  products: {
    list: (args: unknown) => Promise<{ data: StripeProduct[] }>;
    create: (args: unknown) => Promise<StripeProduct>;
    retrieve: (id: string) => Promise<StripeProduct>;
  };
  prices: {
    list: (args: unknown) => Promise<{ data: StripePrice[] }>;
    create: (args: unknown) => Promise<StripePrice>;
  };
};

export type TorqueShedCatalogReportItem = {
  packageKey: string;
  lookupKey: string;
  productId: string | null;
  priceId: string | null;
  action: 'none' | 'would_create_product_and_price' | 'would_create_price' | 'created_product_and_price' | 'created_price';
  status: 'validated' | 'missing' | 'drift';
  driftCodes: string[];
};

export type TorqueShedCatalogProvisioningReport = {
  contractVersion: 1;
  catalogVersion: string;
  mode: TorqueShedStripeMode;
  operation: 'dry-run' | 'apply' | 'validate';
  accountId: string;
  status: 'validated' | 'changes_required' | 'drift';
  created: { products: number; prices: number };
  items: TorqueShedCatalogReportItem[];
  legacyLookupKeys: string[];
  safeToEnablePurchases: boolean;
};

function metadataDrift(actual: Record<string, string> | undefined, expected: Record<string, string>): boolean {
  return Object.entries(expected).some(([key, value]) => actual?.[key] !== value);
}

function productDrift(product: StripeProduct, item: TorqueShedCreditPackage, mode: TorqueShedStripeMode): string[] {
  const drift: string[] = [];
  if (product.active === false) drift.push('PRODUCT_INACTIVE');
  if (product.livemode !== (mode === 'live')) drift.push('PRODUCT_MODE_MISMATCH');
  if (product.name !== `Torque Assist ${item.name} credits`) drift.push('PRODUCT_NAME_DRIFT');
  if (metadataDrift(product.metadata, torqueShedStripeMetadata(item, mode))) drift.push('PRODUCT_METADATA_DRIFT');
  return drift;
}

function priceDrift(price: StripePrice, product: StripeProduct, item: TorqueShedCreditPackage, mode: TorqueShedStripeMode): string[] {
  const drift: string[] = [];
  if (price.active !== true) drift.push('PRICE_INACTIVE');
  if (price.livemode !== (mode === 'live')) drift.push('PRICE_MODE_MISMATCH');
  if (price.lookup_key !== item.lookupKey) drift.push('PRICE_LOOKUP_KEY_DRIFT');
  if (price.unit_amount !== item.amountMinor) drift.push('PRICE_AMOUNT_DRIFT');
  if (price.currency?.toUpperCase() !== item.currency) drift.push('PRICE_CURRENCY_DRIFT');
  if (price.recurring != null) drift.push('PRICE_NOT_ONE_TIME');
  const productId = typeof price.product === 'string' ? price.product : price.product?.id;
  if (productId !== product.id) drift.push('PRICE_PRODUCT_MISMATCH');
  if (metadataDrift(price.metadata, torqueShedStripeMetadata(item, mode))) drift.push('PRICE_METADATA_DRIFT');
  return drift;
}

async function findProduct(client: TorqueShedCatalogStripeClient, item: TorqueShedCreditPackage, mode: TorqueShedStripeMode) {
  const listed = await client.products.list({ active: true, limit: 100 });
  return listed.data.filter((product) =>
    product.metadata?.package_key === item.key
    && product.metadata?.catalog_version === TORQUESHED_CREDIT_CATALOG_VERSION
    && product.metadata?.environment === mode);
}

async function loadProduct(client: TorqueShedCatalogStripeClient, price: StripePrice): Promise<StripeProduct> {
  return typeof price.product === 'string' ? client.products.retrieve(price.product) : price.product!;
}

export async function provisionTorqueShedStripeCatalog(input: {
  client: TorqueShedCatalogStripeClient;
  mode: TorqueShedStripeMode;
  operation: 'dry-run' | 'apply' | 'validate';
  persist?: (mapping: TorqueShedCatalogMapping) => Promise<void>;
}): Promise<TorqueShedCatalogProvisioningReport> {
  const account = await input.client.accounts.retrieve();
  if (!account?.id) throw Object.assign(new Error('Stripe account identity is unavailable'), { code: 'STRIPE_ACCOUNT_UNAVAILABLE' });
  const persist = input.persist ?? persistTorqueShedCatalogMapping;
  const created = { products: 0, prices: 0 };
  const items: TorqueShedCatalogReportItem[] = [];

  for (const item of TORQUESHED_CREDIT_CATALOG) {
    const prices = await input.client.prices.list({ lookup_keys: [item.lookupKey], limit: 100 });
    if (prices.data.length > 1) {
      items.push({ packageKey: item.key, lookupKey: item.lookupKey, productId: null, priceId: null, action: 'none', status: 'drift', driftCodes: ['DUPLICATE_ACTIVE_LOOKUP_KEY'] });
      continue;
    }

    let price = prices.data[0];
    let products = price ? [await loadProduct(input.client, price)] : await findProduct(input.client, item, input.mode);
    if (products.length > 1) {
      items.push({ packageKey: item.key, lookupKey: item.lookupKey, productId: null, priceId: null, action: 'none', status: 'drift', driftCodes: ['DUPLICATE_CATALOG_PRODUCT'] });
      continue;
    }
    let product = products[0];

    if (!price && input.operation !== 'apply') {
      items.push({
        packageKey: item.key, lookupKey: item.lookupKey,
        productId: product?.id ?? null, priceId: null,
        action: product ? 'would_create_price' : 'would_create_product_and_price',
        status: 'missing', driftCodes: [],
      });
      continue;
    }

    let action: TorqueShedCatalogReportItem['action'] = 'none';
    if (!product && input.operation === 'apply') {
      product = await input.client.products.create({
        name: `Torque Assist ${item.name} credits`,
        active: true,
        metadata: torqueShedStripeMetadata(item, input.mode),
      });
      created.products += 1;
      action = 'created_product_and_price';
    }
    if (!price && product && input.operation === 'apply') {
      price = await input.client.prices.create({
        product: product.id,
        currency: item.currency.toLowerCase(),
        unit_amount: item.amountMinor,
        lookup_key: item.lookupKey,
        metadata: torqueShedStripeMetadata(item, input.mode),
      });
      created.prices += 1;
      if (action === 'none') action = 'created_price';
    }
    if (!product || !price) continue;

    const driftCodes = [...productDrift(product, item, input.mode), ...priceDrift(price, product, item, input.mode)];
    const status = driftCodes.length ? 'drift' : 'validated';
    items.push({ packageKey: item.key, lookupKey: item.lookupKey, productId: product.id, priceId: price.id, action, status, driftCodes });

    if (input.operation === 'apply') {
      await persist({
        environment: input.mode, packageKey: item.key, catalogVersion: TORQUESHED_CREDIT_CATALOG_VERSION,
        lookupKey: item.lookupKey, units: item.units, amountMinor: item.amountMinor, currency: item.currency,
        stripeAccountId: account.id, stripeProductId: product.id,
        stripePriceId: price.id, active: status === 'validated',
        validationStatus: status === 'validated' ? 'validated' : 'drift',
        driftCode: driftCodes[0] ?? null, validatedAt: status === 'validated' ? new Date() : null,
      });
    }
  }

  const known = new Set<string>(TORQUESHED_CREDIT_CATALOG.map((item) => item.lookupKey));
  const legacy = await input.client.prices.list({ active: true, limit: 100 });
  const legacyLookupKeys = legacy.data
    .map((price) => price.lookup_key)
    .filter((key): key is string => typeof key === 'string' && key.startsWith('operatoros_torqueshed_') && !known.has(key))
    .sort();
  const status = items.some((item) => item.status === 'drift') ? 'drift'
    : items.some((item) => item.status === 'missing') ? 'changes_required'
      : 'validated';
  return {
    contractVersion: 1, catalogVersion: TORQUESHED_CREDIT_CATALOG_VERSION,
    mode: input.mode, operation: input.operation, accountId: account.id,
    status, created, items, legacyLookupKeys,
    safeToEnablePurchases: status === 'validated' && items.length === TORQUESHED_CREDIT_CATALOG.length,
  };
}
