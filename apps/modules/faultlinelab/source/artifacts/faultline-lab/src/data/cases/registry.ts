import type { CaseDefinition } from '@/types';
import { windowsAdCase } from './windows-ad-case';
import { networkingVpnCase } from './networking-vpn-case';
import { automotiveCase } from './automotive-case';
import { electronicsSensorCase } from './electronics-sensor-case';

/**
 * Typed registry of every implemented `CaseDefinition` in the app, keyed
 * by case id. This is the single resolution point for "given a case id,
 * give me its game logic".
 *
 * Authoring framework outputs (see `./authoring/`) should be added here
 * as they ship. The case catalog registry's `implementationRef` field
 * is intended to be a key into this map (see Task #12 for the typed
 * version).
 */
export const CASE_DEFINITIONS = {
  [windowsAdCase.id]: windowsAdCase,
  [networkingVpnCase.id]: networkingVpnCase,
  [automotiveCase.id]: automotiveCase,
  [electronicsSensorCase.id]: electronicsSensorCase,
} as const satisfies Record<string, CaseDefinition>;

export type CaseDefinitionId = keyof typeof CASE_DEFINITIONS;

export function getCaseDefinitionById(id: string): CaseDefinition | undefined {
  return (CASE_DEFINITIONS as Record<string, CaseDefinition>)[id];
}

export function caseDefinitionExists(id: string): boolean {
  return id in CASE_DEFINITIONS;
}

export function listCaseDefinitions(): CaseDefinition[] {
  return Object.values(CASE_DEFINITIONS);
}
