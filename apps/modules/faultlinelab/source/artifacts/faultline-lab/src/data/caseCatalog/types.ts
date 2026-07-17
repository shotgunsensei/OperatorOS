import type { CaseCategory, Difficulty } from '@/types';
import type { CaseImplementationKey } from '@/data/cases';

export type CaseSourceType = 'starter' | 'pack';

export type CaseCatalogStatus = 'playable' | 'planned' | 'disabled';

export type CaseAccessModel = 'free' | 'pack' | 'pro' | 'bundle';

export type RedHerringLevel = 'low' | 'medium' | 'high';

export interface CaseCatalogEntry {
  id: string;
  slug: string;
  title: string;
  shortSummary: string;
  mobileSummary: string;
  category: CaseCategory;
  difficulty: Difficulty;
  estimatedMinutes: number;
  sourceType: CaseSourceType;
  status: CaseCatalogStatus;
  accessModel: CaseAccessModel;
  sourceProductId: string;
  requiredEntitlements: string[];
  requiredToolSlugs: string[];
  previewSymptoms: string[];
  previewSystems: string[];
  redHerringLevel: RedHerringLevel;
  implementationRef?: CaseImplementationKey;
  definitionRef?: string;
  /**
   * Optional public-object path for the case author / cover image.
   * Stored as a relative path within `PUBLIC_OBJECT_SEARCH_PATHS`
   * (e.g. `case-authors/jane-doe.jpg`). Resolve to a serving URL with
   * `getCaseAuthorImageUrl()` from `@/data/caseCatalog/authorImage`.
   *
   * See `docs/case-author-images.md` for the upload + reference workflow.
   */
  authorImagePath?: string;
  tags: string[];
  isStarter: boolean;
  isFeatured: boolean;
  isDailyEligible: boolean;
  isSandboxEligible: boolean;
  sortOrder: number;
  /**
   * Optional millisecond timestamp marking when this case was added or
   * substantively updated in the catalog. Consumed by the Incident Board
   * to surface a "New since your last visit" badge. When omitted the
   * entry is treated as having been published before any modern visit
   * timestamp (see LEGACY_CATALOG_PUBLISHED_AT).
   */
  publishedAt?: number;
}

export interface CaseCardState {
  entry: CaseCatalogEntry;
  owned: boolean;
  playable: boolean;
  locked: boolean;
  comingSoon: boolean;
  requiredProductId: string | null;
}
