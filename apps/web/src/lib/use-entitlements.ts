'use client';

import { useEffect, useState } from 'react';
import { modulesApi } from './auth';
import { useAuth } from '@/components/AuthProvider';

/**
 * useEntitlements — public-safe hook that resolves the set of module
 * slugs the current viewer is entitled to.
 *
 *   - Returns `null` while loading OR for anonymous viewers (the
 *     marketing CTA helper treats null as "use static defaults").
 *   - Returns a `Set<string>` once the viewer is signed in and the
 *     `/v1/modules` listing has come back. Slugs in the set are
 *     unlocked for the viewer's active tenant.
 *
 * Failure modes are silent: if the API call fails (offline, expired
 * session, etc.), we fall back to `null` so the grid degrades to the
 * static catalog rather than blocking the marketing surface.
 */
export function useEntitlements(): ReadonlySet<string> | null {
  const { user, loading } = useAuth();
  const [entitled, setEntitled] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setEntitled(null); return; }
    let alive = true;
    (async () => {
      try {
        const res = await modulesApi.list();
        if (!alive) return;
        const set = new Set<string>();
        for (const row of res.modules ?? []) {
          if (row.unlocked && row.module?.slug) set.add(row.module.slug);
        }
        setEntitled(set);
      } catch {
        if (alive) setEntitled(null);
      }
    })();
    return () => { alive = false; };
  }, [user, loading]);

  return entitled;
}
