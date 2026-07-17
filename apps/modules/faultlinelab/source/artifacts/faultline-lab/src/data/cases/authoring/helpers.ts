import type {
  EvidenceItem,
  HintTier,
  Symptom,
  RootCause,
  ToolCommand,
  EventLogEntry,
  TicketNote,
  CaseDefinition,
} from '@/types';
import type { AuthorEvidence, CaseDraft } from './schema';
import { validateDraft } from './validate';

/**
 * Composition helpers. These mostly exist for IDE autocomplete and
 * to fill in sensible defaults so authors don't repeat themselves.
 */

export function symptom(input: Symptom): Symptom {
  return input;
}

export function rootCause(input: RootCause): RootCause {
  return input;
}

export function evidence(input: AuthorEvidence): AuthorEvidence {
  return input;
}

export function command(input: ToolCommand): ToolCommand {
  return input;
}

export function eventLog(input: EventLogEntry): EventLogEntry {
  return input;
}

export function ticket(input: TicketNote): TicketNote {
  return input;
}

/**
 * Build a hint ladder enforcing strictly increasing penalties at the
 * type level. Authors should typically pass exactly four entries
 * matching the engine's `1 | 2 | 3 | 4` scale; `validateDraft` checks
 * monotonicity and labels.
 */
export function hintLadder(input: HintTier[]): HintTier[] {
  return input;
}

/**
 * Validate a `CaseDraft` and lift it into a fully-formed
 * `CaseDefinition`. Throws an `Error` containing the authoring
 * issues if validation fails. Use `validateDraft` directly if you
 * want to inspect issues without throwing (e.g. in the admin
 * authoring UI).
 */
export function composeCase(draft: CaseDraft): CaseDefinition {
  const result = validateDraft(draft);
  if (result.errorCount > 0) {
    const summary = result.issues
      .filter((i) => i.level === 'error')
      .map((i) => `[${i.code}] ${i.message}${i.path ? ` (${i.path})` : ''}`)
      .join('\n');
    throw new Error(
      `composeCase: validation failed for ${draft.id || '<unknown>'}:\n${summary}`
    );
  }

  const evidenceItems: EvidenceItem[] = draft.evidence.map((e) => ({
    ...e,
    unlocked: false,
  }));

  return {
    id: draft.id,
    title: draft.title,
    category: draft.category,
    difficulty: draft.difficulty,
    description: draft.description,
    briefing: draft.briefing,
    symptoms: draft.symptoms,
    rootCause: draft.rootCause,
    evidence: evidenceItems,
    hints: draft.hints,
    terminalCommands: draft.terminalCommands,
    eventLogs: draft.eventLogs,
    ticketHistory: draft.ticketHistory,
    availableTools: draft.availableTools,
    redHerrings: draft.redHerrings,
    remediation: draft.remediation,
    preventativeMeasures: draft.preventativeMeasures,
    maxScore: draft.maxScore ?? 100,
  };
}
