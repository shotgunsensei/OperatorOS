import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { AiProvider } from '../src/lib/ai-provider.js';
import {
  STUDYFORGE_PLAN_LIMITS,
  calendarDayInTimeZone,
  countdownDays,
  generateStudyForgeCompleteMaterial,
  parseStudyForgeCompleteMaterial,
  resolveStudyForgeCompleteGeneration,
} from '../src/lib/studyforge-phase33.js';

const input = {
  title: 'Cell Energy',
  subject: 'Biology',
  difficulty: 'medium' as const,
  examDate: '2026-08-18',
  anchorDate: '2026-08-12',
  maxFlashcards: 25,
  notes: 'Mitochondria generate ATP through oxidative phosphorylation. Cells use ATP as an energy carrier. Glycolysis occurs in the cytoplasm and produces pyruvate. Oxygen accepts electrons at the end of the transport chain.',
};

test('Phase 33 deterministic generator has a stable complete golden fixture', () => {
  const first = generateStudyForgeCompleteMaterial(input);
  const second = generateStudyForgeCompleteMaterial(input);
  assert.deepEqual(first, second);
  assert.ok(first.summary.includes('Mitochondria generate ATP'));
  assert.deepEqual(first.keyTerms.slice(0, 4).map((item) => item.term), ['Mitochondria', 'Cells', 'Glycolysis', 'Oxygen']);
  assert.ok(first.flashcards.length >= first.keyTerms.length);
  assert.equal(first.mcqs.length, 4);
  assert.equal(first.shortAnswers.length, 4);
  assert.equal(first.reviewSheet.sections.length, 4);
  assert.deepEqual(first.reviewSheet.topicCoverage, {
    totalTopics: 4,
    topicsWithFlashcards: 4,
    topicsWithPracticeQuestions: 4,
    flashcardCoveragePercent: 100,
    practiceCoveragePercent: 100,
  });
  assert.ok(first.qualityScore >= 85);
  assert.equal(first.studyPlan.length, 6);
  assert.equal(first.studyPlan[0].date, '2026-08-12');
  assert.equal(first.studyPlan.at(-1)?.date, '2026-08-17');
  for (const card of first.flashcards) {
    assert.doesNotMatch(card.front, /_{3,}|fill in the blank/i);
    assert.ok(card.back.split(/\s+/).length > 3);
  }
  for (const question of first.mcqs) {
    assert.equal(question.choices.length, 4);
    assert.equal(new Set(question.choices.map((choice) => choice.toLowerCase())).size, 4);
    assert.doesNotMatch(question.question, /_{3,}|fill in the blank/i);
    assert.ok(question.correctIndex >= 0 && question.correctIndex < question.choices.length);
    assert.doesNotMatch(question.choices.join(' '), /\b(?:alternative|option|choice|distractor)\s*\d*\b/i);
  }
  for (const artifact of [...first.keyTerms, ...first.flashcards, ...first.mcqs, ...first.shortAnswers]) {
    assert.ok(input.notes.includes(artifact.sourceExcerpt));
  }
  const digest = createHash('sha256').update(JSON.stringify(first)).digest('hex');
  assert.equal(digest, 'd99dcd5916540a84c2dfbe05da60f109db06768a3c7ac9a1c916cee468711631');
});

test('built-in generation deduplicates repeated notes and uses same-subject concepts as distractors', () => {
  const plantInput = {
    ...input,
    title: 'Plant Energy and Transport',
    notes: [
      'Photosynthesis converts light energy into glucose.',
      'Photosynthesis converts light energy into glucose.',
      'Chlorophyll absorbs red and blue wavelengths.',
      'Stomata regulate gas exchange with the atmosphere.',
      'Roots transport water and minerals into the plant.',
    ].join(' '),
  };
  const material = generateStudyForgeCompleteMaterial(plantInput);
  const expectedConcepts = new Set(['photosynthesis', 'chlorophyll', 'stomata', 'roots']);
  assert.equal(material.mcqs.length, 4);
  assert.equal(new Set(material.mcqs.map((question) => question.question.toLowerCase())).size, 4);
  assert.equal(new Set(material.shortAnswers.map((question) => question.question.toLowerCase())).size, 4);
  assert.equal(material.reviewSheet.topicCoverage.practiceCoveragePercent, 100);
  assert.equal(material.reviewSheet.topicCoverage.flashcardCoveragePercent, 100);
  for (const question of material.mcqs) {
    assert.equal(question.choices.length, 4);
    for (const choice of question.choices) assert.ok(expectedConcepts.has(choice.toLowerCase()), `unexpected generic distractor: ${choice}`);
    assert.ok(plantInput.notes.includes(question.sourceExcerpt));
    assert.ok(question.explanation.includes(question.sourceExcerpt));
  }
});

test('quality score rewards usable source breadth instead of raw note length alone', () => {
  const thin = generateStudyForgeCompleteMaterial({
    ...input,
    title: 'Mitosis',
    notes: 'Mitosis divides cells.',
    examDate: null,
  });
  const useful = generateStudyForgeCompleteMaterial({
    ...input,
    title: 'Mitosis',
    notes: 'Mitosis divides one parent cell into two daughter cells. Chromosomes replicate before division. Metaphase aligns chromosomes at the cell equator. Spindle fibers separate sister chromatids during anaphase. Cytokinesis divides the cytoplasm after nuclear division.',
    examDate: null,
  });
  assert.ok(thin.qualityScore < useful.qualityScore, `${thin.qualityScore} should be lower than ${useful.qualityScore}`);
  assert.ok(useful.qualityScore >= 85);
});

test('structured AI output rejects ungrounded answers, repeated choices, and placeholder distractors', () => {
  const fixture = generateStudyForgeCompleteMaterial(input);

  const ungrounded = structuredClone(fixture);
  ungrounded.flashcards[0].back = 'Neptune is the closest planet to the Sun.';
  assert.throws(
    () => parseStudyForgeCompleteMaterial(JSON.stringify(ungrounded), input),
    /flashcard answer is not grounded/i,
  );

  const shallow = structuredClone(fixture);
  shallow.flashcards[0].front = 'Fill in the blank: Mitochondria _____ ATP.';
  assert.throws(
    () => parseStudyForgeCompleteMaterial(JSON.stringify(shallow), input),
    /must test a concept or relationship/i,
  );

  const repeatedChoice = structuredClone(fixture);
  repeatedChoice.mcqs[0].choices[1] = repeatedChoice.mcqs[0].choices[0];
  assert.throws(
    () => parseStudyForgeCompleteMaterial(JSON.stringify(repeatedChoice), input),
    /choices contains duplicate or ambiguous entries/i,
  );

  const placeholder = structuredClone(fixture);
  const distractorIndex = placeholder.mcqs[0].correctIndex === 0 ? 1 : 0;
  placeholder.mcqs[0].choices[distractorIndex] = 'Alternative 1';
  assert.throws(
    () => parseStudyForgeCompleteMaterial(JSON.stringify(placeholder), input),
    /plausible subject-matter distractors/i,
  );
});

test('Phase 33 retries invalid structured output and records validated AI provenance', async () => {
  const deterministic = generateStudyForgeCompleteMaterial(input);
  const providerClaim = { ...deterministic, qualityScore: 100 };
  let calls = 0;
  const provider: AiProvider = {
    name: 'fixture',
    async complete() {
      calls += 1;
      return {
        text: calls === 1 ? '{"summary":"incomplete"}' : JSON.stringify(providerClaim),
        tokenCount: 77,
        durationMs: 9,
        provider: 'fixture',
        model: 'strict-json',
        version: 'v1',
      };
    },
  };
  const result = await resolveStudyForgeCompleteGeneration({ input, mode: 'ai', provider });
  assert.equal(calls, 2);
  assert.equal(result.provenance.effectiveMode, 'ai');
  assert.equal(result.provenance.attempts, 2);
  assert.equal(result.provenance.fallbackReason, null);
  assert.deepEqual(result.material, deterministic);
  assert.notEqual(result.material.qualityScore, providerClaim.qualityScore, 'provider must not self-award its quality score');
});

test('auto mode falls back deterministically while ai-required mode stays honestly unavailable', async () => {
  const provider: AiProvider = {
    name: 'offline',
    async complete() { throw Object.assign(new Error('offline'), { code: 'AI_PROVIDER_DISABLED' }); },
  };
  const fallback = await resolveStudyForgeCompleteGeneration({ input, mode: 'auto', provider });
  assert.equal(fallback.provenance.effectiveMode, 'deterministic');
  assert.equal(fallback.provenance.fallbackReason, 'AI_PROVIDER_DISABLED');
  assert.equal(fallback.provenance.attempts, 2);
  await assert.rejects(
    resolveStudyForgeCompleteGeneration({ input, mode: 'ai', provider }),
    (error: any) => error.code === 'AI_PROVIDER_DISABLED',
  );
});

test('plan limits, time zones, and date-only countdowns are deterministic', () => {
  assert.equal(STUDYFORGE_PLAN_LIMITS.free.activeSets, 3);
  assert.equal(STUDYFORGE_PLAN_LIMITS.free.flashcardsPerSet, 25);
  assert.equal(STUDYFORGE_PLAN_LIMITS.free.quizAttemptsPerMonth, 3);
  assert.equal(STUDYFORGE_PLAN_LIMITS.free.examCountdowns, false);
  assert.equal(STUDYFORGE_PLAN_LIMITS.pro.spacedRepetition, true);
  assert.equal(STUDYFORGE_PLAN_LIMITS.tutor.tutorGroups, true);
  assert.equal(calendarDayInTimeZone(new Date('2026-08-12T02:00:00.000Z'), 'America/New_York'), '2026-08-11');
  assert.equal(countdownDays('2026-08-18', '2026-08-12'), 6);
  assert.equal(countdownDays('2026-08-10', '2026-08-12'), 0);
  assert.throws(() => calendarDayInTimeZone(new Date(), 'Not/A_Time_Zone'));
});
