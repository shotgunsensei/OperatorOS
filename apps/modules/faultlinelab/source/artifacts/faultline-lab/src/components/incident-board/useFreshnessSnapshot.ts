import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import { subscribeFreshness } from '@/lib/incidentFreshness';
import {
  getSandboxAuthoredEntries,
  subscribeSandboxScenarios,
} from '@/lib/sandboxScenarios';
import type { CaseCatalogEntry } from '@/data/caseCatalog';

// Cache the authored-entries snapshot so useSyncExternalStore sees a stable
// reference between renders. The cached value is only refreshed when the
// underlying scenarios actually change (subscriber callback fires + content
// differs from the previous snapshot).
let cachedAuthoredEntriesSnapshot: CaseCatalogEntry[] = getSandboxAuthoredEntries();
let cachedAuthoredEntriesKey = JSON.stringify(
  cachedAuthoredEntriesSnapshot.map((e) => [e.id, e.sortOrder, e.title])
);
function getAuthoredEntriesSnapshot(): CaseCatalogEntry[] {
  const fresh = getSandboxAuthoredEntries();
  const key = JSON.stringify(fresh.map((e) => [e.id, e.sortOrder, e.title]));
  if (key !== cachedAuthoredEntriesKey) {
    cachedAuthoredEntriesSnapshot = fresh;
    cachedAuthoredEntriesKey = key;
  }
  return cachedAuthoredEntriesSnapshot;
}
const EMPTY_AUTHORED_ENTRIES: CaseCatalogEntry[] = [];
function getAuthoredEntriesServerSnapshot(): CaseCatalogEntry[] {
  return EMPTY_AUTHORED_ENTRIES;
}

export interface FreshnessSnapshot {
  previousVisitAt: number | null;
  seenNewCases: Record<string, number>;
  authoredEntries: CaseCatalogEntry[];
  markCaseSeen: (caseId: string) => void;
}

export function useFreshnessSnapshot(
  isSignedIn: boolean,
  cloudSyncReady: boolean
): FreshnessSnapshot {
  const updateSettings = useAppStore((s) => s.updateSettings);

  // Snapshot the previous-visit timestamp once cloud sync has settled (or
  // immediately for signed-out users) so badges don't disappear mid-session
  // as we update the cloud-synced lastVisitedAt, and so cloud settings
  // arriving slightly after mount aren't ignored.
  const previousVisitRef = useRef<number | null>(null);
  const seenMapRef = useRef<Record<string, number>>({});
  const snapshotTakenRef = useRef(false);
  const [, forceFreshRender] = useState(0);
  const shouldSnapshot = !isSignedIn || cloudSyncReady;

  useEffect(() => {
    if (!shouldSnapshot || snapshotTakenRef.current) return;
    snapshotTakenRef.current = true;
    const fresh = useAppStore.getState().settings;
    previousVisitRef.current = fresh.lastVisitedAt ?? null;
    seenMapRef.current = { ...(fresh.seenNewCases ?? {}) };
    updateSettings({ lastVisitedAt: Date.now() });
    forceFreshRender((n) => n + 1);
  }, [shouldSnapshot, updateSettings]);

  useEffect(() => {
    const unsub = subscribeFreshness(() => forceFreshRender((n) => n + 1));
    return unsub;
  }, []);

  const markCaseSeen = (caseId: string) => {
    const now = Date.now();
    seenMapRef.current = { ...seenMapRef.current, [caseId]: now };
    updateSettings({ seenNewCases: seenMapRef.current });
  };

  const authoredEntries = useSyncExternalStore(
    subscribeSandboxScenarios,
    getAuthoredEntriesSnapshot,
    getAuthoredEntriesServerSnapshot
  );

  return {
    previousVisitAt: previousVisitRef.current,
    seenNewCases: seenMapRef.current,
    authoredEntries,
    markCaseSeen,
  };
}
