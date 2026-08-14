import { sha256, StudyForgeValidationError } from './studyforge.js';

export const STUDYFORGE_SOURCE_COMMIT = 'a607a9f34442b1d0f6bfffbf0293609529494825';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function planStudyForgeImport(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new StudyForgeValidationError('Import descriptor must be an object');
  }
  const descriptor = input as Record<string, unknown>;
  if (descriptor.sourceCommit !== STUDYFORGE_SOURCE_COMMIT) {
    throw new StudyForgeValidationError('Import sourceCommit does not match the pinned source', 'sourceCommit');
  }
  if (!descriptor.export || typeof descriptor.export !== 'object' || Array.isArray(descriptor.export)) {
    throw new StudyForgeValidationError('Import export must be an object', 'export');
  }
  const exported = descriptor.export as Record<string, unknown>;
  const count = (key: string) => Array.isArray(exported[key]) ? exported[key].length : 0;
  return {
    mode: 'dry-run' as const,
    sourceCommit: STUDYFORGE_SOURCE_COMMIT,
    exportSha256: sha256(stable(exported)),
    counts: {
      folders: count('folders'),
      studySets: count('studySets'),
      flashcards: count('flashcards'),
      quizQuestions: count('quizQuestions'),
      quizAttempts: count('quizAttempts'),
      studySessions: count('studySessions'),
      activityDays: count('studyActivity'),
    },
    mappings: {
      folders: 'studyforge_subjects/course organization',
      studySets: 'studyforge_sources plus reviewed deck/quiz/plan',
      flashcards: 'studyforge_cards',
      quizQuestions: 'studyforge_questions',
      quizAttempts: 'studyforge_quiz_attempts after user mapping',
      studySessions: 'studyforge_plan_sessions',
      studyActivity: 'recomputed from accepted attempts, reviews, and sessions',
    },
    excluded: [
      'users', 'password hashes', 'sessions', 'stripe events',
      'subscriptions', 'child roles', 'admin authority',
    ],
    blockers: [
      'Owner-approved OperatorOS tenant/user mapping is required before apply.',
      'No apply mode exists in Phase 11C.',
    ],
  };
}
