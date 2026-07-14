import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/stores/useAppStore';
import { CASE_BY_SLUG } from '@/data/caseCatalog/selectors';
import {
  isCaseAccessible,
  getRequiredProductForCase,
} from '@/lib/entitlements';
import { useUpgradePrompt } from './UpgradePrompt';

function consumeCaseSlugFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const url = new URL(window.location.href);
    const queryslug = url.searchParams.get('case');
    if (queryslug) {
      url.searchParams.delete('case');
      const search = url.searchParams.toString();
      const next = url.pathname + (search ? `?${search}` : '') + url.hash;
      window.history.replaceState(window.history.state, '', next);
      return queryslug;
    }
    // Also recognise pre-rendered share-landing URLs of the form
    // `<base>case/<slug>/` so direct visitors to the SEO snapshot
    // start the case after the SPA hydrates.
    const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '') + '/';
    const path = url.pathname;
    if (path.startsWith(base)) {
      const rest = path.slice(base.length);
      const match = rest.match(/^case\/([^/]+)\/?$/);
      if (match) {
        const slug = decodeURIComponent(match[1]);
        const search = url.searchParams.toString();
        const next = base + (search ? `?${search}` : '') + url.hash;
        window.history.replaceState(window.history.state, '', next);
        return slug;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export function CaseDeepLinkHandler() {
  const [slug] = useState(() => consumeCaseSlugFromUrl());
  const handledRef = useRef(false);
  const authLoaded = useAppStore((s) => s.authLoaded);
  const isSignedIn = useAppStore((s) => s.isSignedIn);
  const cloudSyncReady = useAppStore((s) => s.cloudSyncReady);
  const startCase = useAppStore((s) => s.startCase);
  const resumeCase = useAppStore((s) => s.resumeCase);
  const setView = useAppStore((s) => s.setView);
  const isCaseSolved = useAppStore((s) => s.isCaseSolved);
  const { prompt } = useUpgradePrompt();

  // Wait for entitlements to be authoritative before deciding accessibility:
  // for signed-in users that means cloud sync has hydrated, otherwise just
  // for the auth check to settle.
  const ready = authLoaded && (!isSignedIn || cloudSyncReady);

  useEffect(() => {
    if (!slug || handledRef.current || !ready) return;
    handledRef.current = true;

    const entry = CASE_BY_SLUG.get(slug);
    if (!entry) {
      setView('incident-board');
      toast.error(`Unknown case "${slug}"`, {
        description: 'Showing the incident board instead.',
      });
      return;
    }

    if (entry.status !== 'playable') {
      setView('incident-board');
      toast.message(`${entry.title} is still in development.`, {
        description: 'Showing the incident board instead.',
      });
      const required = getRequiredProductForCase(entry.id);
      if (required) {
        prompt({
          productId: required.id,
          contextKey: `deep-link:${entry.id}`,
          reason: `"${entry.title}" is part of ${required.name}, which is in development. Reserve your slot to be notified at launch.`,
        });
      }
      return;
    }

    if (!isCaseAccessible(entry.id)) {
      setView('incident-board');
      const required = getRequiredProductForCase(entry.id);
      if (required) {
        prompt({
          productId: required.id,
          contextKey: `deep-link:${entry.id}`,
          reason: `"${entry.title}" is part of ${required.name}. Unlock it to start the investigation.`,
        });
      } else {
        setView('store');
      }
      return;
    }

    if (isCaseSolved(entry.id)) {
      resumeCase(entry.id);
    } else {
      startCase(entry.id);
    }
  }, [slug, ready, prompt, setView, startCase, resumeCase, isCaseSolved]);

  return null;
}
