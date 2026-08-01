import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

test('TradeFlowKit lead messaging is consent-aware, replay-safe, provider-neutral, and complete in the shell', () => {
  const route = readFileSync(resolve(root, 'apps/api/src/routes/tradeflowkit-routes.ts'), 'utf8');
  const client = readFileSync(resolve(root, 'apps/web/src/lib/auth.ts'), 'utf8');
  const leadCenter = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitLeadCenter.tsx'), 'utf8');
  const shell = readFileSync(resolve(root, 'apps/web/src/components/module-shells/TradeFlowKitShell.tsx'), 'utf8');
  const ledger = readFileSync(resolve(root, 'scripts/tradeflowkit-phase16-ledger.mjs'), 'utf8');

  assert.match(route, /leads\/:id\/send-email'.*preHandler: \[\.\.\.writeGuards\]/);
  assert.match(route, /leads\/:id\/send-sms'.*preHandler: \[\.\.\.writeGuards\]/);
  assert.match(route, /IDEMPOTENCY_KEY_REQUIRED/);
  assert.match(route, /IDEMPOTENCY_KEY_REUSE/);
  assert.match(route, /LEAD_SMS_CONSENT_REQUIRED/);
  assert.match(route, /Reply STOP to opt out/);
  assert.match(route, /destination = channel === 'email' \? lead\.email : lead\.phone/);
  assert.match(route, /enqueueOutboxMessage/);
  assert.doesNotMatch(route, /sendgrid|twilio\.messages|api\.twilio|mail\.send/i);
  assert.match(client, /messageLead:/);
  assert.match(leadCenter, /tradeflowkit-lead-message-status/);
  assert.match(leadCenter, /Queue email to/);
  assert.match(leadCenter, /SMS consent is required/);
  assert.match(leadCenter, /Provider delivery is tracked by OperatorOS/);
  assert.match(leadCenter, /tradeflowkit-lead-read-only/);
  assert.match(shell, /canManage=\{canManageModule\}/);
  assert.match(ledger, /lead_messaging/);
});
