import type { CaseCategory, Difficulty } from '@/types';
import type { AuthoringIssue, AuthoringResult, CaseDraft } from './schema';

// Derived from the canonical type unions in `@/types`. Keeping the set
// here as a typed `Record` ensures the validator fails the typecheck
// (rather than silently going out of sync) when a new category or
// difficulty is added to the domain model.
const VALID_DIFFICULTIES: ReadonlySet<Difficulty> = new Set<Difficulty>([
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

const VALID_CATEGORIES: ReadonlySet<CaseCategory> = new Set<CaseCategory>([
  'windows-ad',
  'networking',
  'automotive',
  'electronics',
  'servers',
  'mixed',
]);

export function validateDraft(draft: CaseDraft): AuthoringResult {
  const issues: AuthoringIssue[] = [];
  const err = (code: string, message: string, path?: string) =>
    issues.push({ level: 'error', code, message, path });
  const warn = (code: string, message: string, path?: string) =>
    issues.push({ level: 'warning', code, message, path });

  // --- Identity ---
  if (!draft.id) err('missing-id', 'Case id is required');
  if (!draft.slug) err('missing-slug', 'Case slug is required');
  if (!draft.title) err('missing-title', 'Case title is required');
  if (!draft.briefing) err('missing-briefing', 'Case briefing is required');
  if (!draft.description)
    err('missing-description', 'Case description is required');
  if (!VALID_CATEGORIES.has(draft.category as CaseCategory))
    err('invalid-category', `Category "${draft.category}" is not recognized`);
  if (!VALID_DIFFICULTIES.has(draft.difficulty as Difficulty))
    err(
      'invalid-difficulty',
      `Difficulty "${draft.difficulty}" must be one of: ${[...VALID_DIFFICULTIES].join(', ')}`
    );

  // --- Symptoms ---
  if (!draft.symptoms || draft.symptoms.length < 2)
    err('too-few-symptoms', 'At least 2 symptoms are required');

  // --- Root cause ---
  if (!draft.rootCause?.id || !draft.rootCause?.title)
    err('missing-root-cause', 'Root cause id and title are required');
  if (draft.rootCause && !draft.rootCause.technicalDetail)
    warn(
      'thin-root-cause',
      'Root cause is missing technicalDetail — debrief will feel sparse'
    );

  // --- Evidence ---
  const evidenceIds = new Set<string>();
  if (!draft.evidence || draft.evidence.length < 4) {
    err('too-few-evidence', 'At least 4 evidence items are required');
  } else {
    for (const e of draft.evidence) {
      if (!e.id) {
        err('missing-evidence-id', 'Evidence item is missing id');
        continue;
      }
      if (evidenceIds.has(e.id))
        err(
          'duplicate-evidence-id',
          `Duplicate evidence id: ${e.id}`,
          `evidence.${e.id}`
        );
      evidenceIds.add(e.id);
      if (!e.title)
        err('missing-evidence-title', `Evidence ${e.id} has no title`, `evidence.${e.id}`);
    }
  }

  // --- Hint ladder ---
  if (!draft.hints || draft.hints.length !== 4) {
    err('hint-ladder-length', 'Hint ladder must have exactly 4 tiers (levels 1-4)');
  } else {
    const expected: ReadonlyArray<1 | 2 | 3 | 4> = [1, 2, 3, 4];
    for (let i = 0; i < draft.hints.length; i++) {
      const h = draft.hints[i];
      if (h.level !== expected[i])
        err(
          'hint-level-order',
          `Hint at index ${i} must be level ${expected[i]}, got ${h.level}`,
          `hints[${i}]`
        );
      if (!h.label || !h.text)
        err('hint-content-missing', `Hint level ${h.level} is missing label/text`, `hints[${i}]`);
      if (i > 0 && h.scorePenalty <= draft.hints[i - 1].scorePenalty)
        err(
          'hint-penalty-monotonic',
          `Hint level ${h.level} penalty (${h.scorePenalty}) must be strictly greater than the previous tier (${draft.hints[i - 1].scorePenalty})`,
          `hints[${i}]`
        );
    }
  }

  // --- Cross-references: every revealsEvidence id must exist ---
  const checkRefs = (
    refs: string[] | undefined,
    where: string,
    ref: string
  ) => {
    if (!refs) return;
    for (const id of refs) {
      if (!evidenceIds.has(id))
        err(
          'unknown-evidence-ref',
          `${where} "${ref}" reveals unknown evidence "${id}"`,
          `${where}:${ref}`
        );
    }
  };
  for (const c of draft.terminalCommands || [])
    checkRefs(c.revealsEvidence, 'command', c.command);
  for (const e of draft.eventLogs || [])
    checkRefs(e.revealsEvidence, 'eventLog', e.id);
  for (const t of draft.ticketHistory || [])
    checkRefs(t.revealsEvidence, 'ticket', t.id);

  // --- Reachability: every clue / critical evidence must be revealed somewhere ---
  const reachable = new Set<string>();
  for (const c of draft.terminalCommands || [])
    for (const id of c.revealsEvidence || []) reachable.add(id);
  for (const e of draft.eventLogs || [])
    for (const id of e.revealsEvidence || []) reachable.add(id);
  for (const t of draft.ticketHistory || [])
    for (const id of t.revealsEvidence || []) reachable.add(id);

  for (const e of draft.evidence || []) {
    if (
      (e.category === 'clue' || e.importance === 'critical') &&
      !reachable.has(e.id)
    ) {
      err(
        'unreachable-evidence',
        `Evidence "${e.id}" (${e.category}/${e.importance}) is not revealed by any command, event, or ticket`,
        `evidence.${e.id}`
      );
    }
  }

  // --- Tool variety ---
  if (!draft.availableTools || draft.availableTools.length === 0) {
    err('no-tools', 'availableTools is empty');
  } else if (
    (draft.difficulty === 'advanced' || draft.difficulty === 'expert') &&
    draft.availableTools.length === 1 &&
    draft.availableTools[0] === 'terminal'
  ) {
    warn(
      'single-tool-advanced',
      'Advanced/expert cases should expose more than just the terminal'
    );
  }

  // --- Scoring scale ---
  if (draft.maxScore !== undefined && draft.maxScore !== 100)
    err(
      'invalid-max-score',
      `maxScore must be 100 (engine's normalized scale), got ${draft.maxScore}`
    );

  // --- Remediation / preventatives ---
  if (!draft.remediation)
    err('missing-remediation', 'remediation text is required');
  if (!draft.preventativeMeasures || draft.preventativeMeasures.length === 0)
    warn(
      'no-preventatives',
      'preventativeMeasures is empty — debrief will be thin'
    );

  return {
    issues,
    errorCount: issues.filter((i) => i.level === 'error').length,
    warningCount: issues.filter((i) => i.level === 'warning').length,
  };
}
