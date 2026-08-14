import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;

export class StudyForgeValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'STUDYFORGE_INPUT_INVALID';
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'StudyForgeValidationError';
  }
}

type Input = Record<string, unknown>;

function record(value: unknown): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new StudyForgeValidationError('Request body must be an object');
  }
  return value as Input;
}

function known(body: Input, fields: readonly string[]) {
  const allowed = new Set(fields);
  const unknown = Object.keys(body).filter((field) => !allowed.has(field));
  if (unknown.length) throw new StudyForgeValidationError(`Unknown field: ${unknown[0]}`, unknown[0]);
}

function text(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new StudyForgeValidationError(`${field} must be text`, field);
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw new StudyForgeValidationError(`${field} must be ${min}-${max} characters`, field);
  }
  return result;
}

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return text(value, field, 1, max);
}

function uuid(value: unknown, field: string, required = false): string | null | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new StudyForgeValidationError(`${field} is required`, field);
    return value === undefined ? undefined : null;
  }
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new StudyForgeValidationError(`${field} must be a valid identifier`, field);
  }
  return value;
}

function integer(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max) {
    throw new StudyForgeValidationError(`${field} must be an integer from ${min} to ${max}`, field);
  }
  return Number(value);
}

function version(body: Input): number {
  return integer(body.expectedVersion, 'expectedVersion', 1, 2_147_483_647);
}

function isoDate(value: unknown, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new StudyForgeValidationError(`${field} must be YYYY-MM-DD`, field);
  }
  return value;
}

function oneOf<T extends readonly string[]>(value: unknown, field: string, values: T): T[number] {
  if (typeof value !== 'string' || !values.includes(value as T[number])) {
    throw new StudyForgeValidationError(`${field} is invalid`, field);
  }
  return value as T[number];
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function parseSubjectInput(value: unknown, patch = false) {
  const body = record(value);
  known(body, ['name', 'courseCode', 'description', 'expectedVersion']);
  const output = {
    name: !patch || body.name !== undefined ? text(body.name, 'name', 1, 160) : undefined,
    courseCode: optionalText(body.courseCode, 'courseCode', 80),
    description: optionalText(body.description, 'description', 8_000),
  };
  if (patch && Object.values(output).every((item) => item === undefined)) {
    throw new StudyForgeValidationError('At least one field must be changed');
  }
  return { ...output, ...(patch ? { expectedVersion: version(body) } : {}) };
}

export function parseSourceInput(value: unknown, patch = false) {
  const body = record(value);
  known(body, ['subjectId', 'title', 'sourceType', 'body', 'attachmentId', 'expectedVersion']);
  const sourceType = body.sourceType === undefined && patch
    ? undefined
    : oneOf(body.sourceType ?? 'note', 'sourceType', ['note', 'document'] as const);
  const noteBody = optionalText(body.body, 'body', 100_000);
  const attachmentId = uuid(body.attachmentId, 'attachmentId');
  if (!patch || sourceType !== undefined) {
    if (sourceType === 'note' && (!noteBody || attachmentId)) {
      throw new StudyForgeValidationError('A note source requires body text and cannot include attachmentId', 'body');
    }
    if (sourceType === 'document' && (!attachmentId || noteBody)) {
      throw new StudyForgeValidationError('A document source requires attachmentId and cannot include body text', 'attachmentId');
    }
  }
  return {
    subjectId: uuid(body.subjectId, 'subjectId'),
    title: !patch || body.title !== undefined ? text(body.title, 'title', 1, 200) : undefined,
    sourceType,
    body: noteBody,
    attachmentId,
    ...(patch ? { expectedVersion: version(body) } : {}),
  };
}

export function parseDocumentSourceInput(value: unknown) {
  const body = record(value);
  known(body, ['subjectId', 'title', 'originalName', 'mimeType', 'contentBase64']);
  const contentBase64 = text(body.contentBase64, 'contentBase64', 1, 35_000_000);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64)) {
    throw new StudyForgeValidationError('contentBase64 must be canonical base64', 'contentBase64');
  }
  const content = Buffer.from(contentBase64, 'base64');
  if (content.toString('base64').replace(/=+$/, '') !== contentBase64.replace(/=+$/, '')) {
    throw new StudyForgeValidationError('contentBase64 must be canonical base64', 'contentBase64');
  }
  return {
    subjectId: uuid(body.subjectId, 'subjectId'),
    title: text(body.title, 'title', 1, 200),
    originalName: text(body.originalName, 'originalName', 1, 240),
    mimeType: text(body.mimeType, 'mimeType', 1, 120),
    content,
  };
}

export function parseManualDeck(value: unknown) {
  const body = record(value);
  known(body, ['subjectId', 'sourceId', 'title', 'description', 'cards']);
  if (!Array.isArray(body.cards) || body.cards.length < 1 || body.cards.length > 200) {
    throw new StudyForgeValidationError('cards must contain 1-200 items', 'cards');
  }
  return {
    subjectId: uuid(body.subjectId, 'subjectId'),
    sourceId: uuid(body.sourceId, 'sourceId'),
    title: text(body.title, 'title', 1, 200),
    description: optionalText(body.description, 'description', 8_000),
    cards: body.cards.map((value, position) => {
      const card = record(value);
      known(card, ['question', 'answer', 'sourceExcerpt']);
      return {
        position,
        question: text(card.question, 'question', 1, 2_000),
        answer: text(card.answer, 'answer', 1, 8_000),
        sourceExcerpt: optionalText(card.sourceExcerpt, 'sourceExcerpt', 1_000),
      };
    }),
  };
}

export function parseCardPatch(value: unknown) {
  const body = record(value);
  known(body, ['question', 'answer', 'sourceExcerpt', 'expectedVersion']);
  const output = {
    question: body.question === undefined ? undefined : text(body.question, 'question', 1, 2_000),
    answer: body.answer === undefined ? undefined : text(body.answer, 'answer', 1, 8_000),
    sourceExcerpt: optionalText(body.sourceExcerpt, 'sourceExcerpt', 1_000),
  };
  if (Object.values(output).every((item) => item === undefined)) {
    throw new StudyForgeValidationError('At least one field must be changed');
  }
  return { ...output, expectedVersion: version(body) };
}

export function parseQuestionPatch(value: unknown) {
  const body = record(value);
  known(body, ['question', 'choices', 'correctIndex', 'explanation', 'sourceExcerpt', 'expectedVersion']);
  const choices = body.choices === undefined
    ? undefined
    : (() => {
        if (!Array.isArray(body.choices) || body.choices.length < 2 || body.choices.length > 6) {
          throw new StudyForgeValidationError('choices must contain 2-6 items', 'choices');
        }
        return body.choices.map((choice) => text(choice, 'choice', 1, 1_000));
      })();
  const output = {
    question: body.question === undefined ? undefined : text(body.question, 'question', 1, 2_000),
    choices,
    correctIndex: body.correctIndex === undefined
      ? undefined
      : integer(body.correctIndex, 'correctIndex', 0, (choices?.length ?? 6) - 1),
    explanation: body.explanation === undefined ? undefined : text(body.explanation, 'explanation', 1, 8_000),
    sourceExcerpt: optionalText(body.sourceExcerpt, 'sourceExcerpt', 1_000),
  };
  if (Object.values(output).every((item) => item === undefined)) {
    throw new StudyForgeValidationError('At least one field must be changed');
  }
  return { ...output, expectedVersion: version(body) };
}

export function parsePlanSessionPatch(value: unknown) {
  const body = record(value);
  known(body, ['title', 'focus', 'scheduledFor', 'estimatedMinutes', 'expectedVersion']);
  const output = {
    title: body.title === undefined ? undefined : text(body.title, 'title', 1, 200),
    focus: body.focus === undefined ? undefined : text(body.focus, 'focus', 1, 4_000),
    scheduledFor: isoDate(body.scheduledFor, 'scheduledFor'),
    estimatedMinutes: body.estimatedMinutes === undefined
      ? undefined
      : integer(body.estimatedMinutes, 'estimatedMinutes', 5, 480),
  };
  if (Object.values(output).every((item) => item === undefined)) {
    throw new StudyForgeValidationError('At least one field must be changed');
  }
  return { ...output, expectedVersion: version(body) };
}

export function parseLifecycle(value: unknown, values: readonly string[] = ['draft', 'review', 'published', 'archived']) {
  const body = record(value);
  known(body, ['status', 'expectedVersion']);
  return { status: oneOf(body.status, 'status', values), expectedVersion: version(body) };
}

export function parseGeneration(value: unknown) {
  const body = record(value);
  known(body, ['sourceId', 'subjectId', 'type', 'title', 'targetDate', 'idempotencyKey']);
  const idempotencyKey = text(body.idempotencyKey, 'idempotencyKey', 8, 160);
  if (!KEY.test(idempotencyKey)) throw new StudyForgeValidationError('idempotencyKey has invalid characters', 'idempotencyKey');
  return {
    sourceId: uuid(body.sourceId, 'sourceId', true) as string,
    subjectId: uuid(body.subjectId, 'subjectId'),
    type: oneOf(body.type, 'type', ['deck', 'quiz', 'study_plan'] as const),
    title: text(body.title, 'title', 1, 200),
    targetDate: isoDate(body.targetDate, 'targetDate'),
    idempotencyKey,
  };
}

export type GeneratedStudyMaterial =
  | { type: 'deck'; cards: Array<{ question: string; answer: string; sourceExcerpt: string }> }
  | { type: 'quiz'; questions: Array<{ question: string; choices: string[]; correctIndex: number; explanation: string; sourceExcerpt: string }> }
  | { type: 'study_plan'; sessions: Array<{ title: string; focus: string; estimatedMinutes: number }> };

export function parseGeneratedMaterial(type: 'deck' | 'quiz' | 'study_plan', raw: string, sourceBody: string): GeneratedStudyMaterial {
  if (raw.length > 100_000) throw new StudyForgeValidationError('Provider output exceeded the safe limit');
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/```json\s*|\s*```/g, '').trim());
  } catch {
    throw new StudyForgeValidationError('Provider output was not valid JSON');
  }
  const body = record(value);
  const verifiedExcerpt = (candidate: unknown) => {
    const excerpt = text(candidate, 'sourceExcerpt', 1, 1_000);
    if (!sourceBody.includes(excerpt)) {
      throw new StudyForgeValidationError('Provider cited text that is not present in the authorized source', 'sourceExcerpt');
    }
    return excerpt;
  };
  if (type === 'deck') {
    if (!Array.isArray(body.cards) || body.cards.length < 1 || body.cards.length > 50) {
      throw new StudyForgeValidationError('Generated deck must contain 1-50 cards');
    }
    return {
      type,
      cards: body.cards.map((item) => {
        const card = record(item);
        return {
          question: text(card.question, 'question', 1, 2_000),
          answer: text(card.answer, 'answer', 1, 8_000),
          sourceExcerpt: verifiedExcerpt(card.sourceExcerpt),
        };
      }),
    };
  }
  if (type === 'quiz') {
    if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 50) {
      throw new StudyForgeValidationError('Generated quiz must contain 1-50 questions');
    }
    return {
      type,
      questions: body.questions.map((item) => {
        const question = record(item);
        if (!Array.isArray(question.choices) || question.choices.length < 2 || question.choices.length > 6) {
          throw new StudyForgeValidationError('Each question requires 2-6 choices', 'choices');
        }
        const choices = question.choices.map((choice) => text(choice, 'choice', 1, 1_000));
        return {
          question: text(question.question, 'question', 1, 2_000),
          choices,
          correctIndex: integer(question.correctIndex, 'correctIndex', 0, choices.length - 1),
          explanation: text(question.explanation, 'explanation', 1, 8_000),
          sourceExcerpt: verifiedExcerpt(question.sourceExcerpt),
        };
      }),
    };
  }
  if (!Array.isArray(body.sessions) || body.sessions.length < 1 || body.sessions.length > 60) {
    throw new StudyForgeValidationError('Generated plan must contain 1-60 sessions');
  }
  return {
    type,
    sessions: body.sessions.map((item) => {
      const session = record(item);
      return {
        title: text(session.title, 'title', 1, 200),
        focus: text(session.focus, 'focus', 1, 4_000),
        estimatedMinutes: integer(session.estimatedMinutes, 'estimatedMinutes', 5, 480),
      };
    }),
  };
}

export function parseAttempt(value: unknown) {
  const body = record(value);
  known(body, ['answers']);
  if (!Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > 100) {
    throw new StudyForgeValidationError('answers must contain 1-100 items', 'answers');
  }
  return body.answers.map((item) => {
    const answer = record(item);
    known(answer, ['questionId', 'selectedIndex']);
    return {
      questionId: uuid(answer.questionId, 'questionId', true) as string,
      selectedIndex: integer(answer.selectedIndex, 'selectedIndex', 0, 5),
    };
  });
}

export function parseReview(value: unknown) {
  const body = record(value);
  known(body, ['rating', 'expectedVersion']);
  return {
    rating: oneOf(body.rating, 'rating', ['again', 'hard', 'good', 'easy'] as const),
    expectedVersion: body.expectedVersion === undefined ? undefined : version(body),
  };
}

export function parseSessionCompletion(value: unknown) {
  const body = record(value);
  known(body, ['completed', 'expectedVersion']);
  if (typeof body.completed !== 'boolean') throw new StudyForgeValidationError('completed must be boolean', 'completed');
  return { completed: body.completed, expectedVersion: version(body) };
}
