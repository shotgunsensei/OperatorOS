import { loadSandboxScenarios, subscribeSandboxScenarios } from './sandboxScenarios';
import { getCasesByProductId, getCaseEntryById } from '@/data/caseCatalog';

/**
 * Cases without an explicit publishedAt are treated as having shipped
 * before this date. Picked far enough in the past that returning users
 * never see "New" badges on legacy starter content, but recent enough
 * that any case authored with a real timestamp from 2025 onwards is
 * easily distinguishable.
 */
export const LEGACY_CATALOG_PUBLISHED_AT = Date.UTC(2024, 0, 1);

const overrideFreshByCaseId = new Map<string, number>();
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

/**
 * Record that the cases owned by `productIds` were updated server-side
 * at `at`. Each call uses the highest seen timestamp per case so a
 * later override always wins. Apply this on every overrides payload
 * (initial snapshot included) using the server-provided per-row
 * `updatedAt`; the freshness check below filters against the user's
 * previous-visit timestamp.
 */
export function recordCatalogOverrideFreshness(
  productIds: string[],
  at: number
): void {
  if (!Number.isFinite(at) || at <= 0) return;
  let changed = false;
  for (const pid of productIds) {
    const cases = getCasesByProductId(pid);
    for (const c of cases) {
      const prev = overrideFreshByCaseId.get(c.id) ?? 0;
      if (at > prev) {
        overrideFreshByCaseId.set(c.id, at);
        changed = true;
      }
    }
  }
  if (changed) notify();
}

export function subscribeFreshness(cb: () => void): () => void {
  const unsubSandbox = subscribeSandboxScenarios(cb);
  listeners.add(cb);
  return () => {
    unsubSandbox();
    listeners.delete(cb);
  };
}

/**
 * Compute the most recent freshness timestamp for a case, combining:
 *   - sandbox-authored `updatedAt`/`createdAt` (for sandbox entries)
 *   - the catalog entry's declared `publishedAt` (or LEGACY default)
 *   - the latest server override timestamp recorded for the case
 */
export function getCaseFreshAt(caseId: string, isSandbox: boolean): number {
  if (isSandbox) {
    const s = loadSandboxScenarios().find((s) => s.id === caseId);
    if (!s) return 0;
    return Math.max(s.updatedAt, s.createdAt);
  }
  const entry = getCaseEntryById(caseId);
  const published = entry?.publishedAt ?? LEGACY_CATALOG_PUBLISHED_AT;
  const overrideAt = overrideFreshByCaseId.get(caseId) ?? 0;
  return Math.max(published, overrideAt);
}

/**
 * Returns true if the case has a freshness timestamp later than both
 * the user's previous-visit timestamp AND the timestamp at which they
 * last acknowledged this case's badge. The second clause means the
 * badge re-appears when a case is updated again after dismissal.
 */
export function isCaseNewSince(
  caseId: string,
  isSandbox: boolean,
  previousVisit: number | null | undefined,
  seenAtMap: Record<string, number> | undefined
): boolean {
  if (!previousVisit) return false;
  const freshAt = getCaseFreshAt(caseId, isSandbox);
  if (freshAt <= 0) return false;
  if (freshAt <= previousVisit) return false;
  const seenAt = seenAtMap?.[caseId] ?? 0;
  return freshAt > seenAt;
}
