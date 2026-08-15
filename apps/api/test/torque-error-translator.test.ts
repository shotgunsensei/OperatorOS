import assert from 'node:assert/strict';
import test from 'node:test';

import { translateTorqueShedError } from '../../web/src/lib/torque-error-translator.js';

const noChargeCodes = [
  'TORQUE_ASSIST_CREDITS_REQUIRED',
  'TORQUE_ASSIST_BALANCE_EXHAUSTED',
  'TORQUE_ASSIST_RESERVATION_CONFLICT',
  'TORQUE_ASSIST_RATE_LIMITED',
  'TORQUE_ASSIST_PROVIDER_DISABLED',
  'TORQUE_ASSIST_PROVIDER_CIRCUIT_OPEN',
  'TORQUE_ASSIST_PROVIDER_UNAVAILABLE',
  'TORQUE_ASSIST_PROVIDER_TIMEOUT',
  'TORQUE_ASSIST_RESPONSE_INVALID',
  'TORQUE_ASSIST_CONTEXT_INVALID',
  'TORQUE_ASSIST_SESSION_NOT_FOUND',
  'TORQUE_ASSIST_FORBIDDEN',
  'TORQUE_ASSIST_REQUEST_CONFLICT',
  'TORQUE_ASSIST_CANCELLED',
] as const;

test('Torque Assist failure states render safe, actionable, no-charge guidance', () => {
  for (const code of noChargeCodes) {
    const presentation = translateTorqueShedError({
      code,
      charged: false,
      requestId: 'request-phase45-0001',
      correlationId: 'correlation-phase45-0001',
    });
    assert.equal(presentation.code, code);
    assert.equal(presentation.noCreditsConsumed, true, code);
    assert.ok(presentation.message.length >= 24, code);
    assert.ok(presentation.administratorAction.length >= 24, code);
    assert.equal(presentation.requestId, 'request-phase45-0001');
    assert.equal(presentation.correlationId, 'correlation-phase45-0001');
  }
});

test('unknown failures remain safe and do not echo provider text', () => {
  const secretText = 'provider-key-must-not-appear';
  const presentation = translateTorqueShedError({
    code: 'TORQUE_ASSIST_UNKNOWN',
    status: 503,
    message: secretText,
    requestId: '../unsafe',
  });
  assert.equal(presentation.code, 'TORQUE_ASSIST_UNKNOWN');
  assert.equal(presentation.retryable, true);
  assert.equal(presentation.requestId, null);
  assert.equal(presentation.message.includes(secretText), false);
});
