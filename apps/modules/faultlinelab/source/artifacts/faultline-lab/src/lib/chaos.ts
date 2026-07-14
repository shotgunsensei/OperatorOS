export interface ChaosSettings {
  shuffleEvidence: boolean;
  injectRedHerrings: boolean;
  timePressure: boolean;
  hintBlackout: boolean;
  intensity: number;
}

export const DEFAULT_CHAOS: ChaosSettings = {
  shuffleEvidence: false,
  injectRedHerrings: false,
  timePressure: false,
  hintBlackout: false,
  intensity: 1,
};

const STORAGE_KEY = 'faultline-lab-chaos-settings';

const snapshotCache = new Map<string, ChaosSettings>();

function readFromStorage(caseId: string): ChaosSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_CHAOS;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${caseId}`);
    if (!raw) return DEFAULT_CHAOS;
    return { ...DEFAULT_CHAOS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CHAOS;
  }
}

function settingsEqual(a: ChaosSettings, b: ChaosSettings): boolean {
  return (
    a.shuffleEvidence === b.shuffleEvidence &&
    a.injectRedHerrings === b.injectRedHerrings &&
    a.timePressure === b.timePressure &&
    a.hintBlackout === b.hintBlackout &&
    a.intensity === b.intensity
  );
}

export function loadChaosSettings(caseId: string): ChaosSettings {
  const fresh = readFromStorage(caseId);
  const cached = snapshotCache.get(caseId);
  if (cached && settingsEqual(cached, fresh)) {
    return cached;
  }
  snapshotCache.set(caseId, fresh);
  return fresh;
}

export function saveChaosSettings(caseId: string, settings: ChaosSettings) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${caseId}`, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }
  snapshotCache.delete(caseId);
  notifyChaosListeners();
}

export function clearChaosSettings(caseId: string) {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(`${STORAGE_KEY}:${caseId}`);
    } catch {
      /* ignore */
    }
  }
  snapshotCache.delete(caseId);
  notifyChaosListeners();
}

const chaosListeners = new Set<() => void>();
function notifyChaosListeners() {
  chaosListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}
export function subscribeChaosSettings(cb: () => void): () => void {
  chaosListeners.add(cb);
  return () => {
    chaosListeners.delete(cb);
  };
}

export function isChaosActive(chaos: ChaosSettings | undefined | null): boolean {
  if (!chaos) return false;
  return (
    chaos.shuffleEvidence ||
    chaos.injectRedHerrings ||
    chaos.timePressure ||
    chaos.hintBlackout ||
    chaos.intensity > 1
  );
}

export function countActiveToggles(chaos: ChaosSettings | undefined | null): number {
  if (!chaos) return 0;
  return (
    (chaos.shuffleEvidence ? 1 : 0) +
    (chaos.injectRedHerrings ? 1 : 0) +
    (chaos.timePressure ? 1 : 0) +
    (chaos.hintBlackout ? 1 : 0)
  );
}

export function chaosTimeLimitMs(chaos: ChaosSettings | undefined | null): number | undefined {
  if (!chaos || !chaos.timePressure) return undefined;
  const intensity = Math.max(1, chaos.intensity);
  return Math.round(600_000 / intensity);
}

export function computeChaosMultiplier(chaos: ChaosSettings | undefined | null): number {
  if (!isChaosActive(chaos)) return 1;
  const intensityBoost = (chaos!.intensity - 1) * 0.25;
  const toggleBoost = countActiveToggles(chaos) * 0.05;
  return Math.max(1, 1 + intensityBoost + toggleBoost);
}
