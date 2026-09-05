import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

test('SnapProofOS UI mirrors ordinary-write and organization-admin server guards', () => {
  const primaryRoutes = read('apps/api/src/routes/snapproofos-routes.ts');
  const fieldRoutes = read('apps/api/src/routes/snapproofos-phase32-routes.ts');
  const shell = read('apps/web/src/components/module-shells/SnapProofShell.tsx');
  const legacy = read('apps/web/src/components/module-shells/SnapProofWorkspace.tsx');
  const field = read('apps/web/src/components/module-shells/SnapProofFieldWorkspace.tsx');

  for (const routes of [primaryRoutes, fieldRoutes]) {
    assert.match(routes, /const writeGuards = \[\.\.\.readGuards, requireTenantModuleWriteAccess\]/);
    assert.match(routes, /const adminGuards = \[\.\.\.writeGuards, requireTenantAdmin\]/);
  }

  assert.match(shell, /const canWriteModule = platformAdmin \|\| \(activeRole !== 'viewer' &&/);
  assert.match(shell, /const canManageModule = canWriteModule && \(platformAdmin \|\| activeRole === 'owner' \|\| activeRole === 'admin'\)/);
  assert.match(shell, /canWrite=\{canWriteModule\} canManage=\{canManageModule\}/);

  assert.match(legacy, /canWrite = false, canManage = false/);
  assert.match(legacy, /data-testid="snapproofos-read-only"/);
  assert.match(legacy, /<ReviewPanel[\s\S]{0,300}canManage=\{canManage\}/);
  assert.match(legacy, /<RetentionPanel[\s\S]{0,300}canManage=\{canManage\}/);
  assert.match(legacy, /canManage && <div[\s\S]{0,500}decideEvidence/);
  assert.match(legacy, /canWrite && \['captured', 'rejected'\][\s\S]{0,250}submitEvidence/);
  assert.match(legacy, /item\.attachmentId &&[\s\S]{0,220}> Download<\/button>[\s\S]{0,200}\{canWrite && <button[\s\S]{0,200}verifyIntegrity/);

  assert.match(field, /canWrite = false,[\s\S]{0,80}canManage = false/);
  assert.match(field, /data-testid="snapproofos-field-read-only"/);
  assert.match(field, /if \(!canWrite \|\| !navigator\.onLine\) return;/);
  assert.match(field, /disabled=\{!canWrite \|\| !online\}/);
  assert.match(field, /<Customers[\s\S]{0,200}canWrite=\{canWrite\} canManage=\{canManage\}/);
  assert.match(field, /canManage && <div[\s\S]{0,300}archiveCustomer/);
  assert.match(field, /canManage \? <Form onSubmit=\{submit\}>[\s\S]{0,1400}Save branding/);
  assert.match(field, /disabled=\{!canWrite \|\| saving \|\| !job\}/);
  assert.match(field, /if \(!canWrite\) return;[\s\S]{0,140}createReportExport/);
});

test('TechDeck keeps viewers read-only while contributors work and organization admins configure', () => {
  const shellRoutes = read('apps/api/src/routes/module-shell-routes.ts');
  const coreRoutes = read('apps/api/src/routes/techdeck-routes.ts');
  const literalRoutes = read('apps/api/src/routes/techdeck-literal-routes.ts');
  const shell = read('apps/web/src/components/module-shells/TechDeckShell.tsx');
  const tickets = read('apps/web/src/components/module-shells/TechDeckTicketQueue.tsx');
  const operations = read('apps/web/src/components/module-shells/TechDeckOperations.tsx');
  const literal = read('apps/web/src/components/module-shells/TechDeckLiteralConsole.tsx');

  assert.match(shellRoutes, /const techdeckWriteGuards = \[\.\.\.techdeckGuards, requireTenantModuleWriteAccess\]/);
  for (const routes of [coreRoutes, literalRoutes]) {
    assert.match(routes, /const writeGuards = \[\.\.\.readGuards, requireTenantModuleWriteAccess\]/);
    assert.match(routes, /const adminGuards = \[\.\.\.writeGuards, requireTenantAdmin\]/);
  }

  assert.match(shell, /const canWriteModule = platformAdmin \|\| \(activeRole !== 'viewer' &&/);
  assert.match(shell, /const canManageModule = canWriteModule && \(platformAdmin \|\| activeRole === 'owner' \|\| activeRole === 'admin'\)/);
  assert.match(shell, /canWriteTickets=\{canWriteModule\} canManageTickets=\{canManageModule\}/);
  assert.match(shell, /<TechDeckOperations[\s\S]{0,350}canWrite=\{canWriteModule\}[\s\S]{0,150}canApprove=\{canManageModule\}/);
  assert.match(shell, /<TechDeckLiteralConsole[\s\S]{0,350}canWrite=\{canWriteModule\}[\s\S]{0,150}canManage=\{canManageModule\}/);

  assert.match(tickets, /data-testid="techdeck-ticket-read-only"/);
  assert.ok((tickets.match(/if \(!canWriteTickets \|\|/g) ?? []).length >= 4);
  assert.match(tickets, /\{canWriteTickets && <form className="techdeck-ticket-form"/);
  assert.ok((tickets.match(/disabled=\{!canWriteTickets \|\| Boolean\(updatingId\)/g) ?? []).length >= 3);
  assert.match(tickets, /\{canManageTickets && \([\s\S]{0,250}techdeck-ticket-archive/);

  assert.match(operations, /data-testid="techdeck-operations-read-only"/);
  assert.match(operations, /async function action[\s\S]*?if \(!canWrite\) return;/);
  assert.match(operations, /canWrite && <form className="td-form td-item-form"/);
  assert.match(operations, /\['in_review', 'approved'\]\.includes\(row\.status\) \? canApprove/);

  assert.match(literal, /data-testid="techdeck-literal-read-only"/);
  assert.match(literal, /const act = async[\s\S]{0,180}if \(!canWrite\) return null;/);
  assert.match(literal, /canWrite && <form onSubmit=\{submit\('appointment'/);
  assert.match(literal, /canManage && <form onSubmit=\{submit\('recurrence'/);
  assert.match(literal, /canManage && <form onSubmit=\{submit\('webhook'/);
  assert.match(literal, /canWrite && <button type="button" className="tdl-wide"/);
});
