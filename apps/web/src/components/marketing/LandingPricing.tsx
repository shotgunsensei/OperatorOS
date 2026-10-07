'use client';

import React from 'react';
import { Check } from 'lucide-react';
import type { CoreProductKey } from '@operatoros/sdk';
import { catalogMoney, type BillingCatalog } from '@/lib/pricing-catalog';
import { useBillingCatalog } from '@/lib/use-billing-catalog';
import styles from './AudiencePages.module.css';

export default function LandingPricing({ productKey, product, initialCatalog }: {
  productKey: CoreProductKey; product: string; initialCatalog: BillingCatalog | null;
}) {
  const { catalog, loading, error, retry } = useBillingCatalog(initialCatalog);
  const price = catalog?.coreProducts.find(row => row.key === productKey)?.monthlyPriceCents;
  return <aside className={styles.pricePanel} aria-label={`${product} monthly pricing`} data-testid="lane-price-panel">
    <div>
      <p className={styles.eyebrow}>ONE ORGANIZATION / ONE FLAGSHIP</p>
      <p className={styles.price} role="status" data-testid="lane-price">{price != null
        ? <>{catalogMoney(price)}<span> / month</span></> : loading ? 'Loading pricing…' : 'Pricing unavailable'}</p>
      <p>Monthly Application Stack for {product}.</p>
    </div>
    <div>
      <ul>{['5 team seats', 'One eligible organization-wide companion', 'OperatorOS home base and free account apps'].map(item =>
        <li key={item}><Check size={16} aria-hidden="true" />{item}</li>)}</ul>
      {catalog && <p>Extra seats {catalogMoney(catalog.additionalSeatMonthlyPriceCents)}/month each. Extra eligible companions {catalogMoney(catalog.companionModuleMonthlyPriceCents)}/month each.</p>}
      <p>Review your selection and checkout availability before purchasing. Creating an account does not activate this paid application.</p>
      {catalog && !catalog.stripeConfigured[productKey] && <p role="status">Checkout is not configured for {product}.</p>}
      {error && <div role="alert"><p>Current pricing could not be loaded.</p><button type="button" className={styles.retryButton} onClick={retry}>Retry pricing</button></div>}
    </div>
  </aside>;
}
