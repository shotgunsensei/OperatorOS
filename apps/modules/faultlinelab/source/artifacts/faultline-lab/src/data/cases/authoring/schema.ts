import type {
  CaseCategory,
  Difficulty,
  EvidenceItem,
  HintTier,
  Symptom,
  RootCause,
  ToolCommand,
  ToolType,
  EventLogEntry,
  TicketNote,
} from '@/types';

/**
 * A `CaseDraft` is the input shape an author works with. It mirrors
 * `CaseDefinition` but allows partial scoring metadata, omits derived
 * fields like `unlocked: false`, and is the payload that
 * `composeCase()` turns into a fully-formed `CaseDefinition` after
 * validation.
 *
 * Authoring rules enforced by `validateDraft()`:
 *   - id, slug, title, briefing, description must be non-empty.
 *   - At least 2 symptoms, 1 root cause, 4 evidence items, 4 hint tiers.
 *   - Hint tiers must be levels 1..4 with strictly increasing penalties.
 *   - Every command/event/ticket `revealsEvidence` id must point at a
 *     real evidence id.
 *   - Every "clue" or "critical" evidence item must be revealed by at
 *     least one command, event, or ticket.
 *   - At least one tool other than `terminal` must appear in
 *     `availableTools` for non-beginner cases (encourages variety).
 *   - `maxScore` must be 100 (the engine's normalized scale).
 */
export interface CaseDraft {
  id: string;
  slug: string;
  title: string;
  category: CaseCategory;
  difficulty: Difficulty;
  description: string;
  briefing: string;
  symptoms: Symptom[];
  rootCause: RootCause;
  evidence: AuthorEvidence[];
  hints: HintTier[];
  terminalCommands: ToolCommand[];
  eventLogs: EventLogEntry[];
  ticketHistory: TicketNote[];
  availableTools: ToolType[];
  redHerrings: string[];
  remediation: string;
  preventativeMeasures: string[];
  maxScore?: number;
}

/**
 * `AuthorEvidence` is `EvidenceItem` minus runtime fields
 * (`unlocked`, `unlockedBy`, `unlockedAt`) which `composeCase` fills in.
 */
export type AuthorEvidence = Omit<
  EvidenceItem,
  'unlocked' | 'unlockedBy' | 'unlockedAt'
>;

export interface AuthoringIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}

export interface AuthoringResult {
  issues: AuthoringIssue[];
  errorCount: number;
  warningCount: number;
}
