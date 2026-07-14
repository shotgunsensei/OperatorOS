import type { CaseDefinition } from '@/types';
import { CASE_DEFINITIONS, getCaseById } from '@/data/cases';
import { CASE_BY_ID } from './selectors';
import type { CaseCatalogEntry } from './types';
import { getSandboxAuthoredCaseDef } from '@/lib/sandboxScenarios';

export function resolveCaseDefinition(entry: CaseCatalogEntry): CaseDefinition | undefined {
  if (entry.implementationRef) {
    const def = CASE_DEFINITIONS[entry.implementationRef];
    if (def) return def;
  }
  // Pack cases are authored via the `defineCase` framework and registered in
  // `allCases`. They use their own catalog id as their definition id, so a
  // direct lookup by id resolves them without needing every pack case to be
  // hand-added to the typed `CASE_DEFINITIONS` map.
  return getCaseById(entry.id);
}

export function resolveCaseDefinitionByEntryId(entryId: string): CaseDefinition | undefined {
  const entry = CASE_BY_ID.get(entryId);
  if (entry) {
    const def = resolveCaseDefinition(entry);
    if (def) return def;
  }
  // Fall back to user-authored sandbox scenarios so authors can play their
  // own puzzles. Catalog cases always win when both exist.
  return getSandboxAuthoredCaseDef(entryId);
}
