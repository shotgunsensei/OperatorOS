import { CASE_CATALOG_ENTRIES } from './entries';
import type { CaseCatalogEntry, CaseCardState } from './types';
import { CATALOG } from '@/data/catalog';
import { isCaseAccessible, getEntitlements } from '@/lib/entitlements';

export const CASE_BY_ID: Map<string, CaseCatalogEntry> = new Map(
  CASE_CATALOG_ENTRIES.map((c) => [c.id, c])
);

export const CASE_BY_SLUG: Map<string, CaseCatalogEntry> = new Map(
  CASE_CATALOG_ENTRIES.map((c) => [c.slug, c])
);

export function getAllCaseEntries(): CaseCatalogEntry[] {
  return [...CASE_CATALOG_ENTRIES].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getCaseEntryById(id: string): CaseCatalogEntry | undefined {
  return CASE_BY_ID.get(id);
}

export function getStarterCases(): CaseCatalogEntry[] {
  return CASE_CATALOG_ENTRIES.filter((c) => c.isStarter).sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
}

export function getCasesByProductId(productId: string): CaseCatalogEntry[] {
  // Direct mapping by sourceProductId.
  const direct = CASE_CATALOG_ENTRIES.filter((c) => c.sourceProductId === productId);
  if (direct.length > 0) return direct.sort((a, b) => a.sortOrder - b.sortOrder);

  // Bundle expansion: walk bundledProductIds.
  const product = CATALOG.find((p) => p.id === productId);
  if (product?.bundledProductIds && product.bundledProductIds.length > 0) {
    const ids = new Set<string>();
    const out: CaseCatalogEntry[] = [];
    for (const innerId of product.bundledProductIds) {
      for (const c of getCasesByProductId(innerId)) {
        if (!ids.has(c.id)) {
          ids.add(c.id);
          out.push(c);
        }
      }
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return [];
}

export function getCaseCountForProduct(productId: string): {
  ready: number;
  planned: number;
  total: number;
} {
  const cases = getCasesByProductId(productId);
  const ready = cases.filter((c) => c.status === 'playable').length;
  const planned = cases.filter((c) => c.status === 'planned').length;
  return { ready, planned, total: cases.length };
}

export function getOwningProductForCase(caseId: string): string | null {
  const entry = CASE_BY_ID.get(caseId);
  return entry?.sourceProductId ?? null;
}

export function getPackForCaseId(caseId: string): string | null {
  const productId = getOwningProductForCase(caseId);
  if (!productId) return null;
  const product = CATALOG.find((p) => p.id === productId);
  if (!product) return null;
  if (product.entitlementType === 'content-pack') return product.id;
  return null;
}

export function resolveCaseOwnedState(caseId: string): boolean {
  // Single source of truth lives in entitlements.isCaseAccessible — it handles
  // starters, owned packs, bundles, and Pro subscription consistently.
  return isCaseAccessible(caseId);
}

export function resolveCasePlayable(caseId: string): boolean {
  const entry = CASE_BY_ID.get(caseId);
  if (!entry || entry.status !== 'playable') return false;
  return resolveCaseOwnedState(caseId);
}

export function getCaseCardState(caseId: string): CaseCardState | null {
  const entry = CASE_BY_ID.get(caseId);
  if (!entry) return null;
  const owned = resolveCaseOwnedState(caseId);
  const playable = entry.status === 'playable' && owned;
  const comingSoon = entry.status === 'planned';
  const locked = !owned;
  return {
    entry,
    owned,
    playable,
    locked,
    comingSoon,
    requiredProductId: owned ? null : entry.sourceProductId,
  };
}

export function getVisibleCasesForUser(): CaseCatalogEntry[] {
  // Everything is visible — locked or planned cases render with appropriate state.
  return getAllCaseEntries();
}

export function getLockedCasesForUser(): CaseCatalogEntry[] {
  return getAllCaseEntries().filter((c) => !resolveCaseOwnedState(c.id));
}

export function getPlayableCasesForUser(): CaseCatalogEntry[] {
  return getAllCaseEntries().filter((c) => resolveCasePlayable(c.id));
}

export function getDailyEligibleCases(): CaseCatalogEntry[] {
  return getAllCaseEntries().filter(
    (c) => c.isDailyEligible && c.status === 'playable' && resolveCaseOwnedState(c.id)
  );
}

export function getSandboxEligibleCases(): CaseCatalogEntry[] {
  return getAllCaseEntries().filter(
    (c) => c.isSandboxEligible && c.status === 'playable' && resolveCaseOwnedState(c.id)
  );
}

export function getRelatedCases(caseId: string, limit = 3): CaseCatalogEntry[] {
  const entry = CASE_BY_ID.get(caseId);
  if (!entry) return [];
  return getAllCaseEntries()
    .filter((c) => c.id !== caseId && c.category === entry.category)
    .slice(0, limit);
}

export function getRecommendedCases(limit = 3): CaseCatalogEntry[] {
  const ent = getEntitlements();
  const ownedPackIds = new Set(ent.ownedProductIds);
  return getAllCaseEntries()
    .filter((c) => c.status === 'planned' && !ownedPackIds.has(c.sourceProductId))
    .slice(0, limit);
}

export function getIncludedCaseIdsForProduct(productId: string): string[] {
  return getCasesByProductId(productId).map((c) => c.id);
}

/**
 * Honest case-count copy: surfaces both ready and planned counts so the
 * storefront never advertises inventory that does not exist yet.
 */
export function getCaseCountLabelForProduct(productId: string): string | null {
  const { ready, planned, total } = getCaseCountForProduct(productId);
  if (total <= 0) return null;
  if (planned > 0 && ready < total) {
    if (ready === 0) return `${total} cases planned`;
    return `${ready} of ${total} cases ready`;
  }
  return `${total} case${total === 1 ? '' : 's'}`;
}
