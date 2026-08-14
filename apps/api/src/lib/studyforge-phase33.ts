import type { AiCompletionResponse, AiProvider } from './ai-provider.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those',
  'it', 'its', 'as', 'by', 'from', 'than', 'then', 'so', 'if', 'because', 'while',
  'which', 'who', 'what', 'when', 'where', 'why', 'how', 'can', 'could', 'should',
  'would', 'may', 'might', 'must', 'will', 'have', 'has', 'had', 'not', 'we', 'you',
  'they', 'our', 'your', 'their', 'also', 'more', 'most', 'such', 'into', 'about',
]);

export type StudyForgePlan = 'free' | 'pro' | 'tutor';
export type GenerationMode = 'auto' | 'ai' | 'deterministic';

export interface StudyForgeCompleteMaterial {
  summary: string;
  keyTerms: Array<{ term: string; definition: string; sourceExcerpt: string }>;
  flashcards: Array<{ front: string; back: string; sourceExcerpt: string }>;
  mcqs: Array<{
    question: string;
    choices: string[];
    correctIndex: number;
    explanation: string;
    topic: string;
    sourceExcerpt: string;
  }>;
  shortAnswers: Array<{ question: string; answer: string; topic: string; sourceExcerpt: string }>;
  reviewSheet: {
    sections: Array<{ heading: string; bullets: string[] }>;
    cramSection: string[];
  };
  studyPlan: Array<{
    day: number;
    date: string;
    topic: string;
    focus: string;
    estimatedMinutes: number;
  }>;
  qualityScore: number;
}

export interface CompleteGenerationProvenance {
  requestedMode: GenerationMode;
  effectiveMode: 'ai' | 'deterministic';
  provider: string;
  model: string;
  providerVersion: string;
  generatorVersion: 'studyforge-complete-v2';
  attempts: number;
  fallbackReason: string | null;
  tokenCount: number;
  durationMs: number;
}

export interface CompleteGenerationResult {
  material: StudyForgeCompleteMaterial;
  provenance: CompleteGenerationProvenance;
}

export interface CompleteGenerationInput {
  notes: string;
  title: string;
  subject: string;
  difficulty: 'easy' | 'medium' | 'hard';
  examDate?: string | null;
  maxFlashcards?: number;
  anchorDate: string;
}

export const STUDYFORGE_PLAN_LIMITS = Object.freeze({
  free: Object.freeze({
    activeSets: 3,
    flashcardsPerSet: 25,
    quizAttemptsPerMonth: 3,
    generationsPerMonth: 3,
    examCountdowns: false,
    advancedExport: false,
    spacedRepetition: false,
    tutorGroups: false,
  }),
  pro: Object.freeze({
    activeSets: null,
    flashcardsPerSet: 60,
    quizAttemptsPerMonth: null,
    generationsPerMonth: 100,
    examCountdowns: true,
    advancedExport: true,
    spacedRepetition: true,
    tutorGroups: false,
  }),
  tutor: Object.freeze({
    activeSets: null,
    flashcardsPerSet: 100,
    quizAttemptsPerMonth: null,
    generationsPerMonth: 500,
    examCountdowns: true,
    advancedExport: true,
    spacedRepetition: true,
    tutorGroups: true,
  }),
});

function sentences(text: string): string[] {
  const values = text.replace(/\s+/g, ' ').trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)
    .map((value) => value.trim())
    .filter((value) => value.length > 8);
  return values.length ? values : [text.replace(/\s+/g, ' ').trim()];
}

function tokens(text: string): string[] {
  return text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [];
}

function keywords(text: string, count: number): string[] {
  const totals = new Map<string, number>();
  for (const token of tokens(text)) {
    if (!STOPWORDS.has(token)) totals.set(token, (totals.get(token) ?? 0) + 1);
  }
  return [...totals.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, count)
    .map(([token]) => token);
}

function titleCase(value: string): string {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function deterministicPick<T>(values: T[], count: number, seed: number): T[] {
  const output = [...values];
  let state = seed + 1;
  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 9301 + 49297) % 233280;
    const target = Math.floor((state / 233280) * (index + 1));
    [output[index], output[target]] = [output[target], output[index]];
  }
  return output.slice(0, Math.min(count, output.length));
}

function dateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must be YYYY-MM-DD');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('Date is invalid');
  }
  return parsed;
}

function addDays(value: string, amount: number): string {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function topicFor(excerpt: string, topics: string[]): string {
  return topics.find((topic) => excerpt.toLowerCase().includes(topic.toLowerCase())) ?? topics[0] ?? 'General';
}

export function generateStudyForgeCompleteMaterial(input: CompleteGenerationInput): StudyForgeCompleteMaterial {
  const notes = input.notes.replace(/\s+/g, ' ').trim();
  if (notes.length < 8 || notes.length > 100_000) throw new Error('Notes must be 8-100000 characters');
  const sourceSentences = sentences(notes);
  const terms = keywords(notes, 24);
  const topics = (terms.length ? terms : [input.subject || input.title]).slice(0, Math.max(1, Math.min(6, Math.ceil(sourceSentences.length / 4)))).map(titleCase);
  const summary = sourceSentences.slice(0, 4).join(' ');
  const keyTerms = terms.slice(0, 12).map((term) => {
    const sourceExcerpt = sourceSentences.find((item) => item.toLowerCase().includes(term)) ?? sourceSentences[0];
    return { term: titleCase(term), definition: sourceExcerpt.slice(0, 1000), sourceExcerpt };
  });
  if (!keyTerms.length) keyTerms.push({ term: titleCase(input.subject || 'Overview'), definition: sourceSentences[0], sourceExcerpt: sourceSentences[0] });

  const flashcards: StudyForgeCompleteMaterial['flashcards'] = keyTerms.map((term) => ({
    front: `Define: ${term.term}`,
    back: term.definition,
    sourceExcerpt: term.sourceExcerpt,
  }));
  for (const sourceExcerpt of sourceSentences) {
    if (flashcards.length >= Math.max(1, Math.min(100, input.maxFlashcards ?? 60))) break;
    const words = sourceExcerpt.split(/\s+/);
    const position = words.findIndex((word) => {
      const normalized = word.toLowerCase().replace(/[^a-z'-]/g, '');
      return normalized.length > 4 && !STOPWORDS.has(normalized);
    });
    if (position < 0) continue;
    const answer = words[position].replace(/[^A-Za-z'-]/g, '');
    if (!answer) continue;
    flashcards.push({
      front: words.map((word, index) => index === position ? '_____' : word).join(' '),
      back: answer,
      sourceExcerpt,
    });
  }

  let seed = 1;
  const mcqs = sourceSentences.slice(0, 12).map((sourceExcerpt) => {
    const words = sourceExcerpt.split(/\s+/);
    const position = words.findIndex((word) => {
      const normalized = word.toLowerCase().replace(/[^a-z'-]/g, '');
      return normalized.length > 4 && !STOPWORDS.has(normalized);
    });
    const answer = (position >= 0 ? words[position] : topics[0]).replace(/[^A-Za-z'-]/g, '') || topics[0];
    const distractors = deterministicPick(terms.map(titleCase).filter((item) => item.toLowerCase() !== answer.toLowerCase()), 3, seed++);
    while (distractors.length < 3) distractors.push(`Alternative ${distractors.length + 1}`);
    const choices = deterministicPick([answer, ...distractors], 4, seed++);
    return {
      question: position >= 0
        ? `Fill in the blank: ${words.map((word, index) => index === position ? '______' : word).join(' ')}`
        : `Which topic is supported by this source?`,
      choices,
      correctIndex: Math.max(0, choices.findIndex((choice) => choice.toLowerCase() === answer.toLowerCase())),
      explanation: `The answer is supported by the learner-supplied source excerpt.`,
      topic: topicFor(sourceExcerpt, topics),
      sourceExcerpt,
    };
  });

  const shortAnswers = sourceSentences.slice(0, 8).map((sourceExcerpt) => {
    const focus = titleCase(tokens(sourceExcerpt).find((token) => !STOPWORDS.has(token) && token.length > 4) ?? 'this concept');
    return {
      question: `Explain in your own words: ${focus}.`,
      answer: sourceExcerpt,
      topic: topicFor(sourceExcerpt, topics),
      sourceExcerpt,
    };
  });

  const sections = topics.map((topic) => ({
    heading: topic,
    bullets: sourceSentences.filter((item) => topicFor(item, topics) === topic).slice(0, 6),
  })).filter((section) => section.bullets.length);
  if (!sections.length) sections.push({ heading: titleCase(input.subject || 'Overview'), bullets: sourceSentences.slice(0, 6) });

  const examDays = input.examDate
    ? Math.ceil((dateOnly(input.examDate).getTime() - dateOnly(input.anchorDate).getTime()) / 86_400_000)
    : 7;
  const totalDays = Math.max(2, Math.min(21, examDays));
  const estimatedMinutes = input.difficulty === 'hard' ? 50 : input.difficulty === 'easy' ? 20 : 35;
  const studyPlan = Array.from({ length: totalDays }, (_, index) => ({
    day: index + 1,
    date: addDays(input.anchorDate, index),
    topic: topics[index % topics.length],
    focus: index === 0
      ? 'Read all notes and skim flashcards.'
      : index === totalDays - 1
        ? 'Final review: cram section and practice quiz.'
        : index % 3 === 0
          ? 'Practice quiz and analyze weak areas.'
          : index % 2 === 0
            ? 'Flashcard drill and short-answer practice.'
            : 'Read notes and review key terms.',
    estimatedMinutes,
  }));

  const wordCount = tokens(notes).length;
  const qualityScore = Math.max(10, Math.min(100, Math.round(
    Math.min(wordCount, 600) / 600 * 50
      + Math.min(sourceSentences.length, 30) / 30 * 25
      + Math.min(topics.length, 6) / 6 * 25,
  )));
  return {
    summary,
    keyTerms,
    flashcards,
    mcqs,
    shortAnswers: shortAnswers.length ? shortAnswers : [{ question: 'Summarize the main idea.', answer: summary, topic: topics[0], sourceExcerpt: sourceSentences[0] }],
    reviewSheet: {
      sections,
      cramSection: keyTerms.slice(0, 8).map((term) => `${term.term}: ${term.definition}`),
    },
    studyPlan,
    qualityScore,
  };
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label} is invalid`);
  return value.trim();
}

function list(value: unknown, label: string, min: number, max: number): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) throw new Error(`${label} is invalid`);
  return value;
}

function cited(candidate: unknown, notes: string): string {
  const excerpt = boundedText(candidate, 'sourceExcerpt', 1000);
  if (!notes.includes(excerpt)) throw new Error('AI output cited text outside the authorized source');
  return excerpt;
}

export function parseStudyForgeCompleteMaterial(raw: string, input: CompleteGenerationInput): StudyForgeCompleteMaterial {
  if (raw.length > 250_000) throw new Error('AI output exceeded the safe limit');
  const parsed = plainObject(JSON.parse(raw.replace(/```json\s*|\s*```/g, '').trim()), 'output');
  const keyTerms = list(parsed.keyTerms, 'keyTerms', 1, 20).map((value) => {
    const item = plainObject(value, 'keyTerm');
    return { term: boundedText(item.term, 'term', 120), definition: boundedText(item.definition, 'definition', 1000), sourceExcerpt: cited(item.sourceExcerpt, input.notes) };
  });
  const flashcards = list(parsed.flashcards, 'flashcards', 1, Math.min(100, input.maxFlashcards ?? 60)).map((value) => {
    const item = plainObject(value, 'flashcard');
    return { front: boundedText(item.front, 'front', 2000), back: boundedText(item.back, 'back', 8000), sourceExcerpt: cited(item.sourceExcerpt, input.notes) };
  });
  const mcqs = list(parsed.mcqs, 'mcqs', 1, 50).map((value) => {
    const item = plainObject(value, 'mcq');
    const choices = list(item.choices, 'choices', 2, 6).map((choice) => boundedText(choice, 'choice', 1000));
    if (!Number.isInteger(item.correctIndex) || Number(item.correctIndex) < 0 || Number(item.correctIndex) >= choices.length) throw new Error('correctIndex is invalid');
    return {
      question: boundedText(item.question, 'question', 2000), choices,
      correctIndex: Number(item.correctIndex), explanation: boundedText(item.explanation, 'explanation', 8000),
      topic: boundedText(item.topic, 'topic', 160), sourceExcerpt: cited(item.sourceExcerpt, input.notes),
    };
  });
  const shortAnswers = list(parsed.shortAnswers, 'shortAnswers', 1, 50).map((value) => {
    const item = plainObject(value, 'shortAnswer');
    return {
      question: boundedText(item.question, 'question', 2000), answer: boundedText(item.answer, 'answer', 8000),
      topic: boundedText(item.topic, 'topic', 160), sourceExcerpt: cited(item.sourceExcerpt, input.notes),
    };
  });
  const review = plainObject(parsed.reviewSheet, 'reviewSheet');
  const reviewSheet = {
    sections: list(review.sections, 'sections', 1, 20).map((value) => {
      const item = plainObject(value, 'section');
      return { heading: boundedText(item.heading, 'heading', 160), bullets: list(item.bullets, 'bullets', 1, 20).map((bullet) => boundedText(bullet, 'bullet', 1000)) };
    }),
    cramSection: list(review.cramSection, 'cramSection', 1, 30).map((value) => boundedText(value, 'cram item', 1000)),
  };
  const studyPlan = list(parsed.studyPlan, 'studyPlan', 1, 60).map((value, index) => {
    const item = plainObject(value, 'studyPlan item');
    const estimatedMinutes = Number(item.estimatedMinutes);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 480) throw new Error('estimatedMinutes is invalid');
    return {
      day: index + 1, date: addDays(input.anchorDate, index), topic: boundedText(item.topic, 'topic', 160),
      focus: boundedText(item.focus, 'focus', 4000), estimatedMinutes,
    };
  });
  const qualityScore = Number(parsed.qualityScore);
  if (!Number.isInteger(qualityScore) || qualityScore < 0 || qualityScore > 100) throw new Error('qualityScore is invalid');
  return { summary: boundedText(parsed.summary, 'summary', 8000), keyTerms, flashcards, mcqs, shortAnswers, reviewSheet, studyPlan, qualityScore };
}

function fallbackReason(error: unknown): string {
  const value = error as { code?: string; name?: string };
  return String(value?.code || value?.name || 'PROVIDER_OUTPUT_INVALID').slice(0, 120);
}

export async function resolveStudyForgeCompleteGeneration(args: {
  input: CompleteGenerationInput;
  mode: GenerationMode;
  provider: AiProvider;
  maxAttempts?: number;
}): Promise<CompleteGenerationResult> {
  const deterministic = () => generateStudyForgeCompleteMaterial(args.input);
  if (args.mode === 'deterministic') {
    return {
      material: deterministic(),
      provenance: { requestedMode: args.mode, effectiveMode: 'deterministic', provider: 'local', model: 'studyforge-deterministic', providerVersion: 'v2', generatorVersion: 'studyforge-complete-v2', attempts: 0, fallbackReason: null, tokenCount: 0, durationMs: 0 },
    };
  }
  const attempts = Math.max(1, Math.min(2, args.maxAttempts ?? 2));
  let lastError: unknown;
  let lastResponse: AiCompletionResponse | null = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      lastResponse = await args.provider.complete({
        systemPrompt: 'OPERATOROS_STUDYFORGE_V1 OPERATOROS_STUDYFORGE_COMPLETE_V2. Return one JSON object only. Every sourceExcerpt must be copied exactly from the authorized source. Required keys: summary, keyTerms[{term,definition,sourceExcerpt}], flashcards[{front,back,sourceExcerpt}], mcqs[{question,choices,correctIndex,explanation,topic,sourceExcerpt}], shortAnswers[{question,answer,topic,sourceExcerpt}], reviewSheet{sections[{heading,bullets}],cramSection}, studyPlan[{topic,focus,estimatedMinutes}], qualityScore.',
        userPrompt: JSON.stringify({ type: 'complete_set', ...args.input }),
        responseFormat: 'json', temperature: 0.2, maxTokens: 6000, timeoutMs: 30_000,
      });
      return {
        material: parseStudyForgeCompleteMaterial(lastResponse.text, args.input),
        provenance: { requestedMode: args.mode, effectiveMode: 'ai', provider: lastResponse.provider, model: lastResponse.model, providerVersion: lastResponse.version, generatorVersion: 'studyforge-complete-v2', attempts: attempt, fallbackReason: null, tokenCount: lastResponse.tokenCount, durationMs: lastResponse.durationMs },
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (args.mode === 'ai') throw lastError;
  return {
    material: deterministic(),
    provenance: { requestedMode: args.mode, effectiveMode: 'deterministic', provider: 'local', model: 'studyforge-deterministic', providerVersion: 'v2', generatorVersion: 'studyforge-complete-v2', attempts, fallbackReason: fallbackReason(lastError), tokenCount: lastResponse?.tokenCount ?? 0, durationMs: lastResponse?.durationMs ?? 0 },
  };
}

export function calendarDayInTimeZone(now: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch {
    throw new Error('timeZone must be a valid IANA time zone');
  }
}

export function countdownDays(targetDate: string, currentDate: string): number {
  return Math.max(0, Math.ceil((dateOnly(targetDate).getTime() - dateOnly(currentDate).getTime()) / 86_400_000));
}
