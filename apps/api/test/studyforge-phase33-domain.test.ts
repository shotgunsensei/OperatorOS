import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { AiProvider } from '../src/lib/ai-provider.js';
import {
  STUDYFORGE_PLAN_LIMITS,
  calendarDayInTimeZone,
  countdownDays,
  generateStudyForgeCompleteMaterial,
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
  assert.ok(first.keyTerms.length >= 1);
  assert.ok(first.flashcards.length >= first.keyTerms.length);
  assert.equal(first.mcqs.length, 4);
  assert.equal(first.shortAnswers.length, 4);
  assert.ok(first.reviewSheet.sections.length >= 1);
  assert.equal(first.studyPlan.length, 6);
  assert.equal(first.studyPlan[0].date, '2026-08-12');
  assert.equal(first.studyPlan.at(-1)?.date, '2026-08-17');
  for (const artifact of [...first.keyTerms, ...first.flashcards, ...first.mcqs, ...first.shortAnswers]) {
    assert.ok(input.notes.includes(artifact.sourceExcerpt));
  }
  const digest = createHash('sha256').update(JSON.stringify(first)).digest('hex');
  assert.equal(digest, 'f87e7295a49af81a0c18b6c84018a1f4d0962c43aa7a384ba285e2b84364eb1e');
});

test('Phase 33 retries invalid structured output and records validated AI provenance', async () => {
  const deterministic = generateStudyForgeCompleteMaterial(input);
  let calls = 0;
  const provider: AiProvider = {
    name: 'fixture',
    async complete() {
      calls += 1;
      return {
        text: calls === 1 ? '{"summary":"incomplete"}' : JSON.stringify(deterministic),
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
