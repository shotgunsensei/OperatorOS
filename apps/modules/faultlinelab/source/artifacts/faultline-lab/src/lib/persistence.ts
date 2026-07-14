import type { InvestigatorProfile, CaseState, AppSettings } from '@/types';

const KEYS = {
  PROFILE: 'faultline-lab-profile',
  CASE_STATES: 'faultline-lab-case-states',
  SETTINGS: 'faultline-lab-settings',
  CURRENT_CASE: 'faultline-lab-current-case',
};

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.warn('Failed to save to localStorage');
  }
}

const DEFAULT_DAILY_PROGRESS = {
  lastCompletedDateUtc: null,
  lastCompletedCaseId: null,
  currentStreak: 0,
  bestStreak: 0,
  totalCompleted: 0,
};

export function loadProfile(): InvestigatorProfile {
  const stored = safeGet<Partial<InvestigatorProfile> | null>(KEYS.PROFILE, null);
  const base: InvestigatorProfile = {
    name: 'Investigator',
    casesSolved: 0,
    bestScores: {},
    totalScore: 0,
    bestChaosScores: {},
    totalChaosScore: 0,
    streakCurrent: 0,
    streakBest: 0,
    achievementsUnlocked: [],
    solvedCaseIds: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    dailyChallenge: { ...DEFAULT_DAILY_PROGRESS },
  };
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    dailyChallenge: {
      ...DEFAULT_DAILY_PROGRESS,
      ...(stored.dailyChallenge ?? {}),
    },
  };
}

export function saveProfile(profile: InvestigatorProfile): void {
  safeSet(KEYS.PROFILE, { ...profile, lastActiveAt: Date.now() });
}

export function loadCaseStates(): Record<string, CaseState> {
  return safeGet<Record<string, CaseState>>(KEYS.CASE_STATES, {});
}

export function saveCaseState(caseId: string, state: CaseState): void {
  const states = loadCaseStates();
  states[caseId] = state;
  safeSet(KEYS.CASE_STATES, states);
}

export function saveCaseStates(states: Record<string, CaseState>): void {
  safeSet(KEYS.CASE_STATES, states);
}

export function loadCurrentCaseId(): string | null {
  return safeGet<string | null>(KEYS.CURRENT_CASE, null);
}

export function saveCurrentCaseId(caseId: string | null): void {
  safeSet(KEYS.CURRENT_CASE, caseId);
}

export function loadSettings(): AppSettings {
  return safeGet<AppSettings>(KEYS.SETTINGS, {
    soundEnabled: false,
    animationsEnabled: true,
    terminalFontSize: 16,
    onboardingTourCompletedAt: null,
    pricingIntroSeenAt: null,
    lastVisitedAt: null,
    seenNewCases: {},
    dismissedRenewalNoticeKey: null,
  });
}

export function saveSettings(settings: AppSettings): void {
  safeSet(KEYS.SETTINGS, settings);
}

export function clearAllData(): void {
  Object.values(KEYS).forEach(key => localStorage.removeItem(key));
}
