import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/stores/useAppStore';
import {
  fetchProfile,
  saveProfileToCloud,
  fetchEntitlements,
  fetchCatalogOverrides,
  getCatalogOverridesStreamUrl,
} from '@/lib/api';
import { setEntitlements } from '@/lib/entitlements';
import { applyCatalogOverrides } from '@/data/catalog';
import { recordCatalogOverrideFreshness } from '@/lib/incidentFreshness';
import { loadCaseStates, saveCaseStates } from '@/lib/persistence';
import { useUpgradePrompt } from './UpgradePrompt';

export function CloudSyncProvider({ children }: { children: React.ReactNode }) {
  const isSignedIn = useAppStore(s => s.isSignedIn);
  const profile = useAppStore(s => s.profile);
  const settings = useAppStore(s => s.settings);
  const syncedRef = useRef(false);
  const overridesLoadedRef = useRef(false);
  const cloudPromptShownRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { prompt } = useUpgradePrompt();

  useEffect(() => {
    if (overridesLoadedRef.current) return;
    overridesLoadedRef.current = true;

    let lastVersion = -1;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let eventSource: EventSource | null = null;
    let cancelled = false;

    const applyPayload = (payload: { overrides?: unknown; version?: number } | null) => {
      if (!payload) return;
      const version = typeof payload.version === 'number' ? payload.version : Date.now();
      if (version === lastVersion) return;
      lastVersion = version;
      const overridesRaw =
        (payload.overrides as Array<
          { productId: string; updatedAt?: string | null } & Record<string, unknown>
        >) || [];
      applyCatalogOverrides(
        overridesRaw as Parameters<typeof applyCatalogOverrides>[0]
      );
      // Record per-product freshness using the server-provided per-row
      // updatedAt (when available). isCaseNewSince filters against the
      // user's previous-visit timestamp, so applying this on the initial
      // snapshot will only badge cases whose overrides actually post-date
      // the user's last visit.
      for (const o of overridesRaw) {
        const ts = o.updatedAt ? Date.parse(o.updatedAt) : NaN;
        if (Number.isFinite(ts)) {
          recordCatalogOverrideFreshness([o.productId], ts);
        }
      }
    };

    const startPolling = () => {
      if (pollTimer || cancelled) return;
      pollTimer = setInterval(() => {
        fetchCatalogOverrides()
          .then(applyPayload)
          .catch(() => {});
      }, 5000);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    fetchCatalogOverrides()
      .then(applyPayload)
      .catch(() => {});

    if (typeof window !== 'undefined' && typeof window.EventSource !== 'undefined') {
      try {
        const es = new EventSource(getCatalogOverridesStreamUrl(), { withCredentials: true });
        eventSource = es;
        es.addEventListener('overrides', (ev) => {
          stopPolling();
          try {
            applyPayload(JSON.parse((ev as MessageEvent).data));
          } catch {}
        });
        es.onerror = () => {
          startPolling();
        };
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      cancelled = true;
      stopPolling();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, []);

  const syncFromCloud = useCallback(async () => {
    if (syncedRef.current) return;
    try {
      const [profileData, entitlementData] = await Promise.all([
        fetchProfile(),
        fetchEntitlements(),
      ]);

      if (entitlementData) {
        setEntitlements(entitlementData);
        if (!entitlementData.isProUser && !cloudPromptShownRef.current) {
          cloudPromptShownRef.current = true;
          setTimeout(() => {
            prompt({
              productId: 'pro-subscription',
              contextKey: 'cloud-sync-after-signin',
              reason:
                "You're signed in. Pro Investigator adds cloud sync across devices, daily challenges, and the full archive.",
            });
          }, 1500);
        }
      }

      if (profileData?.profile) {
        useAppStore.getState().updateProfile(profileData.profile);
      }
      if (profileData?.settings) {
        useAppStore.getState().updateSettings(profileData.settings);
      }
      if (profileData?.caseStates && typeof profileData.caseStates === 'object') {
        const localStates = loadCaseStates();
        const merged = { ...profileData.caseStates };
        for (const [caseId, localState] of Object.entries(localStates)) {
          const cloudState = merged[caseId] as any;
          const local = localState as any;
          if (!cloudState || (local?.lastActiveAt && (!cloudState.lastActiveAt || local.lastActiveAt > cloudState.lastActiveAt))) {
            merged[caseId] = localState;
          }
        }
        saveCaseStates(merged as Record<string, any>);
      }

      syncedRef.current = true;
      useAppStore.getState().setCloudSyncReady(true);
    } catch (err) {
      console.warn('Cloud sync failed, using local data:', err);
      useAppStore.getState().setCloudSyncReady(true);
    }
  }, []);

  const saveToCloud = useCallback(async () => {
    try {
      const currentProfile = useAppStore.getState().profile;
      const currentSettings = useAppStore.getState().settings;
      const caseStates = loadCaseStates();
      await saveProfileToCloud({
        profile: currentProfile,
        settings: currentSettings,
        caseStates,
      });
    } catch (err) {
      console.warn('Cloud save failed:', err);
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      syncFromCloud();
    } else {
      syncedRef.current = false;
      useAppStore.getState().setCloudSyncReady(false);
      setEntitlements({
        ownedProductIds: ['base-free'],
        activeSubscription: null,
        isProUser: false,
      });
    }
  }, [isSignedIn, syncFromCloud]);

  useEffect(() => {
    if (!isSignedIn || !syncedRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveToCloud();
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [isSignedIn, profile, settings, saveToCloud]);

  return <>{children}</>;
}
