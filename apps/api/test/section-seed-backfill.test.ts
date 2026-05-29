/**
 * Task #117 — app sections (platform components) seed + back-fill safely.
 *
 * Task #114 introduced `seedPlatformComponents` (top-level grouping layer)
 * and `backfillModuleComponents` (fills `modules.component_id` from the SDK
 * catalog). Both ran only on boot and were verified manually via logs/DB
 * queries. A regression could silently mis-group modules or stomp an
 * admin's component choice. These tests give the path automated coverage:
 *
 *   - the four components seed with the right slugs + ord, idempotently
 *   - component_id is back-filled from the catalog ONLY when null, and an
 *     admin-set (non-null) value is never overwritten on re-seed
 *   - an unmapped module (no catalog `component`) is left null, no throw
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/db.js';
import { modules, platformComponents } from '../src/schema.js';
import {
  seedPlatformComponents,
  backfillModuleComponents,
} from '../src/lib/saas-db-init.js';
import { PLATFORM_COMPONENTS, MODULE_CATALOG } from '@operatoros/sdk';
import { ensureSchemaReady, uniqueId } from './_setup.js';

// Modules this test inserted itself (unique or borrowed-fresh slugs).
const insertedModuleIds: string[] = [];
// Real catalog-slug modules whose component_id we mutated; healed in after().
const touchedRealSlugs = new Set<string>();

before(async () => {
  await ensureSchemaReady();
});

after(async () => {
  if (insertedModuleIds.length) {
    try { await db.delete(modules).where(inArray(modules.id, insertedModuleIds)); } catch {}
  }
  // Heal any real catalog modules we poked: null their component_id then
  // re-run the back-fill so they end in the correct production state.
  for (const slug of touchedRealSlugs) {
    try { await db.update(modules).set({ componentId: null }).where(eq(modules.slug, slug)); } catch {}
  }
  try { await backfillModuleComponents(); } catch {}
});

/**
 * Ensure a module row for `slug` exists with component_id = null. If the row
 * already exists (e.g. a prior test ran the module seeder) we just null its
 * component_id; otherwise we insert a fixture and track it for teardown.
 */
async function ensureModuleWithNullComponent(slug: string) {
  const existing = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
  if (existing.length > 0) {
    touchedRealSlugs.add(slug);
    await db.update(modules).set({ componentId: null }).where(eq(modules.slug, slug));
    return;
  }
  const cat = MODULE_CATALOG.find(m => m.slug === slug);
  const [m] = await db.insert(modules).values({
    slug,
    name: cat?.name ?? 'Fixture Module',
    description: 'fixture',
    baseUrl: 'https://example.test',
    status: 'live',
    planMin: 'starter',
    ord: 0,
  }).returning();
  insertedModuleIds.push(m.id);
}

/** Same as above but sets a specific (admin-style) component_id. */
async function ensureModuleWithComponent(slug: string, componentId: string) {
  const existing = await db.select().from(modules).where(eq(modules.slug, slug)).limit(1);
  if (existing.length > 0) {
    touchedRealSlugs.add(slug);
    await db.update(modules).set({ componentId }).where(eq(modules.slug, slug));
    return;
  }
  const cat = MODULE_CATALOG.find(m => m.slug === slug);
  const [m] = await db.insert(modules).values({
    slug,
    name: cat?.name ?? 'Fixture Module',
    description: 'fixture',
    baseUrl: 'https://example.test',
    status: 'live',
    planMin: 'starter',
    ord: 0,
    componentId,
  }).returning();
  insertedModuleIds.push(m.id);
}

test('seedPlatformComponents seeds the four components with correct slugs + ord, idempotently', async () => {
  await seedPlatformComponents();

  // Every catalog component is present exactly once with the right slug/ord/name.
  for (const c of PLATFORM_COMPONENTS) {
    const rows = await db.select().from(platformComponents)
      .where(eq(platformComponents.slug, c.slug));
    assert.equal(rows.length, 1, `expected exactly one component for '${c.slug}'`);
    assert.equal(rows[0].slug, c.slug);
    assert.equal(rows[0].ord, c.ord, `ord mismatch for '${c.slug}'`);
    assert.equal(rows[0].name, c.name);
  }

  // Snapshot ids so we can prove a re-seed neither duplicates nor recreates.
  const slugs = PLATFORM_COMPONENTS.map(c => c.slug);
  const before = await db.select().from(platformComponents)
    .where(inArray(platformComponents.slug, slugs));
  const idBySlug = new Map(before.map(r => [r.slug, r.id]));

  // Re-running the seeder must be a no-op on identity (idempotent).
  await seedPlatformComponents();

  for (const c of PLATFORM_COMPONENTS) {
    const rows = await db.select().from(platformComponents)
      .where(eq(platformComponents.slug, c.slug));
    assert.equal(rows.length, 1, `re-seed must keep exactly one component for '${c.slug}'`);
    assert.equal(rows[0].id, idBySlug.get(c.slug), `id must be stable across re-seed for '${c.slug}'`);
    assert.equal(rows[0].ord, c.ord);
  }
});

test('backfillModuleComponents fills component_id only when null and never overwrites an admin value', async () => {
  await seedPlatformComponents();
  const components = await db.select().from(platformComponents);
  const componentIdBySlug = new Map(components.map(c => [c.slug, c.id]));

  // Two distinct catalog modules that map to a platform component.
  const mapped = MODULE_CATALOG.filter(m => m.component);
  assert.ok(mapped.length >= 2, 'catalog should have at least two component-mapped modules');
  const entryA = mapped[0];
  const entryB = mapped[1];

  // --- Case A: a null component_id gets back-filled from the catalog. ---
  await ensureModuleWithNullComponent(entryA.slug);
  await backfillModuleComponents();
  const [rowA] = await db.select().from(modules).where(eq(modules.slug, entryA.slug));
  assert.equal(
    rowA.componentId,
    componentIdBySlug.get(entryA.component!),
    `'${entryA.slug}' should be back-filled to component '${entryA.component}'`,
  );

  // --- Case B: an admin-set (non-null) component_id is preserved. ---
  // Deliberately set a *wrong* but valid component so we can detect a stomp.
  const wrongComponentSlug = PLATFORM_COMPONENTS.find(c => c.slug !== entryB.component)!.slug;
  const wrongId = componentIdBySlug.get(wrongComponentSlug)!;
  await ensureModuleWithComponent(entryB.slug, wrongId);
  await backfillModuleComponents();
  const [rowB] = await db.select().from(modules).where(eq(modules.slug, entryB.slug));
  assert.equal(
    rowB.componentId,
    wrongId,
    `admin-set component_id on '${entryB.slug}' must not be overwritten by the back-fill`,
  );
});

test('backfillModuleComponents leaves an unmapped module null without throwing', async () => {
  await seedPlatformComponents();

  // Unique slug guaranteed absent from the SDK catalog → no `component` map.
  const slug = uniqueId('unmapped-mod');
  const [m] = await db.insert(modules).values({
    slug,
    name: 'Unmapped Fixture',
    description: 'fixture',
    baseUrl: 'https://example.test',
    status: 'live',
    planMin: 'starter',
    ord: 0,
  }).returning();
  insertedModuleIds.push(m.id);

  // Must not throw even though this module has no catalog component.
  await backfillModuleComponents();

  const [row] = await db.select().from(modules).where(eq(modules.id, m.id));
  assert.equal(row.componentId, null, 'unmapped module must be left with a null component_id');
});
