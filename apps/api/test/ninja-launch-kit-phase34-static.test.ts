import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../src/routes/ninja-launch-kit-phase34-routes.ts', import.meta.url), 'utf8');
const dbInit = readFileSync(new URL('../src/lib/ninja-launch-kit-phase34-db-init.ts', import.meta.url), 'utf8');
const workspace = readFileSync(new URL('../../web/src/components/module-shells/NinjaLaunchKitCompleteWorkspace.tsx', import.meta.url), 'utf8');

test('Phase 34 API declares the complete persisted kit, brand, history, export, account, and admin workflows', () => {
  for (const contract of [
    '/catalog/templates', '/kits/preview', '/kits/:id/duplicate', '/kits/:id/regenerate',
    '/kits/:id/undo-delete', '/brands/:id/restore', '/kits/:id/exports', '/exports/:id/content', '/account', '/admin/stats',
  ]) assert.match(route, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(route, /\['archive', 'restore'\]/);
  assert.match(route, /requireTenantModuleAccess/);
  assert.match(route, /requireTenantModuleWriteAccess/);
  assert.match(route, /requireSuperAdmin/);
  assert.match(route, /beginIdempotentOperation/);
  assert.match(route, /recordUsageEvent/);
});

test('Phase 34 persistence remains additive and tenant/user scoped', () => {
  for (const table of ['launchkit_brand_profiles','launchkit_product_kits','launchkit_product_revisions','launchkit_product_exports','launchkit_usage_counters']) {
    assert.match(dbInit, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.doesNotMatch(dbInit, /DROP TABLE|TRUNCATE/i);
  assert.match(dbInit, /tenant_id VARCHAR\(36\) NOT NULL/);
  assert.match(dbInit, /user_id VARCHAR\(36\) NOT NULL/);
});

test('complete workspace renders customer outcomes, honest access states, product CRUD, exports, and parent authority', () => {
  for (const phrase of ['All 20 niche templates','Visual-production briefs','Soft delete','Campaign downloads','File verified','Application Stack','Locked by the current OperatorOS plan']) {
    assert.match(workspace, new RegExp(phrase));
  }
  assert.match(workspace, /grandfathered[\s\S]*plan[\s\S]*retains its original package limits/);
  assert.match(workspace, /shell-ninja-launch-kit-complete/);
  assert.match(workspace, /colorScheme: 'dark'/);
});
