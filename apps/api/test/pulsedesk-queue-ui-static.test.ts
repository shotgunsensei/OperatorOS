import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

test('PulseDesk shell mounts the live tenant-scoped department escalation queue', () => {
  const shell = readRepoFile('apps/web/src/components/module-shells/PulseDeskShell.tsx');
  assert.match(shell, /PulseDeskDepartmentEscalationQueue/);
  assert.match(shell, /key=\{adapter\.tenantId\}/);
  assert.match(shell, /tenantKey=\{adapter\.tenantId\}/);
  assert.match(shell, /const hasTenantContext = !!adapter\.tenantId/);
  assert.match(shell, /pulsedesk-operations-panel/);
  assert.match(shell, /pulsedesk-empty-state/);
  assert.match(shell, /pulsedesk-error-state/);
});

test('PulseDesk queue exposes the live PHI-minimized workflow states', () => {
  const queue = readRepoFile('apps/web/src/components/module-shells/PulseDeskDepartmentEscalationQueue.tsx');
  assert.match(queue, /data-testid="pulsedesk-department-escalation-queue"/);
  assert.match(queue, /Operational information only\. Do not enter patient names, MRNs, dates of birth, diagnoses, or clinical notes\./);
  assert.match(queue, /data-testid="pulsedesk-phi-acknowledgement"/);
  assert.match(queue, /phiAcknowledged: true/);
  assert.match(queue, /label="Intake"/);
  assert.match(queue, /label="Escalated"/);
  assert.match(queue, /label="Waiting Department"/);
  assert.match(queue, /label="Overdue"/);
  assert.match(queue, /pulsedesk-request-loading/);
  assert.match(queue, /pulsedesk-request-empty/);
  assert.match(queue, /pulsedesk-queue-error/);
  assert.match(queue, /pulsedesk-queue-retry/);
  assert.match(queue, /HTTP \$\{record\.status\}/);
  assert.match(queue, /record\.code/);
  assert.match(queue, /pulsedesk-department-manager/);
  assert.match(queue, /pulsedesk-workflow-controls/);
  assert.match(queue, /pulsedesk-request-timeline/);
  assert.doesNotMatch(queue, /textarea/i);
  assert.doesNotMatch(queue, /attachment|email intake|delete request/i);
});

test('PulseDesk client uses guarded nested capabilities and server-owned SLA dates', () => {
  const auth = readRepoFile('apps/web/src/lib/auth.ts');
  const updateInput = auth.slice(
    auth.indexOf('export interface PulseDeskRequestUpdateInput'),
    auth.indexOf('// Task #72'),
  );
  assert.match(auth, /capabilities: PulseDeskCapabilities/);
  assert.match(auth, /canManageWorkflow: boolean/);
  assert.match(auth, /\/modules\/pulsedesk\/departments/);
  assert.match(auth, /\/modules\/pulsedesk\/assignees/);
  assert.match(auth, /\/modules\/pulsedesk\/requests/);
  assert.match(auth, /\/transitions/);
  assert.doesNotMatch(updateInput, /dueAt/);
  assert.doesNotMatch(updateInput, /tenantId|createdByUserId/);
});
