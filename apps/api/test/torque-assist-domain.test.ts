process.env.APP_ENV ||= 'test';
process.env.NODE_ENV ||= 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getSharedAiProviderAdapter } from '../src/lib/shared-provider-adapters.js';
import {
  mandatorySafetyWarnings,
  parseTorqueAssistResult,
  summarizeContext,
  torqueTokenPackage,
  TORQUE_ASSIST_DISCLAIMER,
  TORQUE_ASSIST_SYSTEM_PROMPT,
} from '../src/lib/torque-assist-domain.js';

test('deterministic Torque Assist adapter returns a validated evidence-ranked plan', async () => {
  const context = {
    diagnostic: {
      customerConcern: 'Brake pedal sinks at a stop',
      symptoms: 'Long pedal travel',
    },
    codes: [{ code: 'C1234', description: 'Wheel-speed input' }],
    entries: [
      {
        kind: 'measurement',
        title: 'Pedal travel',
        valueNumeric: 110,
        unit: 'mm',
      },
    ],
  };
  const adapter = getSharedAiProviderAdapter();
  assert.equal(adapter.status.state, 'test');
  const completion = await adapter.complete({
    systemPrompt: TORQUE_ASSIST_SYSTEM_PROMPT,
    userPrompt: JSON.stringify({ diagnosticContext: context }),
    responseFormat: 'json',
  });
  const result = parseTorqueAssistResult(completion.text, JSON.stringify(context));
  assert.equal(result.status, 'plan_ready');
  assert.equal(result.hypotheses[0]?.confidence, 'low');
  assert.equal(result.disclaimer, TORQUE_ASSIST_DISCLAIMER);
  assert.ok(result.safetyWarnings.some((warning) => warning.category === 'braking'));
  assert.ok(result.recommendedTests.length >= 1);
  assert.ok(completion.tokenCount > 0);
  assert.equal(completion.provider, 'test');
  assert.equal(completion.version, 'deterministic-v1');
});

test('insufficient evidence returns targeted follow-up questions instead of a repair claim', async () => {
  const context = {
    diagnostic: { customerConcern: 'Intermittent noise', symptoms: null },
    codes: [],
    entries: [],
  };
  const completion = await getSharedAiProviderAdapter().complete({
    systemPrompt: TORQUE_ASSIST_SYSTEM_PROMPT,
    userPrompt: JSON.stringify({ diagnosticContext: context }),
    responseFormat: 'json',
  });
  const result = parseTorqueAssistResult(completion.text, JSON.stringify(context));
  assert.equal(result.status, 'follow_up_required');
  assert.equal(result.hypotheses.length, 0);
  assert.ok(result.followUpQuestions.length >= 3);
});

test('unsafe certainty and malformed confidence are rejected before a result can be accepted', () => {
  const base = {
    status: 'plan_ready',
    summary: 'A test-first plan.',
    facts: [{ source: 'observed', statement: 'P0171 is recorded.' }],
    assumptions: [],
    hypotheses: [
      {
        rank: 1,
        description: 'The pump must replace the existing unit.',
        confidence: 'medium',
        supportingEvidence: ['Pressure is low.'],
        contradictingEvidence: [],
      },
    ],
    safetyWarnings: [
      { category: 'fuel-fire', warning: 'Fuel is hazardous.', escalation: 'Escalate safely.' },
    ],
    recommendedTests: [
      {
        priority: 1,
        title: 'Repeat pressure test',
        rationale: 'Confirm the observation.',
        procedure: 'Use approved service information.',
        stopConditions: ['Stop for leaks.'],
      },
    ],
    followUpQuestions: [],
  };
  assert.throws(
    () => parseTorqueAssistResult(JSON.stringify(base), 'fuel pressure'),
    (error: any) => error.code === 'TORQUE_ASSIST_UNSAFE_CERTAINTY',
  );
  assert.throws(
    () =>
      parseTorqueAssistResult(
        JSON.stringify({
          ...base,
          hypotheses: [
            { ...base.hypotheses[0], description: 'Possible pump issue.', confidence: 'high' },
          ],
        }),
        'fuel pressure',
      ),
    (error: any) => error.code === 'TORQUE_ASSIST_RESPONSE_INVALID',
  );
});

test('context, safety, and package limits are deterministic and bounded', () => {
  const summary = summarizeContext({ diagnostic: { concern: 'Airbag lamp' }, codes: [] });
  assert.equal(summary.sha256.length, 64);
  assert.ok(summary.estimatedUnits >= 1_200);
  assert.ok(
    mandatorySafetyWarnings('SRS airbag lamp').some((row) => row.category === 'airbag-restraint'),
  );
  assert.equal(torqueTokenPackage('roadside-25000').units, 25_000);
  assert.throws(
    () => torqueTokenPackage('unknown'),
    (error: any) => error.code === 'TORQUE_TOKEN_PACKAGE_INVALID',
  );
  assert.throws(
    () => summarizeContext({ content: 'x'.repeat(48_001) }),
    (error: any) => error.code === 'TORQUE_ASSIST_CONTEXT_TOO_LARGE',
  );
});
