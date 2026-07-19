import test from 'node:test';
import assert from 'node:assert/strict';
import { planTechDeckImport } from '../src/lib/techdeck-import.js';

test('TechDeck dry-run importer maps approved records while excluding authority and remote actions', () => {
  const source = {
    exportVersion: 1,
    users: [{ id: 'user-1', passwordHash: 'never-export-this' }],
    sessions: [{ id: 'session-1', sid: 'session-secret' }],
    subscriptions: [{ id: 'subscription-1', stripeId: 'sub_legacy' }],
    remoteActions: [{ id: 'remote-1', command: 'unsafe-command' }],
    credentials: [{ id: 'credential-1', password: 'credential-secret' }],
    clients: [{ id: 'client-1', name: 'Northstar' }],
    sites: [{ id: 'site-1', clientId: 'client-1', name: 'Main Office' }],
    configurationItems: [
      { id: 'item-1', clientId: 'client-1', siteId: 'site-1', type: 'firewall', externalVaultReference: 'vault://northstar/firewall' },
      { id: 'item-2', clientId: 'client-1', type: 'subnet', cidr: '10.20.0.0/24' },
    ],
    relationships: [{ id: 'relationship-1', sourceId: 'item-1', targetId: 'item-2' }],
    documents: [{ id: 'document-1', title: 'Recovery runbook' }],
    revisions: [{ id: 'revision-1', documentId: 'document-1', version: 1 }],
  };
  const first = planTechDeckImport(source);
  const second = planTechDeckImport(source);
  assert.equal(first.readyToApply, true, first.errors.join('\n'));
  assert.equal(first.sourceFingerprint, second.sourceFingerprint);
  assert.deepEqual(first.mappings, second.mappings);
  assert.equal(first.reconciliation.referencesMissing, 0);
  assert.equal(first.plannedTargetCounts.migrationRefs, 7);
  assert.equal(first.excludedAuthority.users, 1);
  assert.equal(first.excludedUnsafeCapabilities.remoteActions, 1);
  assert.doesNotMatch(JSON.stringify(first), /never-export-this|session-secret|sub_legacy|unsafe-command|credential-secret/);
});

test('TechDeck dry-run importer fails closed on duplicates, missing references, and secret-shaped included fields', () => {
  const plan = planTechDeckImport({
    exportVersion: 1,
    clients: [{ id: 'client-1' }, { id: 'client-1' }],
    sites: [{ id: 'site-1', clientId: 'missing-client' }],
    configurationItems: [{ id: 'item-1', details: { apiToken: 'forbidden' } }],
    relationships: [{ id: 'relationship-1', sourceId: 'item-1', targetId: 'missing-item' }],
  });
  assert.equal(plan.readyToApply, false);
  assert.ok(plan.errors.some(error => error.includes('duplicate source id')));
  assert.ok(plan.errors.some(error => error.includes('missing clients')));
  assert.ok(plan.errors.some(error => error.includes('missing configurationItems')));
  assert.ok(plan.errors.some(error => error.includes('secret-shaped')));
  assert.equal(plan.reconciliation.secretShapedFieldsRejected, 1);
});
