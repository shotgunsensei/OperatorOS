import { createHash } from 'node:crypto';

export const FAULTLINE_CATEGORIES = [
  'windows-ad',
  'networking',
  'automotive',
  'electronics',
  'servers',
  'mixed',
  'healthcare-imaging',
] as const;
export const FAULTLINE_DIFFICULTIES = [
  'beginner',
  'intermediate',
  'advanced',
  'expert',
] as const;
export const FAULTLINE_SESSION_MODES = [
  'standard',
  'daily',
  'preview',
  'assignment',
  'chaos',
] as const;
export const FAULTLINE_SESSION_STATES = ['active', 'completed', 'abandoned'] as const;

export type FaultlineCategory = (typeof FAULTLINE_CATEGORIES)[number];
export type FaultlineDifficulty = (typeof FAULTLINE_DIFFICULTIES)[number];
export type FaultlineSessionMode = (typeof FAULTLINE_SESSION_MODES)[number];
export type FaultlineEvidenceImportance = 'low' | 'medium' | 'high' | 'critical';
export type FaultlineEvidenceCategory = 'clue' | 'red-herring' | 'contextual';

export interface FaultlineEvidence {
  id: string;
  title: string;
  description: string;
  category: FaultlineEvidenceCategory;
  importance: FaultlineEvidenceImportance;
}

export interface FaultlineHint {
  level: 1 | 2 | 3 | 4;
  label: string;
  text: string;
  scorePenalty: number;
}

export interface FaultlineCommand {
  command: string;
  aliases: string[];
  description: string;
  output: string;
  revealsEvidence: string[];
  risky: boolean;
}

export interface FaultlineEvent {
  id: string;
  timestamp: string;
  source: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  details: string;
  revealsEvidence: string[];
}

export interface FaultlineTicket {
  id: string;
  author: string;
  role: string;
  timestamp: string;
  content: string;
  redHerring: boolean;
  revealsEvidence: string[];
}

export interface FaultlineChallengeContent {
  schemaVersion: 1;
  sourceId?: string;
  description: string;
  briefing: string;
  symptoms: Array<{
    id: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  rootCause: {
    id: string;
    title: string;
    description: string;
    technicalDetail: string;
  };
  rootCauseOptions: Array<{ id: string; title: string }>;
  evidence: FaultlineEvidence[];
  hints: FaultlineHint[];
  commands: FaultlineCommand[];
  events: FaultlineEvent[];
  tickets: FaultlineTicket[];
  availableTools: string[];
  redHerrings: string[];
  remediation: string;
  remediationKeywords: string[];
  preventativeMeasures: string[];
  maxScore: 100;
}

export interface FaultlineValidationResult {
  valid: boolean;
  errors: Array<{ code: string; path: string; message: string }>;
  warnings: Array<{ code: string; path: string; message: string }>;
}

export class FaultlineValidationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode = 400,
    readonly field?: string,
  ) {
    super(message);
  }
}

const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,99}$/;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const HTML_PATTERN = /<\/?[a-z][^>]*>/i;

export function faultlineText(
  value: unknown,
  field: string,
  max: number,
  options: { required?: boolean; min?: number; singleLine?: boolean } = {},
): string | null {
  if (value === undefined || value === null || value === '') {
    if (options.required) {
      throw new FaultlineValidationError(`${field} is required`, 'FAULTLINE_FIELD_REQUIRED', 400, field);
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw new FaultlineValidationError(`${field} must be text`, 'FAULTLINE_TEXT_INVALID', 400, field);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (
    normalized.length < (options.min ?? 0) ||
    normalized.length > max ||
    CONTROL_PATTERN.test(normalized) ||
    HTML_PATTERN.test(normalized) ||
    (options.singleLine && normalized.includes('\n'))
  ) {
    throw new FaultlineValidationError(
      `${field} is outside the allowed plain-text format`,
      'FAULTLINE_TEXT_INVALID',
      400,
      field,
    );
  }
  return normalized;
}

export function faultlineId(value: unknown, field: string): string {
  const result = faultlineText(value, field, 100, { required: true, min: 1, singleLine: true })!;
  if (!ID_PATTERN.test(result)) {
    throw new FaultlineValidationError(`${field} has an invalid identifier`, 'FAULTLINE_ID_INVALID', 400, field);
  }
  return result;
}

export function faultlineExpectedVersion(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new FaultlineValidationError(
      'expectedVersion must be a positive integer',
      'FAULTLINE_VERSION_REQUIRED',
      400,
      'expectedVersion',
    );
  }
  return Number(value);
}

function stringArray(value: unknown, field: string, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new FaultlineValidationError(
      `${field} must be an array of at most ${maxItems} items`,
      'FAULTLINE_ARRAY_INVALID',
      400,
      field,
    );
  }
  return value.map((item, index) => faultlineText(item, `${field}.${index}`, maxLength, {
    required: true,
    min: 1,
  })!);
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new FaultlineValidationError(
      `${field} must be one of ${allowed.join(', ')}`,
      'FAULTLINE_ENUM_INVALID',
      400,
      field,
    );
  }
  return value as T;
}

function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new FaultlineValidationError(`${field} must be an object`, 'FAULTLINE_OBJECT_INVALID', 400, field);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, field: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new FaultlineValidationError(
      `${field} must contain between ${min} and ${max} items`,
      'FAULTLINE_ARRAY_INVALID',
      400,
      field,
    );
  }
  return value;
}

export function parseFaultlineChallengeContent(value: unknown): FaultlineChallengeContent {
  const input = object(value, 'content');
  const root = object(input.rootCause, 'content.rootCause');
  const symptoms = array(input.symptoms, 'content.symptoms', 2, 30).map((raw, index) => {
    const item = object(raw, `content.symptoms.${index}`);
    return {
      id: faultlineId(item.id, `content.symptoms.${index}.id`),
      description: faultlineText(item.description, `content.symptoms.${index}.description`, 1000, {
        required: true,
        min: 2,
      })!,
      severity: enumValue(item.severity, `content.symptoms.${index}.severity`, [
        'low',
        'medium',
        'high',
        'critical',
      ] as const),
    };
  });
  const evidence = array(input.evidence, 'content.evidence', 4, 100).map((raw, index) => {
    const item = object(raw, `content.evidence.${index}`);
    return {
      id: faultlineId(item.id, `content.evidence.${index}.id`),
      title: faultlineText(item.title, `content.evidence.${index}.title`, 180, {
        required: true,
        min: 2,
        singleLine: true,
      })!,
      description: faultlineText(item.description, `content.evidence.${index}.description`, 3000, {
        required: true,
        min: 2,
      })!,
      category: enumValue(item.category, `content.evidence.${index}.category`, [
        'clue',
        'red-herring',
        'contextual',
      ] as const),
      importance: enumValue(item.importance, `content.evidence.${index}.importance`, [
        'low',
        'medium',
        'high',
        'critical',
      ] as const),
    };
  });
  const hints = array(input.hints, 'content.hints', 4, 4).map((raw, index) => {
    const item = object(raw, `content.hints.${index}`);
    const level = Number(item.level);
    const scorePenalty = Number(item.scorePenalty);
    if (![1, 2, 3, 4].includes(level) || !Number.isInteger(scorePenalty) || scorePenalty < 0 || scorePenalty > 50) {
      throw new FaultlineValidationError(
        `content.hints.${index} has an invalid level or penalty`,
        'FAULTLINE_HINT_INVALID',
        400,
        `content.hints.${index}`,
      );
    }
    return {
      level: level as 1 | 2 | 3 | 4,
      label: faultlineText(item.label, `content.hints.${index}.label`, 100, {
        required: true,
        min: 1,
        singleLine: true,
      })!,
      text: faultlineText(item.text, `content.hints.${index}.text`, 2000, {
        required: true,
        min: 2,
      })!,
      scorePenalty,
    };
  });
  const commands = array(input.commands, 'content.commands', 1, 100).map((raw, index) => {
    const item = object(raw, `content.commands.${index}`);
    return {
      command: faultlineText(item.command, `content.commands.${index}.command`, 200, {
        required: true,
        min: 1,
        singleLine: true,
      })!,
      aliases: stringArray(item.aliases ?? [], `content.commands.${index}.aliases`, 20, 200),
      description: faultlineText(item.description, `content.commands.${index}.description`, 500, {
        required: true,
        min: 1,
      })!,
      output: faultlineText(item.output, `content.commands.${index}.output`, 20_000, {
        required: true,
      })!,
      revealsEvidence: stringArray(
        item.revealsEvidence ?? [],
        `content.commands.${index}.revealsEvidence`,
        30,
        100,
      ).map((id, evidenceIndex) => faultlineId(id, `content.commands.${index}.revealsEvidence.${evidenceIndex}`)),
      risky: item.risky === true,
    };
  });
  const events = array(input.events ?? [], 'content.events', 0, 100).map((raw, index) => {
    const item = object(raw, `content.events.${index}`);
    return {
      id: faultlineId(item.id, `content.events.${index}.id`),
      timestamp: faultlineText(item.timestamp, `content.events.${index}.timestamp`, 100, {
        required: true,
        singleLine: true,
      })!,
      source: faultlineText(item.source, `content.events.${index}.source`, 120, {
        required: true,
        singleLine: true,
      })!,
      level: enumValue(item.level, `content.events.${index}.level`, [
        'info',
        'warning',
        'error',
        'critical',
      ] as const),
      message: faultlineText(item.message, `content.events.${index}.message`, 1000, {
        required: true,
      })!,
      details: faultlineText(item.details ?? item.message, `content.events.${index}.details`, 5000, {
        required: true,
      })!,
      revealsEvidence: stringArray(
        item.revealsEvidence ?? [],
        `content.events.${index}.revealsEvidence`,
        30,
        100,
      ).map((id, evidenceIndex) => faultlineId(id, `content.events.${index}.revealsEvidence.${evidenceIndex}`)),
    };
  });
  const tickets = array(input.tickets ?? [], 'content.tickets', 0, 100).map((raw, index) => {
    const item = object(raw, `content.tickets.${index}`);
    return {
      id: faultlineId(item.id, `content.tickets.${index}.id`),
      author: faultlineText(item.author, `content.tickets.${index}.author`, 160, {
        required: true,
        singleLine: true,
      })!,
      role: faultlineText(item.role, `content.tickets.${index}.role`, 160, {
        required: true,
        singleLine: true,
      })!,
      timestamp: faultlineText(item.timestamp, `content.tickets.${index}.timestamp`, 100, {
        required: true,
        singleLine: true,
      })!,
      content: faultlineText(item.content, `content.tickets.${index}.content`, 5000, {
        required: true,
        min: 1,
      })!,
      redHerring: item.redHerring === true,
      revealsEvidence: stringArray(
        item.revealsEvidence ?? [],
        `content.tickets.${index}.revealsEvidence`,
        30,
        100,
      ).map((id, evidenceIndex) => faultlineId(id, `content.tickets.${index}.revealsEvidence.${evidenceIndex}`)),
    };
  });
  const rootCauseOptions = array(input.rootCauseOptions, 'content.rootCauseOptions', 2, 12).map(
    (raw, index) => {
      const item = object(raw, `content.rootCauseOptions.${index}`);
      return {
        id: faultlineId(item.id, `content.rootCauseOptions.${index}.id`),
        title: faultlineText(item.title, `content.rootCauseOptions.${index}.title`, 220, {
          required: true,
          min: 2,
          singleLine: true,
        })!,
      };
    },
  );
  const result: FaultlineChallengeContent = {
    schemaVersion: 1,
    ...(input.sourceId ? { sourceId: faultlineId(input.sourceId, 'content.sourceId') } : {}),
    description: faultlineText(input.description, 'content.description', 3000, {
      required: true,
      min: 2,
    })!,
    briefing: faultlineText(input.briefing, 'content.briefing', 10_000, {
      required: true,
      min: 2,
    })!,
    symptoms,
    rootCause: {
      id: faultlineId(root.id, 'content.rootCause.id'),
      title: faultlineText(root.title, 'content.rootCause.title', 220, {
        required: true,
        min: 2,
        singleLine: true,
      })!,
      description: faultlineText(root.description, 'content.rootCause.description', 3000, {
        required: true,
        min: 2,
      })!,
      technicalDetail: faultlineText(root.technicalDetail, 'content.rootCause.technicalDetail', 6000, {
        required: true,
        min: 2,
      })!,
    },
    rootCauseOptions,
    evidence,
    hints,
    commands,
    events,
    tickets,
    availableTools: stringArray(input.availableTools ?? ['terminal'], 'content.availableTools', 20, 100),
    redHerrings: stringArray(input.redHerrings ?? [], 'content.redHerrings', 30, 1000),
    remediation: faultlineText(input.remediation, 'content.remediation', 5000, {
      required: true,
      min: 2,
    })!,
    remediationKeywords: stringArray(
      input.remediationKeywords,
      'content.remediationKeywords',
      30,
      100,
    ).map((keyword) => keyword.toLowerCase()),
    preventativeMeasures: stringArray(
      input.preventativeMeasures ?? [],
      'content.preventativeMeasures',
      30,
      1000,
    ),
    maxScore: 100,
  };
  const validation = validateFaultlineChallengeContent(result);
  if (!validation.valid) {
    const first = validation.errors[0]!;
    throw new FaultlineValidationError(first.message, first.code, 422, first.path);
  }
  return result;
}

export function validateFaultlineChallengeContent(
  content: FaultlineChallengeContent,
): FaultlineValidationResult {
  const errors: FaultlineValidationResult['errors'] = [];
  const warnings: FaultlineValidationResult['warnings'] = [];
  const unique = (items: string[], path: string) => {
    const seen = new Set<string>();
    for (const id of items) {
      if (seen.has(id)) errors.push({ code: 'FAULTLINE_ID_DUPLICATE', path, message: `Duplicate id ${id}` });
      seen.add(id);
    }
  };
  unique(content.symptoms.map((item) => item.id), 'content.symptoms');
  unique(content.evidence.map((item) => item.id), 'content.evidence');
  unique(content.events.map((item) => item.id), 'content.events');
  unique(content.tickets.map((item) => item.id), 'content.tickets');
  unique(content.rootCauseOptions.map((item) => item.id), 'content.rootCauseOptions');
  unique(content.commands.map((item) => item.command.toLowerCase()), 'content.commands');
  const evidenceIds = new Set(content.evidence.map((item) => item.id));
  const revealIds = [
    ...content.commands.flatMap((item) => item.revealsEvidence),
    ...content.events.flatMap((item) => item.revealsEvidence),
    ...content.tickets.flatMap((item) => item.revealsEvidence),
  ];
  for (const id of revealIds) {
    if (!evidenceIds.has(id)) {
      errors.push({
        code: 'FAULTLINE_EVIDENCE_REFERENCE_INVALID',
        path: 'content',
        message: `Unknown revealed evidence id ${id}`,
      });
    }
  }
  for (const item of content.evidence) {
    if ((item.category === 'clue' || item.importance === 'critical') && !revealIds.includes(item.id)) {
      errors.push({
        code: 'FAULTLINE_EVIDENCE_UNREACHABLE',
        path: `content.evidence.${item.id}`,
        message: `Required evidence ${item.id} is not reachable from an investigation action`,
      });
    }
  }
  const sortedHints = [...content.hints].sort((a, b) => a.level - b.level);
  for (let index = 0; index < sortedHints.length; index += 1) {
    if (sortedHints[index]?.level !== index + 1) {
      errors.push({ code: 'FAULTLINE_HINT_LEVEL_INVALID', path: 'content.hints', message: 'Hint levels must be 1 through 4' });
    }
    if (index > 0 && sortedHints[index]!.scorePenalty <= sortedHints[index - 1]!.scorePenalty) {
      errors.push({ code: 'FAULTLINE_HINT_PENALTY_INVALID', path: 'content.hints', message: 'Hint penalties must increase by level' });
    }
  }
  if (!content.rootCauseOptions.some((item) => item.id === content.rootCause.id)) {
    errors.push({
      code: 'FAULTLINE_ROOT_CAUSE_OPTION_MISSING',
      path: 'content.rootCauseOptions',
      message: 'Root cause options must include the canonical root cause',
    });
  }
  if (content.remediationKeywords.length < 2) {
    errors.push({
      code: 'FAULTLINE_REMEDIATION_KEYWORDS_REQUIRED',
      path: 'content.remediationKeywords',
      message: 'At least two remediation keywords are required for deterministic scoring',
    });
  }
  if (content.events.length === 0 || content.tickets.length === 0) {
    warnings.push({
      code: 'FAULTLINE_TOOL_VARIETY_WARNING',
      path: 'content',
      message: 'A complete lab should include both event-log and ticket-history evidence',
    });
  }
  return { valid: errors.length === 0, errors, warnings };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function faultlineContentHash(content: FaultlineChallengeContent): string {
  return createHash('sha256').update(canonical(content)).digest('hex');
}

export function safeFaultlineChallenge(content: FaultlineChallengeContent) {
  return {
    schemaVersion: content.schemaVersion,
    description: content.description,
    briefing: content.briefing,
    symptoms: content.symptoms,
    rootCauseOptions: content.rootCauseOptions,
    evidence: content.evidence.map(({ description: _description, ...item }) => item),
    hints: content.hints.map(({ text: _text, ...item }) => item),
    commands: content.commands.map(({ output: _output, revealsEvidence: _reveals, risky: _risky, ...item }) => item),
    events: content.events.map(({ details: _details, revealsEvidence: _reveals, ...item }) => item),
    tickets: content.tickets.map(({ content: _content, revealsEvidence: _reveals, redHerring: _redHerring, ...item }) => item),
    availableTools: content.availableTools,
  };
}

export function faultlineDebrief(content: FaultlineChallengeContent) {
  return {
    rootCause: content.rootCause,
    cluesThatMattered: content.evidence.filter(
      (item) => item.category === 'clue' && item.importance !== 'low',
    ),
    misleadingClues: content.redHerrings,
    remediation: content.remediation,
    preventativeMeasures: content.preventativeMeasures,
  };
}

export interface FaultlineScoreInput {
  selectedRootCauseId: string;
  evidenceIds: string[];
  remediation: string;
  unlockedEvidenceIds: string[];
  hintLevels: number[];
  actionCount: number;
  riskyActionCount: number;
  elapsedSeconds: number;
  mode: FaultlineSessionMode;
  chaosIntensity?: number;
  timeLimitSeconds?: number | null;
}

export interface FaultlineScoreBreakdown {
  diagnosisAccuracy: number;
  evidenceQuality: number;
  remediationQuality: number;
  efficiency: number;
  hintPenalty: number;
  riskyActionPenalty: number;
  timePenalty: number;
  chaosMultiplier: number;
  baseTotal: number;
  total: number;
  maxPossible: number;
  percentage: number;
  tier: 'Surgical' | 'Solid' | 'Sloppy but Correct' | 'Misdiagnosed';
  passed: boolean;
  badges: string[];
}

export function scoreFaultlineSubmission(
  content: FaultlineChallengeContent,
  input: FaultlineScoreInput,
): FaultlineScoreBreakdown {
  const unlocked = new Set(input.unlockedEvidenceIds);
  if (input.evidenceIds.some((id) => !unlocked.has(id))) {
    throw new FaultlineValidationError(
      'A submission may cite only evidence unlocked in this attempt',
      'FAULTLINE_EVIDENCE_LOCKED',
      422,
      'evidenceIds',
    );
  }
  const correct = input.selectedRootCauseId === content.rootCause.id;
  const diagnosisAccuracy = correct ? 45 : 0;
  const weights: Record<FaultlineEvidenceImportance, number> = {
    critical: 5,
    high: 4,
    medium: 2,
    low: 1,
  };
  const clueEvidence = content.evidence.filter((item) => item.category === 'clue');
  const availableWeight = clueEvidence.reduce((total, item) => total + weights[item.importance], 0) || 1;
  let selectedWeight = 0;
  let redHerringCount = 0;
  for (const id of new Set(input.evidenceIds)) {
    const item = content.evidence.find((candidate) => candidate.id === id);
    if (item?.category === 'clue') selectedWeight += weights[item.importance];
    if (item?.category === 'red-herring') redHerringCount += 1;
  }
  const evidenceQuality = Math.max(
    0,
    Math.min(25, Math.round((selectedWeight / availableWeight) * 25) - redHerringCount * 3),
  );
  const remediationLower = input.remediation.toLowerCase();
  const remediationMatches = content.remediationKeywords.filter((term) => remediationLower.includes(term)).length;
  const remediationQuality = Math.round(
    Math.min(15, (remediationMatches / content.remediationKeywords.length) * 15),
  );
  let efficiency = 15;
  if (input.actionCount > 25) efficiency -= 3;
  if (input.actionCount > 40) efficiency -= 3;
  if (input.actionCount > 60) efficiency -= 4;
  if (input.elapsedSeconds > 30 * 60) efficiency -= 2;
  if (input.elapsedSeconds > 60 * 60) efficiency -= 3;
  efficiency = Math.max(0, efficiency);
  const hintPenalty = [...new Set(input.hintLevels)].reduce(
    (total, level) => total + (content.hints.find((hint) => hint.level === level)?.scorePenalty ?? 0),
    0,
  );
  const riskyActionPenalty = Math.max(0, input.riskyActionCount) * 3;
  const timePenalty = input.timeLimitSeconds && input.elapsedSeconds > input.timeLimitSeconds
    ? Math.min(20, Math.floor((input.elapsedSeconds - input.timeLimitSeconds) / 30) * 2)
    : 0;
  const raw = diagnosisAccuracy + evidenceQuality + remediationQuality + efficiency;
  const baseTotal = Math.max(0, raw - hintPenalty - riskyActionPenalty - timePenalty);
  const chaosMultiplier = input.mode === 'chaos'
    ? Math.min(1.5, 1 + Math.max(1, Math.min(3, input.chaosIntensity ?? 1)) * 0.15)
    : 1;
  const total = Math.round(baseTotal * chaosMultiplier);
  const maxPossible = Math.round(content.maxScore * chaosMultiplier);
  const percentage = maxPossible === 0 ? 0 : Math.round((total / maxPossible) * 100);
  const tier = !correct
    ? 'Misdiagnosed'
    : percentage >= 80
      ? 'Surgical'
      : percentage >= 55
        ? 'Solid'
        : 'Sloppy but Correct';
  const passed = correct && percentage >= 50;
  const badges: string[] = [];
  if (tier === 'Surgical') badges.push('no-guesswork');
  if (hintPenalty === 0 && percentage > 70) badges.push('clean-hands');
  if (input.actionCount <= 10 && percentage > 60) badges.push('first-responder');
  if (hintPenalty === 0 && riskyActionPenalty === 0) badges.push('safe-operator');
  if (content.sourceId?.includes('networking') && passed) badges.push('packet-whisperer');
  if (content.sourceId?.includes('automotive') && passed) badges.push('voltage-hunter');
  if (
    input.unlockedEvidenceIds.some(
      (id) => content.evidence.find((item) => item.id === id)?.category === 'red-herring',
    ) && passed
  ) {
    badges.push('red-herring-survivor');
  }
  return {
    diagnosisAccuracy,
    evidenceQuality,
    remediationQuality,
    efficiency,
    hintPenalty,
    riskyActionPenalty,
    timePenalty,
    chaosMultiplier,
    baseTotal,
    total,
    maxPossible,
    percentage,
    tier,
    passed,
    badges: [...new Set(badges)],
  };
}

export function normalizeFaultlineCommand(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchFaultlineCommand(content: FaultlineChallengeContent, value: string) {
  const normalized = normalizeFaultlineCommand(value);
  return content.commands.find((command) => {
    const candidates = [command.command, ...command.aliases].map(normalizeFaultlineCommand);
    if (candidates.includes(normalized)) return true;
    const inputWords = normalized.split(' ');
    const commandWords = normalizeFaultlineCommand(command.command).split(' ');
    return inputWords.length >= commandWords.length && commandWords.every((word, index) => inputWords[index] === word);
  }) ?? null;
}

export function faultlineChaosSettings(intensityValue: unknown) {
  const intensity = intensityValue === undefined ? 1 : Number(intensityValue);
  if (!Number.isInteger(intensity) || intensity < 1 || intensity > 3) {
    throw new FaultlineValidationError(
      'chaosIntensity must be 1, 2, or 3',
      'FAULTLINE_CHAOS_INTENSITY_INVALID',
      400,
      'chaosIntensity',
    );
  }
  return {
    intensity,
    shuffle: true,
    timeLimitSeconds: intensity === 1 ? 3600 : intensity === 2 ? 2700 : 1800,
    hintBlackout: intensity === 3,
  };
}
