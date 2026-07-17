import { create } from 'zustand';
import type {
  AppView,
  AppSettings,
  InvestigatorProfile,
  CaseState,
  CaseDefinition,
  DiagnosisSubmission,
  ToolOutput,
  Debrief,
  AuthUser,
} from '@/types';
import {
  loadProfile,
  saveProfile,
  loadCaseStates,
  saveCaseState,
  loadCurrentCaseId,
  saveCurrentCaseId,
  loadSettings,
  saveSettings,
} from '@/lib/persistence';
import {
  createCaseState,
  processCommand,
  processEventLogView,
  processTicketNoteView,
  useHint,
  evaluateDiagnosis,
  generateDebrief,
  applyChaosToCaseDef,
} from '@/lib/simulation';
import { loadChaosSettings, isChaosActive } from '@/lib/chaos';
import { resolveCaseDefinitionByEntryId } from '@/data/caseCatalog';
import { getUtcDateKey, utcDateDiffInDays } from '@/lib/dailyChallenge';

interface TerminalEntry {
  type: 'input' | 'output';
  content: string;
  timestamp: number;
  evidenceUnlocked?: string[];
}

interface AppState {
  view: AppView;
  profile: InvestigatorProfile;
  settings: AppSettings;
  currentCaseId: string | null;
  currentCaseDef: CaseDefinition | null;
  currentCaseState: CaseState | null;
  terminalHistory: TerminalEntry[];
  activeTool: string;
  showDiagnosisForm: boolean;
  authUser: AuthUser | null;
  isSignedIn: boolean;
  authSource: 'operatoros' | 'clerk' | 'unknown' | null;
  managedByOperatorOs: boolean;
  operatorIdentity: {
    planSlug: string | null;
    tenantId: string | null;
    moduleRole: string | null;
    tenantRole: string | null;
    accessLevel: 'pro' | 'standard' | 'read-only' | 'denied' | null;
    subscriptionStatus: string | null;
    localRole: 'admin' | 'standard' | 'read-only' | 'deny' | null;
    features: string[];
    moduleEnabled: boolean;
  } | null;
  accessDeniedReason: string | null;
  setAccessDeniedReason: (reason: string | null) => void;
  cloudSyncReady: boolean;
  setCloudSyncReady: (ready: boolean) => void;
  authLoaded: boolean;
  setAuthLoaded: (loaded: boolean) => void;
  toolUsageSignals: Record<string, number>;
  pendingStoreProduct: { productId: string; reason: string; billingInterval?: 'month' | 'year' } | null;
  sandboxRunCaseId: string | null;
  dailyRunCaseId: string | null;
  pricingIntroActive: boolean;
  setPricingIntroActive: (active: boolean) => void;

  trackToolUsage: (signal: string) => void;
  setView: (view: AppView) => void;
  openStoreWithProduct: (productId: string, reason: string, billingInterval?: 'month' | 'year') => void;
  consumePendingStoreProduct: () => { productId: string; reason: string; billingInterval?: 'month' | 'year' } | null;
  setAuthUser: (
    user: AuthUser | null,
    meta?: {
      authSource?: 'operatoros' | 'clerk' | 'unknown';
      operator?: AppState['operatorIdentity'];
    },
  ) => void;
  startCase: (caseId: string) => void;
  resumeCase: (caseId: string) => void;
  startSandboxRun: (caseId: string) => void;
  startDailyChallenge: (caseId: string) => void;
  executeCommand: (command: string) => ToolOutput | null;
  viewEventLog: (logId: string) => void;
  viewTicketNote: (noteId: string) => void;
  requestHint: (level: number) => string | null;
  submitDiagnosis: (submission: DiagnosisSubmission) => Debrief | null;
  setActiveTool: (tool: string) => void;
  toggleDiagnosisForm: () => void;
  restartCase: (caseId: string) => void;
  exitCase: () => void;
  updateProfile: (updates: Partial<InvestigatorProfile>) => void;
  updateSettings: (updates: Partial<AppSettings>) => void;
  initFromStorage: () => void;
  isCaseSolved: (caseId: string) => boolean;
  getCaseScore: (caseId: string) => number | undefined;
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'boot',
  profile: loadProfile(),
  settings: loadSettings(),
  currentCaseId: null,
  currentCaseDef: null,
  currentCaseState: null,
  terminalHistory: [],
  activeTool: 'terminal',
  showDiagnosisForm: false,
  authUser: null,
  isSignedIn: false,
  authSource: null,
  managedByOperatorOs: false,
  operatorIdentity: null,
  accessDeniedReason: null,
  setAccessDeniedReason: (reason) =>
    set({
      accessDeniedReason: reason,
      view: reason ? 'access-denied' : 'incident-board',
    }),
  cloudSyncReady: false,
  setCloudSyncReady: (ready) => set({ cloudSyncReady: ready }),
  authLoaded: false,
  setAuthLoaded: (loaded) => set({ authLoaded: loaded }),
  toolUsageSignals: {},
  pendingStoreProduct: null,
  sandboxRunCaseId: null,
  dailyRunCaseId: null,
  pricingIntroActive: false,
  setPricingIntroActive: (active) => set({ pricingIntroActive: active }),

  openStoreWithProduct: (productId, reason, billingInterval) =>
    set({ pendingStoreProduct: { productId, reason, billingInterval }, view: 'store' }),

  consumePendingStoreProduct: () => {
    const pending = get().pendingStoreProduct;
    if (pending) set({ pendingStoreProduct: null });
    return pending;
  },

  trackToolUsage: (signal) =>
    set((state) => ({
      toolUsageSignals: {
        ...state.toolUsageSignals,
        [signal]: (state.toolUsageSignals[signal] || 0) + 1,
      },
    })),

  setView: (view) => set({ view }),

  setAuthUser: (user, meta) => set({
    authUser: user,
    isSignedIn: !!user,
    authSource: user ? meta?.authSource ?? get().authSource ?? 'unknown' : null,
    managedByOperatorOs: !!user && (meta?.authSource ?? get().authSource) === 'operatoros',
    operatorIdentity: user ? meta?.operator ?? get().operatorIdentity ?? null : null,
  }),

  startCase: (caseId) => {
    const caseDef = resolveCaseDefinitionByEntryId(caseId);
    if (!caseDef) return;

    const savedStates = loadCaseStates();
    const existingState = savedStates[caseId];

    if (existingState && existingState.status === 'active') {
      const decorated = applyChaosToCaseDef(
        caseDef,
        existingState.chaos,
        existingState.startedAt
      );
      set({
        view: 'investigation',
        currentCaseId: caseId,
        currentCaseDef: decorated,
        currentCaseState: existingState,
        terminalHistory: [],
        activeTool: 'terminal',
        showDiagnosisForm: false,
        sandboxRunCaseId: null,
        dailyRunCaseId: null,
      });
      saveCurrentCaseId(caseId);
      return;
    }

    const chaos = loadChaosSettings(caseId);
    const newState = createCaseState(caseId, chaos);
    const decorated = applyChaosToCaseDef(caseDef, newState.chaos, newState.startedAt);
    saveCaseState(caseId, newState);
    saveCurrentCaseId(caseId);

    set({
      view: 'investigation',
      currentCaseId: caseId,
      currentCaseDef: decorated,
      currentCaseState: newState,
      terminalHistory: [],
      activeTool: 'terminal',
      showDiagnosisForm: false,
      sandboxRunCaseId: null,
      dailyRunCaseId: null,
    });
  },

  startSandboxRun: (caseId) => {
    const caseDef = resolveCaseDefinitionByEntryId(caseId);
    if (!caseDef) return;
    const chaos = loadChaosSettings(caseId);
    const newState = createCaseState(caseId, chaos);
    const decorated = applyChaosToCaseDef(caseDef, newState.chaos, newState.startedAt);
    // Sandbox runs are ephemeral — do not persist them to the saved-state map
    // or current-case pointer, so they never overwrite real progress.
    set({
      view: 'investigation',
      currentCaseId: caseId,
      currentCaseDef: decorated,
      currentCaseState: newState,
      terminalHistory: [],
      activeTool: 'terminal',
      showDiagnosisForm: false,
      sandboxRunCaseId: caseId,
      dailyRunCaseId: null,
    });
  },

  startDailyChallenge: (caseId) => {
    const caseDef = resolveCaseDefinitionByEntryId(caseId);
    if (!caseDef) return;
    const chaos = loadChaosSettings(caseId);
    const newState = createCaseState(caseId, chaos);
    const decorated = applyChaosToCaseDef(caseDef, newState.chaos, newState.startedAt);
    saveCaseState(caseId, newState);
    saveCurrentCaseId(caseId);
    set({
      view: 'investigation',
      currentCaseId: caseId,
      currentCaseDef: decorated,
      currentCaseState: newState,
      terminalHistory: [],
      activeTool: 'terminal',
      showDiagnosisForm: false,
      sandboxRunCaseId: null,
      dailyRunCaseId: caseId,
    });
  },

  resumeCase: (caseId) => {
    const caseDef = resolveCaseDefinitionByEntryId(caseId);
    if (!caseDef) return;

    const savedStates = loadCaseStates();
    const existingState = savedStates[caseId];
    if (!existingState) return;

    const decorated = applyChaosToCaseDef(
      caseDef,
      existingState.chaos,
      existingState.startedAt
    );

    if (existingState.status === 'debriefed' && existingState.debrief) {
      set({
        view: 'debrief',
        currentCaseId: caseId,
        currentCaseDef: decorated,
        currentCaseState: existingState,
      });
      return;
    }

    set({
      view: 'investigation',
      currentCaseId: caseId,
      currentCaseDef: decorated,
      currentCaseState: existingState,
      terminalHistory: [],
      activeTool: 'terminal',
      showDiagnosisForm: false,
    });
    saveCurrentCaseId(caseId);
  },

  executeCommand: (command) => {
    const { currentCaseDef, currentCaseState, sandboxRunCaseId } = get();
    if (!currentCaseDef || !currentCaseState) return null;
    const isSandbox = sandboxRunCaseId === currentCaseDef.id;

    if (command.toLowerCase().trim() === 'help') {
      const helpOutput = currentCaseDef.terminalCommands
        .map(tc => `  ${tc.command.padEnd(45)} ${tc.description}`)
        .join('\n');
      const output: ToolOutput = {
        command,
        output: `Available Commands\n${'='.repeat(60)}\n${helpOutput}\n\nType a command to execute it.`,
        timestamp: Date.now(),
      };
      set((state) => ({
        terminalHistory: [
          ...state.terminalHistory,
          { type: 'input', content: command, timestamp: Date.now() },
          { type: 'output', content: output.output, timestamp: Date.now() },
        ],
      }));
      return output;
    }

    if (command.toLowerCase().trim() === 'clear') {
      set({ terminalHistory: [] });
      return { command, output: '', timestamp: Date.now() };
    }

    const { output, newState } = processCommand(
      currentCaseDef,
      currentCaseState,
      command
    );

    if (!isSandbox) saveCaseState(currentCaseDef.id, newState);

    set((state) => ({
      currentCaseState: newState,
      terminalHistory: [
        ...state.terminalHistory,
        { type: 'input', content: command, timestamp: Date.now() },
        {
          type: 'output',
          content: output.output,
          timestamp: Date.now(),
          evidenceUnlocked: output.evidenceUnlocked,
        },
      ],
    }));

    return output;
  },

  viewEventLog: (logId) => {
    const { currentCaseDef, currentCaseState, sandboxRunCaseId } = get();
    if (!currentCaseDef || !currentCaseState) return;

    const newState = processEventLogView(
      currentCaseDef,
      currentCaseState,
      logId
    );
    if (sandboxRunCaseId !== currentCaseDef.id) {
      saveCaseState(currentCaseDef.id, newState);
    }
    set({ currentCaseState: newState });
  },

  viewTicketNote: (noteId) => {
    const { currentCaseDef, currentCaseState, sandboxRunCaseId } = get();
    if (!currentCaseDef || !currentCaseState) return;

    const newState = processTicketNoteView(
      currentCaseDef,
      currentCaseState,
      noteId
    );
    if (sandboxRunCaseId !== currentCaseDef.id) {
      saveCaseState(currentCaseDef.id, newState);
    }
    set({ currentCaseState: newState });
  },

  requestHint: (level) => {
    const { currentCaseDef, currentCaseState, sandboxRunCaseId } = get();
    if (!currentCaseDef || !currentCaseState) return null;
    if (currentCaseState.chaos?.hintBlackout) return null;

    const hint = currentCaseDef.hints.find(h => h.level === level);
    if (!hint) return null;

    const newState = useHint(currentCaseState, level);
    if (sandboxRunCaseId !== currentCaseDef.id) {
      saveCaseState(currentCaseDef.id, newState);
    }
    set({ currentCaseState: newState });

    return hint.text;
  },

  submitDiagnosis: (submission) => {
    const { currentCaseDef, currentCaseState, profile, sandboxRunCaseId, dailyRunCaseId } = get();
    if (!currentCaseDef || !currentCaseState) return null;

    const scoreBreakdown = evaluateDiagnosis(
      currentCaseDef,
      currentCaseState,
      submission
    );
    const debrief = generateDebrief(currentCaseDef, currentCaseState, scoreBreakdown);

    const completedState: CaseState = {
      ...currentCaseState,
      status: 'debriefed',
      completedAt: Date.now(),
      diagnosis: submission,
      debrief,
    };

    const isSandboxRun = sandboxRunCaseId === currentCaseDef.id;
    const isDailyRun = dailyRunCaseId === currentCaseDef.id;

    if (isSandboxRun) {
      // Sandbox: surface the debrief, but do not persist state or scores.
      set({
        currentCaseState: completedState,
        view: 'debrief',
        showDiagnosisForm: false,
      });
      return debrief;
    }

    saveCaseState(currentCaseDef.id, completedState);

    const wasChaosRun = isChaosActive(currentCaseState.chaos);

    const previousVanillaBest = profile.bestScores[currentCaseDef.id];
    const previousChaosBest = profile.bestChaosScores[currentCaseDef.id];

    const isBetterVanilla =
      !wasChaosRun &&
      (previousVanillaBest === undefined ||
        scoreBreakdown.total > previousVanillaBest);
    const isBetterChaos =
      wasChaosRun &&
      (previousChaosBest === undefined ||
        scoreBreakdown.total > previousChaosBest);

    const nextBestScores = isBetterVanilla
      ? { ...profile.bestScores, [currentCaseDef.id]: scoreBreakdown.total }
      : profile.bestScores;
    const nextBestChaosScores = isBetterChaos
      ? { ...profile.bestChaosScores, [currentCaseDef.id]: scoreBreakdown.total }
      : profile.bestChaosScores;

    const nextTotalScore = isBetterVanilla
      ? Object.values(nextBestScores).reduce((a, b) => a + b, 0)
      : profile.totalScore;
    const nextTotalChaosScore = isBetterChaos
      ? Object.values(nextBestChaosScores).reduce((a, b) => a + b, 0)
      : profile.totalChaosScore;

    const newAchievements = debrief.achievementsUnlocked.filter(
      a => !profile.achievementsUnlocked.includes(a)
    );

    const wasPreviouslySolved = profile.solvedCaseIds.includes(currentCaseDef.id);

    const updatedProfile: InvestigatorProfile = {
      ...profile,
      casesSolved: wasPreviouslySolved
        ? profile.casesSolved
        : profile.casesSolved + 1,
      bestScores: nextBestScores,
      totalScore: nextTotalScore,
      bestChaosScores: nextBestChaosScores,
      totalChaosScore: nextTotalChaosScore,
      streakCurrent:
        scoreBreakdown.tier !== 'Misdiagnosed'
          ? profile.streakCurrent + 1
          : 0,
      streakBest: Math.max(
        profile.streakBest,
        scoreBreakdown.tier !== 'Misdiagnosed'
          ? profile.streakCurrent + 1
          : 0
      ),
      achievementsUnlocked: [
        ...profile.achievementsUnlocked,
        ...newAchievements,
      ],
      solvedCaseIds: wasPreviouslySolved
        ? profile.solvedCaseIds
        : [...profile.solvedCaseIds, currentCaseDef.id],
    };

    if (isDailyRun) {
      const today = getUtcDateKey();
      const alreadyResolvedToday =
        updatedProfile.dailyChallenge.lastCompletedDateUtc === today;
      // Streak/counter mutations are idempotent per UTC day: only the first
      // daily result of the day counts. Replays on the same day are inert.
      if (!alreadyResolvedToday) {
        if (scoreBreakdown.tier !== 'Misdiagnosed') {
          const last = updatedProfile.dailyChallenge.lastCompletedDateUtc;
          const continued = last !== null && utcDateDiffInDays(last, today) === 1;
          const nextStreak = continued ? updatedProfile.dailyChallenge.currentStreak + 1 : 1;
          updatedProfile.dailyChallenge = {
            lastCompletedDateUtc: today,
            lastCompletedCaseId: currentCaseDef.id,
            currentStreak: nextStreak,
            bestStreak: Math.max(updatedProfile.dailyChallenge.bestStreak, nextStreak),
            totalCompleted: updatedProfile.dailyChallenge.totalCompleted + 1,
          };
        } else {
          // First daily attempt today was a misdiagnosis — break the streak.
          updatedProfile.dailyChallenge = {
            ...updatedProfile.dailyChallenge,
            currentStreak: 0,
          };
        }
      }
    }

    saveProfile(updatedProfile);

    set({
      currentCaseState: completedState,
      profile: updatedProfile,
      view: 'debrief',
      showDiagnosisForm: false,
      dailyRunCaseId: null,
    });

    return debrief;
  },

  setActiveTool: (tool) => set({ activeTool: tool }),

  toggleDiagnosisForm: () =>
    set((state) => ({ showDiagnosisForm: !state.showDiagnosisForm })),

  restartCase: (caseId) => {
    const caseDef = resolveCaseDefinitionByEntryId(caseId);
    if (!caseDef) return;

    const chaos = loadChaosSettings(caseId);
    const newState = createCaseState(caseId, chaos);
    const decorated = applyChaosToCaseDef(caseDef, newState.chaos, newState.startedAt);
    saveCaseState(caseId, newState);
    saveCurrentCaseId(caseId);

    set({
      view: 'investigation',
      currentCaseId: caseId,
      currentCaseDef: decorated,
      currentCaseState: newState,
      terminalHistory: [],
      activeTool: 'terminal',
      showDiagnosisForm: false,
      sandboxRunCaseId: null,
      dailyRunCaseId: null,
    });
  },

  exitCase: () => {
    saveCurrentCaseId(null);
    set({
      view: 'incident-board',
      currentCaseId: null,
      currentCaseDef: null,
      currentCaseState: null,
      terminalHistory: [],
      showDiagnosisForm: false,
      sandboxRunCaseId: null,
      dailyRunCaseId: null,
    });
  },

  updateProfile: (updates) => {
    const newProfile = { ...get().profile, ...updates };
    saveProfile(newProfile);
    set({ profile: newProfile });
  },

  updateSettings: (updates) => {
    const newSettings = { ...get().settings, ...updates };
    saveSettings(newSettings);
    set({ settings: newSettings });
  },

  initFromStorage: () => {
    const profile = loadProfile();
    const settings = loadSettings();
    const currentCaseId = loadCurrentCaseId();

    set({ profile, settings });

    if (currentCaseId) {
      const savedStates = loadCaseStates();
      const state = savedStates[currentCaseId];
      const caseDef = resolveCaseDefinitionByEntryId(currentCaseId);

      if (state && caseDef && state.status === 'active') {
        const decorated = applyChaosToCaseDef(caseDef, state.chaos, state.startedAt);
        set({
          currentCaseId,
          currentCaseDef: decorated,
          currentCaseState: state,
        });
      }
    }
  },

  isCaseSolved: (caseId) => {
    return get().profile.solvedCaseIds.includes(caseId);
  },

  getCaseScore: (caseId) => {
    return get().profile.bestScores[caseId];
  },
}));
