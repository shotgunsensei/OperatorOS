'use client';

import { useEffect, useState } from 'react';
import { billingApi } from './auth';
import { readBillingCatalog, type BillingCatalog } from './pricing-catalog';

export function useBillingCatalog(initialCatalog: BillingCatalog | null) {
  const [catalog, setCatalog] = useState(initialCatalog);
  const [loading, setLoading] = useState(!initialCatalog);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (initialCatalog && attempt === 0) {
      setCatalog(initialCatalog);
      setLoading(false);
      setError(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(false);
    void billingApi.getCatalog(AbortSignal.timeout(8000)).then(response => {
      const current = readBillingCatalog(response);
      if (!current) throw new Error('Invalid public catalog');
      if (alive) setCatalog(current);
    }).catch(() => {
      if (alive) { setCatalog(null); setError(true); }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [initialCatalog, attempt]);
  return { catalog, loading, error, retry: () => setAttempt(current => current + 1) };
}
