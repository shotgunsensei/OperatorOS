import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FaultlineValidationError,
  faultlineChaosSettings,
  faultlineContentHash,
  matchFaultlineCommand,
  parseFaultlineChallengeContent,
  safeFaultlineChallenge,
  scoreFaultlineSubmission,
} from '../src/lib/faultlinelab-domain.js';
import { FAULTLINELAB_STARTER_CHALLENGES } from '../src/lib/faultlinelab-starter-content.js';

const starter = FAULTLINELAB_STARTER_CHALLENGES[0]!;

test('FaultlineLab starter content is validated and canonically hashed', () => {
  const parsed = parseFaultlineChallengeContent(starter.content);
  assert.equal(faultlineContentHash(parsed), starter.contentHash);
  const command = parsed.commands[0]!;
  assert.equal(matchFaultlineCommand(parsed, command.command), command);

  const safe = safeFaultlineChallenge(parsed);
  assert.equal('rootCause' in safe, false);
  assert.equal('output' in safe.commands[0]!, false);
  assert.equal('description' in safe.evidence[0]!, false);
  assert.equal('text' in safe.hints[0]!, false);
});

test('FaultlineLab scoring is server-derived and rejects locked evidence', () => {
  const content = starter.content;
  const clueIds = content.evidence.filter((item) => item.category === 'clue').map((item) => item.id);
  const remediation = content.remediationKeywords.join(' ');
  const result = scoreFaultlineSubmission(content, {
    selectedRootCauseId: content.rootCause.id,
    evidenceIds: clueIds,
    remediation,
    unlockedEvidenceIds: clueIds,
    hintLevels: [],
    actionCount: 8,
    riskyActionCount: 0,
    elapsedSeconds: 300,
    mode: 'standard',
  });
  assert.equal(result.diagnosisAccuracy, 45);
  assert.equal(result.evidenceQuality, 25);
  assert.equal(result.remediationQuality, 15);
  assert.equal(result.passed, true);
  assert.equal(result.tier, 'Surgical');
  assert.ok(result.badges.includes('safe-operator'));

  assert.throws(
    () => scoreFaultlineSubmission(content, {
      selectedRootCauseId: content.rootCause.id,
      evidenceIds: [content.evidence[0]!.id],
      remediation,
      unlockedEvidenceIds: [],
      hintLevels: [],
      actionCount: 1,
      riskyActionCount: 0,
      elapsedSeconds: 30,
      mode: 'standard',
    }),
    (error: unknown) =>
      error instanceof FaultlineValidationError && error.code === 'FAULTLINE_EVIDENCE_LOCKED',
  );
});

test('FaultlineLab chaos policy is bounded and the highest level disables hints', () => {
  assert.deepEqual(faultlineChaosSettings(3), {
    intensity: 3,
    shuffle: true,
    timeLimitSeconds: 1800,
    hintBlackout: true,
  });
  assert.throws(
    () => faultlineChaosSettings(4),
    (error: unknown) =>
      error instanceof FaultlineValidationError && error.code === 'FAULTLINE_CHAOS_INTENSITY_INVALID',
  );
});
