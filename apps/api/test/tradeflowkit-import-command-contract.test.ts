import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

test('TradeFlowKit snapshot export is read-only, scoped, external, and excludes credential/provider token columns', () => {
  const source = readFileSync(resolve(root, 'apps/api/src/scripts/tradeflowkit-export.ts'), 'utf8');
  assert.match(source, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(source, /OPERATOROS_TRADEFLOWKIT_EXPORT_MODE/);
  assert.match(source, /TRADEFLOWKIT_SOURCE_DATABASE_URL/);
  assert.match(source, /--source-commit/);
  assert.match(source, /37aa67f1da804fc3ac56f36e50e01362077d7a26/);
  assert.match(source, /outside the OperatorOS repository/);
  assert.match(source, /flag: 'wx'/);
  assert.doesNotMatch(source, /\bpassword\b|\btotp_secret\b|\bportal_token\b|\bpublic_token\b|\bstripe_payment_intent_id\b|\bstripe_customer_id\b|\bstripe_subscription_id\b/);
});

test('TradeFlowKit apply command requires fingerprint, tenant, actor, source org, backup, and explicit production confirmation', () => {
  const source = readFileSync(resolve(root, 'apps/api/src/scripts/tradeflowkit-import.ts'), 'utf8');
  for (const marker of [
    '--tenant-id',
    '--actor-user-id',
    '--source-org-id',
    '--expect-source-fingerprint',
    '--backup-reference',
    'OPERATOROS_TRADEFLOWKIT_IMPORT_MODE',
    'OPERATOROS_TRADEFLOWKIT_PRODUCTION_CUTOVER',
    '--confirm-production-cutover',
  ]) {
    assert.match(source, new RegExp(marker.replaceAll('-', '\\-')));
  }
  assert.match(source, /closeDatabasePool/);
});
