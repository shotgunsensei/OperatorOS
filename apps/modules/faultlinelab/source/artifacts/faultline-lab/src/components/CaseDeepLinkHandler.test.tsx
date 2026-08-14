import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { CaseCatalogEntry } from '@/data/caseCatalog/types';

const toastError = vi.fn();
const toastMessage = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    message: (...args: unknown[]) => toastMessage(...args),
  },
}));

const PLANNED_ID = 'case-planned-fixture-001';
const PLANNED_SLUG = 'planned-fixture-slug';
const LOCKED_ID = 'case-locked-fixture-001';
const LOCKED_SLUG = 'locked-fixture-slug';

vi.mock('@/data/caseCatalog/selectors', async () => {
  const actual = await vi.importActual<
    typeof import('@/data/caseCatalog/selectors')
  >('@/data/caseCatalog/selectors');
  const base: CaseCatalogEntry = {
    id: 'fixture',
    slug: 'fixture',
    title: 'Fixture',
    shortSummary: 'short',
    mobileSummary: 'mobile',
    category: 'networking',
    difficulty: 'intermediate',
    estimatedMinutes: 20,
    sourceType: 'pack',
    status: 'playable',
    accessModel: 'pack',
    sourceProductId: 'pack-network-ops',
    requiredEntitlements: ['pack-network-ops'],
    requiredToolSlugs: ['terminal'],
    previewSymptoms: [],
    previewSystems: [],
    redHerringLevel: 'low',
    tags: [],
    isStarter: false,
    isFeatured: false,
    isDailyEligible: false,
    isSandboxEligible: false,
    sortOrder: 9999,
  };
  const map = new Map(actual.CASE_BY_SLUG);
  map.set('planned-fixture-slug', {
    ...base,
    id: 'case-planned-fixture-001',
    slug: 'planned-fixture-slug',
    title: 'Planned Fixture Case',
    status: 'planned',
  });
  map.set('locked-fixture-slug', {
    ...base,
    id: 'case-locked-fixture-001',
    slug: 'locked-fixture-slug',
    title: 'Locked Fixture Case',
    status: 'playable',
  });
  return { ...actual, CASE_BY_SLUG: map };
});

vi.mock('@/lib/entitlements', async () => {
  const actual = await vi.importActual<typeof import('@/lib/entitlements')>(
    '@/lib/entitlements'
  );
  const catalogMod = await vi.importActual<typeof import('@/data/catalog')>(
    '@/data/catalog'
  );
  const overrideIds = new Set([
    'case-locked-fixture-001',
    'case-planned-fixture-001',
  ]);
  return {
    ...actual,
    isCaseAccessible: (id: string) => {
      if (overrideIds.has(id)) return false;
      return actual.isCaseAccessible(id);
    },
    getRequiredProductForCase: (id: string) => {
      if (overrideIds.has(id)) {
        return (
          catalogMod.CATALOG.find((p) => p.id === 'pack-network-ops') ?? null
        );
      }
      return actual.getRequiredProductForCase(id);
    },
  };
});

import { CaseDeepLinkHandler } from './CaseDeepLinkHandler';
import { UpgradePromptProvider } from './UpgradePrompt';
import { useAppStore } from '@/stores/useAppStore';
import { resetEntitlements } from '@/lib/entitlements';

type StoreOverrides = Partial<ReturnType<typeof useAppStore.getState>>;

const initialStore = { ...useAppStore.getState() };

function setUrl(search: string) {
  const path = search ? `/?${search.replace(/^\?/, '')}` : '/';
  window.history.replaceState({}, '', path);
}

function setupStore(overrides: StoreOverrides = {}) {
  useAppStore.setState(
    {
      ...initialStore,
      view: 'boot',
      authLoaded: true,
      isSignedIn: false,
      cloudSyncReady: false,
      profile: { ...initialStore.profile, solvedCaseIds: [] },
      ...overrides,
    },
    true
  );
}

function renderHandler() {
  return render(
    <UpgradePromptProvider>
      <CaseDeepLinkHandler />
    </UpgradePromptProvider>
  );
}

describe('<CaseDeepLinkHandler />', () => {
  beforeEach(() => {
    resetEntitlements();
    setupStore();
    setUrl('');
    toastError.mockClear();
    toastMessage.mockClear();
  });

  afterEach(() => {
    cleanup();
    setUrl('');
  });

  it('is a no-op when ?case= is missing', async () => {
    const startCase = vi.fn();
    const resumeCase = vi.fn();
    const setView = vi.fn();
    setupStore({ startCase, resumeCase, setView });
    setUrl('');
    renderHandler();
    await new Promise((r) => setTimeout(r, 20));
    expect(startCase).not.toHaveBeenCalled();
    expect(resumeCase).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();
  });

  it('starts the case for a known playable slug', async () => {
    const startCase = vi.fn();
    const resumeCase = vi.fn();
    setupStore({ startCase, resumeCase });
    setUrl('case=domain-auth-failure');
    renderHandler();
    await waitFor(() =>
      expect(startCase).toHaveBeenCalledWith('case-windows-ad-001')
    );
    expect(resumeCase).not.toHaveBeenCalled();
  });

  it('resumes the case for a solved playable slug', async () => {
    const startCase = vi.fn();
    const resumeCase = vi.fn();
    setupStore({
      startCase,
      resumeCase,
      profile: {
        ...initialStore.profile,
        solvedCaseIds: ['case-windows-ad-001'],
      },
    });
    setUrl('case=domain-auth-failure');
    renderHandler();
    await waitFor(() =>
      expect(resumeCase).toHaveBeenCalledWith('case-windows-ad-001')
    );
    expect(startCase).not.toHaveBeenCalled();
  });

  it('strips ?case= from the URL after handling so refresh does not retrigger', async () => {
    setupStore({ startCase: vi.fn(), resumeCase: vi.fn() });
    setUrl('case=domain-auth-failure&other=keep');
    renderHandler();
    await waitFor(() => {
      expect(window.location.search).not.toContain('case=');
    });
    expect(window.location.search).toContain('other=keep');
  });

  it('falls back to the incident board with a toast for an unknown slug', async () => {
    const setView = vi.fn();
    const startCase = vi.fn();
    setupStore({ setView, startCase });
    setUrl('case=this-slug-does-not-exist');
    renderHandler();
    await waitFor(() =>
      expect(setView).toHaveBeenCalledWith('incident-board')
    );
    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(toastError.mock.calls[0]?.[0]).toContain(
      'Unknown case "this-slug-does-not-exist"'
    );
    expect(startCase).not.toHaveBeenCalled();
  });

  it('routes a planned slug to the incident board with an upgrade prompt', async () => {
    const setView = vi.fn();
    const startCase = vi.fn();
    setupStore({ setView, startCase });
    setUrl(`case=${PLANNED_SLUG}`);
    renderHandler();
    await waitFor(() =>
      expect(setView).toHaveBeenCalledWith('incident-board')
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Network Ops Pack/i).length).toBeGreaterThan(
        0
      );
    });
    expect(toastMessage).toHaveBeenCalled();
    expect(toastMessage.mock.calls[0]?.[0]).toContain('in development');
    expect(startCase).not.toHaveBeenCalled();
  });

  it('routes a locked playable slug to the incident board with an upgrade prompt', async () => {
    const setView = vi.fn();
    const startCase = vi.fn();
    setupStore({ setView, startCase });
    setUrl(`case=${LOCKED_SLUG}`);
    renderHandler();
    await waitFor(() =>
      expect(setView).toHaveBeenCalledWith('incident-board')
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Unlock it to start the investigation/i)
      ).toBeDefined();
    });
    expect(screen.getAllByText(/Network Ops Pack/i).length).toBeGreaterThan(0);
    expect(startCase).not.toHaveBeenCalled();
  });

  it('waits for authLoaded before handling the slug', async () => {
    const startCase = vi.fn();
    setupStore({ startCase, authLoaded: false });
    setUrl('case=domain-auth-failure');
    renderHandler();
    await new Promise((r) => setTimeout(r, 20));
    expect(startCase).not.toHaveBeenCalled();
    act(() => {
      useAppStore.setState({ authLoaded: true });
    });
    await waitFor(() =>
      expect(startCase).toHaveBeenCalledWith('case-windows-ad-001')
    );
  });

  it('waits for cloudSyncReady before handling when signed in', async () => {
    const startCase = vi.fn();
    setupStore({
      startCase,
      authLoaded: true,
      isSignedIn: true,
      cloudSyncReady: false,
    });
    setUrl('case=domain-auth-failure');
    renderHandler();
    await new Promise((r) => setTimeout(r, 20));
    expect(startCase).not.toHaveBeenCalled();
    act(() => {
      useAppStore.setState({ cloudSyncReady: true });
    });
    await waitFor(() =>
      expect(startCase).toHaveBeenCalledWith('case-windows-ad-001')
    );
  });
});
